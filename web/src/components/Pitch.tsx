import { useEffect, useRef, useState } from "react";
import type { MatchMetadata } from "../contracts.gen.ts";
import { PITCH_LENGTH, PITCH_WIDTH } from "../coords.ts";
import { useProfile } from "../profile.ts";
import { cursorAt, replayMs } from "../replay.ts";
import {
  type Dot,
  EMPTY_SCENE,
  frameScene,
  liveMarks,
  type Mark,
  replayScene,
  type Scene,
} from "../scene.ts";
import { liveMinute, useLive } from "../store.ts";
import { eventName } from "../text.ts";
import { useT } from "../useT.ts";

const KEY_TYPES = new Set([
  "goal",
  "own_goal",
  "card",
  "kickoff",
  "period_end",
  "match_end",
]);
const DOT_RADIUS = 1.8;
const SHIRT_SIZE = 1.9;
/** Rings the replayed events and the selected player. */
const HIGHLIGHT = "#4cd7f6";
const CAPTAIN = "#ceb9ff";
const STRIPES = ["#14532d", "#166534"];

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface Computed {
  scene: Scene;
  /** Whether the scene will change again without any new data. */
  moving: boolean;
}

function computeScene(now: number): Computed | null {
  const s = useLive.getState();
  const meta = s.metadata;
  if (!meta) return null;
  const replay = s.replay;
  if (replay && replay.status !== "loading" && replay.clips.length > 0) {
    const total = replayMs(replay.clips);
    const elapsed = now - replay.startedAt;
    if (elapsed >= total && replay.status === "playing")
      s.setReplay({ ...replay, status: "ended" });
    const cursor = cursorAt(replay.clips, Math.min(elapsed, total - 1));
    return cursor
      ? { scene: replayScene(meta, cursor), moving: elapsed < total }
      : null;
  }
  if (!s.frame) return { scene: EMPTY_SCENE, moving: false };
  const gap = Math.max(s.frameAt - s.prevFrameAt, 16);
  const alpha =
    s.prevFrame && !prefersReducedMotion()
      ? Math.min(1, (now - s.frameAt) / gap)
      : 1;
  const marks = liveMarks(meta, s.recent, now, s.state?.speed ?? 18);
  const moving = alpha < 1 || marks.length > 0;
  return {
    scene: { ...frameScene(meta, s.prevFrame, s.frame, alpha), marks },
    moving,
  };
}

/** The scene to draw: recomputed every animation frame while anything moves, idle otherwise. */
function useScene(): Scene {
  const [scene, setScene] = useState<Scene>(EMPTY_SCENE);
  useEffect(() => {
    let raf = 0;
    let lastMoving = true;
    let lastFrame: unknown = null;
    let lastReplay: unknown = null;
    const tick = (now: number) => {
      const result = computeScene(now);
      if (result) {
        const { frame, replay } = useLive.getState();
        if (
          result.moving ||
          lastMoving ||
          frame !== lastFrame ||
          replay !== lastReplay
        ) {
          setScene(result.scene);
        }
        lastMoving = result.moving;
        lastFrame = frame;
        lastReplay = replay;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return scene;
}

function readableOn(hex: string): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const luma = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luma > 150 ? "#070e1d" : "#ffffff";
}

function Markings() {
  const boxY = (PITCH_WIDTH - 40.32) / 2;
  const goalY = (PITCH_WIDTH - 18.32) / 2;
  const arc = 7.31;
  const mid = PITCH_WIDTH / 2;
  const line = {
    fill: "none",
    stroke: "#ffffff",
    strokeWidth: 0.22,
    opacity: 0.55,
  } as const;
  return (
    <g aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <rect
          key={i}
          x={(i * PITCH_LENGTH) / 10}
          y={0}
          width={PITCH_LENGTH / 10}
          height={PITCH_WIDTH}
          fill={STRIPES[i % 2]}
        />
      ))}
      <rect
        x={0}
        y={0}
        width={PITCH_LENGTH}
        height={PITCH_WIDTH}
        rx={0.8}
        {...line}
      />
      <line
        x1={PITCH_LENGTH / 2}
        y1={0}
        x2={PITCH_LENGTH / 2}
        y2={PITCH_WIDTH}
        {...line}
      />
      <circle cx={PITCH_LENGTH / 2} cy={mid} r={9.15} {...line} />
      <circle
        cx={PITCH_LENGTH / 2}
        cy={mid}
        r={0.4}
        fill="#ffffff"
        opacity={0.7}
      />
      {[0, 1].map((end) => {
        const dir = end === 0 ? 1 : -1;
        const edge = end === 0 ? 0 : PITCH_LENGTH;
        return (
          <g key={end}>
            <rect
              x={end === 0 ? 0 : PITCH_LENGTH - 16.5}
              y={boxY}
              width={16.5}
              height={40.32}
              {...line}
            />
            <rect
              x={end === 0 ? 0 : PITCH_LENGTH - 5.5}
              y={goalY}
              width={5.5}
              height={18.32}
              {...line}
            />
            <rect
              x={end === 0 ? -2 : PITCH_LENGTH}
              y={mid - 3.66}
              width={2}
              height={7.32}
              {...line}
            />
            <circle
              cx={edge + dir * 11}
              cy={mid}
              r={0.35}
              fill="#ffffff"
              opacity={0.7}
            />
            <path
              d={`M ${edge + dir * 16.5} ${mid - arc} A 9.15 9.15 0 0 ${end === 0 ? 1 : 0} ${edge + dir * 16.5} ${mid + arc}`}
              {...line}
            />
          </g>
        );
      })}
    </g>
  );
}

function MarkShape({ mark }: { mark: Mark }) {
  const { from, to, opacity, type } = mark;
  const stroke =
    type === "shot" || type === "goal" || type === "own_goal"
      ? "#fb7185"
      : "#ffffff";
  let shape = null;
  if (to) {
    shape = (
      <>
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke={stroke}
          strokeWidth={type === "shot" ? 0.5 : 0.28}
          strokeDasharray={type === "carry" ? "1 0.8" : undefined}
        />
        <circle cx={to.x} cy={to.y} r={0.55} fill={stroke} />
      </>
    );
  }
  switch (type) {
    case "goal":
    case "own_goal":
      shape = (
        <>
          {shape}
          <circle
            cx={from.x}
            cy={from.y}
            r={2.2 + (1 - opacity) * 5}
            fill="none"
            stroke="#6bfb9a"
            strokeWidth={0.6}
          />
        </>
      );
      break;
    case "card":
      shape = (
        <>
          {mark.card !== "red" && (
            <rect
              x={from.x - 1.8}
              y={from.y - 1.4}
              width={1.7}
              height={2.6}
              rx={0.2}
              fill="#f59e0b"
            />
          )}
          {mark.card !== "yellow" && (
            <rect
              x={from.x + 0.1}
              y={from.y - 1.4}
              width={1.7}
              height={2.6}
              rx={0.2}
              fill="#fb7185"
            />
          )}
        </>
      );
      break;
    case "corner":
      shape = (
        <polygon
          points={`${from.x},${from.y - 1.8} ${from.x + 2},${from.y - 0.9} ${from.x},${from.y}`}
          fill="#f8fafc"
        />
      );
      break;
    case "foul":
    case "block":
      shape = (
        <path
          d={`M ${from.x - 1} ${from.y - 1} L ${from.x + 1} ${from.y + 1} M ${from.x + 1} ${from.y - 1} L ${from.x - 1} ${from.y + 1}`}
          stroke="#f59e0b"
          strokeWidth={0.5}
        />
      );
      break;
    case "save":
    case "penalty_won":
      shape = (
        <circle
          cx={from.x}
          cy={from.y}
          r={1.8}
          fill="none"
          stroke={HIGHLIGHT}
          strokeWidth={0.5}
        />
      );
      break;
  }
  return (
    <g opacity={Math.max(0.15, opacity)} data-mark={type}>
      {shape}
      {mark.source && (
        <circle
          cx={from.x}
          cy={from.y}
          r={3}
          fill="none"
          stroke={HIGHLIGHT}
          strokeWidth={0.5}
          strokeDasharray="1.2 0.8"
        />
      )}
    </g>
  );
}

function PlayerDot({
  dot,
  meta,
  focused,
  captain,
}: {
  dot: Dot;
  meta: MatchMetadata;
  focused: boolean;
  captain: boolean;
}) {
  const team = meta[dot.side];
  const text = readableOn(team.primary_colour);
  const r = DOT_RADIUS;
  return (
    <g data-player={dot.id}>
      {focused && (
        <circle
          cx={dot.x}
          cy={dot.y}
          r={r + 1.3}
          fill="none"
          stroke={HIGHLIGHT}
          strokeWidth={0.45}
          strokeDasharray="1.2 0.8"
        />
      )}
      {dot.side === "home" ? (
        <circle
          cx={dot.x}
          cy={dot.y}
          r={r}
          fill={team.primary_colour}
          stroke="#070e1d"
          strokeWidth={0.25}
        />
      ) : (
        <rect
          x={dot.x - r}
          y={dot.y - r}
          width={r * 2}
          height={r * 2}
          rx={0.7}
          fill={team.primary_colour}
          stroke="#070e1d"
          strokeWidth={0.25}
        />
      )}
      <text
        x={dot.x}
        y={dot.y + SHIRT_SIZE * 0.35}
        fontSize={SHIRT_SIZE}
        textAnchor="middle"
        fill={text}
        fontWeight={700}
        fontFamily="var(--font-mono)"
      >
        {dot.shirt}
      </text>
      {captain && (
        <g data-captain>
          <circle cx={dot.x + r} cy={dot.y - r} r={0.9} fill={CAPTAIN} />
          <text
            x={dot.x + r}
            y={dot.y - r + 0.42}
            fontSize={1.15}
            textAnchor="middle"
            fill="#23005c"
            fontWeight={800}
          >
            C
          </text>
        </g>
      )}
    </g>
  );
}

/** The pitch drawing for one scene; pure, so it renders the same in tests. */
export function PitchView({
  scene,
  meta,
  label,
  focusId = null,
  captainId = null,
}: {
  scene: Scene;
  meta: MatchMetadata;
  label: string;
  /** A player to ring: the one whose card is open. */
  focusId?: string | null;
  /** The viewer's captain, marked with a C. */
  captainId?: string | null;
}) {
  return (
    <svg
      viewBox="-2.5 -2.5 110 73"
      role="img"
      aria-label={label}
      className="h-auto w-full rounded-xl bg-pitch"
    >
      <Markings />
      <g aria-hidden="true">
        {scene.marks.map((mark) => (
          <MarkShape key={mark.key} mark={mark} />
        ))}
        {scene.dots.map((dot) => (
          <PlayerDot
            key={dot.id}
            dot={dot}
            meta={meta}
            focused={dot.id === focusId}
            captain={dot.id === captainId}
          />
        ))}
        {scene.ball && (
          <circle
            cx={scene.ball.x}
            cy={scene.ball.y}
            r={0.95}
            fill="#ffffff"
            stroke="#070e1d"
            strokeWidth={0.3}
            data-ball
          />
        )}
      </g>
    </svg>
  );
}

/** The live pitch, or the replay while one is playing. */
export function Pitch() {
  const meta = useLive((s) => s.metadata);
  const minute = useLive(liveMinute);
  const keyEvent = useLive((s) =>
    s.events.findLast((e) => KEY_TYPES.has(e.type)),
  );
  const replayStart = useLive((s) => s.replay?.startedAt ?? null);
  const focusId = useProfile((s) => s.selectedPlayerId);
  const captainId = useProfile(
    (s) => s.profile.fantasy_squad?.captain_id ?? null,
  );
  const ref = useRef<HTMLElement>(null);
  const scene = useScene();
  const { language, t } = useT();

  useEffect(() => {
    // A replay starts from a button that may be far down the page: bring the pitch into view.
    if (replayStart === null) return;
    ref.current?.scrollIntoView({
      block: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [replayStart]);

  if (!meta) return null;
  return (
    <figure ref={ref} className="m-0">
      <PitchView
        scene={scene}
        meta={meta}
        focusId={focusId}
        captainId={captainId}
        label={t("pitchLabel", { home: meta.home.name, away: meta.away.name })}
      />
      <figcaption className="visually-hidden" aria-live="polite">
        {keyEvent
          ? t("latestEvent", {
              event: eventName(keyEvent, language),
              minute: keyEvent.minute,
            })
          : t("minuteLabel", { minute })}
      </figcaption>
    </figure>
  );
}

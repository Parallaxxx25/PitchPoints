import {
  Activity,
  CircleAlert,
  Gauge,
  Goal,
  Hand,
  Medal,
  RectangleVertical,
  Zap,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { startReplay } from "../connection.ts";
import type { KeyMoment, LedgerEntry } from "../contracts.gen.ts";
import { formatNumber } from "../i18n/index.ts";
import { recentEntries } from "../points.ts";
import { playerName } from "../roster.ts";
import { useLive } from "../store.ts";
import { CASUAL_MOMENTS, describeMoment, ruleLabel } from "../text.ts";
import { useT } from "../useT.ts";

/** Which rows the stream shows: every key moment, only the big ones, or fantasy points. */
export type FeedFilter = "all" | "big" | "points";

const TONES: Record<KeyMoment["type"], string> = {
  goal: "text-volt",
  big_chance: "text-cyan",
  save: "text-cyan",
  card: "text-amber",
  momentum_swing: "text-violet",
  pressure_spell: "text-violet",
  milestone: "text-ink-2",
};

const ICONS: Record<KeyMoment["type"], typeof Goal> = {
  goal: Goal,
  big_chance: CircleAlert,
  save: Hand,
  card: RectangleVertical,
  momentum_swing: Activity,
  pressure_spell: Gauge,
  milestone: Medal,
};

function Row({
  minute,
  tone,
  icon,
  onReplay,
  side,
  children,
  highlight,
}: {
  minute: number;
  tone: string;
  icon: ReactNode;
  onReplay: () => void;
  side: ReactNode;
  children: ReactNode;
  highlight?: boolean;
}) {
  const { t } = useT();
  return (
    <li>
      <button
        type="button"
        onClick={onReplay}
        className={`flex w-full cursor-pointer items-start gap-3 rounded-xl p-2.5 text-left hover:bg-high ${
          highlight ? "bg-volt/10" : "bg-low"
        }`}
      >
        <span className={`w-9 shrink-0 font-mono text-base font-bold ${tone}`}>
          {minute}&prime;
        </span>
        <span aria-hidden="true" className={`mt-0.5 shrink-0 ${tone}`}>
          {icon}
        </span>
        <span className="min-w-0 flex-1 text-sm">{children}</span>
        {side}
        <span className="visually-hidden"> — {t("replayMoment")}</span>
      </button>
    </li>
  );
}

function MomentRow({ moment }: { moment: KeyMoment }) {
  const meta = useLive((s) => s.metadata)!;
  const { language, t } = useT();
  const text = describeMoment(moment, { language, meta });
  const tone =
    moment.type === "card" && moment.facts.card !== "yellow"
      ? "text-coral"
      : TONES[moment.type];
  const Icon = ICONS[moment.type];
  const swing = Number(moment.facts.win_prob_swing ?? 0);
  return (
    <Row
      minute={moment.minute}
      tone={tone}
      icon={<Icon size={18} />}
      highlight={moment.type === "goal"}
      onReplay={() =>
        void startReplay(
          `${text.badge} ${moment.minute}'`,
          moment.source_event_ids,
        )
      }
      side={
        swing > 0 ? (
          <span className={`pill shrink-0 font-mono text-xs font-bold ${tone}`}>
            {t("swingPill", { points: formatNumber(language, swing * 100) })}
          </span>
        ) : null
      }
    >
      <strong className="text-ink">{text.badge}</strong> – {text.text}
      {text.details.length > 0 && (
        <span className="block text-xs text-ink-2">
          {text.details.join(" ")}
        </span>
      )}
      <span className="block text-xs text-ink-2">
        <span className="font-semibold">{t("feedWhy")}:</span>{" "}
        {text.why.join(" ")}
      </span>
    </Row>
  );
}

function PointsRow({ entry }: { entry: LedgerEntry }) {
  const meta = useLive((s) => s.metadata)!;
  const { language, t } = useT();
  const name = playerName(meta, entry.player_id);
  const rule = ruleLabel(language, entry.rule_id);
  const tone = entry.delta < 0 ? "text-coral" : "text-volt";
  return (
    <Row
      minute={entry.minute}
      tone={tone}
      icon={<Zap size={18} />}
      onReplay={() =>
        void startReplay(`${name}: ${rule}`, entry.source_event_ids)
      }
      side={
        <span className={`pill shrink-0 font-mono text-xs font-bold ${tone}`}>
          {entry.delta > 0 ? "+" : ""}
          {formatNumber(language, entry.delta)} {t("ptsUnit")}
        </span>
      }
    >
      <strong className="text-ink">{name}</strong> – {rule}
      {entry.provisional && (
        <span className="pill label-caps ml-2 text-amber">
          {t("fantasyProvisional")}
        </span>
      )}
    </Row>
  );
}

/**
 * The live event stream: key moments newest first (each explained with the engine's own numbers),
 * or fantasy points as they are scored. Every row replays its source events on the pitch.
 */
export function Feed({
  initial = "all",
  filter,
  players,
}: {
  initial?: FeedFilter;
  /** Narrows the moments shown, for a club or a player. */
  filter?: (m: KeyMoment) => boolean;
  /** Whose fantasy points the points filter shows; everyone when absent. */
  players?: ReadonlySet<string>;
}) {
  const moments = useLive((s) => s.moments);
  const ledger = useLive((s) => s.ledger);
  const meta = useLive((s) => s.metadata);
  const { t } = useT();
  const [shown, setShown] = useState<FeedFilter>(initial);
  if (!meta) return null;
  const kept = filter ? moments.filter(filter) : moments;
  const rows =
    shown === "points"
      ? recentEntries(ledger, players).map((e) => (
          <PointsRow key={e.id} entry={e} />
        ))
      : kept
          .filter((m) => shown === "all" || CASUAL_MOMENTS.has(m.type))
          .toReversed()
          .map((m) => <MomentRow key={m.id} moment={m} />);
  const options: [FeedFilter, string][] = [
    ["all", t("filterAll")],
    ["big", t("filterBig")],
    ["points", t("filterPoints")],
  ];
  return (
    <section
      aria-labelledby="feed-title"
      className="card flex flex-col gap-3 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="feed-title"
          className="flex items-center gap-2 text-base font-semibold"
        >
          <span
            aria-hidden="true"
            className="live-dot size-2.5 rounded-full bg-coral"
          />
          {t("streamTitle")}
        </h2>
        <div
          role="group"
          aria-label={t("filterLabel")}
          className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-low p-1"
        >
          {options.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={shown === value}
              onClick={() => setShown(value)}
              className={`cursor-pointer whitespace-nowrap rounded-lg px-2.5 py-1 font-mono text-xs ${
                shown === value
                  ? "bg-high font-semibold text-ink"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-2">
          {shown === "points" ? t("fantasyLedgerEmpty") : t("feedEmpty")}
        </p>
      ) : (
        <ol className="flex max-h-[36rem] flex-col gap-2 overflow-y-auto">
          {rows}
        </ol>
      )}
    </section>
  );
}

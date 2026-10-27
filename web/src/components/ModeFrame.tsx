import { type KeyboardEvent, type ReactNode, useState } from "react";
import { useMediaQuery } from "../useMediaQuery.ts";
import { Pitch } from "./Pitch.tsx";
import { MomentCaption, PitchHeader } from "./PitchHeader.tsx";

/** One block of a mode's screen: what it shows, and the name its tab carries on narrow screens. */
export interface PanelDef {
  id: string;
  label: string;
  element: ReactNode;
}

/** Screen width from which the three-panel console layout is used (Stitch: 12 columns from 1200px). */
const WIDE = "(min-width: 1200px)";

/** The pitch card: what is on the pitch (or replaying) above it, the latest moment along its foot. */
export function PitchCard() {
  return (
    <section className="card flex flex-col gap-3 p-3 sm:p-4">
      <PitchHeader />
      <div className="relative">
        <Pitch />
        <MomentCaption />
      </div>
    </section>
  );
}

const CENTRE_SPAN: Record<string, string> = {
  both: "col-span-6",
  one: "col-span-9",
  none: "col-span-12",
};

function Column({
  panels,
  className,
}: {
  panels: PanelDef[];
  className: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-6 ${className}`}>
      {panels.map((p) => (
        <div key={p.id}>{p.element}</div>
      ))}
    </div>
  );
}

/**
 * The pitch with a mode's panels around it. Wide screens get the Stitch console: a left rail,
 * the pitch and the panels below it in the centre, a right rail. Narrower screens stack the pitch
 * above one panel at a time, chosen with pill tabs.
 */
export function ModeFrame({
  left = [],
  right = [],
  below = [],
  tabOrder,
}: {
  left?: PanelDef[];
  right?: PanelDef[];
  below?: PanelDef[];
  /** Panel ids in the order their tabs appear on narrow screens, most important first. */
  tabOrder?: string[];
}) {
  const wide = useMediaQuery(WIDE);
  const [picked, setPicked] = useState<string | null>(null);
  const all = [...below, ...right, ...left];
  const ordered = tabOrder
    ? tabOrder
        .map((id) => all.find((p) => p.id === id))
        .filter((p) => p !== undefined)
    : all;
  const active = ordered.find((p) => p.id === picked) ?? ordered[0];

  if (wide) {
    const sides = Number(left.length > 0) + Number(right.length > 0);
    return (
      <div className="grid grid-cols-12 items-start gap-6">
        {left.length > 0 && <Column panels={left} className="col-span-3" />}
        <div
          className={`flex min-w-0 flex-col gap-6 ${CENTRE_SPAN[sides === 2 ? "both" : sides ? "one" : "none"]}`}
        >
          <PitchCard />
          {below.map((p) => (
            <div key={p.id}>{p.element}</div>
          ))}
        </div>
        {right.length > 0 && <Column panels={right} className="col-span-3" />}
      </div>
    );
  }

  const move = (event: KeyboardEvent, index: number) => {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const next = ordered[(index + step + ordered.length) % ordered.length]!;
    setPicked(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      <PitchCard />
      <div
        role="tablist"
        aria-orientation="horizontal"
        className="flex gap-1 self-start overflow-x-auto rounded-full bg-low p-1"
      >
        {ordered.map((p, i) => (
          <button
            key={p.id}
            id={`tab-${p.id}`}
            type="button"
            role="tab"
            aria-selected={p.id === active?.id}
            aria-controls={`panel-${p.id}`}
            tabIndex={p.id === active?.id ? 0 : -1}
            onClick={() => setPicked(p.id)}
            onKeyDown={(e) => move(e, i)}
            className={`shrink-0 cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold ${
              p.id === active?.id
                ? "bg-high text-ink"
                : "text-ink-2 hover:text-ink"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {active && (
        <div
          role="tabpanel"
          id={`panel-${active.id}`}
          aria-labelledby={`tab-${active.id}`}
        >
          {active.element}
        </div>
      )}
    </div>
  );
}

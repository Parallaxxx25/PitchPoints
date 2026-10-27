import { Feed } from "../components/Feed.tsx";
import { ModeFrame } from "../components/ModeFrame.tsx";
import { WinBar } from "../components/Tactics.tsx";
import { formatNumber, formatPercent } from "../i18n/index.ts";
import { useLive } from "../store.ts";
import { useT } from "../useT.ts";

function Versus({
  label,
  home,
  away,
  share,
}: {
  label: string;
  home: string;
  away: string;
  share: number;
}) {
  const meta = useLive((s) => s.metadata)!;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-2xl font-bold text-cyan">{home}</span>
        <span className="label-caps text-ink-2">{label}</span>
        <span className="font-mono text-2xl font-bold text-violet">{away}</span>
      </div>
      <div
        className="mt-2 flex h-2 gap-1 overflow-hidden rounded-full"
        aria-hidden="true"
      >
        <div
          className="rounded-full"
          style={{
            width: `${share * 100}%`,
            backgroundColor: meta.home.primary_colour,
          }}
        />
        <div
          className="flex-1 rounded-full"
          style={{ backgroundColor: meta.away.primary_colour }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-ink-2">
        <span>{meta.home.short_name}</span>
        <span>{meta.away.short_name}</span>
      </div>
    </div>
  );
}

/** A handful of headline numbers: possession, shots, and who is likely to win. */
export function Headline() {
  const stats = useLive((s) => s.stats);
  const meta = useLive((s) => s.metadata);
  const { language, t } = useT();
  if (!meta || !stats) return null;
  const { home, away } = stats;
  const total = home.shots + away.shots;
  return (
    <section
      aria-label={t("tabStats")}
      className="card flex flex-col gap-5 p-5"
    >
      <Versus
        label={t("statPossession")}
        home={formatPercent(language, home.possession, 1)}
        away={formatPercent(language, away.possession, 1)}
        share={home.possession}
      />
      <Versus
        label={t("statShots")}
        home={formatNumber(language, home.shots)}
        away={formatNumber(language, away.shots)}
        share={total ? home.shots / total : 0.5}
      />
      <WinBar />
    </section>
  );
}

/** Narrative first: the big moments in plain words, with only a few numbers beneath the pitch. */
export function CasualView() {
  const { t } = useT();
  return (
    <ModeFrame
      right={[
        { id: "feed", label: t("tabStory"), element: <Feed initial="big" /> },
      ]}
      below={[{ id: "headline", label: t("tabStats"), element: <Headline /> }]}
      tabOrder={["feed", "headline"]}
    />
  );
}

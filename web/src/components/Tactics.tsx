import { formatNumber, formatPercent } from "../i18n/index.ts";
import { useLive } from "../store.ts";
import { useT } from "../useT.ts";

/** A bar from -100 to +100 with a centre line; positive values fill toward the left (home). */
function Diverging({
  label,
  value,
  left,
  right,
  readout,
}: {
  label: string;
  value: number;
  left: string;
  right: string;
  readout: string;
}) {
  const share = Math.min(100, Math.abs(value)) / 2;
  const style =
    value >= 0
      ? { right: "50%", width: `${share}%` }
      : { left: "50%", width: `${share}%` };
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono font-semibold">{readout}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={readout}
        className="relative mt-1 h-3 overflow-hidden rounded-full bg-low"
      >
        <div className="absolute top-0 h-full bg-volt-deep" style={style} />
        <div className="absolute left-1/2 top-0 h-full w-0.5 bg-ink" />
      </div>
      <div className="mt-0.5 flex justify-between text-xs text-ink-2">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

/** Home, draw, and away win probability as one bar, each share also written out. */
export function WinBar() {
  const tactical = useLive((s) => s.tactical);
  const meta = useLive((s) => s.metadata);
  const { language, t } = useT();
  if (!meta || !tactical) return null;
  const win = tactical.win_probability;
  const segments = [
    {
      key: "home",
      label: t("tacWinHome", { team: meta.home.short_name }),
      share: win.home,
      tone: "bg-cyan",
    },
    { key: "draw", label: t("tacDraw"), share: win.draw, tone: "bg-highest" },
    {
      key: "away",
      label: t("tacWinHome", { team: meta.away.short_name }),
      share: win.away,
      tone: "bg-violet",
    },
  ];
  return (
    <div>
      <div className="text-sm">{t("tacWinProb")}</div>
      <div
        className="mt-1 flex h-4 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={segments
          .map((s) => `${s.label} ${formatPercent(language, s.share)}`)
          .join(", ")}
      >
        {segments.map((s) => (
          <div
            key={s.key}
            className={s.tone}
            style={{ width: `${s.share * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-1 flex justify-between gap-2 text-xs">
        {segments.map((s) => (
          <li key={s.key}>
            {s.label}{" "}
            <span className="font-mono font-semibold">
              {formatPercent(language, s.share)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The rolling tactical indices: momentum, control vs chaos, pressing, tempo, and win probability. */
export function Tactics() {
  const tactical = useLive((s) => s.tactical);
  const meta = useLive((s) => s.metadata);
  const { language, t } = useT();
  if (!meta || !tactical) return null;
  const { home, away } = meta;
  const signed = (v: number) =>
    `${v > 0 ? "+" : ""}${formatNumber(language, v, 0)}`;
  return (
    <section
      aria-labelledby="tactics-title"
      className="card flex flex-col gap-4 p-5"
    >
      <h2 id="tactics-title" className="text-base font-semibold">
        {t("tabTactics")}
      </h2>
      <Diverging
        label={t("tacMomentum")}
        value={tactical.momentum}
        left={home.short_name}
        right={away.short_name}
        readout={`${home.short_name} ${signed(tactical.momentum)}`}
      />
      <Diverging
        label={t("tacControl")}
        value={tactical.control_chaos_index}
        left={t("tacControlEnd")}
        right={t("tacChaosEnd")}
        readout={signed(tactical.control_chaos_index)}
      />
      <WinBar />
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-2">{t("tacPressing")}</dt>
        <dd className="text-right font-mono font-semibold">
          {home.short_name}{" "}
          {formatNumber(language, tactical.pressing_intensity.home, 2)} ·{" "}
          {away.short_name}{" "}
          {formatNumber(language, tactical.pressing_intensity.away, 2)}
        </dd>
        <dt className="text-ink-2">{t("tacTempo")}</dt>
        <dd className="text-right font-mono font-semibold">
          {formatNumber(language, tactical.tempo, 1)}
        </dd>
      </dl>
    </section>
  );
}

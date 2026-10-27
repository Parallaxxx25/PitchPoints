import { formatNumber, formatPercent } from "../i18n/index.ts";
import { type TimelinePoint, useLive } from "../store.ts";
import { useT } from "../useT.ts";

const W = 300;
const H = 96;
const PAD = { left: 26, right: 8, top: 8, bottom: 16 };
const FULL_TIME_MIN = 90;
const HALF_TIME_MIN = 45;

interface Series {
  name: string;
  colour: string;
  dash?: string;
  points: [number, number][];
}

function pick(
  timeline: TimelinePoint[],
  value: (p: TimelinePoint) => number | undefined,
): [number, number][] {
  return timeline.flatMap((p) => {
    const v = value(p);
    return v === undefined ? [] : [[p.minute, v] as [number, number]];
  });
}

function LineChart({
  title,
  series,
  yMin,
  yMax,
  yFormat,
  summary,
}: {
  title: string;
  series: Series[];
  yMin: number;
  yMax: number;
  yFormat: (v: number) => string;
  summary: string;
}) {
  const last = Math.max(
    FULL_TIME_MIN,
    ...series.flatMap((s) => s.points.map((p) => p[0])),
  );
  const x = (minute: number) =>
    PAD.left + (minute / last) * (W - PAD.left - PAD.right);
  const y = (v: number) =>
    PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-sm font-medium">{title}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${title}: ${summary}`}
        className="h-auto w-full"
      >
        <g aria-hidden="true" fontSize={6.5} fill="#bccabb">
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(yMin)}
            y2={y(yMin)}
            stroke="#2e3545"
          />
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(yMax)}
            y2={y(yMax)}
            stroke="#232a3a"
          />
          <line
            x1={x(HALF_TIME_MIN)}
            x2={x(HALF_TIME_MIN)}
            y1={y(yMax)}
            y2={y(yMin)}
            stroke="#2e3545"
            strokeDasharray="2 3"
          />
          <text x={PAD.left - 3} y={y(yMax) + 3} textAnchor="end">
            {yFormat(yMax)}
          </text>
          <text x={PAD.left - 3} y={y(yMin) + 3} textAnchor="end">
            {yFormat(yMin)}
          </text>
          {[0, HALF_TIME_MIN, FULL_TIME_MIN].map((m) => (
            <text key={m} x={x(m)} y={H - 3} textAnchor="middle">
              {m}
            </text>
          ))}
          {series.map((s) => (
            <polyline
              key={s.name}
              fill="none"
              stroke={s.colour}
              strokeWidth={1.6}
              strokeDasharray={s.dash}
              points={s.points.map(([m, v]) => `${x(m)},${y(v)}`).join(" ")}
            />
          ))}
        </g>
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-2">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-1">
            <svg viewBox="0 0 16 4" width={16} height={4} aria-hidden="true">
              <line
                x1={0}
                x2={16}
                y1={2}
                y2={2}
                stroke={s.colour}
                strokeWidth={2}
                strokeDasharray={s.dash}
              />
            </svg>
            {s.name}
          </li>
        ))}
      </ul>
    </figure>
  );
}

function summarise(series: Series[], format: (v: number) => string): string {
  return series
    .map((s) => {
      const end = s.points[s.points.length - 1];
      return end ? `${s.name} ${format(end[1])}` : "";
    })
    .filter(Boolean)
    .join(", ");
}

/** The xG, momentum, and win-probability timelines, one point per match minute. */
export function Timelines() {
  const timeline = useLive((s) => s.timeline);
  const meta = useLive((s) => s.metadata);
  const { language, t } = useT();
  if (!meta) return null;
  const { home, away } = meta;
  const ready = timeline.length >= 2;
  const dec = (v: number) => formatNumber(language, v, 2);
  const pct = (v: number) => formatPercent(language, v);
  const int = (v: number) => formatNumber(language, v, 0);

  const xg: Series[] = [
    {
      name: home.short_name,
      colour: home.primary_colour,
      points: pick(timeline, (p) => p.xgHome),
    },
    {
      name: away.short_name,
      colour: away.primary_colour,
      dash: "5 3",
      points: pick(timeline, (p) => p.xgAway),
    },
  ];
  const momentum: Series[] = [
    {
      name: home.short_name,
      colour: "#6bfb9a",
      points: pick(timeline, (p) => p.momentum),
    },
  ];
  const win: Series[] = [
    {
      name: home.short_name,
      colour: home.primary_colour,
      points: pick(timeline, (p) => p.win?.home),
    },
    {
      name: t("tacDraw"),
      colour: "#bccabb",
      dash: "1 3",
      points: pick(timeline, (p) => p.win?.draw),
    },
    {
      name: away.short_name,
      colour: away.primary_colour,
      dash: "5 3",
      points: pick(timeline, (p) => p.win?.away),
    },
  ];
  const xgMax = Math.max(1, ...xg.flatMap((s) => s.points.map((p) => p[1])));

  return (
    <section
      aria-labelledby="timelines-title"
      className="flex flex-col gap-3 card p-5"
    >
      <h2 id="timelines-title" className="visually-hidden">
        {t("timelineXg")}, {t("timelineMomentum")}, {t("timelineWin")}
      </h2>
      {ready ? (
        <>
          <LineChart
            title={t("timelineXg")}
            series={xg}
            yMin={0}
            yMax={Math.ceil(xgMax)}
            yFormat={dec}
            summary={summarise(xg, dec)}
          />
          <LineChart
            title={t("timelineMomentum")}
            series={momentum}
            yMin={-100}
            yMax={100}
            yFormat={int}
            summary={summarise(momentum, int)}
          />
          <LineChart
            title={t("timelineWin")}
            series={win}
            yMin={0}
            yMax={1}
            yFormat={pct}
            summary={summarise(win, pct)}
          />
        </>
      ) : (
        <p className="text-sm text-ink-2">{t("timelineEmpty")}</p>
      )}
    </section>
  );
}

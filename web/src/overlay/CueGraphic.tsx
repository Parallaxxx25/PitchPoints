import type { MatchMetadata, OverlayCue } from "../contracts.gen.ts";
import type { CueText } from "../text.ts";

const card = "cue-in rounded-[0.8cqw] bg-lowest/90 text-white shadow-lg";

function Tag({
  accent,
  title,
  lines,
}: {
  accent: string;
  title: string;
  lines: string[];
}) {
  return (
    <div
      className={`${card} w-[26cqw] border-l-[0.8cqw] px-[1.4cqw] py-[0.9cqw] ${accent}`}
    >
      <div className="text-[2cqw] font-bold leading-tight">{title}</div>
      {lines.map((line) => (
        <div key={line} className="text-[1.7cqw] leading-snug text-ink">
          {line}
        </div>
      ))}
    </div>
  );
}

/** One overlay cue as a broadcast graphic, sized in container units so it scales with the 16:9 frame. */
export function CueGraphic({
  cue,
  text,
  meta,
}: {
  cue: OverlayCue;
  text: CueText;
  meta: MatchMetadata;
}) {
  switch (cue.template) {
    case "player_tag":
      return <Tag accent="border-cyan" title={text.title} lines={text.lines} />;
    case "pass_quality":
      return (
        <Tag accent="border-volt-deep" title={text.title} lines={text.lines} />
      );
    case "shot_speed":
      return (
        <Tag accent="border-coral" title={text.title} lines={text.lines} />
      );
    case "momentum_bar": {
      const value = text.bar ?? 0;
      const share = Math.min(100, Math.abs(value)) / 2;
      const fill =
        value >= 0
          ? { right: "50%", width: `${share}%` }
          : { left: "50%", width: `${share}%` };
      return (
        <div
          className={`${card} w-[34cqw] px-[1.6cqw] py-[0.9cqw]`}
          data-template="momentum_bar"
        >
          <div className="flex justify-between text-[1.5cqw] font-semibold">
            <span>{meta.home.short_name}</span>
            <span>{text.title}</span>
            <span>{meta.away.short_name}</span>
          </div>
          <div
            role="meter"
            aria-label={text.title}
            aria-valuemin={-100}
            aria-valuemax={100}
            aria-valuenow={value}
            className="relative mt-[0.5cqw] h-[1.2cqw] rounded bg-highest"
          >
            <div className="absolute top-0 h-full bg-volt-deep" style={fill} />
            <div className="absolute left-1/2 top-0 h-full w-[0.2cqw] bg-white" />
          </div>
        </div>
      );
    }
    case "key_moment":
      return (
        <div
          className={`${card} flex w-[70cqw] overflow-hidden`}
          data-template="key_moment"
        >
          <div className="bg-volt-deep px-[1.6cqw] py-[1.1cqw] text-[1.9cqw] font-bold text-lowest">
            {text.title}
          </div>
          <div className="px-[2cqw] py-[1.1cqw] text-[2.2cqw] leading-snug">
            {text.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>
      );
    case "stat_compare":
      return (
        <div
          className={`${card} w-[36cqw] px-[1.6cqw] py-[1.1cqw]`}
          data-template="stat_compare"
        >
          <div className="mb-[0.8cqw] text-center text-[1.9cqw] font-bold">
            {text.title}
          </div>
          <table className="w-full text-[1.5cqw]">
            <thead>
              <tr className="text-ink-2">
                <th scope="col" className="w-[28%] text-right font-semibold">
                  {meta.home.short_name}
                </th>
                <td />
                <th scope="col" className="w-[28%] text-left font-semibold">
                  {meta.away.short_name}
                </th>
              </tr>
            </thead>
            <tbody>
              {text.rows.map((row) => (
                <tr key={row.label}>
                  <td className="text-right font-bold tabular-nums">
                    {row.home}
                  </td>
                  <th
                    scope="row"
                    className="px-[1cqw] text-center font-normal text-ink"
                  >
                    {row.label}
                  </th>
                  <td className="text-left font-bold tabular-nums">
                    {row.away}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "recap_card":
      return (
        <div
          className={`${card} w-[46cqw] px-[2cqw] py-[1.4cqw]`}
          data-template="recap_card"
        >
          <div className="text-center text-[2.6cqw] font-bold">
            {text.title}
          </div>
          <ul className="mt-[1cqw] flex list-none flex-col gap-[0.5cqw] p-0 text-[1.6cqw]">
            {text.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      );
  }
}

import { Zap } from "lucide-react";
import { useMemo } from "react";
import { formatNumber } from "../i18n/index.ts";
import { pointsByPlayer } from "../points.ts";
import { useProfile } from "../profile.ts";
import { playerName } from "../roster.ts";
import { useLive } from "../store.ts";
import { useT } from "../useT.ts";

/** The viewer's fantasy squad at a glance: its total, whether that can still change, and the captain. */
export function SquadStrip() {
  const profile = useProfile((s) => s.profile);
  const setScreen = useProfile((s) => s.setScreen);
  const meta = useLive((s) => s.metadata);
  const ledger = useLive((s) => s.ledger);
  const total = useLive((s) => s.squadTotal);
  const finished = useLive((s) => s.state?.status === "finished");
  const { language, t } = useT();
  const points = useMemo(() => pointsByPlayer(ledger), [ledger]);
  const squad = profile.fantasy_squad;
  if (!meta) return null;

  if (!squad) {
    return (
      <section className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-ink-2">{t("fantasyNoSquad")}</p>
        <button
          type="button"
          className="btn-primary px-4 py-2 text-sm"
          onClick={() => setScreen("squad")}
        >
          {t("obPickSquad")}
        </button>
      </section>
    );
  }

  const provisional =
    !finished &&
    squad.players.some((id) => (points.get(id)?.provisional ?? 0) !== 0);
  const captainPoints = points.get(squad.captain_id)?.total ?? 0;
  return (
    <section
      aria-label={t("fantasyTitle")}
      className="card mb-6 flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-tr from-[#03b5d3] to-cyan text-lowest"
          >
            <Zap size={22} />
          </span>
          <span>
            <span className="block label-caps text-ink-2">
              {t("fantasyTitle")}
            </span>
            <span className="font-semibold">
              {t("squadOwner", { name: profile.display_name })}
            </span>
          </span>
        </div>
        <span
          aria-hidden="true"
          className="hidden h-8 w-px bg-highest sm:block"
        />
        <div className="flex items-baseline gap-2">
          <span
            className="font-mono text-4xl font-extrabold text-volt"
            data-squad-total
          >
            {total === null ? "–" : formatNumber(language, total)}
          </span>
          <span className="label-caps text-ink-2">{t("ptsUnit")}</span>
          <span
            className={`pill label-caps ${provisional ? "text-amber" : "text-volt"}`}
          >
            {provisional ? t("fantasyProvisional") : t("fantasyFinal")}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="pod flex items-center gap-3 px-4 py-2">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-lg bg-violet font-mono text-sm font-bold text-[#23005c]"
          >
            C
          </span>
          <span>
            <span className="block label-caps text-cyan">
              {t("captainLabel")}
            </span>
            <span className="font-semibold">
              {playerName(meta, squad.captain_id)}
            </span>
          </span>
          <span className="ml-2 font-mono font-bold text-volt">
            {t("fantasyPlayerTotal", {
              points: formatNumber(language, captainPoints),
            })}{" "}
            ×2
          </span>
        </div>
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={() => setScreen("squad")}
        >
          {t("fantasyEdit")}
        </button>
      </div>
    </section>
  );
}

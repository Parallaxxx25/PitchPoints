import { Feed } from "../components/Feed.tsx";
import { ModeFrame } from "../components/ModeFrame.tsx";
import { TeamPanel } from "../components/TeamPanel.tsx";
import { useProfile } from "../profile.ts";
import { sideOf } from "../roster.ts";
import { useLive } from "../store.ts";
import { useT } from "../useT.ts";
import { useRightRail } from "./rightRail.tsx";
import { Headline } from "./CasualView.tsx";

/** Club mode: the match from the favourite club's side: its players and stats, and its story. */
export function ClubView() {
  const meta = useLive((s) => s.metadata)!;
  const clubId = useProfile((s) => s.profile.favourite_club_id);
  const setScreen = useProfile((s) => s.setScreen);
  const { t } = useT();
  const side =
    clubId === meta.home.id || clubId === meta.away.id
      ? sideOf(meta, clubId)
      : null;
  const club = side ? meta[side] : null;
  const right = useRightRail({
    id: "feed",
    label: club ? t("clubStory") : t("tabStory"),
    element: club ? (
      <Feed filter={(m) => m.team_id === club.id || m.type === "goal"} />
    ) : (
      <Feed />
    ),
  });

  if (!side || !club) {
    return (
      <ModeFrame
        right={[right]}
        below={[
          {
            id: "pick",
            label: t("tabClub"),
            element: (
              <section className="card flex flex-col items-start gap-3 p-5">
                <p>{t("clubPick")}</p>
                <button
                  type="button"
                  className="btn-primary px-4 py-2 text-sm"
                  onClick={() => setScreen("setup")}
                >
                  {t("profileButton")}
                </button>
              </section>
            ),
          },
        ]}
        tabOrder={["pick", right.id]}
      />
    );
  }

  const opponent = meta[side === "home" ? "away" : "home"];
  return (
    <ModeFrame
      left={[
        {
          id: "club",
          label: t("tabClub"),
          element: (
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-bold">
                {t("clubTitle", { team: club.name })}
              </h2>
              <TeamPanel side={side} shows="minutes" stats="headline" />
              <p className="text-sm text-ink-2">
                {t("clubOpponent", { team: opponent.name })}
              </p>
            </div>
          ),
        },
      ]}
      right={[right]}
      below={[{ id: "headline", label: t("tabStats"), element: <Headline /> }]}
      tabOrder={[right.id, "club", "headline"]}
    />
  );
}

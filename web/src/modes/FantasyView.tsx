import { Feed } from "../components/Feed.tsx";
import { ModeFrame } from "../components/ModeFrame.tsx";
import { TeamPanel } from "../components/TeamPanel.tsx";
import { useProfile } from "../profile.ts";
import { useLive } from "../store.ts";
import { useT } from "../useT.ts";
import { useRightRail } from "./rightRail.tsx";

/** Fantasy mode (the Stitch live screen): both teams' fantasy points, and the points as they are scored. */
export function FantasyView() {
  const meta = useLive((s) => s.metadata)!;
  const squad = useProfile((s) => s.profile.fantasy_squad);
  const { t } = useT();
  const players = squad ? new Set(squad.players) : undefined;
  const right = useRightRail({
    id: "away",
    label: meta.away.short_name,
    element: <TeamPanel side="away" shows="points" />,
  });
  return (
    <ModeFrame
      left={[
        {
          id: "home",
          label: meta.home.short_name,
          element: <TeamPanel side="home" shows="points" />,
        },
      ]}
      right={[right]}
      below={[
        {
          id: "feed",
          label: t("tabStory"),
          element: <Feed initial="points" players={players} />,
        },
      ]}
      tabOrder={["feed", "home", right.id]}
    />
  );
}

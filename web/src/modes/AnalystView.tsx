import { Feed } from "../components/Feed.tsx";
import { ModeFrame } from "../components/ModeFrame.tsx";
import { Tactics } from "../components/Tactics.tsx";
import { TeamPanel } from "../components/TeamPanel.tsx";
import { Timelines } from "../components/Timelines.tsx";
import { useLive } from "../store.ts";
import { useT } from "../useT.ts";
import { useRightRail } from "./rightRail.tsx";

/** Dense: both teams' full stats and players, the tactical indices, the timelines, and every moment. */
export function AnalystView() {
  const meta = useLive((s) => s.metadata)!;
  const { t } = useT();
  const right = useRightRail({
    id: "away",
    label: meta.away.short_name,
    element: <TeamPanel side="away" shows="minutes" stats="full" />,
  });
  return (
    <ModeFrame
      left={[
        {
          id: "home",
          label: meta.home.short_name,
          element: <TeamPanel side="home" shows="minutes" stats="full" />,
        },
      ]}
      right={[right]}
      below={[
        {
          id: "tactics",
          label: t("tabTactics"),
          element: (
            <div className="flex flex-col gap-6">
              <Tactics />
              <Timelines />
            </div>
          ),
        },
        { id: "feed", label: t("tabStory"), element: <Feed /> },
      ]}
      tabOrder={["tactics", "feed", "home", right.id]}
    />
  );
}

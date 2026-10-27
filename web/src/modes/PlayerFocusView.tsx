import { useEffect } from "react";
import { Feed } from "../components/Feed.tsx";
import { ModeFrame } from "../components/ModeFrame.tsx";
import { PlayerDrawer } from "../components/PlayerDrawer.tsx";
import { useProfile } from "../profile.ts";
import { rosterOf } from "../roster.ts";
import { useLive } from "../store.ts";
import { useT } from "../useT.ts";

/** Player focus: one player's card always open (with a picker), and the moments they are part of. */
export function PlayerFocusView() {
  const meta = useLive((s) => s.metadata)!;
  const selected = useProfile((s) => s.selectedPlayerId);
  const favourites = useProfile((s) => s.profile.favourite_player_ids);
  const selectPlayer = useProfile((s) => s.selectPlayer);
  const { t } = useT();
  const roster = rosterOf(meta);
  const chosen =
    selected && roster.has(selected)
      ? selected
      : (favourites.find((id) => roster.has(id)) ?? meta.home.starters[9]!.id);

  useEffect(() => {
    if (selected !== chosen) selectPlayer(chosen);
  }, [selected, chosen, selectPlayer]);

  return (
    <ModeFrame
      right={[
        {
          id: "player",
          label: t("tabPlayer"),
          element: <PlayerDrawer playerId={chosen} pinned />,
        },
      ]}
      below={[
        {
          id: "feed",
          label: t("tabStory"),
          element: <Feed filter={(m) => m.player_ids.includes(chosen)} />,
        },
      ]}
      tabOrder={["player", "feed"]}
    />
  );
}

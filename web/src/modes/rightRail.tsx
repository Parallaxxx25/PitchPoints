import type { PanelDef } from "../components/ModeFrame.tsx";
import { PlayerDrawer } from "../components/PlayerDrawer.tsx";
import { useProfile } from "../profile.ts";
import { useT } from "../useT.ts";

/** The right rail: the open player's card, or the given panel when no player is open. */
export function useRightRail(fallback: PanelDef): PanelDef {
  const selected = useProfile((s) => s.selectedPlayerId);
  const { t } = useT();
  return selected
    ? {
        id: "player",
        label: t("tabPlayer"),
        element: <PlayerDrawer playerId={selected} />,
      }
    : fallback;
}

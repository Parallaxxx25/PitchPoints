import { useEffect } from "react";
import { Onboarding } from "./components/Onboarding.tsx";
import { Shell } from "./components/Shell.tsx";
import { SquadPage } from "./components/SquadPage.tsx";
import { connect, disconnect } from "./connection.ts";
import { OverlayPage } from "./overlay/OverlayPage.tsx";
import { useProfile } from "./profile.ts";
import { useLive } from "./store.ts";
import { useLanguage } from "./useT.ts";

function FanApp() {
  const hasMatch = useLive((s) => s.matchId !== null && s.metadata !== null);
  const screen = useProfile((s) => s.screen);
  const language = useLanguage();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const matchId = new URLSearchParams(location.search).get("match");
    if (matchId) connect(matchId);
    return disconnect;
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  if (!hasMatch || screen === "setup") return <Onboarding />;
  return screen === "squad" ? <SquadPage /> : <Shell />;
}

/** The fan app (set-up, squad selection, live match), or the broadcast overlay at /overlay. */
export default function App() {
  const overlay =
    typeof location !== "undefined" && location.pathname.startsWith("/overlay");
  return overlay ? <OverlayPage /> : <FanApp />;
}

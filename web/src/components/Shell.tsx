import { AnalystView } from "../modes/AnalystView.tsx";
import { CasualView } from "../modes/CasualView.tsx";
import { ClubView } from "../modes/ClubView.tsx";
import { FantasyView } from "../modes/FantasyView.tsx";
import { PlayerFocusView } from "../modes/PlayerFocusView.tsx";
import { type Mode, useProfile } from "../profile.ts";
import { useLive } from "../store.ts";
import { useT } from "../useT.ts";
import { Header } from "./Header.tsx";
import { MomentToast } from "./MomentToast.tsx";
import { SquadStrip } from "./SquadStrip.tsx";

function ModeView({ mode }: { mode: Mode }) {
  switch (mode) {
    case "analyst":
      return <AnalystView />;
    case "casual":
      return <CasualView />;
    case "fantasy":
      return <FantasyView />;
    case "player_focus":
      return <PlayerFocusView />;
    case "club":
      return <ClubView />;
  }
}

/** The page footer: the data is synthetic. */
export function Footer() {
  const { t } = useT();
  return (
    <footer className="border-t border-stroke px-4 py-6 text-center text-sm text-ink-2">
      {t("appName")} · {t("syntheticNote")}
    </footer>
  );
}

/** The live match: top bar, the viewer's mode (with the squad strip in Fantasy mode), and the footer. */
export function Shell() {
  const mode = useProfile((s) => s.profile.mode);
  const meta = useLive((s) => s.metadata);
  const { t } = useT();
  return (
    <>
      <a href="#main" className="visually-hidden skip-link">
        {t("skipToContent")}
      </a>
      <Header />
      <main id="main" className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
        {meta ? (
          <>
            {mode === "fantasy" && <SquadStrip />}
            <ModeView mode={mode} />
          </>
        ) : (
          <p role="status">{t("connecting")}</p>
        )}
      </main>
      <Footer />
      <MomentToast />
    </>
  );
}

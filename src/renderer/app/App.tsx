import { LoginScreen } from "../features/auth/LoginScreen";
import { ChatShell } from "../features/chat/ChatShell";
import { useMatrixSession } from "../hooks/matrix/useMatrixSession";
import { BrandLogo } from "../components/common/BrandLogo";
import { PreferenceEffects } from "../features/settings/PreferenceEffects";

export function App() {
  const { phase } = useMatrixSession();

  if (phase === "restoring") {
    return (
      <><PreferenceEffects /><main className="splash-screen" role="status" aria-label="Loading Grungus" aria-busy="true">
        <div className="splash-screen__icon" aria-hidden="true">
          <BrandLogo className="splash-screen__logo" />
        </div>
        <strong className="splash-screen__name">GRUNGUS</strong>
        <p className="splash-screen__message">Getting things ready…</p>
      </main></>
    );
  }

  return <><PreferenceEffects />{phase === "connected" ? <ChatShell /> : <LoginScreen />}</>;
}

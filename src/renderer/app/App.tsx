import { useState } from "react";
import splashConfig from "../../config/splash-quotes.json";
import { DesktopFrame } from "../components/common/DesktopFrame";
import { LoginScreen } from "../features/auth/LoginScreen";
import { ChatShell } from "../features/chat/ChatShell";
import { useMatrixSession } from "../hooks/matrix/useMatrixSession";
import { BrandLogo } from "../components/common/BrandLogo";
import { PreferenceEffects } from "../features/settings/PreferenceEffects";

const splashQuotes = splashConfig.quotes.map(quote => quote.trim()).filter(Boolean);

export function App() {
  const { phase } = useMatrixSession();
  const [quote] = useState(() => splashQuotes[Math.floor(Math.random() * splashQuotes.length)] ?? "Every conversation starts with a little hello.");

  if (phase === "restoring") {
    return (
      <DesktopFrame><PreferenceEffects /><main className="splash-screen" role="status" aria-label="Loading Grungus" aria-busy="true">
        <div className="splash-screen__icon" aria-hidden="true">
          <BrandLogo className="splash-screen__logo" />
        </div>
        <strong className="splash-screen__name">GRUNGUS</strong>
        <p className="splash-screen__message">{quote}</p>
      </main></DesktopFrame>
    );
  }

  return <DesktopFrame><PreferenceEffects />{phase === "connected" ? <ChatShell /> : <LoginScreen />}</DesktopFrame>;
}

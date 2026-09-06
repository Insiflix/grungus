import { LoginScreen } from "../features/auth/LoginScreen";
import { ChatShell } from "../features/chat/ChatShell";
import { useMatrixSession } from "../hooks/matrix/useMatrixSession";

export function App() {
  const { phase } = useMatrixSession();

  if (phase === "restoring") {
    return (
      <main className="splash-screen" aria-label="Restoring Matrix session">
        <div className="brand-mark brand-mark--large" aria-hidden="true">
          G
        </div>
        <div className="spinner" />
        <p>Restoring your encrypted session…</p>
      </main>
    );
  }

  return phase === "connected" ? <ChatShell /> : <LoginScreen />;
}

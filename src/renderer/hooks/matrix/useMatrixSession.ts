import { useMatrixRuntime } from "../../app/providers/MatrixProvider";
import { useMatrixSnapshot } from "./useMatrixSnapshot";

export function useMatrixSession() {
  const runtime = useMatrixRuntime();
  const snapshot = useMatrixSnapshot();
  return {
    phase: snapshot.phase,
    session: snapshot.session,
    sync: snapshot.sync,
    discovery: snapshot.discovery,
    discoveryPending: snapshot.discoveryPending,
    error: snapshot.error,
    persistenceWarning: snapshot.persistenceWarning,
    discover: (server: string) => runtime.discover(server),
    resetDiscovery: () => runtime.resetDiscovery(),
    loginWithPassword: (user: string, password: string) =>
      runtime.loginWithPassword(user, password),
    startBrowserLogin: (identityProviderId?: string) =>
      runtime.startBrowserLogin(identityProviderId),
    logout: () => runtime.logout(),
    clearError: () => runtime.clearError(),
  };
}

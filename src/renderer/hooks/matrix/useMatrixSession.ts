import { useMatrixRuntime } from "../../app/providers/MatrixProvider";
import { useMatrixSnapshot } from "./useMatrixSnapshot";

export function useMatrixSession() {
  const runtime = useMatrixRuntime();
  const snapshot = useMatrixSnapshot();
  return {
    phase: snapshot.phase,
    session: snapshot.session,
    profile: snapshot.profile,
    sync: snapshot.sync,
    discovery: snapshot.discovery,
    discoveryPending: snapshot.discoveryPending,
    browserLoginPending: snapshot.browserLoginPending,
    error: snapshot.error,
    persistenceWarning: snapshot.persistenceWarning,
    registrationChallenge: snapshot.registrationChallenge,
    register: (user: string, password: string, auth?: Parameters<typeof runtime.register>[2]) => runtime.register(user, password, auth),
    cancelRegistration: () => runtime.cancelRegistration(),
    discover: (server: string) => runtime.discover(server),
    resetDiscovery: () => runtime.resetDiscovery(),
    loginWithPassword: (user: string, password: string) =>
      runtime.loginWithPassword(user, password),
    startBrowserLogin: (identityProviderId?: string, register = false) =>
      runtime.startBrowserLogin(identityProviderId, register),
    cancelBrowserLogin: () => runtime.cancelBrowserLogin(),
    logout: () => runtime.logout(),
    clearError: () => runtime.clearError(),
  };
}

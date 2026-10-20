import { AttachmentMediaContext } from "../../components/common/AttachmentMediaContext";
import { ScreenShareDialogHost } from "../../features/chat/ScreenShareDialog";
import { createContext, useContext, useEffect, type PropsWithChildren } from "react";
import { MatrixAuthProvider } from "../../../infrastructure/matrix/MatrixAuthProvider";
import { MatrixJsSdkClient } from "../../../infrastructure/matrix/MatrixJsSdkClient";
import { MatrixRuntime } from "../MatrixRuntime";
import { AvatarMediaProvider } from "../../components/common/AvatarMediaContext";

const authProvider = new MatrixAuthProvider();
const matrixClient = new MatrixJsSdkClient({
  onSessionUpdated: async (session) => {
    await authProvider.persistSession(session);
  },
});
const runtime = new MatrixRuntime(matrixClient, authProvider);

const MatrixRuntimeContext = createContext<MatrixRuntime | null>(null);

export function MatrixProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    void runtime.bootstrap();
  }, []);

  return (
    <MatrixRuntimeContext.Provider value={runtime}>
      <AttachmentMediaContext.Provider value={runtime.loadAttachment}><AvatarMediaProvider load={runtime.loadAvatar}>{children}<ScreenShareDialogHost /></AvatarMediaProvider></AttachmentMediaContext.Provider>
    </MatrixRuntimeContext.Provider>
  );
}

export function useMatrixRuntime(): MatrixRuntime {
  const value = useContext(MatrixRuntimeContext);
  if (!value) throw new Error("useMatrixRuntime must be used within MatrixProvider");
  return value;
}

export const mountCall = matrixClient.mountCall;

export const observeCalls = matrixClient.observeCalls;

export const directCalls = matrixClient.directCalls;
export const matrixSettings = matrixClient.settings;
export const matrixNotifications = matrixClient.notifications;

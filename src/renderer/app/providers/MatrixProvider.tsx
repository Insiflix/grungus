import { createContext, useContext, useEffect, type PropsWithChildren } from "react";
import { MatrixAuthProvider } from "../../../infrastructure/matrix/MatrixAuthProvider";
import { MatrixJsSdkClient } from "../../../infrastructure/matrix/MatrixJsSdkClient";
import { MatrixRuntime } from "../MatrixRuntime";

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
      {children}
    </MatrixRuntimeContext.Provider>
  );
}

export function useMatrixRuntime(): MatrixRuntime {
  const value = useContext(MatrixRuntimeContext);
  if (!value) throw new Error("useMatrixRuntime must be used within MatrixProvider");
  return value;
}

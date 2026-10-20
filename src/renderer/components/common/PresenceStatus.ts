import type { MatrixPresence } from "../../../domain/matrix/MatrixTypes";

export const presenceLabels: Record<MatrixPresence, string> = {
  online: "Online",
  unavailable: "Away",
  offline: "Offline",
  unknown: "Status unknown",
};

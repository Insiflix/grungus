export interface RoomCall {
  roomId: string;
  name: string;
  participants: number;
  members?: import("../matrix/MatrixTypes").MatrixUser[];
}
export interface CallHandle {
  dispose(): void;
  hangup(): Promise<void>;
  setDevices?(state: { audio_enabled?: boolean; video_enabled?: boolean }): Promise<{ audio_enabled: boolean; video_enabled: boolean }>;
}
export interface CallOptions {
  skipLobby?: boolean;
}
export interface ICallProvider {
  mountCall(iframe: HTMLIFrameElement, roomId: string, video: boolean, onClose: () => void, onReady?: () => void, onJoined?: () => void, options?: CallOptions): CallHandle;
  observeCalls(listener: (calls: RoomCall[]) => void): () => void;
}

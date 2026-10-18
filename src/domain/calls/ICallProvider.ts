export interface RoomCall {
  roomId: string;
  name: string;
  participants: number;
}
export interface CallHandle {
  dispose(): void;
  hangup(): Promise<void>;
}
export interface ICallProvider {
  mountCall(iframe: HTMLIFrameElement, roomId: string, video: boolean, onClose: () => void, onReady?: () => void, onJoined?: () => void): CallHandle;
  observeCalls(listener: (calls: RoomCall[]) => void): () => void;
}

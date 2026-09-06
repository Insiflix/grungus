export interface ICallProvider {
  readonly available: boolean;
  openRoomCall(roomId: string): Promise<void>;
}

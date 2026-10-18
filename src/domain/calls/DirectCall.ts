import type { CameraQuality } from "./CameraQuality";
﻿export interface DirectCallFeed { id: string; stream: MediaStream; local: boolean; screenshare: boolean }
export interface DirectCallState {
  id: string;
  roomId: string;
  name: string;
  state: string;
  incoming: boolean;
  video: boolean;
  microphoneMuted: boolean;
  cameraMuted: boolean;
  error: string | null;
  cameraQuality: CameraQuality;
  screenSharing: boolean;
  screenAudio: boolean;
  feeds: DirectCallFeed[];
}

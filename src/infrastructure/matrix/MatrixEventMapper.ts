import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import type { MatrixMessage, MatrixRoom } from "../../domain/matrix/MatrixTypes";
import { MatrixMessageMapper } from "./MatrixMessageMapper";
import { MatrixRoomMapper } from "./MatrixRoomMapper";

export class MatrixEventMapper {
  private readonly messages: MatrixMessageMapper;
  private readonly rooms: MatrixRoomMapper;

  constructor(client: MatrixClient) {
    this.messages = new MatrixMessageMapper(client);
    this.rooms = new MatrixRoomMapper(client);
  }

  message(event: MatrixEvent, room: Room): MatrixMessage | null {
    return this.messages.map(event, room);
  }

  room(room: Room): MatrixRoom {
    return this.rooms.map(room);
  }
}

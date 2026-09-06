import {
  Direction,
  EventType,
  NotificationCountType,
  type MatrixClient,
  type Room,
  type RoomMember,
} from "matrix-js-sdk";
import type {
  MatrixMembership,
  MatrixRoom,
  MatrixRoomMember,
} from "../../domain/matrix/MatrixTypes";
import { MatrixMediaResolver } from "./MatrixMediaResolver";

function membership(value: string | undefined): MatrixMembership {
  if (
    value === "join" ||
    value === "invite" ||
    value === "leave" ||
    value === "ban" ||
    value === "knock"
  ) {
    return value;
  }
  return "leave";
}

export class MatrixRoomMapper {
  private readonly media: MatrixMediaResolver;

  constructor(private readonly client: MatrixClient) {
    this.media = new MatrixMediaResolver(client);
  }

  map(room: Room): MatrixRoom {
    const topicEvent = room
      .getLiveTimeline()
      .getState(Direction.Forward)
      ?.getStateEvents(EventType.RoomTopic, "");
    const topic = Array.isArray(topicEvent)
      ? null
      : topicEvent?.getContent().topic;

    return {
      id: room.roomId,
      name: room.name || "Unnamed room",
      avatarUrl: this.media.resolve(room.getMxcAvatarUrl(), 128, 128),
      topic: typeof topic === "string" ? topic : null,
      unreadCount: room.getUnreadNotificationCount(NotificationCountType.Total),
      highlightCount: room.getUnreadNotificationCount(
        NotificationCountType.Highlight,
      ),
      isEncrypted: room.hasEncryptionStateEvent(),
      membership: membership(room.getMyMembership()),
      memberCount: room.getJoinedMemberCount(),
    };
  }

  mapMember(member: RoomMember): MatrixRoomMember {
    return {
      id: member.userId,
      displayName: member.name || member.userId,
      avatarUrl: this.media.resolve(member.getMxcAvatarUrl(), 80, 80),
      membership: membership(member.membership),
      isTyping: member.typing,
    };
  }
}


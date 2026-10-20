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
import type { MatrixProfileAvatars } from "./MatrixProfileAvatars";
import { MatrixMediaResolver } from "./MatrixMediaResolver";
import { directInvitePeer } from "./MatrixDirectRooms";
import { closedDirectRoomIds, closedDirectRoomsEvent } from "./MatrixClosedDirectRooms";
import { matrixPresence } from "../../domain/matrix/MatrixTypes";

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

  constructor(private readonly client: MatrixClient, private readonly profiles?: MatrixProfileAvatars, private readonly isDirectClosed?: (roomId: string) => boolean) {
    this.media = new MatrixMediaResolver(client);
  }

  map(room: Room): MatrixRoom {
    const state = room
      .getLiveTimeline()
      .getState(Direction.Forward);
    const topicEvent = state?.getStateEvents(EventType.RoomTopic, "");
    const topic = Array.isArray(topicEvent)
      ? null
      : topicEvent?.getContent().topic;

    const directPeer = Object.entries(this.client.getAccountData?.(EventType.Direct)?.getContent() ?? {})
      .find(([userId, ids]) => userId !== this.client.getUserId?.() && Array.isArray(ids) && ids.includes(room.roomId))?.[0] ?? directInvitePeer(room, this.client.getUserId?.());
    const peer = (directPeer && room.getMember?.(directPeer)) || room.getAvatarFallbackMember?.();
    const peerId = directPeer || peer?.userId;
    const roomAvatar = room.getMxcAvatarUrl();
    const peerAvatar = roomAvatar ? undefined : (this.profiles && peerId
      ? this.profiles.resolve(peer, peerId)
      : peer?.getMxcAvatarUrl());
    return {
      id: room.roomId,
      name: room.name || "Unnamed room",
      avatarUrl: this.media.resolve(roomAvatar || peerAvatar, 128, 128),
      topic: typeof topic === "string" ? topic : null,
      unreadCount: room.getUnreadNotificationCount(NotificationCountType.Total),
      highlightCount: room.getUnreadNotificationCount(
        NotificationCountType.Highlight,
      ),
      isEncrypted: room.hasEncryptionStateEvent(),
      membership: membership(room.getMyMembership()),
      memberCount: room.getJoinedMemberCount(),
      directUserId: directPeer || undefined,
      isDirect: Object.values(this.client.getAccountData?.(EventType.Direct)?.getContent() ?? {})
        .some((ids) => Array.isArray(ids) && ids.includes(room.roomId)) || Boolean(directPeer),
      isDirectClosed: this.isDirectClosed?.(room.roomId) ?? closedDirectRoomIds(this.client.getAccountData?.(closedDirectRoomsEvent)?.getContent()).includes(room.roomId),
      isSpace: room.isSpaceRoom?.() ?? false,
      roomType: state?.getStateEvents(EventType.RoomCreate, "")?.getContent().type,
      joinRule: state?.getStateEvents(EventType.RoomJoinRules, "")?.getContent().join_rule,
      childRoomIds: room.isSpaceRoom?.()
        ? (state?.getStateEvents(EventType.SpaceChild) ?? [])
            .filter((event) => Array.isArray(event.getContent().via) && event.getContent().via.length > 0)
            .map((event) => event.getStateKey()!)
        : [],
    };
  }

  mapMember(member: RoomMember): MatrixRoomMember {
    return {
      id: member.userId,
      displayName: this.profiles?.displayName(member, member.userId) || member.name || member.userId.replace(/^@/, "").split(":")[0],
      avatarUrl: this.media.resolve((this.profiles ? this.profiles.resolve(member, member.userId) : member.getMxcAvatarUrl()), 80, 80),
      membership: membership(member.membership),
      isTyping: member.typing,
      presence: matrixPresence(this.client.getUser?.(member.userId)?.events.presence?.getContent().presence),
    };
  }
}


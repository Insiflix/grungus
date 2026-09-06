import {
  EventStatus,
  EventType,
  MsgType,
  RelationType,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import type {
  MatrixMessage,
  MatrixMessageSendState,
  MatrixMessageType,
  MatrixReaction,
} from "../../domain/matrix/MatrixTypes";
import { MatrixMediaResolver } from "./MatrixMediaResolver";

function sendState(status: EventStatus | null): MatrixMessageSendState {
  if (
    status === EventStatus.ENCRYPTING ||
    status === EventStatus.SENDING ||
    status === EventStatus.QUEUED
  ) {
    return "sending";
  }
  if (status === EventStatus.NOT_SENT) return "failed";
  if (status === EventStatus.CANCELLED) return "cancelled";
  return "sent";
}

function messageType(msgtype: unknown): MatrixMessageType {
  if (msgtype === MsgType.Text) return "text";
  if (msgtype === MsgType.Notice) return "notice";
  if (msgtype === MsgType.Emote) return "emote";
  if (msgtype === MsgType.Image) return "image";
  if (msgtype === MsgType.File) return "file";
  return "unsupported";
}

function contentRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export class MatrixMessageMapper {
  private readonly media: MatrixMediaResolver;

  constructor(private readonly client: MatrixClient) {
    this.media = new MatrixMediaResolver(client);
  }

  map(event: MatrixEvent, room: Room): MatrixMessage | null {
    const type = event.getType();
    const rawTimestamp = event.getTs();
    const wireType = event.getWireType();
    const relation = event.getRelation();
    if (
      type === EventType.Reaction ||
      type === EventType.RoomRedaction ||
      relation?.rel_type === RelationType.Replace
    ) {
      return null;
    }

    const eventId = event.getId() ?? event.getTxnId();
    if (!eventId) return null;

    const senderId = event.getSender() ?? "@unknown:matrix";
    const senderMember = room.getMember(senderId);
    const sender = {
      id: senderId,
      displayName: senderMember?.name || senderId,
      avatarUrl: this.media.resolve(senderMember?.getMxcAvatarUrl(), 80, 80),
    };
    const encryptedFailure =
      wireType === EventType.RoomMessageEncrypted && event.isDecryptionFailure();
    const encryptedPending =
      wireType === EventType.RoomMessageEncrypted && type === EventType.RoomMessageEncrypted;
    const content = contentRecord(event.getContent());
    const body = typeof content.body === "string" ? content.body : "";
    const relatesTo = contentRecord(content["m.relates_to"]);
    const inReplyTo = contentRecord(relatesTo["m.in_reply_to"]);
    const redacted = event.isRedacted();

    let mappedType: MatrixMessageType;
    let mappedBody: string;
    if (redacted) {
      mappedType = "unsupported";
      mappedBody = "Message deleted";
    } else if (encryptedFailure) {
      mappedType = "encrypted";
      mappedBody = "Unable to decrypt this message";
    } else if (encryptedPending) {
      mappedType = "encrypted";
      mappedBody = "Waiting for encryption keys…";
    } else if (type === EventType.RoomMessage) {
      mappedType = messageType(content.msgtype);
      mappedBody = body || "Unsupported message";
    } else {
      mappedType = "unsupported";
      mappedBody = `Unsupported event · ${type}`;
    }

    return {
      id: eventId,
      roomId: room.roomId,
      sender,
      timestamp: Number.isFinite(rawTimestamp) ? rawTimestamp : Date.now(),
      type: mappedType,
      body: mappedBody,
      edited: Boolean(event.replacingEvent()),
      replyTo:
        typeof inReplyTo.event_id === "string" ? inReplyTo.event_id : null,
      reactions: this.mapReactions(event, room),
      sendState: sendState(event.status),
      isOwn: senderId === this.client.getUserId(),
      isRedacted: redacted,
    };
  }

  private mapReactions(event: MatrixEvent, room: Room): MatrixReaction[] {
    const eventId = event.getId();
    if (!eventId) return [];
    const relations = room
      .getUnfilteredTimelineSet()
      .relations.getChildEventsForEvent(
        eventId,
        RelationType.Annotation,
        EventType.Reaction,
      )
      ?.getRelations();
    if (!relations) return [];

    const grouped = new Map<string, { userIds: Set<string>; eventId?: string }>();
    for (const reaction of relations) {
      if (reaction.isRedacted()) continue;
      const relation = contentRecord(reaction.getContent()["m.relates_to"]);
      const key = relation.key;
      const sender = reaction.getSender();
      if (typeof key !== "string" || !sender) continue;
      const aggregate = grouped.get(key) ?? { userIds: new Set<string>() };
      aggregate.userIds.add(sender);
      if (sender === this.client.getUserId()) {
        aggregate.eventId = reaction.getId() ?? undefined;
      }
      grouped.set(key, aggregate);
    }

    return [...grouped.entries()].map(([key, aggregate]) => ({
      key,
      count: aggregate.userIds.size,
      userIds: [...aggregate.userIds],
      eventId: aggregate.eventId,
    }));
  }
}


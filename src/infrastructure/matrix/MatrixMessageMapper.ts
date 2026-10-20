import type { EncryptedAttachment } from "../../domain/messaging/Attachments";
import { isHiddenTimelineEvent } from "./MatrixTimelinePolicy";
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
import type { MatrixProfileAvatars } from "./MatrixProfileAvatars";
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
  if (msgtype === MsgType.Video) return "video";
  if (msgtype === MsgType.Audio) return "audio";
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

  constructor(private readonly client: MatrixClient, private readonly profiles?: MatrixProfileAvatars) {
    this.media = new MatrixMediaResolver(client);
  }

  map(event: MatrixEvent, room: Room): MatrixMessage | null {
    const type = event.getType();
    const rawTimestamp = event.getTs();
    const wireType = event.getWireType();
    if (isHiddenTimelineEvent(event)) return null;

    const eventId = event.getId() ?? event.getTxnId();
    if (!eventId) return null;

    const senderId = event.getSender() ?? "@unknown:matrix";
    const senderMember = room.getMember(senderId);
    const sender = {
      id: senderId,
      displayName: this.profiles?.displayName(senderMember, senderId) || senderMember?.name || this.client.getUser?.(senderId)?.displayName || senderId.replace(/^@/, "").split(":")[0],
      avatarUrl: this.media.resolve((this.profiles ? this.profiles.resolve(senderMember, senderId) : senderMember?.getMxcAvatarUrl()), 80, 80),
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
    const mentionIds = contentRecord(content["m.mentions"]).user_ids;
    const mentions = Array.isArray(mentionIds) ? [...new Set(mentionIds.filter((id): id is string => typeof id === "string"))] : [];

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
      ...(["image", "video", "audio", "file"].includes(mappedType) ? (() => {
        const encrypted = contentRecord(content.file);
        const url = typeof encrypted.url === "string" ? encrypted.url : content.url;
        const info = contentRecord(content.info);
        return typeof url === "string" && url.startsWith("mxc://") ? { attachment: {
          url, name: typeof content.filename === "string" ? content.filename : mappedBody,
          mimeType: typeof info.mimetype === "string" ? info.mimetype : "application/octet-stream",
          size: typeof info.size === "number" ? info.size : undefined,
          width: typeof info.w === "number" ? info.w : undefined, height: typeof info.h === "number" ? info.h : undefined,
          ...(typeof encrypted.url === "string" ? { encrypted: encrypted as unknown as EncryptedAttachment } : {}),
        } } : {};
      })() : {}),
      edited: Boolean(event.replacingEvent()),
      replyTo:
        typeof inReplyTo.event_id === "string" ? inReplyTo.event_id : null,
      reactions: this.mapReactions(event, room),
      sendState: sendState(event.status),
      isOwn: senderId === this.client.getUserId(),
      isRedacted: redacted,
      mentions: redacted ? [] : mentions.map(id => ({ id, displayName: this.profiles?.displayName(room.getMember(id), id) || room.getMember(id)?.name || id, avatarUrl: null })),
      mentionsOwnUser: !redacted && mentions.includes(this.client.getUserId() ?? ""),
      isPinned: room.currentState.getStateEvents(EventType.RoomPinnedEvents, "")?.getContent().pinned?.includes(eventId) ?? false,
      canPin: room.currentState.maySendStateEvent(EventType.RoomPinnedEvents, this.client.getUserId() ?? ""),
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


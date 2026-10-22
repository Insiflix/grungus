import { EventType, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk";
import { preferences } from "../../domain/settings/Preferences";
import { showNotification } from "../desktop/Notifications";
import { MatrixMediaResolver } from "./MatrixMediaResolver";
import { directInvitePeer } from "./MatrixDirectRooms";

export async function playNotificationSound() {
  const context = new AudioContext();
  try {
    await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .2);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + .2);
    await new Promise<void>((resolve) => { oscillator.onended = () => resolve(); });
  } finally { await context.close(); }
}

export class MatrixNotifications {
  constructor(private readonly avatar?: (url: string | null, name: string) => Promise<string>) {}
  private generation = 0;
  viewedRoom: string | null = null;
  private seen = new Set<string>();
  private encrypted = new Set<string>();
  clear() { ++this.generation; this.seen.clear(); this.encrypted.clear(); this.viewedRoom = null; }
  live(client: MatrixClient, event: MatrixEvent, room: Room) {
    const id = event.getId();
    if (!id || event.getSender() === client.getUserId() || client.isUserIgnored(event.getSender() ?? "")) return;
    if (event.isDecryptionFailure() || event.isBeingDecrypted() || event.getType() === "m.room.encrypted") {
      this.encrypted.add(id);
      if (this.encrypted.size > 500) this.encrypted.delete(this.encrypted.values().next().value!);
      return;
    }
    if (this.seen.has(id)) return;
    this.seen.add(id);
    if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value!);
    if (typeof document === "undefined" || document.hasFocus() && this.viewedRoom === room.roomId) return;
    const actions = client.getPushActionsForEvent(event, true);
    if (!actions?.notify) return;
    const prefs = preferences.getSnapshot();
    if (prefs.notificationSound && actions.tweaks.sound) void playNotificationSound().catch(() => undefined);
    if (!prefs.desktopNotifications) return;
    const content = event.getContent();
    const senderId = event.getSender()!;
    const member = room.getMember(senderId);
    const sender = member?.name || client.getUser?.(senderId)?.displayName || senderId;
    const direct = Object.values(client.getAccountData?.(EventType.Direct)?.getContent() ?? {})
      .some(ids => Array.isArray(ids) && ids.includes(room.roomId)) || Boolean(directInvitePeer(room, client.getUserId()));
    // Prefer the canonical server; older spaces may only advertise m.space.child.
    const parents = (room.currentState?.getStateEvents(EventType.SpaceParent) ?? [])
      .filter(parent => parent.getContent().via?.length)
      .sort((a, b) => Number(Boolean(b.getContent().canonical)) - Number(Boolean(a.getContent().canonical)));
    const server = parents.map(parent => client.getRoom?.(parent.getStateKey()!)).find(parent => parent?.isSpaceRoom())
      ?? client.getRooms?.().find(space => space.isSpaceRoom?.() && space.currentState?.getStateEvents(EventType.SpaceChild, room.roomId)?.getContent().via?.length);
    const title = direct ? sender : room.name;
    const avatarMxc = direct ? member?.getMxcAvatarUrl?.() || client.getUser?.(senderId)?.avatarUrl
      : server?.getMxcAvatarUrl() || room.getMxcAvatarUrl?.();
    const value = { title, roomId: room.roomId, silent: true,
      body: prefs.notificationPreviews ? (direct ? "" : `${sender}: `) + (typeof content.body === "string" ? content.body : "New activity") : "New activity in Grungus",
    };
    const generation = this.generation;
    const deliver = (iconDataUrl?: string) => {
      if (generation !== this.generation || document.hasFocus() && this.viewedRoom === room.roomId) return;
      return showNotification({ ...value, ...(iconDataUrl ? { iconDataUrl } : {}) });
    };
    const pending = this.avatar
      ? this.avatar(new MatrixMediaResolver(client).resolve(avatarMxc, 96, 96), direct ? sender : server?.name || title).catch(() => undefined).then(deliver)
      : deliver();
    void pending?.catch(error => console.warn("Unable to deliver desktop notification", error));
  }
  decrypted(client: MatrixClient, event: MatrixEvent, room: Room) {
    if (this.encrypted.delete(event.getId() ?? "")) this.live(client, event, room);
  }
}

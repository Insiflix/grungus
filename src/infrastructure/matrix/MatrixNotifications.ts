import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import { preferences } from "../../domain/settings/Preferences";
import { showNotification } from "../desktop/Notifications";

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
  viewedRoom: string | null = null;
  private seen = new Set<string>();
  private encrypted = new Set<string>();
  clear() { this.seen.clear(); this.encrypted.clear(); this.viewedRoom = null; }
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
    const sender = room.getMember(event.getSender()!)?.name ?? event.getSender();
    void showNotification({ title: room.name, roomId: room.roomId, silent: true,
        body: prefs.notificationPreviews ? `${sender}: ${typeof content.body === "string" ? content.body : "New activity"}` : "New activity in Grungus",
    }).catch(error => console.warn("Unable to deliver desktop notification", error));
  }
  decrypted(client: MatrixClient, event: MatrixEvent, room: Room) {
    if (this.encrypted.delete(event.getId() ?? "")) this.live(client, event, room);
  }
}

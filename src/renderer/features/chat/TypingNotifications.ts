/** Keep network typing updates out of a burst of keystrokes. */
export class TypingNotifications {
  private pending: ReturnType<typeof setTimeout> | undefined;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private lastSent = -Infinity;
  private active = false;

  constructor(private readonly notify: (typing: boolean) => void) {}

  update(hasText: boolean) {
    clearTimeout(this.pending);
    clearTimeout(this.idle);
    if (!hasText) { this.stop(); return; }
    // A typing request wakes Matrix sync and crypto processing. Wait for a pause,
    // and refresh at most once per four seconds (the server timeout is eight).
    this.pending = setTimeout(() => {
      this.pending = undefined;
      this.active = true;
      this.lastSent = Date.now();
      this.notify(true);
    }, Math.max(300, this.lastSent + 4000 - Date.now()));
    this.idle = setTimeout(() => this.stop(), 4000);
  }

  stop() {
    clearTimeout(this.pending);
    clearTimeout(this.idle);
    this.pending = this.idle = undefined;
    if (this.active) this.notify(false);
    this.active = false;
    this.lastSent = -Infinity;
  }
}

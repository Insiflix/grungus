import type { MatrixClient, RoomMember } from "matrix-js-sdk";

/** Fill missing room avatars and display names from the global profile once per session. */
export class MatrixProfileAvatars {
  private readonly profiles = new Map<string, { avatarUrl: string | null; displayName: string | null } | null>();
  private disposed = false;

  constructor(private readonly client: MatrixClient, private readonly updated: (userId: string) => void) {}

  resolve(member: RoomMember | null | undefined, userId: string): string | undefined {
    const roomAvatar = member?.getMxcAvatarUrl();
    if (roomAvatar) return roomAvatar;
    // An explicit empty avatar is a room-specific removal, not missing state.
    const content = member?.events?.member?.getDirectionalContent();
    if (content && Object.hasOwn(content, "avatar_url")) return undefined;
    const known = this.client.getUser?.(userId)?.avatarUrl;
    if (known) return known;
    this.fetch(userId);
    return this.profiles.get(userId)?.avatarUrl ?? undefined;
  }

  displayName(member: RoomMember | null | undefined, userId: string): string {
    if (member?.name && member.name !== userId) return member.name;
    const known = this.client.getUser?.(userId)?.displayName;
    if (known && known !== userId) return known;
    this.fetch(userId);
    return this.profiles.get(userId)?.displayName || userId.replace(/^@/, "").split(":")[0];
  }

  remember(userId: string, profile: { avatar_url?: string; displayname?: string }): void {
    if (this.disposed) return;
    this.profiles.set(userId, { avatarUrl: profile.avatar_url || null, displayName: profile.displayname || null });
    if (profile.avatar_url || profile.displayname) this.updated(userId);
  }

  private fetch(userId: string): void {
    if (!this.profiles.has(userId)) {
      this.profiles.set(userId, null);
      void this.client.getProfileInfo(userId).then((profile) => {
        if (this.disposed || this.profiles.get(userId) !== null) return;
        this.remember(userId, profile);
      }).catch(() => { /* Missing/private profiles retain initials. */ });
    }
  }

  dispose(): void { this.disposed = true; this.profiles.clear(); }
}

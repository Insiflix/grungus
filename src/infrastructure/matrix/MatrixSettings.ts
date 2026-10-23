import { ConditionKind, EventType, MatrixError, MatrixEvent, Preset, PushRuleKind, PushRuleActionName, RoomState, TweakName, Visibility, type AuthDict, type MatrixClient, type IContent } from "matrix-js-sdk";
import { membershipNotices } from "../../domain/matrix/MembershipNotices";
import { blockedUsers } from "../../domain/settings/BlockedUsers";
import { JoinRule, RestrictedAllowType } from "matrix-js-sdk/lib/@types/partials";
import type { RoomJoinRulesEventContent } from "matrix-js-sdk/lib/@types/state_events";

export interface SettingsAuthentication {
  session?: string;
  flows: { stages: string[] }[];
  completed?: string[];
}

export class SettingsAuthRequired extends Error {
  constructor(readonly challenge: SettingsAuthentication) { super("Confirm this change with your homeserver."); }
}

export class MatrixSettings {
  constructor(private readonly client: () => MatrixClient, private readonly profileChanged: () => Promise<void>) {}
  private assertCurrent(client: MatrixClient) { if (this.client() !== client) throw new Error("The Matrix session changed."); }

  async profile(name: string) {
    await this.client().setDisplayName(name.trim());
    await this.profileChanged();
  }
  async avatar(file: File | null) {
    const client = this.client();
    let url = "";
    if (file) {
      if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) throw new Error("Choose a PNG, JPEG, WebP, or GIF image.");
      if (file.size > 10 * 1024 * 1024) throw new Error("The avatar must be smaller than 10 MB.");
      url = (await client.uploadContent(file)).content_uri;
    }
    await client.setAvatarUrl(url);
    await this.profileChanged();
  }
  async capabilities() { return this.client().getCapabilities(); }
  async managementUrl(): Promise<string | null> {
    const metadata = await this.client().getAuthMetadata();
    const url = (metadata as unknown as Record<string, unknown>).account_management_uri;
    if (typeof url !== "string" || new URL(url).protocol !== "https:") return null;
    return url;
  }
  private async authenticated<T>(action: (auth?: AuthDict) => Promise<T>, auth?: AuthDict): Promise<T> {
    try { return await action(auth); }
    catch (error) {
      if (error instanceof MatrixError && error.httpStatus === 401 && Array.isArray(error.data.flows)) {
        throw new SettingsAuthRequired(error.data as unknown as SettingsAuthentication);
      }
      throw error;
    }
  }
  async password(password: string, logoutDevices: boolean, auth?: AuthDict) {
    await this.authenticated((auth) => this.client().setPassword(auth ?? {}, password, logoutDevices), auth);
  }
  async deactivate(erase: boolean, auth?: AuthDict) {
    await this.authenticated((auth) => this.client().deactivateAccount(auth, erase), auth);
  }
  async devices() {
    const client = this.client();
    const devices = (await client.getDevices()).devices;
    const crypto = client.getCrypto();
    return Promise.all(devices.map(async (device) => {
      let verified: boolean | null = null;
      try { verified = (await crypto?.getDeviceVerificationStatus(client.getUserId()!, device.device_id))?.isVerified() ?? null; } catch { /* Device list remains available if crypto is still synchronizing. */ }
      return { ...device, verified };
    }));
  }
  async renameDevice(id: string, name: string) { await this.client().setDeviceDetails(id, { display_name: name.trim() }); }
  async revokeDevice(id: string, auth?: AuthDict) {
    if (id === this.client().getDeviceId()) throw new Error("Use Sign out to end this session.");
    await this.authenticated((auth) => this.client().deleteDevice(id, auth), auth);
  }
  async addresses() { return (await this.client().getThreePids()).threepids; }
  async requestEmail(email: string, secret: string, attempt: number) { return this.client().requestAdd3pidEmailToken(email, secret, attempt); }
  async requestPhone(country: string, number: string, secret: string) { return this.client().requestAdd3pidMsisdnToken(country.toUpperCase(), number, secret, 1); }
  async verifyPhone(url: string, sid: string, secret: string, code: string) {
    if (new URL(url).protocol !== "https:") throw new Error("The homeserver returned an insecure SMS verification URL.");
    const result = await this.client().submitMsisdnTokenOtherUrl(url, sid, secret, code);
    if (!result.success) throw new Error("SMS verification failed. Check the code and try again.");
  }
  async addEmail(sid: string, secret: string, auth?: AuthDict) {
    await this.authenticated((auth) => this.client().addThreePidOnly({ sid, client_secret: secret, auth: auth as { type: string; session?: string } | undefined }), auth);
  }
  async removeAddress(medium: string, address: string) { await this.client().deleteThreePid(medium, address); }
  async ignoredUsers() {
    const client = this.client();
    const content = await client.getAccountDataFromServer(EventType.IgnoredUserList);
    this.assertCurrent(client);
    const users = Object.keys(content?.ignored_users ?? {});
    blockedUsers.update(users);
    return users;
  }
  async setIgnored(userId: string, ignored: boolean) {
    const client = this.client();
    if (!/^@[^:\s]+:\S+$/.test(userId)) throw new Error("Enter a full Matrix ID, for example @user:example.org.");
    if (userId === this.client().getUserId()) throw new Error("You cannot block yourself.");
    const users = await this.ignoredUsers();
    this.assertCurrent(client);
    const next = ignored ? [...new Set([...users, userId])] : users.filter((id) => id !== userId);
    await client.setIgnoredUsers(next);
    this.assertCurrent(client);
    blockedUsers.update(next);
  }
  async pushRules() { return this.client().getPushRules(); }
  async pushers() { return (await this.client().getPushers()).pushers; }
  async emailNotifications(address: string, enabled: boolean) {
    if (!enabled) await this.client().removePusher(address, "m.email");
    else await this.client().setPusher({ kind: "email", app_id: "m.email", pushkey: address, app_display_name: "Email notifications", device_display_name: address, lang: "en", data: {}, append: true });
  }
  async enablePushRule(kind: PushRuleKind, id: string, enabled: boolean) {
    const client = this.client();
    await client.setPushRuleEnabled("global", kind, id, enabled);
    client.setPushRules(await client.getPushRules());
  }
  async setMessageNotifications(mode: "all" | "mentions" | "off") {
    const client = this.client();
    if (mode === "off") {
      await client.setPushRuleEnabled("global", PushRuleKind.Override, ".m.rule.master", true);
    } else {
      const rules = await client.getPushRules();
      // Use the standard rules so Element and other clients see the same defaults.
      if (rules.global.underride?.some((rule) => rule.rule_id === "dev.grungus.messages")) {
        await client.deletePushRule("global", PushRuleKind.Underride, "dev.grungus.messages");
      }
      const messageRules = [".m.rule.message", ".m.rule.encrypted", ".m.rule.room_one_to_one", ".m.rule.encrypted_room_one_to_one"];
      for (const id of messageRules) {
        if (!rules.global.underride?.some((rule) => rule.rule_id === id)) continue;
        if (mode === "all") await client.setPushRuleActions("global", PushRuleKind.Underride, id, [PushRuleActionName.Notify, { set_tweak: TweakName.Sound, value: "default" }]);
        await client.setPushRuleEnabled("global", PushRuleKind.Underride, id, mode === "all");
      }
      await client.setPushRuleEnabled("global", PushRuleKind.Override, ".m.rule.master", false);
    }
    client.setPushRules(await client.getPushRules());
  }
  async keyword(word: string, remove = false) {
    if (!word.trim()) throw new Error("Enter a keyword.");
    const client = this.client();
    const id = `dev.grungus.keyword.${encodeURIComponent(word.trim())}`;
    if (remove) await client.deletePushRule("global", PushRuleKind.ContentSpecific, id);
    else {
      await client.addPushRule("global", PushRuleKind.ContentSpecific, id, {
        pattern: word.trim(), actions: [PushRuleActionName.Notify, { set_tweak: TweakName.Highlight, value: true }, { set_tweak: TweakName.Sound, value: "default" }],
      });
    }
    client.setPushRules(await client.getPushRules());
  }
  async removeKeyword(id: string) {
    const client = this.client();
    await client.deletePushRule("global", PushRuleKind.ContentSpecific, id);
    client.setPushRules(await client.getPushRules());
  }
  async media(audio: string, video: string, options: { echoCancellation: boolean; noiseSuppression: boolean; autoGainControl: boolean }) {
    const handler = this.client().getMediaHandler();
    await handler.setMediaInputs(audio, video);
    await handler.setAudioSettings(options);
  }
  async exportKeys() {
    const crypto = this.client().getCrypto();
    if (!crypto) throw new Error("Encryption is not ready.");
    return crypto.exportRoomKeysAsJson();
  }
  async importKeys(json: string) {
    const crypto = this.client().getCrypto();
    if (!crypto) throw new Error("Encryption is not ready.");
    const keys: unknown = JSON.parse(json);
    if (!Array.isArray(keys) || keys.some((key) => !key || typeof key !== "object" || !("session_key" in key))) throw new Error("This file does not contain Matrix room keys.");
    await crypto.importRoomKeysAsJson(json);
  }
  retrySync() { return this.client().retryImmediately(); }

  async createRoom(name: string, space: boolean, encrypted: boolean, isPublic: boolean) {
    const client = this.client();
    const response = await client.createRoom({
      name: name.trim(), preset: isPublic ? Preset.PublicChat : Preset.PrivateChat,
      visibility: Visibility.Private, creation_content: space ? { type: "m.space" } : {},
      ...(!space && { power_level_content_override: { events: { "org.matrix.msc3401.call.member": 0, "m.call.member": 0 } } }),
      initial_state: !space && encrypted ? [{ type: EventType.RoomEncryption, state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }] : [],
    });
    this.assertCurrent(client);
    return response.room_id;
  }
  async createSpaceChannel(spaceId: string, name: string, voice: boolean, access: "public" | "private" | "invite" = "private") {
    if (!["public", "private", "invite"].includes(access)) throw new Error("Unsupported channel access.");
    if (!name.trim()) throw new Error("Enter a channel name.");
    const client = this.client();
    const space = client.getRoom(spaceId);
    if (!space?.currentState.maySendStateEvent(EventType.SpaceChild, client.getUserId() ?? "")) throw new Error("Your role cannot create channels in this server.");
    const joinRules: RoomJoinRulesEventContent = access === "private" ? { join_rule: JoinRule.Restricted, allow: [{ type: RestrictedAllowType.RoomMembership, room_id: spaceId }] } : { join_rule: access === "public" ? JoinRule.Public : JoinRule.Invite };
    const response = await client.createRoom({
      name: name.trim(), preset: access === "public" ? Preset.PublicChat : Preset.PrivateChat, visibility: access === "public" ? Visibility.Public : Visibility.Private,
      room_version: "10", creation_content: voice ? { type: "org.matrix.msc3417.call" } : {},
      power_level_content_override: { events: { "org.matrix.msc3401.call.member": 0, "m.call.member": 0 } },
      initial_state: [
        { type: EventType.RoomJoinRules, state_key: "", content: joinRules },
        { type: EventType.SpaceParent, state_key: spaceId, content: { via: [client.getDomain()!], canonical: true } },
        { type: EventType.RoomEncryption, state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } },
      ],
    });
    this.assertCurrent(client);
    try {
      const matches = (content: IContent) => content.join_rule === joinRules.join_rule && (access !== "private" || content.allow?.some((rule: IContent) => rule.type === "m.room_membership" && rule.room_id === spaceId));
      const saved = await client.getStateEvent(response.room_id, EventType.RoomJoinRules, "");
      this.assertCurrent(client);
      if (!matches(saved)) {
        await client.sendStateEvent(response.room_id, EventType.RoomJoinRules, joinRules, "");
        this.assertCurrent(client);
        const updated = await client.getStateEvent(response.room_id, EventType.RoomJoinRules, "");
        this.assertCurrent(client);
        if (!matches(updated)) throw new Error("The homeserver did not apply the selected access.");
      }
    } catch {
      throw new Error(`Channel created (${response.room_id}), but its access could not be verified. Open this room's Security & access settings and save the intended access before adding it to the server. Do not create it again.`);
    }
    try { await this.spaceChild(spaceId, response.room_id); }
    catch { throw new Error(`Channel created (${response.room_id}), but linking it to the server failed. Add this room ID in Server settings → Rooms instead of creating it again.`); }
    return response.room_id;
  }

  async room(id: string) {
    const client = this.client();
    const room = client.getRoom(id);
    if (!room || room.getMyMembership() !== "join") throw new Error("Join this room before managing it.");
    const events = await client.roomState(id);
    const authoritativeState = new RoomState(id);
    authoritativeState.setStateEvents(events.map((event) => new MatrixEvent(event)));
    const state = (type: string): IContent => events.find((event) => event.type === type && event.state_key === "")?.content ?? {};
    const ownId = client.getUserId()!;
    const power: IContent = state(EventType.RoomPowerLevels);
    const level = authoritativeState.getMember(ownId)?.powerLevel ?? Number(power.users?.[ownId] ?? power.users_default ?? 0);
    const [aliases, directory] = await Promise.all([client.getLocalAliases(id), client.getRoomDirectoryVisibility(id)]);
    const can = (type: string) => authoritativeState.maySendStateEvent(type, ownId);
    return {
      id, name: String(state(EventType.RoomName).name ?? room.name), topic: String(state(EventType.RoomTopic).topic ?? ""),
      avatar: String(state(EventType.RoomAvatar).url ?? ""),
      space: room.isSpaceRoom(), encrypted: Boolean(state(EventType.RoomEncryption).algorithm),
      joinRule: String(state(EventType.RoomJoinRules).join_rule ?? "invite"),
      allowedSpaces: (state(EventType.RoomJoinRules).allow ?? []).filter((rule: { type: string }) => rule.type === "m.room_membership").map((rule: { room_id: string }) => rule.room_id) as string[],
      history: String(state(EventType.RoomHistoryVisibility).history_visibility ?? "shared"),
      guestAccess: String(state(EventType.RoomGuestAccess).guest_access ?? "forbidden"),
      directory: directory.visibility, aliases: aliases.aliases,
      canonicalAlias: String(state(EventType.RoomCanonicalAlias).alias ?? ""),
      power, level, ownId,
      canDetails: can(EventType.RoomName) && can(EventType.RoomTopic), canAvatar: can(EventType.RoomAvatar),
      canAccess: can(EventType.RoomJoinRules), canHistory: can(EventType.RoomHistoryVisibility),
      canGuestAccess: can(EventType.RoomGuestAccess), canPermissions: can(EventType.RoomPowerLevels),
      canEncrypt: can(EventType.RoomEncryption), canAliases: can(EventType.RoomCanonicalAlias),
      canChildren: can(EventType.SpaceChild),
      version: String(state(EventType.RoomCreate).room_version ?? "1"), canUpgrade: can(EventType.RoomTombstone),
      canInvite: level >= Number(power.invite ?? 0), canKick: level >= Number(power.kick ?? 50), canBan: level >= Number(power.ban ?? 50),
      members: events.filter((event) => event.type === EventType.RoomMember && ["join", "invite", "ban", "knock"].includes(event.content?.membership ?? "")).map((event) => ({ id: String(event.state_key), name: String(event.content?.displayname ?? event.state_key), membership: String(event.content?.membership), level: authoritativeState.getMember(event.state_key)?.powerLevel ?? Number(power.users?.[event.state_key] ?? power.users_default ?? 0) })),
      children: events.filter((event) => event.type === EventType.SpaceChild && Object.keys(event.content ?? {}).length).map((event) => ({ id: String(event.state_key), name: client.getRoom(event.state_key)?.name ?? String(event.state_key) })),
    };
  }
  async roomState(id: string, type: string, content: IContent, key = "") {
    await this.client().sendStateEvent(id, type as never, content as never, key);
  }
  async roomDetails(id: string, name: string, topic: string) {
    const client = this.client();
    await this.roomState(id, EventType.RoomName, { name: name.trim() });
    this.assertCurrent(client);
    await this.roomState(id, EventType.RoomTopic, { topic });
  }
  async roomAvatar(id: string, file: File | null) {
    const client = this.client();
    if (file && (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024)) throw new Error("Choose an image smaller than 10 MB.");
    const url = file ? (await client.uploadContent(file)).content_uri : "";
    this.assertCurrent(client);
    await this.roomState(id, EventType.RoomAvatar, { url });
  }
  async roomAccess(id: string, joinRule: string, allowedSpaces: string[]) {
    if (!(["invite", "public", "knock", "restricted", "knock_restricted"].includes(joinRule))) throw new Error("Unsupported join rule.");
    const content: IContent = { join_rule: joinRule };
    if (joinRule.includes("restricted")) {
      if (!allowedSpaces.length || allowedSpaces.some((id) => !/^![^:\s]+:\S+$/.test(id))) throw new Error("Enter at least one valid space ID.");
      content.allow = allowedSpaces.map((room_id) => ({ type: "m.room_membership", room_id }));
    }
    await this.roomState(id, EventType.RoomJoinRules, content);
  }
  async roomHistory(id: string, history: string) {
    if (!["shared", "invited", "joined", "world_readable"].includes(history)) throw new Error("Invalid history visibility.");
    await this.roomState(id, EventType.RoomHistoryVisibility, { history_visibility: history });
  }
  async roomDirectory(id: string, visibility: "public" | "private") { await this.client().setRoomDirectoryVisibility(id, visibility === "public" ? Visibility.Public : Visibility.Private); }
  async roomPermission(id: string, key: string, level: number, user?: string) {
    if (!Number.isSafeInteger(level)) throw new Error("Enter a whole-number power level.");
    if (!["users_default", "events_default", "state_default", "invite", "kick", "ban", "redact", "users"].includes(key)) throw new Error("Unknown permission.");
    const client = this.client();
    // Read server state immediately before writing to preserve unrelated roles.
    const power = await client.getStateEvent(id, EventType.RoomPowerLevels, "");
    this.assertCurrent(client);
    const next = { ...power };
    if (user) {
      if (!/^@[^:\s]+:\S+$/.test(user)) throw new Error("Enter a full Matrix ID.");
      next.users = { ...power.users, [user]: level };
    } else next[key] = level;
    await this.roomState(id, EventType.RoomPowerLevels, next);
  }
  async allowMemberCalls(id: string): Promise<void> {
    const client = this.client();
    const room = client.getRoom(id);
    if (room?.getMyMembership() !== "join" || !room.currentState.maySendStateEvent(EventType.RoomPowerLevels, client.getUserId() ?? "")) {
      throw new Error("A room administrator must enable calls for members.");
    }
    const power = await client.getStateEvent(id, EventType.RoomPowerLevels, "");
    this.assertCurrent(client);
    await client.sendStateEvent(id, EventType.RoomPowerLevels, {
      ...power, events: { ...power.events, "org.matrix.msc3401.call.member": 0, "m.call.member": 0 },
    }, "");
    this.assertCurrent(client);
  }
  async roomMember(id: string, user: string, action: "invite" | "kick" | "ban" | "unban", reason?: string) {
    if (!/^@[^:\s]+:\S+$/.test(user)) throw new Error("Enter a full Matrix ID.");
    const client = this.client();
    if (action === "invite") await client.invite(id, user);
    else if (action === "kick") await client.kick(id, user, reason);
    else if (action === "ban") await client.ban(id, user, reason);
    else await client.unban(id, user);
  }
  async roomAlias(id: string, alias: string, action: "create" | "remove" | "primary") {
    if (!/^#[^:\s]+:\S+$/.test(alias)) throw new Error("Enter a full room address, for example #room:example.org.");
    const client = this.client();
    if (action === "create") await client.createAlias(alias, id);
    else if (action === "remove") {
      const content = await this.canonicalAliasContent(id);
      this.assertCurrent(client);
      if (content.alias === alias || content.alt_aliases?.includes(alias)) {
        await this.roomState(id, EventType.RoomCanonicalAlias, { ...content, ...(content.alias === alias ? { alias: "" } : {}), alt_aliases: (content.alt_aliases ?? []).filter((value: string) => value !== alias) });
      }
      this.assertCurrent(client);
      await client.deleteAlias(alias);
    } else {
      const resolved = await client.getRoomIdForAlias(alias);
      this.assertCurrent(client);
      if (resolved.room_id !== id) throw new Error("This address does not point to this room.");
      const content = await this.canonicalAliasContent(id);
      this.assertCurrent(client);
      await this.roomState(id, EventType.RoomCanonicalAlias, { ...content, alias });
    }
  }
  private async canonicalAliasContent(id: string): Promise<IContent> {
    try { return await this.client().getStateEvent(id, EventType.RoomCanonicalAlias, ""); }
    catch (error) { if (error instanceof MatrixError && error.httpStatus === 404) return {}; throw error; }
  }
  async spaceChild(id: string, child: string, remove = false) {
    if (!/^![^:\s]+:\S+$/.test(child) || id === child) throw new Error("Enter another room’s full room ID.");
    const via = child.slice(child.indexOf(":") + 1);
    await this.roomState(id, EventType.SpaceChild, remove ? {} : { via: [via], suggested: true }, child);
  }
  async leaveRoom(id: string) {
    const client = this.client();
    const room = client.getRoom(id);
    const previous = room?.getMyMembership();
    const details = { name: room?.name || id, isSpace: room?.isSpaceRoom() ?? false };
    await client.leave(id);
    this.assertCurrent(client);
    if (previous === "join") membershipNotices.publish("leave", details);
  }
  async upgradeRoom(id: string, version: string) { return (await this.client().upgradeRoom(id, version)).replacement_room; }
  async roomNotificationMode(id: string): Promise<"default" | "all" | "mentions" | "off"> {
    const rules = await this.pushRules();
    if (rules.global.override?.some((rule) => [id, `dev.grungus.mute.${id}`].includes(rule.rule_id) && rule.enabled && !rule.actions.includes(PushRuleActionName.Notify))) return "off";
    const rule = rules.global.room?.find((rule) => rule.rule_id === id && rule.enabled);
    return !rule ? "default" : rule.actions.includes(PushRuleActionName.Notify) ? "all" : "mentions";
  }
  async roomNotifications(id: string, mode: "default" | "all" | "mentions" | "off") {
    const client = this.client();
    const rules = await this.pushRules();
    for (const rule of rules.global.override ?? []) if ([id, `dev.grungus.mute.${id}`].includes(rule.rule_id)) await client.deletePushRule("global", PushRuleKind.Override, rule.rule_id);
    if (rules.global.room?.some((rule) => rule.rule_id === id)) await client.deletePushRule("global", PushRuleKind.RoomSpecific, id);
    if (mode === "off") await client.addPushRule("global", PushRuleKind.Override, `dev.grungus.mute.${id}`, { conditions: [{ kind: ConditionKind.EventMatch, key: "room_id", pattern: id }], actions: [] });
    else if (mode !== "default") await client.addPushRule("global", PushRuleKind.RoomSpecific, id, { actions: mode === "all" ? [PushRuleActionName.Notify, { set_tweak: TweakName.Sound, value: "default" }] : [] });
    client.setPushRules(await client.getPushRules());
  }
}

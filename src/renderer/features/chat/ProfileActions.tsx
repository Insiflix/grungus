import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, ShieldCheck, Phone, UserPlus, ChevronDown, Ban, Copy, Volume2, VolumeX } from "lucide-react";
import { participantAudio } from "../../../domain/calls/ParticipantAudio";
import { blockedUsers } from "../../../domain/settings/BlockedUsers";
import type { MatrixRoom, MatrixPeerVerification } from "../../../domain/matrix/MatrixTypes";
import { useMatrixSnapshot } from "../../hooks/matrix/useMatrixSnapshot";
import { matrixSettings, useMatrixRuntime } from "../../app/providers/MatrixProvider";

type Target = { userId: string; x: number; y: number; container: Element; voiceRoomId?: string };

/** Profiles opt in with data-profile-user-id; capture keeps message actions separate. */
export function ProfileActions({ onVerification, onCall, callActive = false }: { onVerification: () => void; onCall?: (room: MatrixRoom) => void; callActive?: boolean }) {
  const runtime = useMatrixRuntime();
  const [target, setTarget] = useState<Target | null>(null);
  const close = useCallback(() => setTarget(null), []);
  useEffect(() => {
    const open = (event: MouseEvent) => {
      const profile = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-profile-user-id]") : null;
      const userId = profile?.dataset.profileUserId;
      if (!profile || !userId || userId === runtime.getSnapshot().session?.userId) return;
      event.preventDefault(); event.stopPropagation();
      const rect = profile.getBoundingClientRect();
      setTarget({ userId, x: event.clientX || rect.left, y: event.clientY || rect.bottom, voiceRoomId: profile.dataset.voiceRoomId, container: profile.closest("dialog") ?? document.body });
    };
    document.addEventListener("contextmenu", open, true);
    return () => document.removeEventListener("contextmenu", open, true);
  }, [runtime]);
  return target && <ProfileMenu key={`${target.userId}:${target.voiceRoomId ?? "chat"}`} target={target} onClose={close} onVerification={onVerification} onCall={onCall} callActive={callActive} />;
}

function ProfileMenu({ target, onClose, onVerification, onCall, callActive }: { target: Target; onClose: () => void; onVerification: () => void; onCall?: (room: MatrixRoom) => void; callActive: boolean }) {
  const runtime = useMatrixRuntime();
  const snapshot = useMatrixSnapshot();
  const [inviting, setInviting] = useState(false);
  const [servers, setServers] = useState<MatrixRoom[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const rejectedServers = useRef(new Set<string>());
  const ignored = useSyncExternalStore(blockedUsers.subscribe, blockedUsers.getSnapshot);
  useSyncExternalStore(participantAudio.subscribe, participantAudio.getSnapshot);
  const audio = target.voiceRoomId ? participantAudio.get(target.voiceRoomId, target.userId) : { volume: 100, muted: false };
  const [volume, setVolume] = useState(audio.volume);
  const [audioBusy, setAudioBusy] = useState(false);
  const canAdjustAudio = Boolean(target.voiceRoomId && participantAudio.connected(target.voiceRoomId));
  const menu = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const [status, setStatus] = useState<MatrixPeerVerification>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try { return runtime.observeUserVerification(target.userId, setStatus); }
    catch { setStatus("unavailable"); }
  }, [runtime, target.userId]);
  useLayoutEffect(() => {
    const element = menu.current!;
    if (element.showPopover) element.showPopover();
    else element.removeAttribute("popover");
    const position = () => {
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(target.x, window.innerWidth - rect.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(target.y, window.innerHeight - rect.height - 8))}px`;
    };
    position();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
    observer?.observe(element);
    const previous = document.activeElement as HTMLElement | null;
    element.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: Event) => { if (!element.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", outside, true);
    window.addEventListener("resize", onClose);
    return () => {
      observer?.disconnect();
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", outside, true);
      window.removeEventListener("resize", onClose);
      if (previous?.isConnected) previous.focus();
    };
  }, [target, onClose]);
  useEffect(() => {
    if (!inviting) return;
    let active = true; setServers([]); setLoadingServers(true); setError("");
    const spaces = snapshot.rooms.filter(room => room.isSpace && room.membership === "join" && !rejectedServers.current.has(room.id));
    void Promise.allSettled(spaces.map(async space => ({ space, allowed: await matrixSettings.canInviteToRoom(space.id, target.userId) }))).then(result => {
      if (active) {
        setServers(result.flatMap(item => item.status === "fulfilled" && item.value.allowed ? [item.value.space] : []));
        if (result.some(item => item.status === "rejected")) setError("Some servers could not be loaded. Reopen this list to retry.");
      }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load servers."); }).finally(() => { if (active) setLoadingServers(false); });
    return () => { active = false; };
  }, [inviting, snapshot.rooms, target.userId]);
  const inviteToServer = async (server: MatrixRoom) => {
    const removeServer = () => {
      rejectedServers.current.add(server.id);
      setServers(current => current.filter(item => item.id !== server.id));
    };
    if (!await matrixSettings.canInviteToRoom(server.id, target.userId)) {
      removeServer();
      throw new Error("You cannot invite this user to that server. The server was removed from the list.");
    }
    try { await runtime.inviteUser(server.id, target.userId); }
    catch (cause) {
      const failure = cause as { httpStatus?: number; errcode?: string } | null;
      if (failure?.httpStatus === 403 || failure?.errcode === "M_FORBIDDEN") {
        removeServer();
        throw new Error("This server does not allow you to invite this user. It was removed from the list.");
      }
      throw cause;
    }
  };
  const changeAudio = async (next: { volume: number; muted: boolean }) => {
    if (!target.voiceRoomId || audioBusy) return;
    setAudioBusy(true); setError("");
    try { await participantAudio.set(target.voiceRoomId, target.userId, next); }
    catch (cause) { setVolume(audio.volume); setError(cause instanceof Error ? cause.message : "Unable to adjust audio."); }
    finally { setAudioBusy(false); }
  };
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await action(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to complete profile action."); }
    finally { pending.current = false; setBusy(false); }
  };
  return createPortal(<div ref={menu} popover="manual" className="message-context-menu profile-actions-menu" role="menu" aria-label={`Profile actions for ${target.userId}`} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (!(event.target instanceof HTMLInputElement) && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  }}>
    {target.voiceRoomId && <div className="profile-actions-menu__volume"><label>User volume <output>{volume}%</output><input aria-label="User volume" type="range" min="0" max="200" step="1" value={volume} disabled={!canAdjustAudio || audioBusy} onChange={event => setVolume(Number(event.target.value))} onPointerUp={event => void changeAudio({ ...audio, volume: Number(event.currentTarget.value) })} onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) void changeAudio({ ...audio, volume: Number(event.currentTarget.value) }); }} /></label>{!canAdjustAudio && <small>Join this channel to adjust audio.</small>}</div>}
    {target.voiceRoomId && <button role="menuitemcheckbox" aria-checked={audio.muted} disabled={!canAdjustAudio || audioBusy} onClick={() => void changeAudio({ ...audio, muted: !audio.muted })}>{audio.muted ? "Unmute for me" : "Mute for me"}{audio.muted ? <VolumeX /> : <Volume2 />}</button>}
    <button role="menuitem" disabled={busy} onClick={() => void run(() => runtime.startDirectMessage(target.userId))}>Message <MessageCircle /></button>
    <button role="menuitem" disabled={busy || callActive || !onCall} onClick={() => void run(async () => { await runtime.startDirectMessage(target.userId); const current = runtime.getSnapshot(); const room = current.rooms.find(room => room.id === current.selectedRoomId); if (!room) throw new Error("Unable to open the conversation."); onCall?.(room); })}>Start a Call <Phone /></button>
    <button role="menuitem" aria-haspopup="menu" aria-expanded={inviting} disabled={busy} onClick={() => setInviting(value => !value)}>Invite to server {inviting ? <ChevronDown /> : <UserPlus />}</button>
    {inviting && <div className="profile-actions-menu__servers" role="menu" aria-label="Invite to server">{loadingServers ? <p role="status">Loading servers...</p> : servers.length ? servers.map(server => <button key={server.id} role="menuitem" disabled={busy} onClick={() => void run(() => inviteToServer(server))}>{server.name}</button>) : <p>No servers available to invite to.</p>}</div>}
    <button role="menuitem" className="is-danger" disabled={busy} onClick={() => void run(() => matrixSettings.setIgnored(target.userId, !ignored.has(target.userId)))}>{ignored.has(target.userId) ? "Unblock" : "Block"} <Ban /></button>
    <button role="menuitem" disabled={busy} onClick={() => void run(() => navigator.clipboard.writeText(target.userId))}>Copy user ID <Copy /></button>
    {(status === "unverified" || status === "changed") && <button role="menuitem" disabled={busy} onClick={() => void run(async () => { await runtime.requestUserVerification(target.userId); onVerification(); })}>Verify user <ShieldCheck /></button>}

    {error && <p role="alert">{error}</p>}
  </div>, target.container);
}

import type { MatrixClient } from "matrix-js-sdk";

// Matrix sync can arrive after the widget has disconnected. Suppress only this
// device's departed membership until it joins again; other devices remain visible.
type State = { rooms: Map<string, { token: symbol; left: boolean }>; listeners: Set<() => void> };
const clients = new WeakMap<MatrixClient, State>();
function stateFor(client: MatrixClient): State {
  let state = clients.get(client);
  if (!state) { state = { rooms: new Map(), listeners: new Set() }; clients.set(client, state); }
  return state;
}
export function beginLocalCall(client: MatrixClient, roomId: string) {
  const state = stateFor(client);
  const token = Symbol(roomId);
  state.rooms.set(roomId, { token, left: state.rooms.get(roomId)?.left ?? false });
  const update = (left: boolean) => {
    const current = state.rooms.get(roomId);
    if (current?.token !== token || current.left === left) return;
    current.left = left; state.listeners.forEach(listener => listener());
  };
  return { joined: () => update(false), left: () => update(true) };
}
export function hasLocallyLeftCall(client: MatrixClient, roomId: string) { return stateFor(client).rooms.get(roomId)?.left ?? false; }
export function observeLocalCallState(client: MatrixClient, listener: () => void) {
  const state = stateFor(client); state.listeners.add(listener);
  return () => { state.listeners.delete(listener); };
}

# Grungus Matrix Desktop

Grungus is a functional Matrix desktop client proof of concept built with Electron, React, TypeScript, Vite, Tailwind CSS 4, and `matrix-js-sdk`. It connects to real Matrix homeservers, restores encrypted sessions, synchronizes joined rooms, renders room timelines, and sends and receives text messages with SDK-managed local echo.

## Architecture

The renderer never imports `MatrixClient`, `MatrixEvent`, `Room`, or other SDK implementation types. All SDK objects stop at `src/infrastructure/matrix`; the adapter maps them into application-owned domain objects and application events.

```text
React UI
  ↓
React Matrix hooks (useSyncExternalStore)
  ↓
MatrixRuntime application store
  ↓
IMatrixClient / IMatrixAuthProvider + domain models
  ↓
MatrixJsSdkClient / MatrixAuthProvider
  ↓
matrix-js-sdk
  ↓
Matrix Client-Server API
```

This boundary is intentional: Matrix synchronization is event-driven and remains owned by `matrix-js-sdk`. TanStack Query is configured for future conventional REST server state, but it is not used as a second Matrix sync cache. `ConventionalApiClient` is the Axios boundary for non-Matrix HTTP APIs.

Calling is deliberately separate:

```text
Future room call UI
  ↓
ICallProvider
  ↓
ElementCallProvider (planned)
  ↓
Element Call embedded / MatrixRTC
```

## Main directories

- `electron/` — ESM main process, sandboxed preload bridge, custom-protocol handling, and OS-encrypted session storage.
- `src/domain/matrix/` — application-owned Matrix models, auth/client contracts, and typed application events.
- `src/domain/calls/` — the future call-provider seam; no calling implementation is installed.
- `src/infrastructure/matrix/` — the only layer that imports `matrix-js-sdk`; contains auth, sync, room, message, media, reaction, and crypto adapters.
- `src/infrastructure/http/` — Axios abstraction for future ordinary REST APIs.
- `src/renderer/app/MatrixRuntime.ts` — small external store that bridges domain events to React snapshots.
- `src/renderer/hooks/matrix/` — focused session, rooms, room, and timeline hooks using `useSyncExternalStore`.
- `src/renderer/features/` — login, room navigation, timeline, composer, and local-echo UI.
- `src/renderer/styles/` — Tailwind CSS 4 entry point plus reusable frozen-glass design tokens and desktop layout.

## Electron module format

The Electron main process and shared session types are ES modules. The preload alone compiles from `.cts` to CommonJS intentionally: Electron sandboxed preloads run as plain JavaScript and do not support ESM imports. Keeping that one boundary as CommonJS preserves `sandbox: true`; it is not an application-wide CommonJS choice. See Electron's [ES Modules documentation](https://www.electronjs.org/docs/latest/tutorial/esm#sandboxed-preload-scripts).
## Authentication

1. The user enters a server name or URL.
2. `MatrixAuthProvider` performs Matrix `.well-known` discovery with `AutoDiscovery`, validates the actual homeserver endpoint, and asks the SDK for advertised login flows.
3. If `m.login.sso`/CAS is advertised, the app opens the SDK-generated sign-in URL in the system browser. The homeserver returns a one-time login token to `grungus-matrix://auth/callback`, which Electron isolates and passes to the auth adapter. This compatibility flow is the current working path for Matrix Authentication Service deployments such as matrix.org.
4. Password fields appear only when the server advertises `m.login.password`.
5. Access and refresh tokens are stored by Electron `safeStorage`, never in `localStorage`. If OS encryption is unavailable, the app keeps the live session but refuses to persist it and shows a warning.
6. Refresh tokens are handed to the SDK's token-refresh hook, and refreshed credentials are persisted through the same narrow bridge.

The current MVP discovers delegated OAuth/MAS metadata through `matrix-js-sdk`, but uses the broadly deployed Matrix SSO compatibility/login-token flow for interactive desktop login. A direct native OAuth dynamic-registration/PKCE flow can be added inside `MatrixAuthProvider` without changing React code.

## Encryption and security

- `nodeIntegration: false`, `contextIsolation: true`, and Electron renderer sandboxing are enabled.
- The preload exposes only session load/save/remove, HTTPS system-browser launch, and auth callback subscription.
- Remote navigations, popups, and renderer permission requests are denied.
- The page has a restrictive CSP; remote images are allowed for resolved Matrix media while scripts remain local.
- Session secrets are encrypted in the main process with Electron `safeStorage`.
- Rust crypto is initialized once per session with a device-specific persistent IndexedDB prefix before sync begins.
- Matrix text is rendered as React text. No Matrix-provided HTML is passed to `dangerouslySetInnerHTML`.

## Run against matrix.org

Prerequisites: a current Node.js LTS release and npm.

1. Install dependencies: `npm install`
2. Start Electron and Vite: `npm run dev`
3. Enter `matrix.org` on the login screen and select **Continue**.
4. Select **Continue securely in browser**. Complete the matrix.org/MAS login in the system browser.
5. Approve opening the `grungus-matrix://` link if the browser asks. The desktop app resumes, starts Rust crypto and `/sync`, and populates the room list.
6. Select a room, read its loaded timeline, use **Load older messages** for pagination, and send a text message from the composer.
7. Close and reopen the app to verify OS-encrypted session restoration. Use the logout icon beside the current account to invalidate the Matrix session and delete the local encrypted credential file.

For another homeserver, enter its server name (for example `example.org`) or a complete homeserver URL. Discovery is attempted first; a direct URL is validated against `/_matrix/client/versions` when no usable `.well-known` record exists. Password login is shown only when supported by that server.

Custom protocol registration is most reliable in an installed production build. Development mode registers the protocol for the current Electron executable, but some Windows/browser combinations may require approving the callback or using the packaged build once.

## Commands

```bash
# Development (Vite + Electron)
npm run dev

# Focused unit tests
npm test

# Strict renderer and Electron TypeScript checks
npm run typecheck

# Production renderer, Electron compilation, and platform package
npm run build

# Unpacked production application, useful for local verification
npm run build:dir
```

## Supported in this MVP

- Arbitrary homeserver discovery and validated direct homeserver URLs
- Browser SSO/MAS compatibility login and advertised legacy password login
- OS-encrypted session restore, refresh-token persistence, and logout
- Rust-crypto initialization and encrypted room/message handling
- Joined room list, room names, topics, avatars, encryption status, unread counts, and member counts
- Live `/sync` room/timeline updates through application-owned events
- Current timeline plus backward pagination
- Text, notice, emote, unsupported-event, redacted, encrypted-pending, and decryption-failure presentation
- Text sending, replies/edit/redaction APIs, typing, read receipts, members, and basic reactions at the abstraction layer
- SDK local echo with sending, sent, failed, and cancelled UI states

## Deliberately deferred

- Cross-signing, interactive device verification, recovery-key, and key-backup UX
- Direct native delegated OAuth dynamic registration/PKCE (the SSO compatibility path is implemented)
- Polished reply/edit/delete controls, reaction picker, threads, search, invites, moderation, and room settings
- Inline image/file rendering and upload UI (media resolution and domain extension points exist)
- Push notifications and background sync
- Voice/video calls; `ICallProvider` is reserved for a future Element Call/MatrixRTC adapter

## Tests

The focused Vitest suite covers Matrix event-to-domain message mapping, live-timeline room-state mapping, supported/unsupported message types, reply metadata, runtime bootstrap idempotency, and live event propagation into selected room timelines.


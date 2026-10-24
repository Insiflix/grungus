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

On Windows, `npm run dev` creates a separate Grungus-branded development executable beside the installed Electron runtime. Its embedded product name is **Grungus Dev**, with its own Start Menu shortcut and taskbar/notification identity. Development uses a separate `grungus-matrix-dev` profile under Electron's app-data directory (`%APPDATA%` on Windows), including its own sign-in, encryption database, settings and cache. The installed profile is never copied into development; sign in separately on the first dev launch. Both apps can run at the same time. Development registers only `grungus-matrix-dev://` links, leaving the installed app's `grungus-matrix://` handler untouched. The original Electron executable is preserved. `public/grungus.png` is the icon source; `npm run icons` rebuilds the ICO without modifying the PNG. Restart development after regenerating icons to refresh the branded executable.

With the development app running, `npm run test:notification -- --examples` sends real Windows test notifications, including labeled DM and channel examples. Message notifications use the sender's name/avatar for DMs and the channel name/server avatar for channels; missing avatars use initials.

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

## Registration, invitations, and people

- After homeserver discovery, choose **Register** to create an account. Browser SSO registration is available when advertised by the server. Traditional registration supports automatic dummy authentication, registration tokens, and server-provided browser verification for CAPTCHA, terms, email, and other stages. Finish each browser step, then choose **Continue registration**. The homeserver controls whether registration is enabled and which verification steps are required, as described in the [Matrix registration and user-interactive authentication specification](https://spec.matrix.org/latest/client-server-api/).
- Choose **Add people** beside the DM tabs to search the user directory or enter a full Matrix ID such as `@alice:example.org`. **Message** reopens an existing DM or creates a private, encrypted room and invites that person. Full IDs work even when the server directory cannot find a person.
- Use the **Invite people** button in a room header to send a room invitation. A selected server also has an invite button above its room list. Invite permissions and federation are enforced by the homeserver; failures appear in the people dialog.
- Incoming DM, room, and server invitations appear under **Invitations** in the left sidebar. **Accept** joins the room; **Decline** rejects the invitation. Controls remain pending during the request, and failed requests keep the invitation available to retry.

## GIFs with KLIPY

The **GIF** button beside the message input opens a compact picker with trending GIFs, a debounced search, and pagination. Selecting a GIF sends the full-size media URL as an ordinary Matrix text message in the format `/gif https://…/image.gif`. Existing text drafts stay intact. Failed sends keep the picker open to retry, and both incoming and outgoing `/gif` messages render inline with a link fallback if the image is unavailable. Received GIFs do not need an API key.

The supplied KLIPY key is configured in the ignored `.env.local` file as `VITE_KLIPY_API_KEY` and automatically included when Vite starts or builds. A configured build key always takes precedence over older local picker settings, and the API-key setup control is hidden while it is configured. Without a build key, the picker can still accept a local key. The integration uses KLIPY's [documented Tenor-compatible API](https://klipy.com/migrate), hosted at `https://api.klipy.com/v2`; it does not call Tenor. Small `tinygif` images are used for search previews and full `gif` URLs for messages. A share event is registered with KLIPY only after the Matrix send succeeds.

## Emojis and profile pictures

The smiley beside the input opens a native emoji picker with search, categories, and skin tones. Type `:smi` for shortcode suggestions; Up/Down changes the selection, Enter or Tab inserts it, and Escape dismisses suggestions. Complete shortcodes such as `:smile:`, `:thumbsup:`, `:herz:`, and `:frosch:` become Unicode emoji when sent and when received in text. Code spans, code fences, links, and unknown shortcodes stay unchanged. The bundled Emoji Mart dataset works offline.

Matrix avatars are fetched with the session's Authorization header and displayed through cached blob URLs, rather than placing access tokens in image URLs. The loader sends credentials only to the connected homeserver's authenticated media paths, falls back to the original image if thumbnails are unsupported, and revokes blob URLs when the session ends. Missing or broken images show initials. DM tabs use the counterpart's member avatar when there is no room avatar; the account strip loads the signed-in user's profile picture and display name.

## Encryption and security

See [SECURITY_REVIEW.md](SECURITY_REVIEW.md) for the repository security findings, fixes, verification, and feature suggestions from 2026-10-20.

Open **Identität & Verschlüsselung** with the shield next to your account, the encrypted-room badge, or the unverified-device banner. You can request verification from an existing device, accept incoming SAS requests, and explicitly compare the emoji/number sequence before confirming a match. Incoming requests identify the other user and device. Only SAS is advertised; QR verification is not implemented.

You can also unlock the existing identity with its Matrix recovery key. The adapter checks the key against secret storage before importing cross-signing keys, then restores the message-key backup when available. Recovery never silently replaces missing identity keys. Late SDK decryption events update existing timeline messages.

**Identität ersetzen** prepares a new recovery key for the user to save before the reset can run. Explicit acknowledgement is required: the SDK's [resetEncryption operation](https://matrix-org.github.io/matrix-js-sdk/interfaces/crypto-api.CryptoApi.html#resetEncryption) replaces cross-signing and deletes the previous server key backups and secret-storage configuration. A new secret store and backup are then configured using the saved key. Missing historical message keys are not recovered by a reset. Password and server-provided browser UI-authentication steps are supported; cancellation can leave a partially completed setup and is reported accordingly. No identity reset runs automatically.

Recovery keys and authentication passwords stay in memory; the application does not persist them to localStorage or the session file. New recovery keys remain visible until the user dismisses the saved-key step.

- `nodeIntegration: false`, `contextIsolation: true`, and Electron renderer sandboxing are enabled.
- Sensitive session and browser-launch IPC requires the main application frame and URL. The preload also provides window controls, clipboard, and an explicit screen-capture consent bridge.
- External pages cannot navigate the main application. Permission requests are restricted to the application and bundled call page; screen capture requires source selection.
- Application and call pages have a CSP with local scripts. The call widget runs on a separate origin and communicates through a source- and origin-checked, call-scoped API.
- Session credentials are encrypted in the main process with Electron `safeStorage`; Linux's `basic_text` fallback is refused. Session file operations are serialized so logout follows pending saves.
- Remote homeservers require HTTPS; explicit loopback HTTP URLs are accepted for development. Browser login uses an expiring, single-use state nonce.
- Media downloads have streamed size limits and timeouts. Unsupported audio/video conversion runs in a local WebAssembly worker with bounded input/output, concurrency, and lifetime; received files are never passed to a native FFmpeg process.
- Arbitrary external avatars are rejected. External chat GIFs require a click unless hosted by a configured GIF provider's media CDN.
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

Custom protocol registration is most reliable in an installed production build. Development mode registers its separate `grungus-matrix-dev://` protocol for the current Electron executable, but some Windows/browser combinations may require approving the callback or using the packaged build once.

## Commands

For automatic Windows/Linux builds, GitHub Releases, and in-app updates, see
[Desktop releases and updates](docs/releases.md).

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
- Account registration with interactive verification, incoming invitation acceptance/rejection, user search, room/server invitations, and encrypted DM creation/reuse
- OS-encrypted session restore, refresh-token persistence, and logout
- Rust-crypto initialization and encrypted room/message handling
- Joined room list, room names, topics, avatars, encryption status, unread counts, and member counts
- Live `/sync` room/timeline updates through application-owned events
- Current timeline plus backward pagination
- Text, notice, emote, unsupported-event, redacted, encrypted-pending, and decryption-failure presentation
- Text sending, replies/edit/redaction APIs, typing, read receipts, members, and basic reactions at the abstraction layer
- SDK local echo with sending, sent, failed, and cancelled UI states

## Deliberately deferred

- QR-code device verification, recovery passphrases, and manual key-backup import/export UX
- Direct native delegated OAuth dynamic registration/PKCE (the SSO compatibility path is implemented)
- Polished reply/edit/delete controls, reaction picker, threads, message search, moderation, and room settings
- Inline image/file rendering and upload UI (media resolution and domain extension points exist)
- Push notifications and background sync while the app is closed
- Native incoming-call notifications

## Tests

The focused Vitest suite covers Matrix event-to-domain message mapping, live-timeline room-state mapping, registration and UI authentication, invitations, DM creation/reuse, runtime event propagation, recovery-key validation, explicit identity reset confirmation, SAS comparisons and cancellation, and late decryption updates. Multi-device verification and recovery still require end-to-end testing against a live homeserver.


## MatrixRTC calls

The room header provides voice/video calls using the locally bundled `@element-hq/element-call-embedded` widget. Calls stay mounted across room changes, can be minimized, and ongoing room calls offer a join button. The widget has a dark forest palette; its standard microphone/camera/device controls remain available. Screen sharing uses an explicit desktop/window picker with optional Windows system audio.

The host brokers call-scoped Matrix events, encrypted to-device keys, OpenID, delayed/sticky membership events, authenticated media, and RTC transport discovery. Matrix access tokens are never passed in widget URLs. Packaged Electron assets use a secure local `grungus-app` origin so widget messaging and camera/microphone work without file-origin restrictions. Electron must be restarted after main-process changes.

A compatible MatrixRTC backend (LiveKit SFU and authorization service) must be configured/discoverable on the homeserver. See [Element Call embedding](https://github.com/element-hq/element-call/blob/main/docs/embedded_standalone.md). Vite copies the official widget assets and upstream licenses into `public/element-call` and the production bundle; this generated directory is ignored by Git. Call policy/driver tests cover event and room isolation, membership cleanup, and URL parameters. Live audio/video interoperability still needs verification against a configured homeserver with a second participant.

The emoji picker virtualizes category grids (at most about 88 buttons), resets scrolling per category/search, and memoizes the grid so preview hover updates do not rerender every emoji.

The generated widget bundle includes an explicit `config.json` (compatibility mode). The host waits for `content_loaded` before negotiating capabilities and acknowledges Element Call lifecycle/mute/always-on-screen requests. Two-person calls use DM ringing intents; joining an existing session uses the matching join intent. Classic Matrix 1:1 calls are supported through the room header call-options menu and an incoming accept/reject interface. Call signalling is excluded from chat messages. `npm run test:call` launches an isolated Vite/Electron browser smoke test with synthetic media, no account token, and blocked external network access; it verifies config loading, widget handshake, room state, and the visible voice-call lobby.

## Camera quality and screen sharing

Call headers offer 360p/15 FPS, 720p/30 FPS, and 1080p/30 FPS camera capture presets. The choice is saved locally and applies to active camera tracks without reconnecting the call; device and network limits can lower the achieved quality. Element Call keeps its own device controls and uses a locally injected capture adapter. Its publication ceiling is 1080p/30 FPS for camera and 1440p/30 FPS for screen sharing.

Both Element Call and classic Matrix calls can share screens. Electron presents thumbnails for complete displays and individual windows, then waits for explicit confirmation. The optional Windows system-audio checkbox captures the entire computer output (including other programs when sharing just one window) using loopback without muting local playback. Audio is requested without microphone noise filtering in Element Call. Unsupported platforms and old classic peers fall back to video-only sharing and show that state. Local shared audio/video is muted in preview. Cancelling the picker, unknown sources, or expired requests grants no capture stream.

`npm run test:call` also checks changing a live synthetic camera to 360p and screen-picker selection/audio consent, without recording a real desktop. Unit tests cover native capture decisions and the media adapter. Hearing real system audio at another participant remains a manual end-to-end check.

The pre-join preview uses a centered responsive window with a solid background and explicit cancel button. Minimizing becomes available only after the widget reports joining the call. Browser smoke checks use the actual CallPanel component and verify visible join controls at desktop and narrow sizes, camera quality, screen-source consent, and the preview-to-call layout transition.

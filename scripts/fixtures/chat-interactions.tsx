import { MessageSearchField } from "../../src/renderer/features/chat/MessageSearch";
import { ThemedSelect } from "../../src/renderer/components/common/ThemedSelect";
import { ThemedDatePicker } from "../../src/renderer/components/common/ThemedDatePicker";
import { ThemePicker } from "../../src/renderer/features/settings/ThemePicker";
import { PreferenceEffects } from "../../src/renderer/features/settings/PreferenceEffects";
import { preferences } from "../../src/domain/settings/Preferences";
import { themes, type Theme } from "../../src/domain/settings/Themes";
import { usePreferences } from "../../src/renderer/hooks/usePreferences";
import { MessageText } from "../../src/renderer/features/chat/MessageText";
import { DirectMessageTab } from "../../src/renderer/features/rooms/DirectMessageTab";
import { blockedUsers } from "../../src/domain/settings/BlockedUsers";
import { roomDrafts } from "../../src/renderer/features/chat/RoomDrafts";
import type { MatrixMessage } from "../../src/domain/matrix/MatrixTypes";
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { DesktopFrame } from "../../src/renderer/components/common/DesktopFrame";
import { MessageComposer } from "../../src/renderer/features/chat/MessageComposer";
import { AttachmentMessage } from "../../src/renderer/features/chat/AttachmentMessage";
import { ImageViewer } from "../../src/renderer/features/chat/ImageViewer";
import { AttachmentMediaContext } from "../../src/renderer/components/common/AttachmentMediaContext";
import forestUrl from "../../src/renderer/assets/toad-forest.png";
import "../../src/renderer/styles/index.css";

const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const painted = async () => { await frame(); await frame(); };
const finishZoom = async (button: HTMLElement) => {
  await painted();
  await Promise.all(button.getAnimations().map(animation => animation.finished));
};
const root = createRoot(document.getElementById("root")!);
function ThemeFixture() {
  const prefs = usePreferences();
  const message: MatrixMessage = {id:"$theme",roomId:"!theme",sender:{id:"@alice:test",displayName:"Alice",avatarUrl:null},body:"A little space to make your own. Pick a theme below, then get back to the conversation.",timestamp:Date.now(),type:"text",edited:false,replyTo:null,reactions:[],sendState:"sent",isOwn:false,isRedacted:false};
  return <DesktopFrame><PreferenceEffects /><main className="app-shell"><nav className="workspace-rail"><button className="rail-button is-active" aria-label="Home">G</button><button className="rail-button" aria-label="Server">S</button></nav><nav className="dm-tabs"><div className="dm-tabs__tools"><span className="dm-tabs__label">Your corner of Grungus</span></div><div className="dm-tabs__list"><button className="dm-tab is-selected">Alice</button><button className="dm-tab">Bob</button></div></nav><aside className="room-sidebar"><header className="sidebar-header"><div><span className="sidebar-kicker">GRUNGUS</span><strong>The hideout</strong></div></header><div className="room-list"><p className="room-section-label">TEXT CHANNELS</p><button className="channel-row is-selected"># general</button><button className="channel-row"># inspiration</button><button className="channel-row"># off-topic</button><p className="room-section-label">VOICE CHANNELS</p><button className="channel-row">Lounge</button></div><footer className="account-strip"><strong>Alice</strong><small>Online</small></footer></aside><section className="chat-workspace"><header className="room-header"><div className="room-header__title"><span className="room-hash">#</span><div><h1>general</h1><p>A place for good company</p></div></div><div className="room-header__actions"><button className="member-count">2 members</button><div className="message-search"><form className="message-search__field"><input aria-label="Theme search preview" placeholder="Search general" /></form></div></div></header><section className="timeline"><div className="timeline__inner"><article className="message-row"><div className="avatar">A</div><div className="message-row__content"><header><strong>Alice</strong></header><MessageText message={message} convertEmoji={false} /></div></article><section style={{padding:"24px 16px"}}><h2>Make yourself at home</h2><p style={{color:"var(--text-soft)"}}>Choose your atmosphere. Your theme stays saved for this account.</p><ThemePicker value={prefs.theme} onChange={theme => preferences.update({theme})} /></section></div></section><div className="composer-region"><MessageComposer roomName="general" onSend={async () => {}} onTyping={() => {}} /></div></section></main></DesktopFrame>;
}
function ControlFixture() {
  const [media,setMedia] = React.useState("image"), [date,setDate] = React.useState("2028-02-28");
  return <DesktopFrame><dialog id="controls-dialog" className="settings-dialog" style={{width:520,height:450,padding:24}}><div className="settings-content" style={{width:"100%"}}><h2>App controls</h2><label className="settings-field">Media<ThemedSelect aria-label="Demo media" value={media} onChange={event => setMedia(event.target.value)}><option value="image">Images</option><option value="video">Videos</option><option value="audio">Audio</option></ThemedSelect></label><label className="settings-field">From date<ThemedDatePicker aria-label="Demo date" value={date} onChange={setDate} /></label><button id="demo-tooltip" data-tooltip="Styled app tooltip" type="button">Help</button><button id="controls-outside" type="button">Outside</button></div></dialog></DesktopFrame>;
}
let uploads: string[] = [];
let text: string[] = [];
const getUploadLimit = async () => 2 * 1024 * 1024;

Object.assign(window, { async checkChatInteractions() {
  flushSync(() => root.render(<DesktopFrame><section className="chat-workspace" style={{ height: "100%" }}>
    <header className="room-header"><div className="room-header__title"><span className="room-hash">#</span><h1>general</h1></div></header>
    <section className="timeline" data-history><div className="timeline__inner"><div className="room-intro"><h2>general</h2><p>Drop files anywhere in this chat to preview them.</p></div></div></section>
    <div className="composer-region"><MessageComposer roomName="general" getUploadLimit={getUploadLimit} onTyping={() => {}} onSend={async body => { text.push(body); }} onSendAttachment={async (file, progress) => { progress(100); uploads.push(file.name); }} /></div>
  </section></DesktopFrame>));
  await painted();
  const image = new File([await (await fetch("/grungus.png")).blob()], "grungus.png", { type: "image/png" });
  const data = new DataTransfer(); data.items.add(image); data.items.add(new File(["Example attachment"], "notes.txt", { type: "text/plain" }));
  const history = document.querySelector("[data-history]")!;
  history.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: data }));
  await painted();
  if (!document.querySelector(".attachment-drop")) throw new Error("Drop overlay missing");
  history.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
  await painted();
  const preview = document.querySelector<HTMLImageElement>(".attachment-draft img")!;
  if (!preview) throw new Error("Dropped image preview missing");
  await preview.decode();
  if (uploads.length || document.querySelectorAll(".attachment-draft__card").length !== 2) throw new Error("Drop must stage, never immediately upload");
  const bounds = preview.getBoundingClientRect();
  if (bounds.width < 40 || bounds.height < 40 || bounds.right > innerWidth) throw new Error("Image preview is clipped");
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const selection = new DataTransfer(); selection.items.add(new File(["PDF"], "report.pdf", { type: "application/pdf" }));
  input.files = selection.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  await painted();
  if (document.querySelectorAll(".attachment-draft__card").length !== 3) throw new Error("File selection did not add to the preview queue");
  if (document.querySelectorAll(".desktop-titlebar__controls button").length !== 3) throw new Error("Custom window controls missing");
  return { previews: 3, previewWidth: bounds.width, titlebarHeight: document.querySelector(".desktop-titlebar")!.getBoundingClientRect().height };
}, async sendDraft() {
  document.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click();
  await painted();
  if (uploads.join(",") !== "grungus.png,notes.txt,report.pdf" || text.length || document.querySelector(".attachment-draft")) throw new Error("Attachment send did not complete cleanly");
  return { uploaded: uploads };
}, async checkClipboardPaste() {
  for (let i = 0; i < 100 && !document.querySelector('.attachment-draft img'); i++) await new Promise(resolve => setTimeout(resolve, 20));
  const image = document.querySelector<HTMLImageElement>('.attachment-draft img');
  if (!image) throw new Error('Native clipboard image was not staged');
  await image.decode();
  if (uploads.length !== 3 || document.querySelectorAll('.attachment-draft__card').length !== 1) throw new Error('Clipboard image must stage exactly once without upload');
  document.querySelector<HTMLButtonElement>('.attachment-draft__remove')!.click();
  await painted();
  const data = new DataTransfer();
  data.items.add(new File(['PDF'], 'pasted.pdf', { type: 'application/pdf' }));
  data.items.add(new File([await (await fetch('/grungus.png')).blob()], 'pasted.png', { type: 'image/png' }));
  const input = document.querySelector<HTMLTextAreaElement>('textarea')!;
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data });
  input.dispatchEvent(event);
  await painted();
  if (!event.defaultPrevented || document.querySelectorAll('.attachment-draft__card').length !== 2 || uploads.length !== 3) throw new Error('Pasted files must use the attachment draft queue');
  for (const button of document.querySelectorAll<HTMLButtonElement>('.attachment-draft__remove')) button.click();
  await painted();
  return { nativeImage: true, files: true, previewOnly: true, duplicateFree: true };
}, async checkUploadLimit() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const selection = new DataTransfer(); selection.items.add(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "too-large.bin"));
  input.files = selection.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  await painted();
  if (!document.querySelector(".attachment-draft__warning")?.textContent?.includes("2.0 MB per file")) throw new Error("Server size limit warning missing");
  if (!document.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.disabled) throw new Error("Oversized attachment can still be sent");
  document.querySelector("form")!.requestSubmit();
  await painted();
  if (uploads.length !== 3) throw new Error("Oversized file reached upload handler");
  return { oversizedBlocked: true };
}, async checkImageSkeletons() {
  const blob = await (await fetch('/grungus.png')).blob();
  const checks: { width: number; height: number; narrow: boolean }[] = [];
  for (const [width, height] of [[1600, 900], [600, 1200], [80, 60], [0, 0]]) {
    for (const narrow of [false, true]) {
      let release!: (blob: Blob) => void;
      const load = () => new Promise<Blob>(resolve => { release = resolve; });
      flushSync(() => root.render(<AttachmentMediaContext.Provider value={load}><div style={{ width: narrow ? 180 : 600 }}><AttachmentMessage key={`${width}-${narrow}`} attachment={{ url: `mxc://skeleton/${width}-${narrow}`, name: 'delayed.png', mimeType: 'image/png', width, height }} inline /><p id="following-text">Text after image</p></div></AttachmentMediaContext.Provider>));
      await painted();
      const frame = document.querySelector('.message-attachment__frame')!;
      const before = frame.getBoundingClientRect();
      const textTop = document.querySelector('#following-text')!.getBoundingClientRect().top;
      if (!document.querySelector('.message-attachment__skeleton') || before.height < 1 || before.width > (narrow ? 180 : 400)) throw new Error('Image skeleton does not reserve usable space');
      const ratio = width && height ? width / height : 4 / 3;
      if (Math.abs(before.width / before.height - ratio) > .02) throw new Error('Skeleton has wrong aspect ratio');
      release(blob);
      await painted();
      const image = document.querySelector<HTMLImageElement>('.message-attachment__image img')!;
      await image.decode(); await painted();
      const after = frame.getBoundingClientRect();
      if (Math.abs(after.height - before.height) > .1 || Math.abs(document.querySelector('#following-text')!.getBoundingClientRect().top - textTop) > .1 || document.querySelector('.message-attachment__skeleton')) throw new Error('Image decoding shifted following text');
      checks.push({ width, height, narrow });
    }
  }
  return { layouts: checks.length, correctAspectRatios: true, textShift: 0 };
}, async checkImageViewer() {
  const blob = await (await fetch(forestUrl)).blob();
  const load = async () => blob;
  flushSync(() => root.render(<DesktopFrame><section className="chat-workspace" style={{ height: "100%" }}>
    <header className="room-header"><h1># general</h1></header>
    <section className="timeline"><div className="timeline__inner"><h3>jukodev</h3><AttachmentMediaContext.Provider value={load}><AttachmentMessage attachment={{ name: "forest.png", url: "mxc://example/forest", mimeType: "image/png", size: blob.size }} inline sender={{ id: "@jukodev:example", displayName: "jukodev", avatarUrl: null }} timestamp={Date.now()} /></AttachmentMediaContext.Provider></div></section>
  </section></DesktopFrame>));
  await painted();
  const thumbnail = document.querySelector<HTMLButtonElement>('[aria-label="View forest.png"]')!;
  await thumbnail.querySelector("img")!.decode();
  if (document.querySelector(".message-attachment__details")) throw new Error("Image thumbnail still has file metadata controls");
  thumbnail.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 150, clientY: 180 }));
  await painted();
  if (!document.querySelector('[role="menu"]')) throw new Error("Right-click image actions missing");
  const copyThumbnail = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent?.startsWith("Copy image "))!;
  if (!copyThumbnail) throw new Error("Copy image missing from thumbnail menu");
  copyThumbnail.click(); await painted();
  thumbnail.focus(); thumbnail.click();
  await painted();
  const viewer = document.querySelector<HTMLDialogElement>(".image-viewer[open]")!;
  if (!viewer) throw new Error("Image viewer did not open");
  const image = viewer.querySelector("img")!;
  await image.decode();
  const bounds = image.getBoundingClientRect();
  if (bounds.width < 400 || bounds.left < 0 || bounds.right > innerWidth || bounds.bottom > innerHeight) throw new Error("Full-size image did not fit the window");
  viewer.querySelector<HTMLButtonElement>('[aria-label="Zoom image"]')!.click();
  const imageButton = viewer.querySelector<HTMLButtonElement>(".image-viewer__image")!;
  await finishZoom(imageButton);
  if (!viewer.querySelector(".is-zoomed")) throw new Error("Image zoom did not activate");
  const zoomRatio = image.getBoundingClientRect().width / bounds.width;
  if (Math.abs(zoomRatio - 2.5) > .02) throw new Error(`Zoom must magnify the fitted image 2.5x, got ${zoomRatio}`);
  if (parseFloat(getComputedStyle(imageButton).transitionDuration) <= 0) throw new Error("Zoom animation missing");
  viewer.querySelector<HTMLButtonElement>('[aria-label="Fit image to window"]')!.click();
  await finishZoom(imageButton);
  if (Math.abs(image.getBoundingClientRect().width - bounds.width) > 1) throw new Error("Zoom out did not restore fitted size");
  imageButton.click();
  await finishZoom(imageButton);
  if (Math.abs(image.getBoundingClientRect().width / bounds.width - 2.5) > .02) throw new Error("Clicking the image did not magnify it");
  imageButton.click(); await finishZoom(imageButton);
  const probe = document.createElement("span"); probe.style.background = "var(--glass-heavy)"; viewer.append(probe);
  if (getComputedStyle(viewer.querySelector(".image-viewer__toolbar")!).backgroundColor !== getComputedStyle(probe).backgroundColor) throw new Error("Viewer toolbar does not match the app theme");
  probe.remove();
  viewer.querySelector<HTMLButtonElement>('[aria-label="More image options"]')!.click();
  await painted();
  if (!viewer.querySelector('[role="menu"]')) throw new Error("Image menu rendered outside the modal top layer");
  const copyViewer = [...viewer.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent?.startsWith("Copy image "))!;
  if (!copyViewer) throw new Error("Copy image missing from viewer menu");
  copyViewer.click();
  await new Promise(resolve => setTimeout(resolve, 200));
  if (viewer.querySelector('[role="alert"]')) throw new Error("Image copy failed");
  await painted();
  return { imageWidth: Math.round(bounds.width), imageHeight: Math.round(bounds.height), viewer: true, zoomRatio, animated: true };
}, async checkSmallImageZoom() {
  flushSync(() => root.render(<ImageViewer src="/grungus.png" name="small.png" onClose={() => {}} onDownload={() => {}} onCopy={() => {}} onCopyLink={() => {}} downloading={false} error="" />));
  await painted();
  const image = document.querySelector<HTMLImageElement>(".image-viewer__image img")!;
  await image.decode();
  const width = image.getBoundingClientRect().width;
  const button = document.querySelector<HTMLButtonElement>(".image-viewer__image")!;
  button.click(); await finishZoom(button);
  const ratio = image.getBoundingClientRect().width / width;
  if (Math.abs(ratio - 2.5) > .02 || image.getBoundingClientRect().width <= image.naturalWidth) throw new Error("Small images must magnify beyond their original size");
  document.documentElement.dataset.reduceMotion = "true";
  if (parseFloat(getComputedStyle(button).transitionDuration) !== 0) throw new Error("Zoom ignores reduced motion preference");
  delete document.documentElement.dataset.reduceMotion;
  return { smallImageZoomRatio: ratio, reducedMotionRespected: true };
}, async closeImageViewer() {
  document.querySelector(".image-viewer")!.dispatchEvent(new Event("cancel", { cancelable: true }));
  await painted();
  if (document.querySelector(".image-viewer") || document.activeElement?.getAttribute("aria-label") !== "View forest.png") throw new Error("Viewer did not close and restore thumbnail focus");
  return { focusRestored: true };
} });

Object.assign(window, {
  async stagePersistentDraft() {
    const key = "browser-test/account-one/room-one";
    await roomDrafts.load(key);
    roomDrafts.patch(key, { body:"", files:[], reply:null });
    flushSync(() => root.render(<MessageComposer key="room-one" draftKey={key} roomName="one" onTyping={() => {}} onSend={async () => {}} onSendAttachment={async () => {}} />));
    await painted();
    const input = document.querySelector<HTMLTextAreaElement>("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(input,"Room one unsent text");
    input.dispatchEvent(new Event("input",{bubbles:true}));
    const selection = new DataTransfer(); selection.items.add(new File(["Retained attachment bytes"],"draft.txt",{type:"text/plain"}));
    const files = document.querySelector<HTMLInputElement>('input[type="file"]')!; files.files = selection.files; files.dispatchEvent(new Event("change",{bubbles:true}));
    const reply: MatrixMessage = { id:"$reply-target",roomId:"!one",sender:{id:"@alice:test",displayName:"Alice",avatarUrl:null},timestamp:1,type:"text",body:"Reply to me",edited:false,replyTo:null,reactions:[],sendState:"sent",isOwn:false,isRedacted:false };
    roomDrafts.patch(key,{reply});
    await painted();
    input.focus(); input.setSelectionRange(5,11,"backward"); input.blur();
    await painted();
    await roomDrafts.persist(key);
    if(roomDrafts.get(key).selection?.start !== 5 || roomDrafts.get(key).selection?.end !== 11) throw new Error("Draft cursor was not recorded: "+JSON.stringify({selection:roomDrafts.get(key).selection,hydrated:roomDrafts.get(key).hydrated,sending:roomDrafts.get(key).sending,dom:[input.selectionStart,input.selectionEnd],focus:document.hasFocus(),active:document.activeElement?.tagName}));
    if(roomDrafts.get(key).body !== "Room one unsent text" || roomDrafts.get(key).files.length !== 1) throw new Error("Draft did not capture text/files");
    flushSync(() => root.render(<MessageComposer key="room-two" draftKey="browser-test/account-one/room-two" roomName="two" onTyping={() => {}} onSend={async () => {}} onSendAttachment={async () => {}} />));
    await painted();
    if(document.querySelector<HTMLTextAreaElement>("textarea")!.value || document.querySelector(".attachment-draft")) throw new Error("Draft leaked across rooms");
    flushSync(() => root.render(<MessageComposer key="one-again" draftKey={key} roomName="one" onTyping={() => {}} onSend={async () => {}} onSendAttachment={async () => {}} />));
    await painted();
    const restored=document.querySelector<HTMLTextAreaElement>("textarea")!;
    if(restored.selectionStart !== 5 || restored.selectionEnd !== 11 || restored.selectionDirection !== "backward") throw new Error("Cursor moved after room switch");
    return {roomIsolation:true,persisted:true,cursorPreserved:true};
  },
  async checkPersistentDraft() {
    const key="browser-test/account-one/room-one"; await roomDrafts.load(key);
    const saved=roomDrafts.get(key);
    flushSync(() => root.render(<MessageComposer key="restored" draftKey={key} roomName="one" replying={saved.reply} onTyping={() => {}} onSend={async () => {}} onSendAttachment={async () => {}} />));
    await painted();
    if(document.querySelector<HTMLTextAreaElement>("textarea")!.value !== "Room one unsent text" || !document.querySelector(".attachment-draft") || !document.querySelector(".composer-message-context")?.textContent?.includes("Alice")) throw new Error("Draft failed to restore after reload");
    const input=document.querySelector<HTMLTextAreaElement>("textarea")!;
    if(input.selectionStart !== 5 || input.selectionEnd !== 11 || input.selectionDirection !== "backward") throw new Error("Cursor moved after reload");
    if(await saved.files[0].file.text() !== "Retained attachment bytes" || saved.reply?.id !== "$reply-target") throw new Error("Attachment bytes or reply target lost");
    if(roomDrafts.get("browser-test/account-two/room-one").body) throw new Error("Draft leaked across accounts");
    roomDrafts.patch(key,{body:"",files:[],reply:null}); await roomDrafts.persist(key);
    flushSync(() => root.render(<div style={{width:220}}><DirectMessageTab room={{id:"!blocked",name:"A very long blocked contact name",directUserId:"@blocked:test",avatarUrl:null,topic:null,unreadCount:0,highlightCount:0,isEncrypted:true,membership:"join",memberCount:2,isDirect:true}} selected presence="online" onSelect={() => {}} onClose={() => {}} /></div>));
    flushSync(() => blockedUsers.update(["@blocked:test"])); await painted();
    const badge=document.querySelector(".blocked-user-badge")!.getBoundingClientRect(),tab=document.querySelector(".dm-tab")!.getBoundingClientRect();
    if(badge.width < 25 || badge.right > tab.right || badge.left < tab.left) throw new Error("Blocked badge clipped by contact name");
    blockedUsers.update([]);
    return {reload:true,attachmentBytes:true,replyTarget:true,accountIsolation:true,cursorPreserved:true,blockedBadgeFits:true};
  }
});
Object.assign(window, { async checkInlineSearch() {
  const room = {id:"!search",name:"General",avatarUrl:null,topic:null,unreadCount:0,highlightCount:0,isEncrypted:true,membership:"join" as const,memberCount:2};
  let query: unknown;
  const search = <MessageSearchField key={innerWidth} room={room} serverName="Test server" serverRooms={[room]} historyKey="browser-search" onOpen={async () => {}} searchMessages={async value => {query=value; return {messages:[],scanned:5,roomsDone:1,totalRooms:1,undecryptable:0,limited:false};}} />;
  flushSync(() => root.render(<DesktopFrame><section className="chat-workspace" style={{marginLeft:300}}><header className="room-header"><div className="room-header__title"><div><h1>General</h1></div></div><div className="room-header__actions"><button className="icon-button">Call</button><button className="member-count">Members</button>{search}</div></header><button id="outside-search">Outside search</button></section></DesktopFrame>));
  await painted();
  const input=document.querySelector<HTMLInputElement>("[data-message-search]")!;
  input.focus(); await painted();
  const pop=document.querySelector<HTMLElement>(".message-search-popover")!, rect=pop.getBoundingClientRect(), field=input.getBoundingClientRect(), members=document.querySelector(".member-count")!.getBoundingClientRect();
  if(rect.width > 361 || rect.right > innerWidth || rect.bottom > innerHeight || Math.abs(rect.top-field.bottom-8)>2 || members.right>field.left) throw new Error("Search geometry invalid: "+JSON.stringify({popup:rect.toJSON(),field:field.toJSON(),members:members.toJSON()}));
  if(document.querySelector("dialog[open]")) throw new Error("Search still opens modal");
  (document.querySelector(".message-search__more") as HTMLButtonElement).click(); await painted();
  const sender=document.querySelector<HTMLInputElement>('[aria-label="Filter by sender"]')!;sender.focus();await painted();
  if(!document.querySelector(".message-search-popover")) throw new Error("Filter focus closed popup");
  document.querySelector<HTMLButtonElement>("#outside-search")!.focus();await painted();
  if(document.querySelector(".message-search-popover")) throw new Error("Outside focus did not dismiss");
  input.focus(); await painted(); document.body.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));await painted();
  if(document.querySelector(".message-search-popover")) throw new Error("Outside click did not dismiss");
  input.dispatchEvent(new CustomEvent("grungus:focus-search",{detail:{scope:"server"}}));await painted();
  if(!input.placeholder.includes("Test server")) throw new Error("Server shortcut scope failed");
  input.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));await painted();
  if(document.querySelector(".message-search-popover")) throw new Error("Escape did not dismiss");
  input.click(); await painted();
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!;
  setter.call(input,'launch from:@alice:test has:image');input.dispatchEvent(new Event("input",{bubbles:true}));
  input.closest("form")!.requestSubmit();await painted();
  if(!query || (query as {sender:string}).sender !== "@alice:test") throw new Error("Inline search filters failed");
  setter.call(input,"");input.dispatchEvent(new Event("input",{bubbles:true}));await painted();
  (document.querySelector(".message-search__more") as HTMLButtonElement).click();await painted();
  return {compact:true,rightAligned:true,noModal:true,filterFocus:true,outsideFocus:true,outsideClick:true,escape:true,serverShortcut:true,inlineFilters:true};
}});

Object.assign(window, {
  async showTheme(theme: Theme = "aurora") {
    preferences.update({theme}); flushSync(() => root.render(<ThemeFixture />));await painted();
    document.querySelector(`.settings-theme--${theme}`)?.scrollIntoView({ block: "nearest" }); await painted();
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  },
  async checkThemes() {
    const palettes = new Set<string>(), wallpapers = new Set<string>();
    preferences.setAccount("theme-browser-fixture");
    flushSync(() => root.render(<ThemeFixture />));await painted();
    for(const theme of themes) {
      document.querySelector<HTMLButtonElement>(`.settings-theme--${theme.id}`)!.click();await painted();
      if(document.documentElement.dataset.theme !== theme.id || preferences.getSnapshot().theme !== theme.id) throw new Error("Theme did not apply: "+theme.id);
      if(!document.querySelector(`.settings-theme--${theme.id}[aria-pressed="true"]`)) throw new Error("Theme selection indicator missing");
      preferences.reload();await painted();if(preferences.getSnapshot().theme !== theme.id) throw new Error("Theme did not persist");
      const style=getComputedStyle(document.documentElement);
      palettes.add(style.getPropertyValue("--accent").trim());wallpapers.add(getComputedStyle(document.body).backgroundImage);
      const cards=[...document.querySelectorAll<HTMLElement>(".settings-theme")];
      for(const card of cards) {const rect=card.getBoundingClientRect();if(rect.width < 100 || rect.right > innerWidth || card.scrollWidth > rect.width+1) throw new Error("Theme card overflow: "+theme.id);}
      const popupColor=style.getPropertyValue("--glass-heavy").trim();if(!popupColor) throw new Error("Missing overlay surface");
      if(["aurora","orbit","sundown","rosewater","golden-pond","savanna","reeds","bullfrog","honey","chorus","cocoa","black-rain"].includes(theme.id)) {
        if(getComputedStyle(document.body).backgroundImage.includes("toad-forest")) throw new Error("Forest wallpaper leaked into "+theme.id);
        if(!style.getPropertyValue("--theme-wallpaper").trim()) throw new Error("Missing theme wallpaper");
      }
    }
    if(palettes.size < 5 || wallpapers.size < 6) throw new Error("Theme palettes/backgrounds did not vary");
    await (window as unknown as {showTheme:(theme:Theme)=>Promise<void>}).showTheme("aurora");
    return {themes:themes.length,persisted:true,distinctPalettes:true,distinctBackgrounds:true,previewsFit:true};
  },
  async checkFilterSuggestions() {
    const room = {id:"!suggestions",name:"General",avatarUrl:null,topic:null,unreadCount:0,highlightCount:0,isEncrypted:true,membership:"join" as const,memberCount:2};
    flushSync(() => root.render(<DesktopFrame><header className="room-header" style={{marginLeft:300}}><div className="room-header__title"><h1>General</h1></div><MessageSearchField room={room} serverRooms={[room,{...room,id:"!games:test",name:"Gaming"}]} members={[{id:"@alice:test",displayName:"Alice",avatarUrl:null},{id:"@bob:test",displayName:"Bob",avatarUrl:null}]} onOpen={async () => {}} searchMessages={async () => ({messages:[],scanned:0,roomsDone:0,totalRooms:1,undecryptable:0,limited:false})} /></header></DesktopFrame>));
    await painted();
    const field = document.querySelector<HTMLInputElement>("[data-message-search]")!;field.focus();await painted();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!;
    const type = async (value:string) => {set.call(field,value);field.dispatchEvent(new Event("input",{bubbles:true}));await painted();};
    await type("from:bo");
    if(document.querySelectorAll('[role="option"]').length !== 1 || !document.querySelector('[role="option"]')?.textContent?.includes("Bob")) throw new Error("User filter suggestions failed");
    field.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));await painted();
    if(field.value !== "from:@bob:test ") throw new Error("Keyboard filter completion failed");
    await type(field.value + "in:gam");
    document.querySelector<HTMLButtonElement>('[role="option"]')!.click();await painted();
    if(!field.value.includes("in:!games:test ")) throw new Error("Channel completion failed");
    await type(field.value+"has:");
    if(document.querySelectorAll('[role="option"]').length !== 6) throw new Error("Missing media options");
    document.querySelector<HTMLButtonElement>('[role="option"]')!.click();await painted();
    if(!field.value.endsWith("has:image ")) throw new Error("Media completion failed");
    document.querySelector<HTMLButtonElement>('.message-search__more')!.click();await painted();
    document.querySelector<HTMLButtonElement>('[aria-label="Search scope"]')!.click();await painted();
    const select = document.querySelector<HTMLElement>('.themed-select__options')!;
    if(!select.matches(":popover-open") || !document.querySelector(".message-search-popover")) throw new Error("Nested dropdown closed search");
    select.querySelector<HTMLElement>('[role="option"]')!.click();await painted();
    document.querySelector<HTMLButtonElement>('[aria-label="Choose messages from date"]')!.click();await painted();
    if(!document.querySelector('.themed-calendar:popover-open') || !document.querySelector(".message-search-popover")) throw new Error("Nested calendar closed search");
    document.querySelector<HTMLButtonElement>('.themed-calendar footer button:last-child')!.click();await painted();
    await type("from:");
    return {users:true,channels:true,media:true,keyboard:true,nestedSelect:true,nestedCalendar:true};
  },
  async checkThemedControls() {
    flushSync(() => root.render(<ControlFixture />));await painted();
    const dialog = document.querySelector<HTMLDialogElement>("#controls-dialog")!;dialog.showModal();await painted();
    const media = document.querySelector<HTMLButtonElement>('[aria-label="Demo media"]')!;media.click();await painted();
    const popup = document.querySelector<HTMLElement>('.themed-select__options')!;
    if(!popup.matches(":popover-open")) throw new Error("Custom select not in top layer");
    const option = popup.querySelectorAll<HTMLElement>('[role="option"]')[1], rect=option.getBoundingClientRect();
    if(!option.contains(document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2))) throw new Error("Modal dropdown obstructed");
    option.click();await painted();if(!media.textContent?.includes("Videos")) throw new Error("Custom select value not saved");
    media.click();await painted();media.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));await painted();
    if(document.querySelector(".themed-select__options") || !dialog.open) throw new Error("Escape closed parent modal");
    document.querySelector<HTMLButtonElement>('[aria-label="Choose demo date"]')!.click();await painted();
    const calendar = document.querySelector<HTMLElement>('.themed-calendar')!;
    if(!calendar.matches(":popover-open")) throw new Error("Calendar not visible in modal");
    document.querySelector<HTMLButtonElement>('[aria-label="Calendar month"]')!.click();await painted();
    document.querySelectorAll<HTMLElement>('.themed-select__options [role="option"]')[2].click();await painted();
    if(!document.querySelector('.themed-calendar:popover-open')) throw new Error("Month selection closed calendar");
    document.querySelector<HTMLButtonElement>('.themed-calendar footer button:last-child')!.click();await painted();
    if(!document.querySelector<HTMLInputElement>('[aria-label="Demo date"]')!.value) throw new Error("Date not saved");
    document.querySelector<HTMLButtonElement>('#demo-tooltip')!.focus();await painted();
    const tooltip=document.querySelector<HTMLElement>('[role="tooltip"]');
    if(!tooltip?.matches(":popover-open") || tooltip.textContent !== "Styled app tooltip") throw new Error("Themed tooltip missing");
    const forest = getComputedStyle(tooltip).backgroundColor;
    document.documentElement.dataset.theme="light";await painted();
    if(getComputedStyle(tooltip).backgroundColor === forest) throw new Error("Tooltip did not follow light theme");
    delete document.documentElement.dataset.theme;
    if(document.querySelector('select,datalist,input[type="date"],input[type="time"],button[title]')) throw new Error("Native controls remain");
    document.querySelector<HTMLButtonElement>('[aria-label="Choose demo date"]')!.click();await painted();
    return {modalDropdown:true,modalCalendar:true,nestedMonthPicker:true,escape:true,tooltip:true,lightTheme:true,noNativeControls:true};
  }
});

Object.assign(window, {
  async checkMessageLinks() {
    const message: MatrixMessage = { id: "$links", roomId: "!links", sender: { id: "@alice:test", displayName: "Alice", avatarUrl: null }, timestamp: 1, type: "text", body: "Visit https://example.org/path?q=1 or www.example.com. Email alice@example.org. `https://literal.example.org`", edited: false, replyTo: null, reactions: [], sendState: "sent", isOwn: false, isRedacted: false };
    flushSync(() => root.render(<DesktopFrame><PreferenceEffects /><article className="message-row"><div className="message-row__content"><MessageText message={message} convertEmoji /></div></article></DesktopFrame>));
    await painted();
    const links = [...document.querySelectorAll<HTMLAnchorElement>(".message-body-text a")];
    if (links.length !== 3 || links[0].href !== "https://example.org/path?q=1" || links[1].href !== "https://www.example.com/" || links[2].href !== "mailto:alice@example.org") throw new Error("Bare links did not become clickable");
    if (document.querySelector("code a")) throw new Error("Code must remain literal");
    for (const theme of themes) {
      document.documentElement.dataset.theme = theme.id; await painted();
      const style = getComputedStyle(links[0]);
      if (!style.textDecorationLine.includes("underline") || style.color === getComputedStyle(links[0].parentElement!).color) throw new Error("Link is not visibly distinct in " + theme.id);
    }
    document.documentElement.dataset.theme = "forest"; await painted();
    const rect = links[0].getBoundingClientRect();
    return { links: links.length, themes: themes.length, x: Math.round(rect.left + 10), y: Math.round(rect.top + rect.height / 2) };
  }
});

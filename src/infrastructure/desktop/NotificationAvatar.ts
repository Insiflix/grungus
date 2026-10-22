/** Local, small PNGs keep Matrix credentials and remote URLs out of Windows toasts. */
export async function notificationAvatar(url: string | null, name: string, load: (url: string) => Promise<string>): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Cannot create notification avatar');
  context.beginPath(); context.arc(48, 48, 48, 0, Math.PI * 2); context.clip();
  if (url) {
    try {
      const image = new Image();
      image.src = await load(url);
      await image.decode();
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 96, 96);
      return canvas.toDataURL('image/png');
    } catch { /* Missing/private avatars use initials, like the rest of the UI. */ }
  }
  context.fillStyle = '#325f5b'; context.fillRect(0, 0, 96, 96);
  context.fillStyle = '#ffffff'; context.font = '600 38px sans-serif';
  context.textAlign = 'center'; context.textBaseline = 'middle';
  const initials = name.replace(/^[@#!]/, '').split(/[\s:_-]+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';
  context.fillText(initials, 48, 50);
  return canvas.toDataURL('image/png');
}

// Transport and membership messages belong to the call controllers, not the chat.
export function isCallSignallingEvent(type: string): boolean {
  return type.startsWith("m.call.") || type.startsWith("m.rtc.") || type.startsWith("org.matrix.call.") || type.startsWith("io.element.call.") || /^org\.matrix\.msc(?:3401\.call|4075\.(?:call|rtc)|4143\.rtc|4310\.rtc)\./.test(type);
}

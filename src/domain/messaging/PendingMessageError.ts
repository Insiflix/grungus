export class PendingMessageError extends Error {
  constructor(message: string, readonly eventId: string) { super(message); this.name = "PendingMessageError"; }
}

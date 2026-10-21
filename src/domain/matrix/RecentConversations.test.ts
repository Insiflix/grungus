import { expect, it } from "vitest";
import type { MatrixMessage, MatrixRoom } from "./MatrixTypes";
import { recentConversations } from "./RecentConversations";
const base: MatrixRoom = { id: "!dm", name: "Alice", avatarUrl: null, topic: null, unreadCount: 0, highlightCount: 0, membership: "join", memberCount: 2, isEncrypted: false, isDirect: true, lastMessageTimestamp: 100 };
it("mixes DMs and channels by latest message, independent of unread count and name", () => {
  const channel = { ...base, id: "!channel", name: "Z-channel", isDirect: false, lastMessageTimestamp: 200 };
  const unread = { ...base, id: "!old", unreadCount: 99, lastMessageTimestamp: 50 };
  expect(recentConversations([base, unread, channel], {}).map(room => room.id)).toEqual(["!channel", "!dm", "!old"]);
  expect(recentConversations([base, unread, channel], { "!dm": [{ timestamp: 300 } as MatrixMessage] }).map(room => room.id)).toEqual(["!dm", "!channel", "!old"]);
});
it("keeps startup activity when only older history is loaded and breaks ties consistently", () => {
  const other = { ...base, id: "!a" };
  expect(recentConversations([base, other], { "!dm": [{ timestamp: 10 } as MatrixMessage] }).map(room => room.id)).toEqual(["!a", "!dm"]);
});

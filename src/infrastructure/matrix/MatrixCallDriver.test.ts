import { describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import { MatrixCallDriver, mountMatrixCall } from "./MatrixCallDriver";
function fixture() {
  const sendStateEvent = vi.fn().mockResolvedValue({ event_id: "$membership" });
  const sendEvent = vi.fn().mockResolvedValue({ event_id: "$call" });
  const client = { getRoom: vi.fn(() => ({ getMyMembership: () => "join", getMember: (id: string) => ({ membership: id === "@joined:test" ? "join" : "leave" }) })), getUserId: () => "@alice:test", getDeviceId: () => "DEVICE", sendStateEvent, sendEvent } as unknown as MatrixClient;
  return { driver: new MatrixCallDriver(client, "!call:test"), client, sendStateEvent, sendEvent };
}
describe("call widget driver", () => {
  it("explains missing room call permission before loading the widget", () => {
    const maySendStateEvent = vi.fn(() => false);
    const client = {
      getRoom: () => ({ getMyMembership: () => "join", currentState: { maySendStateEvent } }),
      getUserId: () => "@member:test",
    } as unknown as MatrixClient;
    const iframe = {} as HTMLIFrameElement;
    expect(() => mountMatrixCall(client, iframe, "!call:test", false, () => {})).toThrow("Ask a room admin");
    expect(maySendStateEvent).toHaveBeenCalledWith("org.matrix.msc3401.call.member", "@member:test");
    expect(iframe.src).toBeUndefined();
  });
  it("rejects sends to another room and unrelated chat events", async () => {
    const { driver, sendEvent } = fixture();
    await expect(driver.sendEvent("m.call.notify", {}, null, "!other:test")).rejects.toThrow("outside");
    await expect(driver.sendEvent("m.room.message", { body: "no" })).rejects.toThrow("Unsupported");
    expect(sendEvent).not.toHaveBeenCalled();
  });
  it("cleans up only state membership written by this widget", async () => {
    const { driver, sendStateEvent } = fixture();
    await expect(driver.sendEvent("org.matrix.msc3401.call.member", {}, "@someone:test")).rejects.toThrow();
    await driver.sendEvent("org.matrix.msc3401.call.member", { device_id: "DEVICE" }, "_@alice:test_DEVICE_m.call");
    await driver.cleanup();
    expect(sendStateEvent).toHaveBeenLastCalledWith("!call:test", "org.matrix.msc3401.call.member", {}, "_@alice:test_DEVICE_m.call");
  });
  it("rejects arbitrary to-device recipients and delayed event IDs", async () => {
    const { driver } = fixture();
    await expect(driver.sendToDevice("io.element.call.encryption_keys", true, { "@outsider:test": { OTHER: {} } })).rejects.toThrow("outside");
    await expect(driver.cancelScheduledDelayedEvent("unrelated-delay")).rejects.toThrow("Unknown");
  });
  it("refuses to send call encryption keys as plaintext", async () => {
    const { driver } = fixture();
    await expect(driver.sendToDevice("io.element.call.encryption_keys", false, { "@joined:test": { DEVICE: { keys: [] } } })).rejects.toThrow("must be sent encrypted");
    await expect(driver.sendToDevice("m.call.encryption_keys", false, { "@joined:test": { DEVICE: { keys: [] } } })).rejects.toThrow("must be sent encrypted");
  });
});

it("waits for an in-flight membership write before clearing it and refuses writes after teardown", async () => {
  const { driver, sendStateEvent } = fixture();
  let finish!: (value: { event_id: string }) => void;
  sendStateEvent.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const joining = driver.sendEvent("org.matrix.msc3401.call.member", { device_id: "DEVICE" }, "_@alice:test_DEVICE_m.call");
  await Promise.resolve(); const cleanup = driver.cleanup();
  expect(driver.cleanup()).toBe(cleanup);
  await expect(driver.sendEvent("org.matrix.msc3401.call.member", { device_id: "DEVICE" }, "_@alice:test_DEVICE_m.call")).rejects.toThrow("ended");
  expect(sendStateEvent).toHaveBeenCalledTimes(1);
  finish({ event_id: "$late-join" }); await joining; await cleanup;
  expect(sendStateEvent).toHaveBeenLastCalledWith("!call:test", "org.matrix.msc3401.call.member", {}, "_@alice:test_DEVICE_m.call");
});
it("removes only this device from legacy user-scoped membership state", async () => {
  const { driver, client, sendStateEvent } = fixture();
  Object.assign(client, { getStateEvent: vi.fn(async () => ({ memberships: [{ device_id: "DEVICE" }, { device_id: "OTHER" }] })) });
  await driver.sendEvent("org.matrix.msc3401.call.member", { memberships: [{ device_id: "DEVICE" }] }, "@alice:test");
  await driver.cleanup();
  expect(sendStateEvent).toHaveBeenLastCalledWith("!call:test", "org.matrix.msc3401.call.member", { memberships: [{ device_id: "OTHER" }] }, "@alice:test");
});
it("clears sticky membership using its own sticky key and cancels obsolete delayed leaves", async () => {
  const { driver, client } = fixture();
  const sticky = vi.fn(async () => ({ event_id: "$sticky" }));
  const update = vi.fn(async () => ({}));
  Object.assign(client, { _unstable_sendStickyEvent: sticky, _unstable_sendStickyDelayedEvent: vi.fn(async () => ({ delay_id: "leave" })), _unstable_updateDelayedEvent: update });
  await driver.sendStickyEvent(60000, "m.rtc.member", { member: { device_id: "DEVICE", user_id: "@alice:test" }, msc4354_sticky_key: "own-session" });
  await driver.sendDelayedStickyEvent(8000, 60000, "m.rtc.member", { msc4354_sticky_key: "own-session" });
  await driver.cleanup();
  expect(sticky).toHaveBeenLastCalledWith("!call:test", 60000, null, "m.rtc.member", { msc4354_sticky_key: "own-session" });
  expect(update).toHaveBeenCalledWith("leave", "cancel");
});
it("finishes the old call cleanup before publishing a rapid rejoin", async () => {
  const { driver, client, sendStateEvent } = fixture();
  await driver.sendEvent("m.call.member", { device_id: "DEVICE" }, "_@alice:test_DEVICE_m.call");
  let finish!: (value: { event_id: string }) => void;
  sendStateEvent.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const cleanup = driver.cleanup(); await Promise.resolve(); await Promise.resolve();
  const next = new MatrixCallDriver(client, "!call:test");
  const joining = next.sendEvent("m.call.member", { device_id: "DEVICE", membershipID: "new" }, "_@alice:test_DEVICE_m.call");
  await Promise.resolve(); expect(sendStateEvent).toHaveBeenCalledTimes(2);
  finish({ event_id: "$left" }); await cleanup; await joining;
  expect(sendStateEvent).toHaveBeenLastCalledWith("!call:test", "m.call.member", { device_id: "DEVICE", membershipID: "new" }, "_@alice:test_DEVICE_m.call");
});

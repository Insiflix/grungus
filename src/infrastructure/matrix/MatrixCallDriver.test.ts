import { describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import { MatrixCallDriver } from "./MatrixCallDriver";
function fixture() {
  const sendStateEvent = vi.fn().mockResolvedValue({ event_id: "$membership" });
  const sendEvent = vi.fn().mockResolvedValue({ event_id: "$call" });
  const client = { getRoom: vi.fn(() => ({ getMyMembership: () => "join", getMember: (id: string) => ({ membership: id === "@joined:test" ? "join" : "leave" }) })), getUserId: () => "@alice:test", getDeviceId: () => "DEVICE", sendStateEvent, sendEvent } as unknown as MatrixClient;
  return { driver: new MatrixCallDriver(client, "!call:test"), sendStateEvent, sendEvent };
}
describe("call widget driver", () => {
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

import { describe, expect, it, vi } from "vitest";
import { boundedBlob } from "./BoundedResponse";

describe("bounded media responses", () => {
  it("rejects advertised oversized media before reading it", async () => {
    const response = new Response("large", { headers: { "content-length": "100" } });
    const cancel = vi.spyOn(response.body!, "cancel");
    await expect(boundedBlob(response, 4)).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });
  it("enforces actual streamed bytes when content length is absent or dishonest", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(3)); controller.enqueue(new Uint8Array(3)); }, cancel });
    await expect(boundedBlob(new Response(stream, { headers: { "content-length": "1" } }), 4)).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });
  it("preserves valid data and media type within the bound", async () => {
    const blob = await boundedBlob(new Response("test", { headers: { "content-type": "image/png" } }), 4);
    expect(blob.type).toBe("image/png");
    expect(await blob.text()).toBe("test");
  });
});

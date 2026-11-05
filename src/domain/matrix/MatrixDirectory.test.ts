import { describe, expect, it } from "vitest";
import { matrixRoomAddress, matrixServerName } from "./MatrixDirectory";

describe("federated Matrix addresses", () => {
  it("preserves matrix.to routing servers for remote room IDs", () => {
    expect(matrixRoomAddress("https://matrix.to/#/!opaque?via=remote.org&via=backup.org&via=remote.org"))
      .toEqual({ address: "!opaque", viaServers: ["remote.org", "backup.org"] });
    expect(matrixRoomAddress("https://matrix.to/#/%23lobby%3Aremote.org"))
      .toEqual({ address: "#lobby:remote.org", viaServers: [] });
  });
  it("accepts server names with ports and IPv6", () => {
    for (const server of ["matrix.org", "remote.org:8448", "[2001:db8::1]:8448"]) expect(matrixServerName(server)).toBe(server);
  });
  it("rejects URLs as server names and user links as rooms", () => {
    for (const server of ["https://matrix.org", "server/path", "user@server", "server?query"]) expect(() => matrixServerName(server)).toThrow();
    for (const address of ["matrix.org", "https://matrix.to/#/@alice:remote.org", "https://example.org/#/#room:remote.org"]) expect(() => matrixRoomAddress(address)).toThrow();
  });
});

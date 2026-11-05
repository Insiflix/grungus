export interface MatrixDirectoryRoom {
  id: string;
  name: string;
  alias?: string;
  topic?: string;
  memberCount: number;
  isSpace: boolean;
}

export interface MatrixDirectoryPage {
  rooms: MatrixDirectoryRoom[];
  nextBatch?: string;
}

export function matrixServerName(value: string): string {
  const name = value.trim();
  if (!name || /[\s/@?#]/.test(name)) throw new Error("Enter a Matrix server name, such as matrix.org (without https://).");
  try {
    const url = new URL(`https://${name}`);
    if (!url.hostname || url.username || url.password || url.pathname !== "/") throw new Error();
  } catch { throw new Error("Enter a valid Matrix server name, such as matrix.org."); }
  return name;
}

export function matrixRoomAddress(value: string, viaServers: string[] = []): { address: string; viaServers: string[] } {
  let address = value.trim();
  let via = viaServers;
  if (/^https:\/\/matrix\.to\//i.test(address)) {
    const link = new URL(address);
    const [path, query] = link.hash.slice(1).split("?");
    try { address = decodeURIComponent((path ?? "").replace(/^\//, "")); }
    catch { throw new Error("Invalid Matrix room link."); }
    via = [...via, ...new URLSearchParams(query).getAll("via")];
  }
  if (!/^(?:#[^\s:]+:[^\s/?#]+|![^\s/?#]+)$/.test(address)) throw new Error("Enter a room address (#room:example.org), room ID, or matrix.to room link.");
  return { address, viaServers: [...new Set(via.map(matrixServerName))] };
}

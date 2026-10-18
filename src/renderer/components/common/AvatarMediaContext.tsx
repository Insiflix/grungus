import { createContext, type PropsWithChildren } from "react";

export const AvatarMediaContext = createContext<(url: string) => Promise<string>>(async (url) => url);
export function AvatarMediaProvider({ load, children }: PropsWithChildren<{ load: (url: string) => Promise<string> }>) {
  return <AvatarMediaContext.Provider value={load}>{children}</AvatarMediaContext.Provider>;
}

/// <reference types="vite/client" />
import type { DesktopBridge } from "../electron/shared/session";
declare global {
  interface ImportMetaEnv { readonly VITE_KLIPY_API_KEY?: string }
  interface Window { readonly desktop?: DesktopBridge }
}

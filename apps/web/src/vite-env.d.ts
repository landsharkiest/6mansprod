/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API origin for production builds served from a different host. Empty in dev (proxied). */
  readonly VITE_API_ORIGIN?: string;
}

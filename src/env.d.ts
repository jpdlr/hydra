/// <reference types="vite/client" />

import type { HydraAPI } from '../electron/preload'

declare global {
  interface Window {
    hydra: HydraAPI
  }
}

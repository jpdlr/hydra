// Node 25+ ships a built-in localStorage stub (via --localstorage-file) that
// shadows jsdom's fully-functional Storage implementation. The Node stub lacks
// methods like clear(), getItem(), setItem() etc. This setup file restores a
// proper in-memory Storage for jsdom-based tests.

if (typeof window !== 'undefined') {
  const storage = new Map<string, string>()
  const localStorageShim: Storage = {
    get length() { return storage.size },
    clear() { storage.clear() },
    getItem(key: string) { return storage.get(key) ?? null },
    setItem(key: string, value: string) { storage.set(key, String(value)) },
    removeItem(key: string) { storage.delete(key) },
    key(index: number) {
      const keys = Array.from(storage.keys())
      return keys[index] ?? null
    }
  }
  Object.defineProperty(window, 'localStorage', { value: localStorageShim, writable: true, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageShim, writable: true, configurable: true })

  // Monaco's clipboard contribution probes document.queryCommandSupported at load time.
  if (typeof document !== 'undefined' && typeof (document as Document & { queryCommandSupported?: unknown }).queryCommandSupported !== 'function') {
    (document as Document & { queryCommandSupported?: (cmd: string) => boolean }).queryCommandSupported = () => false
  }
}

// Safe storage: the hosted app can run in a sandboxed frame where
// localStorage access throws a SecurityError. Every access is wrapped so
// the app never crashes; it falls back to in-memory storage.
const memory = new Map<string, string>();

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    memory.delete(key);
  }
}

export const storage = { get: safeGet, set: safeSet, remove: safeRemove };

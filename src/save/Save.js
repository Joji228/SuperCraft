// Thin localStorage wrapper. Storage can be unavailable (private mode, blocked
// site data), so every access is guarded and the game works without it.
const PREFIX = 'supercraft.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // ignore: progress just won't persist
  }
}

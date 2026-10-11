// Minimal event bus so modes and missions can listen to gameplay events
// (enemyDefeated, civilianSaved, civilianLost, fireOut, carSaved, ...).
export class Events {
  constructor() {
    this.map = new Map();
  }

  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.map.get(name)?.delete(fn);
  }

  emit(name, ...args) {
    const set = this.map.get(name);
    if (set) for (const fn of [...set]) fn(...args);
  }
}

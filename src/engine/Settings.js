import { load, save } from '../save/Save.js';

export const RENDER_DISTANCES = [
  { label: 'Low', value: 112 },
  { label: 'Medium', value: 176 },
  { label: 'High', value: 240 },
  { label: 'Ultra', value: 320 },
];

const DEFAULTS = {
  sensitivity: 1,
  invertY: false,
  renderDistance: 176,
  shadows: true,
  dayNight: false,
  volume: 0.56,
  fov: 75,
  firstPerson: false,
  unlockAll: false, // testing: every campaign mission playable
};

export class Settings {
  constructor() {
    const saved = load('settings', {});
    // the default volume was lowered from 0.8; move players still on the old default
    if (saved.volume === 0.8) saved.volume = DEFAULTS.volume;
    Object.assign(this, DEFAULTS, saved);
    this.listeners = [];
  }

  set(key, value) {
    this[key] = value;
    this.save();
    for (const fn of this.listeners) fn(key, value);
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  save() {
    const out = {};
    for (const k of Object.keys(DEFAULTS)) out[k] = this[k];
    save('settings', out);
  }
}

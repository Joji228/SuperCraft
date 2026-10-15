import { load, save } from '../save/Save.js';

import { isTouchDevice } from '../input/TouchControls.js';

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
  autoRes: true, // lower the render resolution a little when frames get slow (big screens)
  phoneDefaults: false, // lighter graphics were set up for a phone
  dayNight: false,
  volume: 0.56,
  fov: 75,
  cameraMode: 0, // 0 close, 1 medium, 2 far, 3 first person (V cycles)
  skin: 'sky', // costume (see player/skins.js); the costume picker was replaced by the Heroes menu
  hero: 'sky', // chosen hero (see player/heroes.js)
  unlockAll: false, // testing: every campaign mission playable
};

export class Settings {
  constructor() {
    const saved = load('settings', {});
    // the default volume was lowered from 0.8; move players still on the old default
    if (saved.volume === 0.8) saved.volume = DEFAULTS.volume;
    // older saves had a first-person on/off switch
    if (saved.firstPerson && saved.cameraMode == null) saved.cameraMode = 3;
    delete saved.firstPerson;
    Object.assign(this, DEFAULTS, saved);
    // first time on a phone: lighter graphics (they can be turned back up in Settings)
    if (isTouchDevice() && !saved.phoneDefaults) {
      this.renderDistance = 112;
      this.shadows = false;
      this.autoRes = true;
      this.phoneDefaults = true;
      this.save?.();
    }
    this.listeners = [];
  }

  get firstPerson() {
    return this.cameraMode === 3;
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

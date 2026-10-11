// Hero health, energy and laser heat.
export const METERS = {
  maxHealth: 100,
  healthRegen: 8, // per second, after a short delay
  regenDelay: 3,
  maxEnergy: 100,
  energyRegen: 15,
  energyRegenDelay: 0.8,
  heatCool: 38,
  overheatRecover: 25, // heat must drop below this to fire again
  speedDrain: 8, // boost bar per second (about 12 s of boosting)
  speedRegen: 14,
};

export class Meters {
  constructor() {
    this.reset();
  }

  reset() {
    this.health = METERS.maxHealth;
    this.energy = METERS.maxEnergy;
    this.heat = 0;
    this.speed = 100;
    this.boosting = false;
    this.overheated = false;
    this.sinceHit = 99;
    this.sinceDrain = 99;
    this.heating = false;
    this.damageTaken = 0;
    this.invulnerable = 0;
  }

  /** Try to spend energy; returns false (and spends nothing) if empty. */
  drain(amount) {
    if (this.energy <= 0) return false;
    this.energy = Math.max(0, this.energy - amount);
    this.sinceDrain = 0;
    return true;
  }

  addHeat(amount) {
    if (this.overheated) return false;
    this.heat = Math.min(100, this.heat + amount);
    this.heating = true;
    if (this.heat >= 100) this.overheated = true;
    return true;
  }

  hurt(amount) {
    if (this.invulnerable > 0 || this.health <= 0) return 0;
    this.health = Math.max(0, this.health - amount);
    this.damageTaken += amount;
    this.sinceHit = 0;
    return amount;
  }

  heal(amount) {
    this.health = Math.min(METERS.maxHealth, this.health + amount);
  }

  get dead() {
    return this.health <= 0;
  }

  update(dt) {
    this.sinceHit += dt;
    this.sinceDrain += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (this.sinceHit > METERS.regenDelay && this.health > 0) this.heal(METERS.healthRegen * dt);
    if (this.sinceDrain > METERS.energyRegenDelay) this.energy = Math.min(METERS.maxEnergy, this.energy + METERS.energyRegen * dt);
    if (!this.heating) this.heat = Math.max(0, this.heat - METERS.heatCool * dt);
    if (this.overheated && this.heat < METERS.overheatRecover) this.overheated = false;
    this.heating = false;
    if (!this.boosting) this.speed = Math.min(100, this.speed + METERS.speedRegen * dt);
    this.boosting = false;
  }

  /** Called every frame the hero boosts. */
  drainSpeed(dt) {
    this.speed = Math.max(0, this.speed - METERS.speedDrain * dt);
    this.boosting = true;
  }
}

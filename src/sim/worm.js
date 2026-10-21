import { CONFIG, STEP, WORLD } from '../config.js';
import { forwardSubstrate } from '../neat/hyperneat.js';
import { clamp, lerp } from './random.js';

const FOOD_RAYS = 8;
const HAZARD_RAYS = 4;
const HAZARD_OFFSETS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const TWO_PI = Math.PI * 2;

function wrapAngle(angle) {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= TWO_PI;
  while (wrapped < -Math.PI) wrapped += TWO_PI;
  return wrapped;
}

export class Worm {
  constructor({ id, index, color, x, y, heading, substrate, config = CONFIG }) {
    this.id = id;
    this.index = index;
    this.color = color;
    this.config = config;
    this.substrate = substrate;

    this.x = x;
    this.y = y;
    this.heading = heading;
    this.speed = config.worm.minSpeed;
    this.steering = 0;
    this.throttle = 0.45;
    this.angularVelocity = 0;

    this.energy = config.worm.startEnergy;
    this.maxEnergy = config.worm.maxEnergy;
    this.age = 0;
    this.alive = true;
    this.deathCause = null;

    this.foodEaten = 0;
    this.foodEnergy = 0;
    this.distanceTravelled = 0;
    this.hazardTime = 0;
    this.wallHits = 0;
    this.ateRecently = 0;

    this.sensorValues = new Array(8 + 4 + 2).fill(0);
    this.activations = {
      hidden: new Array(8).fill(0),
      outputs: [0, 0],
    };
    this.outputs = { turn: 0, thrust: 0 };

    this.body = Array.from({ length: config.worm.segments }, (_, segment) => ({
      x: x - Math.cos(heading) * config.worm.spacing * segment,
      y: y - Math.sin(heading) * config.worm.spacing * segment,
    }));
    this.trail = [{ x, y }];
    this.trailClock = 0;
    this.bodyClock = 0;
  }

  get fitness() {
    const f = this.config.fitness;
    const survival = this.age * f.perSecond;
    const food = this.foodEaten * f.perFood;
    const travel = this.distanceTravelled * f.perUnitTravelled;
    const energy = this.energy * f.finalEnergy;
    const hazard = this.hazardTime * f.hazardPenalty;
    return Math.max(0, food + survival + travel + energy - hazard);
  }

  get fitnessParts() {
    const f = this.config.fitness;
    return {
      food: this.foodEaten * f.perFood,
      survival: this.age * f.perSecond,
      travel: this.distanceTravelled * f.perUnitTravelled,
      energy: this.energy * f.finalEnergy,
      hazard: this.hazardTime * f.hazardPenalty,
    };
  }

  sense(ecology) {
    const { foodSensorRange, hazardSensorRange } = this.config.worm;
    const foodSensors = new Array(FOOD_RAYS).fill(0);
    const hazardSensors = new Array(HAZARD_RAYS).fill(0);
    const rangeSq = foodSensorRange * foodSensorRange;

    for (const food of ecology.foods) {
      if (!food.active) continue;
      const dx = food.x - this.x;
      const dy = food.y - this.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > rangeSq) continue;
      const distance = Math.sqrt(distSq) || 1;
      const closeness = 1 - distance / foodSensorRange;
      const nx = dx / distance;
      const ny = dy / distance;

      for (let index = 0; index < FOOD_RAYS; index += 1) {
        const direction = this.heading + index * (Math.PI / 4);
        const alignment = nx * Math.cos(direction) + ny * Math.sin(direction);
        if (alignment <= 0.04) continue;
        foodSensors[index] += alignment ** 3 * closeness ** 1.7;
      }
    }

    for (let index = 0; index < FOOD_RAYS; index += 1) {
      foodSensors[index] = clamp(foodSensors[index], 0, 1);
    }

    for (const hazard of ecology.hazards) {
      const dx = hazard.x - this.x;
      const dy = hazard.y - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const edgeDistance = distance - hazard.radius;
      if (edgeDistance > hazardSensorRange) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      const closeness =
        edgeDistance <= 0 ? 1 : clamp(1 - edgeDistance / hazardSensorRange, 0, 1);

      for (let index = 0; index < HAZARD_RAYS; index += 1) {
        const direction = this.heading + HAZARD_OFFSETS[index];
        const alignment = nx * Math.cos(direction) + ny * Math.sin(direction);
        const directional = edgeDistance <= 0 ? 0.78 + 0.22 * Math.max(0, alignment) : Math.max(0, alignment) ** 2;
        hazardSensors[index] += directional * closeness * closeness;
      }
    }

    for (let index = 0; index < HAZARD_RAYS; index += 1) {
      hazardSensors[index] = clamp(hazardSensors[index], 0, 1);
    }

    this.sensorValues = [
      ...foodSensors,
      ...hazardSensors,
      clamp(this.energy / this.maxEnergy, 0, 1),
      1,
    ];
    return this.sensorValues;
  }

  think() {
    const result = forwardSubstrate(this.substrate, this.sensorValues);
    this.outputs = { turn: result.turn, thrust: result.thrust };
    this.activations = { hidden: result.hidden, outputs: result.outputs };
    return this.outputs;
  }

  step(dt, ecology) {
    if (!this.alive) return null;

    this.age += dt;

    const steeringTarget = this.outputs.turn;
    const throttleTarget = this.outputs.thrust;
    const turnLerp = 1 - Math.exp(-7.5 * dt);
    const thrustLerp = 1 - Math.exp(-4.5 * dt);
    this.steering = lerp(this.steering, steeringTarget, turnLerp);
    this.throttle = lerp(this.throttle, throttleTarget, thrustLerp);
    this.angularVelocity = this.steering * this.config.worm.turnRate;
    this.heading = wrapAngle(this.heading + this.angularVelocity * dt);

    const vigor = 0.62 + 0.38 * clamp(this.energy / this.maxEnergy, 0, 1);
    const targetSpeed =
      this.config.worm.minSpeed +
      (this.config.worm.maxSpeed - this.config.worm.minSpeed) * this.throttle;
    this.speed = lerp(this.speed, targetSpeed * vigor, 1 - Math.exp(-5 * dt));

    const previousX = this.x;
    const previousY = this.y;
    this.x += Math.cos(this.heading) * this.speed * dt;
    this.y += Math.sin(this.heading) * this.speed * dt;
    this.distanceTravelled += Math.hypot(this.x - previousX, this.y - previousY);

    const margin = 26;
    let wallHit = false;
    if (this.x < margin) {
      this.x = margin;
      wallHit = true;
    } else if (this.x > WORLD.width - margin) {
      this.x = WORLD.width - margin;
      wallHit = true;
    }
    if (this.y < margin) {
      this.y = margin;
      wallHit = true;
    } else if (this.y > WORLD.height - margin) {
      this.y = WORLD.height - margin;
      wallHit = true;
    }

    if (wallHit) {
      this.wallHits += 1;
      this.speed *= 0.5;
      this.throttle *= 0.6;
      this.heading = Math.atan2(
        WORLD.height * 0.5 + (this.y % 9) - this.y,
        WORLD.width * 0.5 + (this.x % 11) - this.x,
      );
    }

    const eaten = ecology.consumeFoodAt(
      this.x,
      this.y,
      this.config.worm.headRadius + 2,
    );
    let foodEvent = null;
    if (eaten) {
      this.foodEaten += 1;
      this.foodEnergy += this.config.food.energy;
      this.energy = Math.min(this.maxEnergy, this.energy + this.config.food.energy);
      this.ateRecently = 1;
      foodEvent = { x: eaten.x, y: eaten.y };
    }

    const hazardIntensity = ecology.hazardIntensity(this.x, this.y);
    let damage = 0;
    if (hazardIntensity > 0) {
      damage = hazardIntensity * this.config.hazards.damagePerSecond * dt;
      this.energy -= damage;
      this.hazardTime += hazardIntensity * dt;
    }

    const drain =
      (this.config.worm.baseDrain + this.speed * this.config.worm.speedDrain) * dt;
    this.energy -= drain;
    this.ateRecently = Math.max(0, this.ateRecently - dt * 0.55);

    let died = false;
    if (this.energy <= 0) {
      this.energy = 0;
      this.alive = false;
      this.deathCause = hazardIntensity > 0 ? 'toxicosis' : 'starvation';
      died = true;
    }

    this.updateBody(dt);
    this.trailClock += dt;
    if (this.trailClock > 0.09) {
      this.trailClock = 0;
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 120) this.trail.shift();
    }

    return {
      wormId: this.id,
      food: foodEvent,
      died,
      deathCause: this.deathCause,
      hazard: hazardIntensity > 0,
      hazardIntensity,
      wallHit,
    };
  }

  updateBody(dt) {
    const { segments, spacing } = this.config.worm;
    this.bodyClock += dt;
    this.body[0].x = this.x;
    this.body[0].y = this.y;

    for (let index = 1; index < segments; index += 1) {
      const previous = this.body[index - 1];
      const current = this.body[index];
      let dx = previous.x - current.x;
      let dy = previous.y - current.y;
      const distance = Math.hypot(dx, dy);

      if (distance < 0.0001) {
        dx = -Math.cos(this.heading);
        dy = -Math.sin(this.heading);
      } else {
        dx /= distance;
        dy /= distance;
      }

      const follow = 1 - Math.exp(-this.config.worm.bodyFriction * dt);
      current.x = lerp(current.x, previous.x - dx * spacing, follow);
      current.y = lerp(current.y, previous.y - dy * spacing, follow);

      dx = previous.x - current.x;
      dy = previous.y - current.y;
      const clampedDistance = Math.hypot(dx, dy);
      if (clampedDistance > spacing && clampedDistance > 0.0001) {
        current.x = previous.x - (dx / clampedDistance) * spacing;
        current.y = previous.y - (dy / clampedDistance) * spacing;
      }
    }
  }
}

export { STEP };

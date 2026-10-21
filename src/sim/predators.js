import { WORLD } from '../config.js';
import { clamp, distanceSq, lerp, mulberry32 } from './random.js';

const TWO_PI = Math.PI * 2;
const DEFAULT_SETTINGS = Object.freeze({
  count: 3,
  radius: 16,
  speed: 78,
  lungeSpeed: 126,
  turnRate: 2.35,
  senseRange: 270,
  chompRange: 24,
  damage: 18,
  cooldown: 2.2,
  chompDuration: 0.42,
  spawnClearance: 190,
  margin: 46,
});

function wrapAngle(angle) {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= TWO_PI;
  while (wrapped < -Math.PI) wrapped += TWO_PI;
  return wrapped;
}

export class ChomperPack {
  constructor(seed, config, ecology) {
    this.config = config;
    this.settings = { ...DEFAULT_SETTINGS, ...(config.predators ?? {}) };
    this.ecology = ecology;
    this.rng = mulberry32((seed ^ 0x51ed270b) >>> 0);
    this.chompers = [];
    for (let index = 0; index < this.settings.count; index += 1) {
      this.chompers.push(this.makeChomper(index));
    }
  }

  findSpawn(index) {
    const { radius, spawnClearance, count } = this.settings;
    const sector = (index / Math.max(1, count)) * TWO_PI;
    let best = null;
    let bestClearance = -Infinity;

    for (let attempt = 0; attempt < 220; attempt += 1) {
      const angle =
        sector + (this.rng() - 0.5) * (TWO_PI / Math.max(1, count)) * 0.84;
      const x =
        WORLD.width * 0.5 + Math.cos(angle) * WORLD.width * (0.24 + this.rng() * 0.2);
      const y =
        WORLD.height * 0.5 + Math.sin(angle) * WORLD.height * (0.22 + this.rng() * 0.2);
      if (this.ecology.isInsideHazard(x, y, radius + 44)) continue;
      if (
        this.chompers.some(
          (chomper) => distanceSq(x, y, chomper.x, chomper.y) < 150 * 150,
        )
      ) {
        continue;
      }

      let nearestSpawn = Infinity;
      for (const spawn of this.ecology.spawnPoints) {
        nearestSpawn = Math.min(
          nearestSpawn,
          Math.sqrt(distanceSq(x, y, spawn.x, spawn.y)),
        );
      }
      if (nearestSpawn > bestClearance) {
        bestClearance = nearestSpawn;
        best = { x, y };
      }
      if (nearestSpawn < spawnClearance) continue;
      if (
        this.ecology.foods.some(
          (food) => distanceSq(x, y, food.x, food.y) < (radius + 38) * (radius + 38),
        )
      ) {
        continue;
      }
      return { x, y };
    }

    if (best) return best;
    return {
      x: WORLD.width * 0.5 + Math.cos(sector) * WORLD.width * 0.34,
      y: WORLD.height * 0.5 + Math.sin(sector) * WORLD.height * 0.32,
    };
  }

  makeChomper(index) {
    const settings = this.settings;
    const spawn = this.findSpawn(index);
    const heading = Math.atan2(
      WORLD.height * 0.5 - spawn.y,
      WORLD.width * 0.5 - spawn.x,
    ) + (this.rng() - 0.5) * 0.8;
    return {
      id: `chomper-${index}`,
      x: spawn.x,
      y: spawn.y,
      heading,
      radius: settings.radius,
      speed: settings.speed * 0.45,
      cruiseSpeed: settings.speed * (0.42 + this.rng() * 0.16),
      chaseSpeed: settings.speed * (0.92 + this.rng() * 0.16),
      lungeSpeed: settings.lungeSpeed * (0.92 + this.rng() * 0.16),
      turnRate: settings.turnRate * (0.88 + this.rng() * 0.24),
      phase: this.rng() * TWO_PI,
      wanderAngle: heading,
      wanderTimer: 1.4 + this.rng() * 2.4,
      targetId: null,
      targetX: spawn.x + Math.cos(heading) * 50,
      targetY: spawn.y + Math.sin(heading) * 50,
      excitement: 0,
      mouthOpen: 0,
      chompTimer: 0,
      cooldown: 0.4 + this.rng() * 1.2,
      digestTimer: 0,
      bites: 0,
    };
  }

  update(dt, agents, elapsed) {
    const settings = this.settings;
    const bites = [];

    for (const chomper of this.chompers) {
      chomper.chompTimer = Math.max(0, chomper.chompTimer - dt);
      chomper.cooldown = Math.max(0, chomper.cooldown - dt);
      chomper.digestTimer = Math.max(0, chomper.digestTimer - dt);

      let target = null;
      let targetDistance = Infinity;
      for (const agent of agents) {
        const worm = agent.worm;
        if (!worm.alive) continue;
        const distance = Math.sqrt(
          distanceSq(chomper.x, chomper.y, worm.x, worm.y),
        );
        if (distance > settings.senseRange || distance >= targetDistance) continue;
        target = agent;
        targetDistance = distance;
      }

      let desiredHeading = chomper.wanderAngle;
      let targetSpeed = chomper.cruiseSpeed;
      let mouthTarget = 0;

      if (target) {
        const worm = target.worm;
        desiredHeading = Math.atan2(worm.y - chomper.y, worm.x - chomper.x);
        targetSpeed =
          targetDistance < settings.senseRange * 0.42
            ? chomper.lungeSpeed
            : chomper.chaseSpeed;
        mouthTarget = clamp(
          1 - targetDistance / (settings.senseRange * 0.46),
          0,
          1,
        );
        chomper.targetId = target.id;
      } else {
        chomper.targetId = null;
        chomper.wanderTimer -= dt;
        if (chomper.wanderTimer <= 0) {
          chomper.wanderAngle = wrapAngle(
            chomper.heading + (this.rng() - 0.5) * 2.3,
          );
          chomper.wanderTimer = 1.8 + this.rng() * 2.8;
        }
        desiredHeading =
          chomper.wanderAngle + Math.sin(elapsed * 0.72 + chomper.phase) * 0.34;
      }

      if (chomper.digestTimer > 0) {
        desiredHeading = wrapAngle(chomper.heading + Math.PI);
        targetSpeed = chomper.cruiseSpeed * 0.8;
        mouthTarget = 0.3;
      }

      const turn = clamp(
        wrapAngle(desiredHeading - chomper.heading),
        -chomper.turnRate * dt,
        chomper.turnRate * dt,
      );
      chomper.heading = wrapAngle(chomper.heading + turn);
      chomper.speed = lerp(
        chomper.speed,
        targetSpeed,
        1 - Math.exp(-4.2 * dt),
      );
      chomper.x += Math.cos(chomper.heading) * chomper.speed * dt;
      chomper.y += Math.sin(chomper.heading) * chomper.speed * dt;

      const margin = settings.margin;
      if (chomper.x < margin) {
        chomper.x = margin;
        chomper.heading = Math.PI - chomper.heading;
        chomper.speed *= 0.55;
      } else if (chomper.x > WORLD.width - margin) {
        chomper.x = WORLD.width - margin;
        chomper.heading = Math.PI - chomper.heading;
        chomper.speed *= 0.55;
      }
      if (chomper.y < margin) {
        chomper.y = margin;
        chomper.heading = -chomper.heading;
        chomper.speed *= 0.55;
      } else if (chomper.y > WORLD.height - margin) {
        chomper.y = WORLD.height - margin;
        chomper.heading = -chomper.heading;
        chomper.speed *= 0.55;
      }
      chomper.heading = wrapAngle(chomper.heading);

      if (target && target.worm.alive) {
        targetDistance = Math.sqrt(
          distanceSq(chomper.x, chomper.y, target.worm.x, target.worm.y),
        );
        chomper.targetX = target.worm.x;
        chomper.targetY = target.worm.y;
        chomper.excitement = clamp(
          1 - targetDistance / settings.senseRange,
          0,
          1,
        );
        mouthTarget = Math.max(
          mouthTarget,
          clamp(1 - targetDistance / (settings.senseRange * 0.46), 0, 1),
        );

        const contactRange =
          settings.chompRange + target.worm.collisionRadii[0];
        if (
          targetDistance <= contactRange &&
          chomper.cooldown <= 0 &&
          chomper.digestTimer <= 0
        ) {
          const died = target.worm.bite(settings.damage);
          chomper.bites += 1;
          chomper.chompTimer = settings.chompDuration;
          chomper.cooldown = settings.cooldown;
          chomper.digestTimer = 0.62;
          chomper.mouthOpen = 1;
          chomper.x -= Math.cos(chomper.heading) * 7;
          chomper.y -= Math.sin(chomper.heading) * 7;
          bites.push({
            chomperId: chomper.id,
            x: target.worm.x,
            y: target.worm.y,
            color: target.worm.color,
            died,
          });
        }
      } else {
        chomper.targetX = chomper.x + Math.cos(chomper.heading) * 40;
        chomper.targetY = chomper.y + Math.sin(chomper.heading) * 40;
        chomper.excitement = Math.max(0, chomper.excitement - dt * 2.4);
      }

      chomper.mouthOpen = lerp(
        chomper.mouthOpen,
        mouthTarget,
        1 - Math.exp(-9 * dt),
      );
    }

    return bites;
  }
}

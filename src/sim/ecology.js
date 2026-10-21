import { CONFIG, WORLD } from '../config.js';
import { distanceSq, mulberry32 } from './random.js';

function randomPoint(rng, margin = 92) {
  return {
    x: margin + rng() * (WORLD.width - margin * 2),
    y: margin + rng() * (WORLD.height - margin * 2),
  };
}

export class Ecology {
  constructor(seed, config = CONFIG) {
    this.seed = seed;
    this.config = config;
    this.rng = mulberry32(seed);
    this.time = 0;
    this.foodSerial = 0;
    this.hazards = [];
    this.foods = [];
    this.spawnPoints = [];
    this.hazardField = [];

    this.createSpawnPoints(config.populationSize);
    this.createHazards();
    this.createInitialFood();
  }

  createHazards() {
    const { count, minRadius, maxRadius } = this.config.hazards;
    for (let index = 0; index < count; index += 1) {
      let candidate = null;

      for (let attempt = 0; attempt < 90; attempt += 1) {
        const point = randomPoint(this.rng, 128);
        const radius = minRadius + this.rng() * (maxRadius - minRadius);
        const clear = this.hazards.every((hazard) => {
          const minDistance = hazard.radius + radius + 96;
          return distanceSq(point.x, point.y, hazard.x, hazard.y) > minDistance * minDistance;
        });
        const clearOfSpawns = this.spawnPoints.every(
          (spawn) =>
            distanceSq(point.x, point.y, spawn.x, spawn.y) >
            (radius + 64) * (radius + 64),
        );
        if (clear && clearOfSpawns) {
          candidate = {
            id: `hazard-${index}`,
            x: point.x,
            y: point.y,
            radius,
            phase: this.rng() * Math.PI * 2,
            spin: (this.rng() - 0.5) * 0.18,
          };
          break;
        }
      }

      if (!candidate) {
        let point = randomPoint(this.rng, 120);
        for (let attempt = 0; attempt < 200; attempt += 1) {
          const clearOfSpawns = this.spawnPoints.every(
            (spawn) =>
              distanceSq(point.x, point.y, spawn.x, spawn.y) > 160 * 160,
          );
          if (clearOfSpawns) break;
          point = randomPoint(this.rng, 120);
        }
        candidate = {
          id: `hazard-${index}`,
          x: point.x,
          y: point.y,
          radius: minRadius + this.rng() * (maxRadius - minRadius),
          phase: this.rng() * Math.PI * 2,
          spin: 0,
        };
      }

      this.hazards.push(candidate);
    }
  }

  createSpawnPoints(count) {
    const { minSpacing, candidates, margin } = this.config.spawn;
    const points = [];

    for (let index = 0; index < count; index += 1) {
      let best = null;
      let bestClearance = -Infinity;

      for (let attempt = 0; attempt < candidates; attempt += 1) {
        const point = randomPoint(this.rng, margin);
        if (this.isInsideHazard(point.x, point.y, 46)) continue;

        let nearest = Infinity;
        for (const existing of points) {
          nearest = Math.min(nearest, Math.hypot(existing.x - point.x, existing.y - point.y));
        }
        if (nearest > bestClearance) {
          bestClearance = nearest;
          best = point;
        }
      }

      if (!best) {
        const angle = (index / count) * Math.PI * 2;
        best = {
          x: WORLD.width * 0.5 + Math.cos(angle) * WORLD.width * 0.33,
          y: WORLD.height * 0.5 + Math.sin(angle) * WORLD.height * 0.33,
        };
        bestClearance = Infinity;
      }

      points.push(best);
    }

    this.spawnPoints = points;
  }

  relocateSpawnPointsAwayFrom(chompers) {
    const { chomperClearance, margin } = this.config.spawn;
    const points = [];

    for (const spawn of this.spawnPoints) {
      let point = spawn;
      for (let attempt = 0; attempt < 240; attempt += 1) {
        const nearChomper = chompers.some(
          (chomper) =>
            distanceSq(point.x, point.y, chomper.x, chomper.y) <
            (chomper.radius + chomperClearance) * (chomper.radius + chomperClearance),
        );
        if (!nearChomper && !this.isInsideHazard(point.x, point.y, 46)) break;
        point = randomPoint(this.rng, margin);
      }
      points.push(point);
    }

    this.spawnPoints = points;
    this.separateFoodFromSpawns();
  }

  separateFoodFromSpawns() {
    const margin = 64;
    for (const food of this.foods) {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const clear = this.spawnPoints.every(
          (spawn) => distanceSq(food.x, food.y, spawn.x, spawn.y) > 72 * 72,
        );
        if (clear) break;
        const position = this.findFoodPosition();
        food.x = position.x;
        food.y = position.y;
      }
    }
  }

  createInitialFood() {
    for (let index = 0; index < this.config.food.count; index += 1) {
      const position = this.findFoodPosition();
      this.foods.push(this.makeFood(position));
    }
  }

  makeFood(position) {
    const food = {
      id: this.foodSerial,
      x: position.x,
      y: position.y,
      radius: this.config.food.radius,
      active: true,
      respawnTimer: 0,
      phase: this.rng() * Math.PI * 2,
    };
    this.foodSerial += 1;
    return food;
  }

  findFoodPosition() {
    const margin = 64;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const position = randomPoint(this.rng, margin);
      const clearOfHazards = !this.isInsideHazard(
        position.x,
        position.y,
        this.config.food.minHazardDistance,
      );
      if (!clearOfHazards) continue;

      const clearOfFood = this.foods.every(
        (food) => distanceSq(food.x, food.y, position.x, position.y) > 54 * 54,
      );
      if (!clearOfFood) continue;

      const clearOfSpawns = this.spawnPoints.every(
        (spawn) => distanceSq(spawn.x, spawn.y, position.x, position.y) > 72 * 72,
      );
      if (!clearOfSpawns) continue;

      return position;
    }

    return randomPoint(this.rng, 80);
  }

  isInsideHazard(x, y, padding = 0) {
    return this.hazards.some((hazard) => {
      const radius = hazard.radius + padding;
      return distanceSq(x, y, hazard.x, hazard.y) < radius * radius;
    });
  }

  hazardIntensity(x, y) {
    let strongest = 0;
    for (const hazard of this.hazards) {
      const distance = Math.sqrt(distanceSq(x, y, hazard.x, hazard.y));
      if (distance < hazard.radius) {
        const intensity = 1 - (distance / hazard.radius) * 0.32;
        strongest = Math.max(strongest, intensity);
      }
    }
    return strongest;
  }

  update(dt) {
    this.time += dt;
    for (const food of this.foods) {
      if (food.active) continue;
      food.respawnTimer -= dt;
      if (food.respawnTimer <= 0) {
        const position = this.findFoodPosition();
        food.x = position.x;
        food.y = position.y;
        food.active = true;
        food.phase = this.rng() * Math.PI * 2;
      }
    }
  }

  activeFoodCount() {
    return this.foods.reduce((total, food) => total + (food.active ? 1 : 0), 0);
  }

  consumeFoodAt(x, y, reach) {
    let closest = null;
    let closestDistance = Infinity;

    for (const food of this.foods) {
      if (!food.active) continue;
      const distance = distanceSq(x, y, food.x, food.y);
      const radius = reach + food.radius;
      if (distance <= radius * radius && distance < closestDistance) {
        closest = food;
        closestDistance = distance;
      }
    }

    if (!closest) return null;
    closest.active = false;
    closest.respawnTimer = this.config.food.respawnSeconds;
    return closest;
  }
}

import { CONFIG, WORM_PALETTE, WORLD } from './config.js';
import {
  createInitialCPPN,
  crossoverCPPN,
  mutateCPPN,
} from './neat/cppn.js';
import { buildSubstrate } from './neat/hyperneat.js';
import { Ecology } from './sim/ecology.js';
import { clamp, mulberry32 } from './sim/random.js';
import { Worm } from './sim/worm.js';

const ENVIRONMENT_SEED_STEP = 7919;

export class Evolution {
  constructor(config = CONFIG) {
    this.config = config;
    this.reset();
  }

  reset() {
    this.generation = 1;
    this.phase = 'ready';
    this.elapsed = 0;
    this.events = [];
    this.history = [];
    this.ranking = [];
    this.champion = null;
    this.lastSummary = null;
    this.bestEver = 0;
    this.seedRng = mulberry32(this.config.seed);
    this.populationRng = mulberry32(this.config.seed ^ 0x9e3779b9);
    const genomes = Array.from({ length: this.config.populationSize }, () =>
      createInitialCPPN(this.populationRng),
    );
    this.spawnGeneration(genomes);
  }

  spawnGeneration(genomes) {
    this.elapsed = 0;
    this.events = [];
    const seed = this.config.seed + (this.generation - 1) * ENVIRONMENT_SEED_STEP;
    this.ecology = new Ecology(seed, this.config);
    this.agents = genomes.map((genome, index) => {
      const spawn = this.ecology.spawnPoints[index];
      const heading =
        Math.atan2(WORLD.height * 0.5 - spawn.y, WORLD.width * 0.5 - spawn.x) +
        (this.populationRng() - 0.5) * 0.9;
      const substrate = buildSubstrate(genome);
      const worm = new Worm({
        id: `${this.generation}-${index}`,
        index,
        color: WORM_PALETTE[index % WORM_PALETTE.length],
        x: spawn.x,
        y: spawn.y,
        heading,
        substrate,
        config: this.config,
      });
      return {
        id: `${this.generation}-${index}`,
        index,
        color: worm.color,
        genome,
        substrate,
        worm,
      };
    });
    this.ranking = [...this.agents];
    this.timeAlive = this.agents.length;
  }

  start() {
    if (this.phase === 'ready' || this.phase === 'paused') {
      this.phase = 'running';
    }
  }

  pause() {
    if (this.phase === 'running') this.phase = 'paused';
  }

  step(dt) {
    if (this.phase !== 'running') return;

    this.ecology.update(dt);
    this.elapsed += dt;

    let alive = 0;
    for (const agent of this.agents) {
      const worm = agent.worm;
      if (!worm.alive) continue;
      alive += 1;
      worm.sense(this.ecology);
      worm.think();
      const result = worm.step(dt, this.ecology);
      if (result?.food) {
        this.events.push({
          type: 'eat',
          x: result.food.x,
          y: result.food.y,
          color: worm.color,
        });
      }
      if (result?.died) {
        this.events.push({
          type: 'death',
          x: worm.x,
          y: worm.y,
          color: worm.color,
          cause: result.deathCause,
        });
      }
      if (result?.hazard && Math.floor(this.elapsed * 60) % 14 === 0) {
        this.events.push({
          type: 'hazard',
          x: worm.x,
          y: worm.y,
          color: '#ff5f8f',
        });
      }
    }

    this.ranking = [...this.agents].sort(
      (a, b) => b.worm.fitness - a.worm.fitness || a.index - b.index,
    );
    this.timeAlive = alive;

    if (this.elapsed >= this.config.episodeSeconds || alive === 0) {
      this.completeGeneration();
    }
  }

  completeGeneration() {
    this.elapsed = Math.min(this.elapsed, this.config.episodeSeconds);
    this.phase = 'intermission';
    this.ranking = [...this.agents].sort(
      (a, b) => b.worm.fitness - a.worm.fitness || a.index - b.index,
    );
    this.champion = this.ranking[0];
    this.bestEver = Math.max(this.bestEver, this.champion.worm.fitness);

    const average =
      this.ranking.reduce((total, agent) => total + agent.worm.fitness, 0) /
      this.ranking.length;
    const best = this.champion.worm.fitness;
    const record = {
      generation: this.generation,
      best,
      average,
      foodEaten: this.champion.worm.foodEaten,
      timeAlive: this.champion.worm.age,
      color: this.champion.color,
    };
    this.history.push(record);
    this.lastSummary = record;
    this.events.push({
      type: 'generation',
      x: WORLD.width * 0.5,
      y: WORLD.height * 0.5,
      color: this.champion.color,
    });
  }

  nextGeneration() {
    if (this.phase !== 'intermission') return;

    const previous = this.ranking;
    const genomes = [];
    const eliteCount = Math.min(this.config.eliteCount, previous.length);

    for (let index = 0; index < eliteCount; index += 1) {
      genomes.push(this.cloneGenome(previous[index].genome));
    }

    while (genomes.length < this.config.populationSize) {
      const fitter = this.tournament(previous);
      let genome = this.cloneGenome(fitter.genome);

      if (this.populationRng() < this.config.crossoverRate) {
        let mate = this.tournament(previous);
        if (mate === fitter) mate = previous[Math.floor(this.populationRng() * previous.length)];
        if (mate !== fitter) {
          const primary = fitter.worm.fitness >= mate.worm.fitness ? fitter : mate;
          const secondary = primary === fitter ? mate : fitter;
          genome = crossoverCPPN(primary.genome, secondary.genome, this.populationRng);
        }
      }

      genomes.push(mutateCPPN(genome, this.populationRng));
    }

    this.generation += 1;
    this.spawnGeneration(genomes);
    this.phase = 'running';
  }

  tournament(candidates) {
    let winner = candidates[Math.floor(this.populationRng() * candidates.length)];
    for (let index = 1; index < this.config.tournamentSize; index += 1) {
      const contender = candidates[Math.floor(this.populationRng() * candidates.length)];
      if (contender.worm.fitness > winner.worm.fitness) winner = contender;
    }
    return winner;
  }

  cloneGenome(genome) {
    return {
      nodes: genome.nodes.map((node) => ({ ...node })),
      connections: genome.connections.map((connection) => ({ ...connection })),
    };
  }

  get timeLeft() {
    return clamp(this.config.episodeSeconds - this.elapsed, 0, this.config.episodeSeconds);
  }

  get leader() {
    if (this.phase === 'intermission' && this.champion) return this.champion;
    let leader = null;
    for (const agent of this.agents) {
      if (!agent.worm.alive) continue;
      if (!leader || agent.worm.fitness > leader.worm.fitness) leader = agent;
    }
    return leader ?? this.ranking[0] ?? this.agents[0];
  }

  get aliveCount() {
    return this.agents.reduce((total, agent) => total + (agent.worm.alive ? 1 : 0), 0);
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
}

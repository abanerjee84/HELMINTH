import '@fontsource-variable/sora';
import '@fontsource-variable/jetbrains-mono';
import './style.css';

import { CONFIG, STEP } from './config.js';
import { Evolution } from './evolution.js';
import { ArenaRenderer } from './render/arena.js';
import { Dashboard } from './ui/dashboard.js';

const host = document.getElementById('arenaHost');
const dashboard = new Dashboard();
const renderer = new ArenaRenderer(host);

let evolution = new Evolution(CONFIG);
let running = false;
let speed = 4;
let accumulator = 0;
let intermissionTimer = 0;
let lastFrame = performance.now();
let fps = 60;

const state = () => ({ running, speed, fps });

function toggleRunning() {
  if (running) {
    running = false;
    evolution.pause();
  } else {
    running = true;
    if (evolution.phase === 'ready' || evolution.phase === 'paused') {
      evolution.start();
    }
  }
  dashboard.update(evolution, state(), performance.now());
}

function resetRun() {
  evolution = new Evolution(CONFIG);
  running = false;
  accumulator = 0;
  intermissionTimer = 0;
  dashboard.resetState();
  renderer.populationSource = null;
  renderer.ecologySource = null;
  renderer.predatorSource = null;
  dashboard.update(evolution, state(), performance.now());
}

function setSpeed(value) {
  speed = value;
  dashboard.setSpeed(value);
}

dashboard.bindSpeed(setSpeed);
dashboard.bindActions({ onStart: toggleRunning, onReset: resetRun });
dashboard.setSpeed(speed);

function simulate(realDelta) {
  if (!running) {
    accumulator = 0;
    return;
  }

  if (evolution.phase === 'intermission') {
    intermissionTimer -= realDelta;
    if (intermissionTimer <= 0) {
      evolution.nextGeneration();
      intermissionTimer = 0;
      accumulator = 0;
    }
    return;
  }

  if (evolution.phase === 'paused') {
    return;
  }

  accumulator += realDelta * speed;
  const maxSteps = 40;
  let steps = 0;
  while (accumulator >= STEP && steps < maxSteps) {
    evolution.step(STEP);
    accumulator -= STEP;
    steps += 1;
    if (evolution.phase === 'intermission') {
      intermissionTimer = 1.8;
      accumulator = 0;
      break;
    }
  }
  if (steps >= maxSteps) accumulator = 0;
}

function animate(now) {
  requestAnimationFrame(animate);
  const rawDelta = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (rawDelta > 0) fps = fps * 0.92 + (1 / rawDelta) * 0.08;

  simulate(rawDelta);

  const events = evolution.drainEvents();
  if (events.length) renderer.ingest(events);
  renderer.update(rawDelta, evolution);
  dashboard.update(evolution, state(), now);
}

window.__HELMINTH__ = {
  getEvolution: () => evolution,
  getState: () => ({
    ...state(),
    phase: evolution.phase,
    generation: evolution.generation,
    elapsed: evolution.elapsed,
    alive: evolution.aliveCount,
    chompers: evolution.predators?.chompers.length ?? 0,
    history: evolution.history,
    maxGenerationSeconds: CONFIG.maxGenerationSeconds,
  }),
  getRenderer: () => renderer,
  setSpeed,
};

dashboard.update(evolution, state(), performance.now());
renderer.update(0.016, evolution);
requestAnimationFrame(animate);
window.__HELMINTH_READY__ = true;

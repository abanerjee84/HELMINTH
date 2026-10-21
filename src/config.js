export const WORLD = Object.freeze({
  width: 1360,
  height: 1240,
  margin: 42,
});

export const STEP = 1 / 60;

export const CONFIG = Object.freeze({
  seed: 4217,
  populationSize: 28,
  episodeSeconds: 36,
  eliteCount: 3,
  tournamentSize: 4,
  crossoverRate: 0.72,
  food: {
    count: 40,
    energy: 24,
    radius: 11,
    respawnSeconds: 3.8,
    minHazardDistance: 62,
  },
  hazards: {
    count: 6,
    minRadius: 58,
    maxRadius: 104,
    damagePerSecond: 27,
  },
  worm: {
    segments: 15,
    spacing: 7.4,
    headRadius: 11,
    maxSpeed: 170,
    minSpeed: 32,
    turnRate: 2.65,
    startEnergy: 58,
    maxEnergy: 100,
    baseDrain: 1.15,
    speedDrain: 0.0045,
    foodSensorRange: 330,
    hazardSensorRange: 260,
    bodyFriction: 18,
    collision: {
      scale: 0.82,
      selfGuardSegments: 5,
      response: 0.22,
      impactSpeedLoss: 0.58,
      cooldown: 0.35,
    },
  },
  fitness: {
    perFood: 180,
    perSecond: 6,
    perUnitTravelled: 0.018,
    finalEnergy: 0.35,
    hazardPenalty: 3.5,
  },
});

export const SENSOR_COUNT = 8 + 4 + 2;

export const WORM_PALETTE = [
  '#b9ff6a',
  '#67f0cf',
  '#6bc8ff',
  '#ffd56a',
  '#ff9b71',
  '#ff7fae',
  '#b7a5ff',
  '#8bffa6',
  '#79e7ff',
  '#e8ff7c',
  '#ffb8d9',
  '#9fe1ff',
  '#d5c1ff',
  '#ffcb91',
  '#78f6b2',
  '#a8d8ff',
  '#f9e58a',
  '#ffa7c3',
  '#92ffe0',
  '#c9b2ff',
  '#d7ff8a',
  '#ffd0a3',
  '#8fe9ca',
  '#ffc8f0',
  '#aef1ff',
  '#e3d6ff',
  '#ffefad',
  '#9dffcf',
];

export const UI_COLORS = Object.freeze({
  acid: '#c8ff6d',
  aqua: '#69efd1',
  amber: '#ffc96b',
  rose: '#ff6e9b',
  ink: '#06110e',
});

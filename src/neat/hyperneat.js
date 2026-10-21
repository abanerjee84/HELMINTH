import { clamp } from '../sim/random.js';
import { compileCPPN, cppnStats } from './cppn.js';

const FOOD_LABELS = ['F', 'FL', 'L', 'BL', 'B', 'BR', 'R', 'FR'];
const HAZARD_LABELS = ['H·F', 'H·L', 'H·B', 'H·R'];

function ringPosition(angle, radius) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function createInputLayout() {
  const inputs = [];

  for (let index = 0; index < 8; index += 1) {
    const angle = Math.PI / 2 + index * (Math.PI / 4);
    inputs.push({
      kind: 'food',
      index,
      label: FOOD_LABELS[index],
      ...ringPosition(angle, 0.9),
    });
  }

  for (let index = 0; index < 4; index += 1) {
    const angle = Math.PI / 2 + index * (Math.PI / 2);
    inputs.push({
      kind: 'hazard',
      index,
      label: HAZARD_LABELS[index],
      ...ringPosition(angle, 0.56),
    });
  }

  inputs.push({ kind: 'energy', index: 0, label: 'E', x: 0, y: 0.21 });
  inputs.push({ kind: 'bias', index: 0, label: 'B', x: 0, y: -0.17 });
  return inputs;
}

const INPUT_LAYOUT = createInputLayout();

const HIDDEN_LAYOUT = Array.from({ length: 8 }, (_, index) => {
  const angle = Math.PI / 2 + index * (Math.PI / 4);
  return {
    index,
    label: `${index + 1}`,
    ...ringPosition(angle, 0.33),
  };
});

const OUTPUT_LAYOUT = [
  { key: 'turn', label: 'TURN', x: -0.24, y: -1.1 },
  { key: 'thrust', label: 'THRUST', x: 0.24, y: -1.1 },
];

export const SUBSTRATE_LAYOUT = Object.freeze({
  inputs: INPUT_LAYOUT,
  hidden: HIDDEN_LAYOUT,
  outputs: OUTPUT_LAYOUT,
});

const CPPN_WEIGHT_SCALE = 2.35;
const MIN_WEIGHT = 0.025;

function cppnWeight(query, source, target) {
  const dx = source.x - target.x;
  const dy = source.y - target.y;
  const distance = Math.sqrt(dx * dx + dy * dy) / 2.4;
  const value = query([source.x, source.y, target.x, target.y, distance, 1]);
  if (!Number.isFinite(value)) return 0;
  const weight = value * CPPN_WEIGHT_SCALE;
  return Math.abs(weight) < MIN_WEIGHT ? 0 : weight;
}

export function buildSubstrate(genome) {
  const query = compileCPPN(genome);
  const connections = [];

  const inputToHidden = Array.from({ length: INPUT_LAYOUT.length }, () =>
    new Array(HIDDEN_LAYOUT.length).fill(0),
  );
  const inputToOutput = Array.from({ length: INPUT_LAYOUT.length }, () =>
    new Array(OUTPUT_LAYOUT.length).fill(0),
  );
  const hiddenToOutput = Array.from({ length: HIDDEN_LAYOUT.length }, () =>
    new Array(OUTPUT_LAYOUT.length).fill(0),
  );

  INPUT_LAYOUT.forEach((source, inputIndex) => {
    HIDDEN_LAYOUT.forEach((target, hiddenIndex) => {
      const weight = cppnWeight(query, source, target);
      if (weight === 0) return;
      inputToHidden[inputIndex][hiddenIndex] = weight;
      connections.push({
        fromKind: 'input',
        from: inputIndex,
        toKind: 'hidden',
        to: hiddenIndex,
        weight,
      });
    });

    OUTPUT_LAYOUT.forEach((target, outputIndex) => {
      const weight = cppnWeight(query, source, target);
      if (weight === 0) return;
      inputToOutput[inputIndex][outputIndex] = weight;
      connections.push({
        fromKind: 'input',
        from: inputIndex,
        toKind: 'output',
        to: outputIndex,
        weight,
      });
    });
  });

  HIDDEN_LAYOUT.forEach((source, hiddenIndex) => {
    OUTPUT_LAYOUT.forEach((target, outputIndex) => {
      const weight = cppnWeight(query, source, target);
      if (weight === 0) return;
      hiddenToOutput[hiddenIndex][outputIndex] = weight;
      connections.push({
        fromKind: 'hidden',
        from: hiddenIndex,
        toKind: 'output',
        to: outputIndex,
        weight,
      });
    });
  });

  return {
    inputToHidden,
    inputToOutput,
    hiddenToOutput,
    connections,
    inputLayout: INPUT_LAYOUT,
    hiddenLayout: HIDDEN_LAYOUT,
    outputLayout: OUTPUT_LAYOUT,
    stats: cppnStats(genome),
    cppn: genome,
  };
}

export function forwardSubstrate(substrate, sensors) {
  const hidden = new Array(HIDDEN_LAYOUT.length).fill(0);
  const outputs = new Array(OUTPUT_LAYOUT.length).fill(0);

  for (let hiddenIndex = 0; hiddenIndex < HIDDEN_LAYOUT.length; hiddenIndex += 1) {
    let sum = 0;
    for (let inputIndex = 0; inputIndex < INPUT_LAYOUT.length; inputIndex += 1) {
      sum += sensors[inputIndex] * substrate.inputToHidden[inputIndex][hiddenIndex];
    }
    hidden[hiddenIndex] = Math.tanh(sum);
  }

  for (let outputIndex = 0; outputIndex < OUTPUT_LAYOUT.length; outputIndex += 1) {
    let sum = 0;
    for (let inputIndex = 0; inputIndex < INPUT_LAYOUT.length; inputIndex += 1) {
      sum += sensors[inputIndex] * substrate.inputToOutput[inputIndex][outputIndex];
    }
    for (let hiddenIndex = 0; hiddenIndex < HIDDEN_LAYOUT.length; hiddenIndex += 1) {
      sum += hidden[hiddenIndex] * substrate.hiddenToOutput[hiddenIndex][outputIndex];
    }
    outputs[outputIndex] = sum;
  }

  return {
    hidden,
    outputs,
    turn: Math.tanh(outputs[0] * 1.8),
    thrust: 1 / (1 + Math.exp(-clamp(outputs[1] * 2.2, -8, 8))),
  };
}

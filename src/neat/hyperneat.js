import { clamp } from '../sim/random.js';
import {
  compileCPPN,
  cppnStats,
  DEPTH_OUTPUT_ID,
} from './cppn.js';

const FOOD_LABELS = ['F', 'FL', 'L', 'BL', 'B', 'BR', 'R', 'FR'];
const HAZARD_LABELS = ['H·F', 'H·L', 'H·B', 'H·R'];
const WORM_LABELS = ['W·F', 'W·L', 'W·B', 'W·R'];
const CHOMPER_LABELS = ['C·F', 'C·L', 'C·B', 'C·R'];

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

  for (let index = 0; index < 4; index += 1) {
    const angle = Math.PI / 2 + index * (Math.PI / 2);
    inputs.push({
      kind: 'worm',
      index,
      label: WORM_LABELS[index],
      ...ringPosition(angle, 0.4),
    });
  }

  for (let index = 0; index < 4; index += 1) {
    const angle = Math.PI / 2 + index * (Math.PI / 2);
    inputs.push({
      kind: 'chomper',
      index,
      label: CHOMPER_LABELS[index],
      ...ringPosition(angle, 0.72),
    });
  }

  inputs.push({ kind: 'energy', index: 0, label: 'E', x: 0, y: 0.21 });
  inputs.push({ kind: 'bias', index: 0, label: 'B', x: 0, y: -0.17 });
  return inputs;
}

const INPUT_LAYOUT = createInputLayout();

const MAX_HIDDEN_LAYERS = 3;
const HIDDEN_PER_LAYER = 4;

const HIDDEN_CANDIDATES = Array.from(
  { length: MAX_HIDDEN_LAYERS * HIDDEN_PER_LAYER },
  (_, index) => {
    const layer = Math.floor(index / HIDDEN_PER_LAYER);
    const row = index % HIDDEN_PER_LAYER;
    return {
      index,
      layer,
      row,
      label: `L${layer + 1}H${row + 1}`,
      x: -0.52 + layer * 0.52,
      y: 0.45 - row * 0.3,
    };
  },
);

const OUTPUT_LAYOUT = [
  { key: 'turn', label: 'TURN', x: -0.24, y: -1.1 },
  { key: 'thrust', label: 'THRUST', x: 0.24, y: -1.1 },
];

export const SUBSTRATE_LAYOUT = Object.freeze({
  inputs: INPUT_LAYOUT,
  hidden: HIDDEN_CANDIDATES,
  outputs: OUTPUT_LAYOUT,
  maxHiddenLayers: MAX_HIDDEN_LAYERS,
  hiddenPerLayer: HIDDEN_PER_LAYER,
});

const CPPN_WEIGHT_SCALE = 2.35;
const EXPRESSION_THRESHOLD = 2.2;
const MIN_HIDDEN_INPUTS = 2;
const DEPTH_QUERY = [0.63, -0.47, -0.63, 0.47, 0.65, 1];

function cppnWeight(query, source, target) {
  const dx = source.x - target.x;
  const dy = source.y - target.y;
  const distance = Math.sqrt(dx * dx + dy * dy) / 2.4;
  const value = query([source.x, source.y, target.x, target.y, distance, 1]);
  if (!Number.isFinite(value)) return 0;
  const weight = value * CPPN_WEIGHT_SCALE;
  return Math.abs(weight) < EXPRESSION_THRESHOLD ? 0 : weight;
}

function substrateDepth(value) {
  if (!Number.isFinite(value)) return 2;
  if (value < -0.7) return 1;
  if (value > 0.7) return 3;
  return 2;
}

export function buildSubstrate(genome) {
  const query = compileCPPN(genome);
  const depthQuery = compileCPPN(genome, DEPTH_OUTPUT_ID);
  const depthSignal = depthQuery(DEPTH_QUERY);
  const candidateDepth = clamp(
    substrateDepth(depthSignal),
    1,
    MAX_HIDDEN_LAYERS,
  );
  const candidates = HIDDEN_CANDIDATES.filter((node) => node.layer < candidateDepth);

  const inputHiddenWeights = INPUT_LAYOUT.map((source) =>
    candidates.map((target) => cppnWeight(query, source, target)),
  );
  const inputOutputWeights = INPUT_LAYOUT.map((source) =>
    OUTPUT_LAYOUT.map((target) => cppnWeight(query, source, target)),
  );
  const hiddenHiddenWeights = candidates.map((source) =>
    candidates.map((target) =>
      source.layer < target.layer ? cppnWeight(query, source, target) : 0,
    ),
  );
  const hiddenOutputWeights = candidates.map((source) =>
    OUTPUT_LAYOUT.map((target) => cppnWeight(query, source, target)),
  );

  const activeCandidates = candidates.map(() => false);
  let activeLayerCount = 0;

  for (let layer = 0; layer < candidateDepth; layer += 1) {
    if (layer > 0 && activeLayerCount < layer) break;

    let layerActiveCount = 0;
    candidates.forEach((candidate, candidateIndex) => {
      if (candidate.layer !== layer) return;

      let incoming = inputHiddenWeights.reduce(
        (total, weights) => total + (weights[candidateIndex] === 0 ? 0 : 1),
        0,
      );
      for (let previousIndex = 0; previousIndex < candidates.length; previousIndex += 1) {
        if (!activeCandidates[previousIndex]) continue;
        if (candidates[previousIndex].layer >= layer) continue;
        if (hiddenHiddenWeights[previousIndex][candidateIndex] !== 0) incoming += 1;
      }

      const hasOutput = OUTPUT_LAYOUT.some(
        (_, outputIndex) => hiddenOutputWeights[candidateIndex][outputIndex] !== 0,
      );
      const hasLaterTarget = candidates.some(
        (target, targetIndex) =>
          target.layer > layer && hiddenHiddenWeights[candidateIndex][targetIndex] !== 0,
      );

      if (incoming >= MIN_HIDDEN_INPUTS && (hasOutput || hasLaterTarget)) {
        activeCandidates[candidateIndex] = true;
        layerActiveCount += 1;
      }
    });

    if (layerActiveCount === 0) break;
    activeLayerCount = layer + 1;
  }

  const hiddenDepth = activeLayerCount;

  const hiddenLayout = candidates
    .filter((_, candidateIndex) => activeCandidates[candidateIndex])
    .map((node) => ({ ...node, candidate: node.index }));
  const activeIndexByCandidate = new Map(
    hiddenLayout.map((node, hiddenIndex) => [node.candidate, hiddenIndex]),
  );
  const connections = [];

  const inputToHidden = Array.from({ length: INPUT_LAYOUT.length }, () =>
    new Array(hiddenLayout.length).fill(0),
  );
  const inputToOutput = Array.from({ length: INPUT_LAYOUT.length }, () =>
    new Array(OUTPUT_LAYOUT.length).fill(0),
  );
  const hiddenToHidden = Array.from({ length: hiddenLayout.length }, () =>
    new Array(hiddenLayout.length).fill(0),
  );
  const hiddenToOutput = Array.from({ length: hiddenLayout.length }, () =>
    new Array(OUTPUT_LAYOUT.length).fill(0),
  );

  INPUT_LAYOUT.forEach((_, inputIndex) => {
    candidates.forEach((candidate, candidateIndex) => {
      const hiddenIndex = activeIndexByCandidate.get(candidate.index);
      if (hiddenIndex === undefined) return;
      const weight = inputHiddenWeights[inputIndex][candidateIndex];
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

    OUTPUT_LAYOUT.forEach((_, outputIndex) => {
      const weight = inputOutputWeights[inputIndex][outputIndex];
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

  candidates.forEach((source, sourceCandidateIndex) => {
    const sourceHiddenIndex = activeIndexByCandidate.get(source.index);
    if (sourceHiddenIndex === undefined) return;

    candidates.forEach((target, targetCandidateIndex) => {
      if (source.layer >= target.layer) return;
      const targetHiddenIndex = activeIndexByCandidate.get(target.index);
      if (targetHiddenIndex === undefined) return;
      const weight = hiddenHiddenWeights[sourceCandidateIndex][targetCandidateIndex];
      if (weight === 0) return;
      hiddenToHidden[sourceHiddenIndex][targetHiddenIndex] = weight;
      connections.push({
        fromKind: 'hidden',
        from: sourceHiddenIndex,
        toKind: 'hidden',
        to: targetHiddenIndex,
        weight,
      });
    });

    OUTPUT_LAYOUT.forEach((_, outputIndex) => {
      const weight = hiddenOutputWeights[sourceCandidateIndex][outputIndex];
      if (weight === 0) return;
      hiddenToOutput[sourceHiddenIndex][outputIndex] = weight;
      connections.push({
        fromKind: 'hidden',
        from: sourceHiddenIndex,
        toKind: 'output',
        to: outputIndex,
        weight,
      });
    });
  });

  const hiddenLayers = Array.from({ length: hiddenDepth }, (_, layer) =>
    hiddenLayout.filter((node) => node.layer === layer),
  );
  const displayedCandidates = candidates.filter(
    (node) => node.layer < hiddenDepth,
  );
  const stats = cppnStats(genome);

  return {
    inputToHidden,
    inputToOutput,
    hiddenToHidden,
    hiddenToOutput,
    connections,
    inputLayout: INPUT_LAYOUT,
    hiddenLayout,
    hiddenLayers,
    hiddenDepth,
    outputLayout: OUTPUT_LAYOUT,
    hiddenCandidates: displayedCandidates,
    activeHidden: hiddenLayout.map((node) => node.candidate),
    stats: {
      ...stats,
      substrateHidden: hiddenLayout.length,
      candidateHidden: displayedCandidates.length,
      candidateDepth,
      hiddenDepth,
      activeLayerCount,
      depthSignal,
    },
    cppn: genome,
  };
}

export function forwardSubstrate(substrate, sensors) {
  const hidden = new Array(substrate.hiddenLayout.length).fill(0);
  const outputs = new Array(OUTPUT_LAYOUT.length).fill(0);

  for (let hiddenIndex = 0; hiddenIndex < hidden.length; hiddenIndex += 1) {
    let sum = 0;
    for (let inputIndex = 0; inputIndex < INPUT_LAYOUT.length; inputIndex += 1) {
      sum += sensors[inputIndex] * substrate.inputToHidden[inputIndex][hiddenIndex];
    }
    for (let previousIndex = 0; previousIndex < hiddenIndex; previousIndex += 1) {
      sum += hidden[previousIndex] * substrate.hiddenToHidden[previousIndex][hiddenIndex];
    }
    hidden[hiddenIndex] = Math.tanh(sum);
  }

  for (let outputIndex = 0; outputIndex < OUTPUT_LAYOUT.length; outputIndex += 1) {
    let sum = 0;
    for (let inputIndex = 0; inputIndex < INPUT_LAYOUT.length; inputIndex += 1) {
      sum += sensors[inputIndex] * substrate.inputToOutput[inputIndex][outputIndex];
    }
    for (let hiddenIndex = 0; hiddenIndex < hidden.length; hiddenIndex += 1) {
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

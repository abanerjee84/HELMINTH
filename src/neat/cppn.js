import { clamp, gaussian, pick } from '../sim/random.js';

export const CPPN_INPUTS = Object.freeze([
  { id: 0, label: 'x₁', order: 0 },
  { id: 1, label: 'y₁', order: 1 },
  { id: 2, label: 'x₂', order: 2 },
  { id: 3, label: 'y₂', order: 3 },
  { id: 4, label: '|Δ|', order: 4 },
  { id: 5, label: 'bias', order: 5 },
]);

const OUTPUT_ID = 999;
const OUTPUT_ORDER = 1000;
const BASE_HIDDEN_IDS = [100, 101, 102];
const BASE_HIDDEN_ORDERS = [30, 31, 32];

const HIDDEN_ACTIVATIONS = ['tanh', 'sin', 'gauss', 'relu', 'abs'];
let nextNodeId = 200;

function activation(value, type) {
  switch (type) {
    case 'sin':
      return Math.sin(value * 2.4);
    case 'gauss':
      return Math.exp(-value * value * 1.9) * 2 - 1;
    case 'relu':
      return Math.max(-0.45, value);
    case 'abs':
      return Math.abs(value) * 2 - 1;
    default:
      return Math.tanh(value);
  }
}

function connectionKey(from, to) {
  return `${from}>${to}`;
}

function cloneGenome(genome) {
  return {
    nodes: genome.nodes.map((node) => ({ ...node })),
    connections: genome.connections.map((connection) => ({ ...connection })),
  };
}

function baseNodes(hiddenActivations) {
  const inputs = CPPN_INPUTS.map((input) => ({
    id: input.id,
    type: 'input',
    order: input.order,
    label: input.label,
    activation: 'identity',
  }));

  const hidden = BASE_HIDDEN_IDS.map((id, index) => ({
    id,
    type: 'hidden',
    order: BASE_HIDDEN_ORDERS[index],
    label: `h${index + 1}`,
    activation: hiddenActivations[index],
  }));

  return [
    ...inputs,
    ...hidden,
    {
      id: OUTPUT_ID,
      type: 'output',
      order: OUTPUT_ORDER,
      label: 'weight',
      activation: 'tanh',
    },
  ];
}

export function createInitialCPPN(rng) {
  const hiddenActivations = BASE_HIDDEN_IDS.map(() => pick(rng, HIDDEN_ACTIVATIONS));
  const nodes = baseNodes(hiddenActivations);
  const connections = [];
  const hiddenIds = BASE_HIDDEN_IDS;

  for (const hiddenId of hiddenIds) {
    for (const input of CPPN_INPUTS) {
      connections.push({
        from: input.id,
        to: hiddenId,
        weight: clamp(gaussian(rng) * 0.92, -3, 3),
        enabled: true,
      });
    }
    connections.push({
      from: hiddenId,
      to: OUTPUT_ID,
      weight: clamp(gaussian(rng) * 1.05, -3, 3),
      enabled: true,
    });
  }

  for (const input of CPPN_INPUTS) {
    connections.push({
      from: input.id,
      to: OUTPUT_ID,
      weight: clamp(gaussian(rng) * 0.7, -2.5, 2.5),
      enabled: true,
    });
  }

  return { nodes, connections };
}

function pruneGenome(genome) {
  const ids = new Set(genome.nodes.map((node) => node.id));
  const used = new Set();
  const seen = new Set();
  const connections = [];

  for (const connection of genome.connections) {
    if (!ids.has(connection.from) || !ids.has(connection.to)) continue;
    if (connection.from === connection.to) continue;
    const key = connectionKey(connection.from, connection.to);
    if (seen.has(key)) continue;
    seen.add(key);
    used.add(connection.from);
    used.add(connection.to);
    connections.push(connection);
  }

  const nodes = genome.nodes.filter((node) => {
    if (node.type === 'input' || node.type === 'output') return true;
    return used.has(node.id);
  });
  const keptIds = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    connections: connections.filter(
      (connection) => keptIds.has(connection.from) && keptIds.has(connection.to),
    ),
  };
}

export function mutateCPPN(genome, rng, intensity = 1) {
  const child = cloneGenome(genome);

  for (const connection of child.connections) {
    if (rng() < 0.58) {
      connection.weight += gaussian(rng) * 0.34 * intensity;
      connection.weight = clamp(connection.weight, -4.2, 4.2);
    }
    if (rng() < 0.025) {
      connection.weight = clamp(gaussian(rng) * 1.2, -4.2, 4.2);
    }
    if (rng() < 0.012) {
      connection.enabled = !connection.enabled;
    }
  }

  if (rng() < 0.09) {
    const hidden = child.nodes.filter(
      (node) => node.type === 'hidden' && node.activation !== 'identity',
    );
    if (hidden.length) {
      const node = pick(rng, hidden);
      const options = HIDDEN_ACTIVATIONS.filter((value) => value !== node.activation);
      node.activation = pick(rng, options);
    }
  }

  if (rng() < 0.16) {
    addRandomConnection(child, rng);
  }

  if (rng() < 0.075) {
    addNodeSplit(child, rng);
  }

  return pruneGenome(child);
}

function addRandomConnection(genome, rng) {
  const existing = new Set(
    genome.connections.map((connection) => connectionKey(connection.from, connection.to)),
  );
  const sources = genome.nodes.filter((node) => node.type !== 'output');
  const targets = genome.nodes.filter((node) => node.type !== 'input');
  const orderedSources = sources.sort((a, b) => a.order - b.order);
  const orderedTargets = targets.sort((a, b) => a.order - b.order);

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const source = pick(rng, orderedSources);
    const target = pick(rng, orderedTargets);
    if (source.order >= target.order) continue;
    const key = connectionKey(source.id, target.id);
    if (existing.has(key)) continue;
    genome.connections.push({
      from: source.id,
      to: target.id,
      weight: clamp(gaussian(rng) * 0.9, -3, 3),
      enabled: true,
    });
    return;
  }
}

function addNodeSplit(genome, rng) {
  const candidates = genome.connections.filter((connection) => connection.enabled);
  if (!candidates.length) return;
  const target = pick(rng, candidates);
  const sourceNode = genome.nodes.find((node) => node.id === target.from);
  const targetNode = genome.nodes.find((node) => node.id === target.to);
  if (!sourceNode || !targetNode) return;

  const id = nextNodeId;
  nextNodeId += 1;
  const order = (sourceNode.order + targetNode.order) * 0.5 + (rng() - 0.5) * 0.001;
  const hidden = {
    id,
    type: 'hidden',
    order,
    label: `h${id}`,
    activation: pick(rng, HIDDEN_ACTIVATIONS),
  };

  target.enabled = false;
  genome.nodes.push(hidden);
  genome.connections.push({
    from: sourceNode.id,
    to: id,
    weight: 1,
    enabled: true,
  });
  genome.connections.push({
    from: id,
    to: targetNode.id,
    weight: clamp(target.weight, -3.4, 3.4),
    enabled: true,
  });
}

export function crossoverCPPN(fitter, other, rng) {
  const fitterKeys = new Map(
    fitter.connections.map((connection) => [
      connectionKey(connection.from, connection.to),
      connection,
    ]),
  );
  const otherKeys = new Map(
    other.connections.map((connection) => [
      connectionKey(connection.from, connection.to),
      connection,
    ]),
  );

  const nodes = fitter.nodes.map((node) => ({ ...node }));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const connections = [];

  for (const connection of fitter.connections) {
    const key = connectionKey(connection.from, connection.to);
    const mate = otherKeys.get(key);
    const chosen = mate && rng() < 0.5 ? mate : connection;
    const enabled = mate ? (rng() < 0.75 ? chosen.enabled : mate.enabled) : chosen.enabled;
    connections.push({ ...chosen, enabled });
  }

  for (const [key, connection] of otherKeys) {
    if (!fitterKeys.has(key)) continue;
    if (rng() >= 0.08) continue;
    if (!nodeMap.has(connection.from) || !nodeMap.has(connection.to)) continue;
    const existing = connections.find(
      (candidate) => connectionKey(candidate.from, candidate.to) === key,
    );
    if (existing) existing.weight = connection.weight;
  }

  return pruneGenome({ nodes, connections });
}

export function compileCPPN(genome) {
  const nodes = [...genome.nodes].sort((a, b) => a.order - b.order);
  const incoming = new Map();
  for (const node of nodes) incoming.set(node.id, []);
  for (const connection of genome.connections) {
    if (!connection.enabled) continue;
    const list = incoming.get(connection.to);
    if (list) list.push(connection);
  }

  const inputIds = CPPN_INPUTS.map((input) => input.id);
  const outputNode = nodes.find((node) => node.type === 'output') ?? nodes[nodes.length - 1];

  return function query(inputValues) {
    const values = new Map();
    inputIds.forEach((id, index) => {
      values.set(id, inputValues[index] ?? 0);
    });

    for (const node of nodes) {
      if (node.type === 'input') continue;
      const links = incoming.get(node.id);
      let sum = 0;
      for (const link of links) {
        sum += (values.get(link.from) ?? 0) * link.weight;
      }
      values.set(node.id, activation(sum, node.activation));
    }

    return values.get(outputNode.id) ?? 0;
  };
}

export function evaluateCPPN(genome, inputValues) {
  return compileCPPN(genome)(inputValues);
}

export function createSeededPopulation(rng, count) {
  return Array.from({ length: count }, () => createInitialCPPN(rng));
}

export function cppnStats(genome) {
  const hidden = genome.nodes.filter((node) => node.type === 'hidden').length;
  const enabled = genome.connections.filter((connection) => connection.enabled).length;
  return {
    hidden,
    enabled,
    nodes: genome.nodes.length,
    signature: `6 · ${hidden} · 1`,
  };
}

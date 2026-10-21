import { SUBSTRATE_LAYOUT } from '../neat/hyperneat.js';

const numberFormat = new Intl.NumberFormat('en-US');

function formatInteger(value) {
  return numberFormat.format(Math.round(value || 0));
}

function formatTimer(seconds) {
  const elapsed = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(elapsed / 60);
  const remainder = elapsed % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatFraction(value) {
  return (value ?? 0).toFixed(2);
}

function formatSigned(value) {
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  return `${normalized >= 0 ? '+' : '-'}${Math.abs(normalized).toFixed(2)}`;
}

function withAlpha(hex, alpha) {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function canvasSize(canvas, context) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height };
}

function inputColor(kind) {
  if (kind === 'food') return '#b9ff68';
  if (kind === 'hazard') return '#ff6e9b';
  if (kind === 'worm') return '#6bc8ff';
  if (kind === 'chomper') return '#ff9b71';
  if (kind === 'energy') return '#ffc96b';
  return '#85a99a';
}

export class Dashboard {
  constructor() {
    this.app = document.getElementById('app');
    this.startButton = document.getElementById('startBtn');
    this.startLabel = document.getElementById('startLabel');
    this.startHint = document.getElementById('startHint');
    this.resetButton = document.getElementById('resetBtn');
    this.runStatus = document.getElementById('runStatus');
    this.statusMeta = document.getElementById('statusMeta');
    this.fpsValue = document.getElementById('fpsValue');
    this.phaseLabel = document.getElementById('phaseLabel');
    this.phaseDetail = document.getElementById('phaseDetail');
    this.genNumber = document.getElementById('genNumber');
    this.genTime = document.getElementById('genTime');
    this.genProgress = document.getElementById('genProgress');
    this.aliveCount = document.getElementById('aliveCount');
    this.foodCount = document.getElementById('foodCount');
    this.avgFit = document.getElementById('avgFit');
    this.bestFit = document.getElementById('bestFit');
    this.leaderCard = document.getElementById('leaderCard');
    this.leaderName = document.getElementById('leaderName');
    this.leaderGenome = document.getElementById('leaderGenome');
    this.leaderScore = document.getElementById('leaderScore');
    this.leaderFood = document.getElementById('leaderFood');
    this.leaderTime = document.getElementById('leaderTime');
    this.leaderForward = document.getElementById('leaderForward');
    this.leaderEnergy = document.getElementById('leaderEnergy');
    this.leaderEnergyBar = document.getElementById('leaderEnergyBar');
    this.standings = document.getElementById('standings');
    this.idlePrompt = document.getElementById('idlePrompt');
    this.toast = document.getElementById('generationToast');
    this.toastTitle = document.getElementById('toastTitle');
    this.toastDetail = document.getElementById('toastDetail');
    this.cppnSignature = document.getElementById('cppnSignature');
    this.brainDominant = document.getElementById('brainDominant');
    this.brainDominantValue = document.getElementById('brainDominantValue');
    this.brainHiddenMean = document.getElementById('brainHiddenMean');
    this.brainActiveLinks = document.getElementById('brainActiveLinks');
    this.brainTotalLinks = document.getElementById('brainTotalLinks');
    this.brainArchitecture = document.getElementById('brainArchitecture');
    this.brainLinkCount = document.getElementById('brainLinkCount');
    this.hiddenNodes = document.getElementById('hiddenNodes');
    this.synapseCount = document.getElementById('synapseCount');
    this.bestEver = document.getElementById('bestEver');
    this.lastChampion = document.getElementById('lastChampion');
    this.cohortCount = document.getElementById('cohortCount');
    this.turnValue = document.getElementById('turnValue');
    this.thrustValue = document.getElementById('thrustValue');
    this.turnFill = document.getElementById('turnFill');
    this.thrustFill = document.getElementById('thrustFill');

    this.brainCanvas = document.getElementById('brainCanvas');
    this.brainContext = this.brainCanvas.getContext('2d');
    this.fitnessCanvas = document.getElementById('fitnessCanvas');
    this.fitnessContext = this.fitnessCanvas.getContext('2d');

    this.textCache = new Map();
    this.lastDomUpdate = -Infinity;
    this.lastBrainDraw = -Infinity;
    this.lastFitnessSignature = '__initial__';
    this.lastStandings = '';
    this.lastToastGeneration = 0;
    this.brainTrace = { key: null, turn: [], thrust: [] };
    this.running = false;
  }

  resetState() {
    this.lastDomUpdate = -Infinity;
    this.lastBrainDraw = -Infinity;
    this.lastFitnessSignature = '__reset__';
    this.lastStandings = '';
    this.lastToastGeneration = 0;
    this.brainTrace = { key: null, turn: [], thrust: [] };
    this.textCache.clear();
    this.toast.classList.remove('is-visible');
  }

  setText(element, value) {
    if (!element) return;
    if (this.textCache.get(element) === value) return;
    this.textCache.set(element, value);
    element.textContent = value;
  }

  setSpeed(speed) {
    document.querySelectorAll('[data-speed]').forEach((button) => {
      const active = Number(button.dataset.speed) === Number(speed);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  bindSpeed(handler) {
    document.querySelectorAll('[data-speed]').forEach((button) => {
      button.addEventListener('click', () => handler(Number(button.dataset.speed)));
    });
  }

  bindActions({ onStart, onReset }) {
    this.startButton.addEventListener('click', onStart);
    this.resetButton.addEventListener('click', onReset);
  }

  update(evolution, state, now = performance.now()) {
    this.running = state.running;
    const interval = 90;
    if (now - this.lastDomUpdate < interval) {
      this.updateBrain(evolution, now);
      return;
    }
    this.lastDomUpdate = now;

    const { running, speed, fps } = state;
    const phase = evolution.phase;
    const leader = evolution.leader;
    const intermission = phase === 'intermission';
    const paused = !running && phase !== 'ready';
    const ready = phase === 'ready';

    this.app.classList.toggle('is-running', running);
    this.app.classList.toggle('is-paused', paused || (running && intermission));
    this.setSpeed(speed);
    this.setText(this.fpsValue, String(Math.round(fps || 0)));

    if (ready) {
      this.setText(this.runStatus, 'STANDBY');
      this.setText(this.statusMeta, 'Awaiting the first selection event');
      this.setText(this.startLabel, 'Start evolution');
      this.setText(this.startHint, 'Seed population · evolve behavior');
      this.startButton.setAttribute('aria-label', 'Start evolution');
      this.setText(this.phaseLabel, 'PRE-FLIGHT');
      this.setText(this.phaseDetail, `${evolution.agents.length} substrates constructed`);
    } else if (intermission) {
      this.setText(this.runStatus, running ? 'COHORT SCORED' : 'SELECTION ON HOLD');
      this.setText(
        this.statusMeta,
        running ? 'Breeding the next cohort' : 'Resume to breed the next cohort',
      );
      this.setText(this.startLabel, running ? 'Pause evolution' : 'Resume evolution');
      this.setText(
        this.startHint,
        running ? 'Observe selection · breeding in progress' : 'Next cohort waiting',
      );
      this.startButton.setAttribute('aria-label', running ? 'Pause evolution' : 'Resume evolution');
      this.setText(this.phaseLabel, 'COHORT SCORED');
      this.setText(this.phaseDetail, `Champion fitness ${formatInteger(leader?.worm.fitness)}`);
    } else if (paused) {
      this.setText(this.runStatus, 'OBSERVATION HOLD');
      this.setText(this.statusMeta, 'Simulation paused by operator');
      this.setText(this.startLabel, 'Resume evolution');
      this.setText(this.startHint, 'Continue cohort evaluation');
      this.startButton.setAttribute('aria-label', 'Resume evolution');
      this.setText(this.phaseLabel, 'HOLD');
      this.setText(this.phaseDetail, `${evolution.aliveCount} organisms suspended`);
    } else {
      this.setText(this.runStatus, 'SELECTION LIVE');
      this.setText(
        this.statusMeta,
        `Generation ${String(evolution.generation).padStart(2, '0')} · ${speed}× realtime`,
      );
      this.setText(this.startLabel, 'Pause evolution');
      this.setText(this.startHint, `Evaluating ${evolution.agents.length} CPPN substrates`);
      this.startButton.setAttribute('aria-label', 'Pause evolution');
      this.setText(this.phaseLabel, 'EXPLORING');
      this.setText(this.phaseDetail, `${evolution.aliveCount} organisms active`);
    }

    this.idlePrompt.classList.toggle('is-hidden', !ready);

    const generation = String(evolution.generation).padStart(2, '0');
    this.setText(this.genNumber, generation);
    this.setText(this.genTime, formatTimer(evolution.elapsed));
    const survival = intermission
      ? 0
      : (evolution.aliveCount / Math.max(1, evolution.agents.length)) * 100;
    this.genProgress.style.width = `${survival.toFixed(2)}%`;

    const alive = evolution.agents.filter((agent) => agent.worm.alive).length;
    const average =
      evolution.agents.reduce((total, agent) => total + agent.worm.fitness, 0) /
      Math.max(1, evolution.agents.length);
    const currentBest = evolution.ranking[0]?.worm.fitness ?? 0;
    this.setText(this.aliveCount, String(alive));
    this.setText(this.foodCount, String(evolution.ecology.activeFoodCount()));
    this.setText(this.avgFit, formatInteger(intermission ? evolution.lastSummary?.average : average));
    this.setText(
      this.bestFit,
      formatInteger(intermission ? evolution.lastSummary?.best : currentBest),
    );

    if (leader) {
      const worm = leader.worm;
      this.leaderCard.style.setProperty('--agent', leader.color);
      this.setText(this.leaderName, `WORM ${String(leader.index).padStart(2, '0')}`);
      this.setText(
        this.leaderGenome,
        `CPPN ${leader.substrate.stats.signature.replaceAll(' · ', '·')} · G${String(
          evolution.generation,
        ).padStart(2, '0')}`,
      );
      this.setText(this.leaderScore, formatInteger(worm.fitness));
      this.setText(this.leaderFood, String(worm.foodEaten));
      this.setText(this.leaderForward, formatInteger(worm.forwardProgress));
      this.setText(this.leaderTime, `${worm.age.toFixed(0)}s`);
      const energyPercent = Math.round((worm.energy / worm.maxEnergy) * 100);
      this.setText(this.leaderEnergy, `${energyPercent}%`);
      this.leaderEnergyBar.style.width = `${energyPercent}%`;

      this.setText(this.cppnSignature, `CPPN ${leader.substrate.stats.signature.replaceAll(' · ', ' · ')}`);
      this.setText(this.brainLinkCount, `${leader.substrate.connections.length} LINKS`);
      this.setText(this.hiddenNodes, String(leader.substrate.stats.hidden));
      this.setText(this.synapseCount, String(leader.substrate.stats.enabled));

      this.setText(this.turnValue, formatFraction(worm.outputs.turn));
      this.setText(this.thrustValue, formatFraction(worm.outputs.thrust));
      const turn = Math.max(-1, Math.min(1, worm.outputs.turn));
      const turnWidth = Math.abs(turn) * 50;
      const turnLeft = turn >= 0 ? 50 : 50 - turnWidth;
      this.turnFill.style.left = `${turnLeft}%`;
      this.turnFill.style.width = `${turnWidth}%`;
      this.thrustFill.style.width = `${Math.round(worm.outputs.thrust * 100)}%`;
    }

    this.updateStandings(evolution);

    const lastRecord = evolution.history[evolution.history.length - 1];
    this.setText(
      this.bestEver,
      formatInteger(Math.max(evolution.bestEver, currentBest)),
    );
    this.setText(this.lastChampion, lastRecord ? formatInteger(lastRecord.best) : '—');
    this.setText(this.cohortCount, String(evolution.history.length).padStart(2, '0'));

    this.handleToast(evolution, running);
    this.updateBrain(evolution, now);
    this.updateFitness(evolution, now);
  }

  updateStandings(evolution) {
    const ranking = evolution.ranking.slice(1, 7);
    const key = ranking
      .map((agent) => `${agent.id}:${Math.round(agent.worm.fitness)}`)
      .join('|');
    if (key === this.lastStandings) return;
    this.lastStandings = key;

    this.standings.innerHTML = ranking
      .map(
        (agent, index) => `
          <div class="standing-row" style="--row-agent:${agent.color}">
            <span class="standing-rank">${String(index + 2).padStart(2, '0')}</span>
            <span class="standing-swatch"></span>
            <span class="standing-name">W-${String(agent.index).padStart(2, '0')}<small>${agent.worm.foodEaten} NUT</small></span>
            <span class="standing-food">${agent.worm.age.toFixed(0)}s</span>
            <span class="standing-score">${formatInteger(agent.worm.fitness)}</span>
          </div>
        `,
      )
      .join('');
  }

  handleToast(evolution, running) {
    if (evolution.phase !== 'intermission') {
      this.toast.classList.remove('is-visible');
      return;
    }
    if (this.lastToastGeneration !== evolution.generation) {
      this.lastToastGeneration = evolution.generation;
      const summary = evolution.lastSummary;
      this.setText(
        this.toastTitle,
        `Generation ${String(evolution.generation).padStart(2, '0')} complete`,
      );
      this.setText(
        this.toastDetail,
        `Champion ${formatInteger(summary?.best)} fit · ${summary?.foodEaten ?? 0} nutrients · ${Math.round(
          summary?.timeAlive ?? 0,
        )}s alive${running ? ' · breeding' : ' · on hold'}`,
      );
    }
    this.toast.classList.add('is-visible');
  }

  updateBrain(evolution, now) {
    if (now - this.lastBrainDraw < 74) return;
    this.lastBrainDraw = now;
    const leader = evolution.leader;
    if (!leader) return;
    const traceKey = `${evolution.generation}:${leader.id}`;
    this.drawBrain(leader, now / 1000, traceKey);
  }

  drawBrain(agent, time, traceKey) {
    const ctx = this.brainContext;
    const { width, height } = canvasSize(this.brainCanvas, ctx);
    ctx.clearRect(0, 0, width, height);

    const worm = agent.worm;
    const substrate = agent.substrate;
    const layerTop = 9;
    const networkTop = 20;
    const traceTop = height - 31;
    const networkBottom = traceTop - 8;
    const inputX = width * 0.19;
    const outputX = width * 0.85;
    const groupGap = Math.max(2, height * 0.012);
    const inputLayout = substrate.inputLayout;
    const inputGapAfter = new Set();
    for (let index = 1; index < inputLayout.length; index += 1) {
      const previousKind = inputLayout[index - 1].kind;
      const kind = inputLayout[index].kind;
      if (kind !== previousKind && !(previousKind === 'energy' && kind === 'bias')) {
        inputGapAfter.add(index - 1);
      }
    }
    const rowHeight =
      (networkBottom - networkTop - groupGap * inputGapAfter.size) /
      inputLayout.length;
    const inputLabelFont = `600 ${Math.max(
      5.8,
      Math.min(8.4, rowHeight * 0.92),
    ).toFixed(1)}px "JetBrains Mono Variable", monospace`;
    const inputY = [];
    let cursor = networkTop + rowHeight * 0.5;
    for (let index = 0; index < inputLayout.length; index += 1) {
      inputY.push(cursor);
      cursor += rowHeight;
      if (inputGapAfter.has(index)) cursor += groupGap;
    }
    const hiddenCount = substrate.hiddenLayout.length;
    const hiddenDepth = substrate.hiddenDepth;
    const hiddenLeft = inputX + 24;
    const hiddenRight = outputX - 58;
    const hiddenColumnX =
      hiddenDepth === 1
        ? [(hiddenLeft + hiddenRight) * 0.5]
        : Array.from(
            { length: hiddenDepth },
            (_, layer) =>
              hiddenLeft + (layer / (hiddenDepth - 1)) * (hiddenRight - hiddenLeft),
          );
    const hiddenTop = networkTop + rowHeight * 0.5;
    const hiddenBottom = networkBottom - rowHeight * 0.5;
    const hiddenRowY = (row) =>
      SUBSTRATE_LAYOUT.hiddenPerLayer === 1
        ? (hiddenTop + hiddenBottom) * 0.5
        : hiddenTop +
          (row / (SUBSTRATE_LAYOUT.hiddenPerLayer - 1)) * (hiddenBottom - hiddenTop);
    const outputY = [
      networkTop + (networkBottom - networkTop) * 0.36,
      networkTop + (networkBottom - networkTop) * 0.66,
    ];

    const inputs = inputLayout.map((node, index) => {
      const value = worm.sensorValues[index] ?? 0;
      return {
        ...node,
        index,
        point: { x: inputX, y: inputY[index] },
        value,
        color: inputColor(node.kind),
        displayLabel: node.kind === 'bias' ? 'BIAS' : node.label,
      };
    });
    const hidden = substrate.hiddenLayout.map((node, index) => {
      const value = worm.activations.hidden[index] ?? 0;
      return {
        ...node,
        index,
        point: { x: hiddenColumnX[node.layer], y: hiddenRowY(node.row) },
        value,
        color: value >= 0 ? '#69efd1' : '#ff7fa6',
      };
    });
    const outputs = substrate.outputLayout.map((node, index) => ({
      ...node,
      index,
      point: { x: outputX, y: outputY[index] },
      value: worm.activations.outputs[index] ?? 0,
      displayValue: index === 0 ? worm.outputs.turn : worm.outputs.thrust,
      color: index === 0 ? '#69efd1' : '#c8ff6d',
    }));

    const connections = substrate.connections.map((connection, order) => {
      const source =
        connection.fromKind === 'input'
          ? inputs[connection.from]
          : hidden[connection.from];
      const target =
        connection.toKind === 'hidden'
          ? hidden[connection.to]
          : outputs[connection.to];
      return {
        ...connection,
        source,
        target,
        order,
        signal: source && target ? Math.abs(source.value * connection.weight) : 0,
      };
    }).filter((connection) => connection.source && connection.target);

    let maxSignal = 0.001;
    for (const connection of connections) {
      if (connection.signal > maxSignal) maxSignal = connection.signal;
    }
    const activeConnections = connections.filter((connection) => connection.signal > 0.02);
    const meanHidden = hidden.length
      ? hidden.reduce((total, node) => total + Math.abs(node.value), 0) / hidden.length
      : 0;

    ctx.save();
    ctx.strokeStyle = 'rgba(151, 255, 201, 0.06)';
    ctx.lineWidth = 1;
    for (const index of inputGapAfter) {
      const separatorY = inputY[index] + rowHeight * 0.5 + groupGap * 0.5;
      ctx.beginPath();
      ctx.moveTo(4, separatorY);
      ctx.lineTo(inputX + 8, separatorY);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 0.4;
    for (const connection of connections) {
      ctx.strokeStyle =
        connection.weight >= 0
          ? 'rgba(105, 239, 209, 0.028)'
          : 'rgba(255, 110, 155, 0.026)';
      ctx.beginPath();
      ctx.moveTo(connection.source.point.x, connection.source.point.y);
      ctx.lineTo(connection.target.point.x, connection.target.point.y);
      ctx.stroke();
    }

    const litConnections = [...activeConnections]
      .sort((a, b) => a.signal - b.signal)
      .slice(-46);
    for (const connection of litConnections) {
      const normalized = Math.min(1, connection.signal / maxSignal);
      const alpha = 0.035 + normalized ** 0.7 * 0.23;
      ctx.strokeStyle =
        connection.weight >= 0
          ? `rgba(105, 239, 209, ${alpha})`
          : `rgba(255, 110, 155, ${alpha * 0.9})`;
      ctx.lineWidth = 0.45 + normalized * 1.15;
      ctx.beginPath();
      ctx.moveTo(connection.source.point.x, connection.source.point.y);
      ctx.lineTo(connection.target.point.x, connection.target.point.y);
      ctx.stroke();
    }

    const pulsingConnections = [...activeConnections]
      .sort((a, b) => a.signal - b.signal)
      .slice(-14);
    for (const connection of pulsingConnections) {
      const normalized = Math.min(1, connection.signal / maxSignal);
      const phase =
        (time * (0.22 + normalized * 0.52) + connection.order * 0.137) % 1;
      const px =
        connection.source.point.x +
        (connection.target.point.x - connection.source.point.x) * phase;
      const py =
        connection.source.point.y +
        (connection.target.point.y - connection.source.point.y) * phase;
      const alpha = Math.sin(phase * Math.PI) * (0.12 + normalized * 0.62);
      ctx.fillStyle =
        connection.weight >= 0
          ? `rgba(174, 255, 226, ${alpha})`
          : `rgba(255, 154, 183, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, 0.9 + normalized * 1.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    this.drawLabel(
      ctx,
      `SENSE ${inputLayout.length}`,
      4,
      layerTop,
      'rgba(137, 177, 157, 0.72)',
      'left',
      '600 7.6px "JetBrains Mono Variable", monospace',
    );
    const candidateCount = substrate.hiddenCandidates.length;
    this.drawLabel(
      ctx,
      candidateCount > 0
        ? `HIDDEN ${hiddenDepth}L · ${hiddenCount}/${candidateCount}`
        : 'HIDDEN 0L',
      hiddenLeft - 2,
      layerTop,
      'rgba(137, 177, 157, 0.72)',
      'left',
      '600 7.6px "JetBrains Mono Variable", monospace',
    );
    for (let layer = 0; layer < hiddenDepth; layer += 1) {
      const count = substrate.hiddenLayers[layer]?.length ?? 0;
      this.drawLabel(
        ctx,
        `L${layer + 1}·${count}`,
        hiddenColumnX[layer],
        networkTop - 3,
        count > 0 ? 'rgba(105, 239, 209, 0.58)' : 'rgba(105, 239, 209, 0.24)',
        'center',
        '600 6.5px "JetBrains Mono Variable", monospace',
      );
    }
    this.drawLabel(
      ctx,
      'MOTOR 2',
      outputX - 18,
      layerTop,
      'rgba(137, 177, 157, 0.72)',
      'left',
      '600 7.6px "JetBrains Mono Variable", monospace',
    );

    for (const input of inputs) {
      const value = Math.max(0, Math.min(1, input.value));
      this.drawLabel(
        ctx,
        input.displayLabel,
        4,
        input.point.y,
        withAlpha(input.color, 0.56 + value * 0.38),
        'left',
        inputLabelFont,
      );
      this.drawNode(
        ctx,
        input.point.x,
        input.point.y,
        2 + value * 2.5,
        input.color,
        0.3 + value * 0.62,
      );
    }

    for (const node of hidden) {
      const intensity = Math.min(1, Math.abs(node.value));
      this.drawNode(
        ctx,
        node.point.x,
        node.point.y,
        2.6 + intensity * 2.4,
        node.color,
        0.36 + intensity * 0.52,
      );
      this.drawLabel(
        ctx,
        formatSigned(node.value),
        node.point.x + 8,
        node.point.y,
        withAlpha(node.color, 0.6 + intensity * 0.34),
        'left',
        '600 8.8px "JetBrains Mono Variable", monospace',
      );
    }

    for (const output of outputs) {
      const magnitude = Math.min(1, Math.abs(Math.tanh(output.value)));
      const radius = 4.4 + magnitude * 2.2;
      this.drawNode(ctx, output.point.x, output.point.y, radius, output.color, 0.75);
      ctx.save();
      ctx.strokeStyle = withAlpha(output.color, 0.26 + magnitude * 0.24);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(output.point.x, output.point.y, radius + 2.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      this.drawLabel(
        ctx,
        output.label,
        output.point.x,
        output.point.y - 10,
        withAlpha(output.color, 0.72),
        'center',
        '600 7.8px "JetBrains Mono Variable", monospace',
      );
      this.drawLabel(
        ctx,
        output.index === 0 ? formatSigned(output.displayValue) : formatFraction(output.displayValue),
        output.point.x,
        output.point.y + 11,
        output.color,
        'center',
        '600 9.6px "JetBrains Mono Variable", monospace',
      );
    }

    if (this.brainTrace.key !== traceKey) {
      this.brainTrace = { key: traceKey, turn: [], thrust: [] };
    }
    this.brainTrace.turn.push(worm.outputs.turn);
    this.brainTrace.thrust.push(worm.outputs.thrust);
    if (this.brainTrace.turn.length > 72) this.brainTrace.turn.shift();
    if (this.brainTrace.thrust.length > 72) this.brainTrace.thrust.shift();

    const traceLeft = 38;
    const traceWidth = width - traceLeft - 4;
    const turnLaneY = traceTop + 8;
    const thrustLaneY = traceTop + 20;
    ctx.save();
    ctx.strokeStyle = 'rgba(151, 255, 201, 0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, traceTop - 3);
    ctx.lineTo(width - 4, traceTop - 3);
    ctx.stroke();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = 'rgba(151, 255, 201, 0.12)';
    ctx.beginPath();
    ctx.moveTo(traceLeft, turnLaneY);
    ctx.lineTo(width - 4, turnLaneY);
    ctx.moveTo(traceLeft, thrustLaneY + 3);
    ctx.lineTo(width - 4, thrustLaneY + 3);
    ctx.stroke();
    ctx.setLineDash([]);
    this.drawLabel(
      ctx,
      'TURN',
      4,
      turnLaneY,
      'rgba(105, 239, 209, 0.78)',
      'left',
      '600 7.4px "JetBrains Mono Variable", monospace',
    );
    this.drawLabel(
      ctx,
      'THRUST',
      4,
      thrustLaneY,
      'rgba(200, 255, 109, 0.76)',
      'left',
      '600 7.4px "JetBrains Mono Variable", monospace',
    );

    const drawTrace = (values, yFor, color) => {
      if (!values.length) return;
      ctx.beginPath();
      values.forEach((value, index) => {
        const x =
          traceLeft + (index / Math.max(1, values.length - 1)) * traceWidth;
        const y = yFor(value);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.shadowBlur = 0;
      const lastX =
        traceLeft +
        ((values.length - 1) / Math.max(1, values.length - 1)) * traceWidth;
      const lastY = yFor(values[values.length - 1]);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 1.5, 0, Math.PI * 2);
      ctx.fill();
    };
    drawTrace(
      this.brainTrace.turn,
      (value) => turnLaneY - Math.max(-1, Math.min(1, value)) * 3.3,
      'rgba(105, 239, 209, 0.78)',
    );
    drawTrace(
      this.brainTrace.thrust,
      (value) => thrustLaneY + 3 - Math.max(0, Math.min(1, value)) * 5.6,
      'rgba(200, 255, 109, 0.74)',
    );
    ctx.restore();

    const dominant = inputs
      .filter((input) =>
        ['food', 'hazard', 'worm', 'chomper'].includes(input.kind),
      )
      .reduce((best, input) => (input.value > best.value ? input : best));
    this.setText(this.brainDominant, dominant.label);
    this.setText(this.brainDominantValue, formatFraction(dominant.value));
    this.brainDominant.style.color = dominant.value > 0.01 ? dominant.color : '';
    this.setText(this.brainHiddenMean, formatFraction(meanHidden));
    this.setText(this.brainActiveLinks, String(activeConnections.length));
    this.setText(this.brainTotalLinks, `/${connections.length}`);
    this.setText(
      this.brainArchitecture,
      hiddenDepth > 0
        ? `${inputLayout.length} → ${hiddenDepth}L · ${hiddenCount}H → 2`
        : `${inputLayout.length} → 0H → 2`,
    );
    this.brainArchitecture.title = `${substrate.stats.activeLayerCount} of ${hiddenDepth} hidden layers populated`;
    this.brainCanvas.setAttribute(
      'aria-label',
      `Live substrate. ${hiddenDepth} hidden layers, ${substrate.stats.activeLayerCount} populated. Strongest sensor ${dominant.label} at ${formatFraction(
        dominant.value,
      )}. ${hiddenCount} active hidden nodes across ${substrate.hiddenCandidates.length} candidates. Mean hidden activation ${formatFraction(
        meanHidden,
      )}. ${activeConnections.length} of ${connections.length} synapses active.`,
    );
  }

  drawNode(ctx, x, y, radius, color, alpha) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 4.4);
    glow.addColorStop(0, color);
    glow.addColorStop(0.18, `${color}aa`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * 0.28;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(1, 10, 7, 0.7)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  drawLabel(
    ctx,
    text,
    x,
    y,
    color,
    align = 'left',
    font = '500 6.2px "JetBrains Mono Variable", monospace',
  ) {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(2, 9, 6, 0.82)';
    ctx.lineWidth = 1.7;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  updateFitness(evolution, now) {
    const signature = evolution.history
      .map((entry) => `${entry.generation}:${entry.best.toFixed(1)}`)
      .join('|');
    if (signature === this.lastFitnessSignature) return;
    this.lastFitnessSignature = signature;
    this.drawFitness(evolution.history);
  }

  drawFitness(history) {
    const ctx = this.fitnessContext;
    const { width, height } = canvasSize(this.fitnessCanvas, ctx);
    ctx.clearRect(0, 0, width, height);

    const padding = { left: 24, right: 6, top: 10, bottom: 18 };
    const plotWidth = Math.max(10, width - padding.left - padding.right);
    const plotHeight = Math.max(10, height - padding.top - padding.bottom);
    const x = (index, length) =>
      padding.left +
      (length <= 1 ? plotWidth * 0.5 : (index / (length - 1)) * plotWidth);

    ctx.save();
    ctx.strokeStyle = 'rgba(151, 255, 201, 0.07)';
    ctx.lineWidth = 1;
    ctx.font = '500 6.4px "JetBrains Mono Variable", monospace';
    ctx.fillStyle = 'rgba(92, 125, 109, 0.7)';
    for (let index = 0; index <= 3; index += 1) {
      const y = padding.top + (plotHeight / 3) * index;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }
    ctx.restore();

    if (!history.length) {
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(105, 239, 209, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, padding.top + plotHeight * 0.6);
      ctx.bezierCurveTo(
        width * 0.32,
        padding.top + plotHeight * 0.68,
        width * 0.68,
        padding.top + plotHeight * 0.42,
        width - padding.right,
        padding.top + plotHeight * 0.5,
      );
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(112, 143, 127, 0.72)';
      ctx.font = '500 6.5px "JetBrains Mono Variable", monospace';
      ctx.fillText('AWAITING COHORT 01', padding.left + 4, padding.top + 10);
      ctx.restore();
      return;
    }

    const maxValue = Math.max(
      100,
      ...history.map((entry) => entry.best),
      ...history.map((entry) => entry.average),
    );
    const niceMax = Math.ceil((maxValue * 1.12) / 100) * 100;
    const y = (value) =>
      padding.top + plotHeight - Math.min(1, value / niceMax) * plotHeight;

    ctx.save();
    ctx.font = '500 6.4px "JetBrains Mono Variable", monospace';
    ctx.fillStyle = 'rgba(92, 125, 109, 0.72)';
    ctx.textAlign = 'right';
    ctx.fillText(formatInteger(niceMax), padding.left - 5, padding.top + 3);
    ctx.fillText(formatInteger(niceMax / 2), padding.left - 5, padding.top + plotHeight / 2 + 3);
    ctx.fillText('0', padding.left - 5, padding.top + plotHeight + 2);
    ctx.textAlign = 'left';
    const tickCount = Math.min(4, history.length);
    for (let index = 0; index < tickCount; index += 1) {
      const historyIndex =
        tickCount === 1 ? 0 : Math.round((index / (tickCount - 1)) * (history.length - 1));
      const entry = history[historyIndex];
      const tickX = x(historyIndex, history.length);
      ctx.fillStyle = 'rgba(92, 125, 109, 0.62)';
      ctx.fillText(`G${String(entry.generation).padStart(2, '0')}`, tickX - 4, height - 4);
    }
    ctx.restore();

    const bestPoints = history.map((entry, index) => ({
      x: x(index, history.length),
      y: y(entry.best),
    }));
    const averagePoints = history.map((entry, index) => ({
      x: x(index, history.length),
      y: y(entry.average),
    }));

    const area = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotHeight);
    area.addColorStop(0, 'rgba(200, 255, 109, 0.14)');
    area.addColorStop(1, 'rgba(200, 255, 109, 0)');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bestPoints[0].x, padding.top + plotHeight);
    for (const point of bestPoints) ctx.lineTo(point.x, point.y);
    ctx.lineTo(bestPoints[bestPoints.length - 1].x, padding.top + plotHeight);
    ctx.closePath();
    ctx.fillStyle = area;
    ctx.fill();

    ctx.beginPath();
    averagePoints.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = 'rgba(105, 239, 209, 0.64)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    bestPoints.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = '#c8ff6d';
    ctx.lineWidth = 1.3;
    ctx.shadowColor = 'rgba(200, 255, 109, 0.65)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const last = bestPoints[bestPoints.length - 1];
    ctx.fillStyle = '#c8ff6d';
    ctx.beginPath();
    ctx.arc(last.x, last.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 255, 109, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

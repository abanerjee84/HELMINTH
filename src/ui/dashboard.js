import { CONFIG } from '../config.js';

const numberFormat = new Intl.NumberFormat('en-US');

function formatInteger(value) {
  return numberFormat.format(Math.round(value || 0));
}

function formatTimer(seconds) {
  const clamped = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(clamped / 60);
  const remainder = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatFraction(value) {
  return (value ?? 0).toFixed(2);
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

function foodColor() {
  return '#b9ff68';
}

function hazardColor() {
  return '#ff6e9b';
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
    this.leaderEnergy = document.getElementById('leaderEnergy');
    this.leaderEnergyBar = document.getElementById('leaderEnergyBar');
    this.standings = document.getElementById('standings');
    this.idlePrompt = document.getElementById('idlePrompt');
    this.toast = document.getElementById('generationToast');
    this.toastTitle = document.getElementById('toastTitle');
    this.toastDetail = document.getElementById('toastDetail');
    this.cppnSignature = document.getElementById('cppnSignature');
    this.brainNodeCount = document.getElementById('brainNodeCount');
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
    this.running = false;
  }

  resetState() {
    this.lastDomUpdate = -Infinity;
    this.lastBrainDraw = -Infinity;
    this.lastFitnessSignature = '__reset__';
    this.lastStandings = '';
    this.lastToastGeneration = 0;
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
    this.setText(this.genTime, formatTimer(evolution.timeLeft));
    const progress = intermission
      ? 100
      : Math.min(100, (evolution.elapsed / CONFIG.episodeSeconds) * 100);
    this.genProgress.style.width = `${progress.toFixed(2)}%`;

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
      this.setText(this.leaderTime, `${worm.age.toFixed(0)}s`);
      const energyPercent = Math.round((worm.energy / worm.maxEnergy) * 100);
      this.setText(this.leaderEnergy, `${energyPercent}%`);
      this.leaderEnergyBar.style.width = `${energyPercent}%`;

      this.setText(this.cppnSignature, `CPPN ${leader.substrate.stats.signature.replaceAll(' · ', ' · ')}`);
      this.setText(
        this.brainNodeCount,
        `${leader.genome.nodes.length} NODES`,
      );
      this.setText(
        this.brainLinkCount,
        `${leader.substrate.connections.length} SYNAPSES`,
      );
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
    this.drawBrain(leader, now / 1000);
  }

  drawBrain(agent, time) {
    const ctx = this.brainContext;
    const { width, height } = canvasSize(this.brainCanvas, ctx);
    ctx.clearRect(0, 0, width, height);

    const worm = agent.worm;
    const substrate = agent.substrate;
    const cx = width * 0.5;
    const cy = height * 0.52;
    const sx = width * 0.34;
    const sy = height * 0.31;

    const project = (node) => ({
      x: cx + node.x * sx,
      y: cy - node.y * sy,
    });

    const inputs = substrate.inputLayout.map((node, index) => ({
      ...node,
      index,
      point: project(node),
      value: worm.sensorValues[index] ?? 0,
    }));
    const hidden = substrate.hiddenLayout.map((node, index) => ({
      ...node,
      index,
      point: project(node),
      value: worm.activations.hidden[index] ?? 0,
    }));
    const outputs = substrate.outputLayout.map((node, index) => ({
      ...node,
      index,
      point: project(node),
      value: worm.activations.outputs[index] ?? 0,
    }));

    const clock = time;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sorted = [...substrate.connections].sort(
      (a, b) => Math.abs(a.weight) - Math.abs(b.weight),
    );
    const shownConnections = sorted.slice(-68);

    for (const connection of shownConnections) {
      const source =
        connection.fromKind === 'input'
          ? inputs[connection.from]
          : hidden[connection.from];
      const target =
        connection.toKind === 'hidden'
          ? hidden[connection.to]
          : outputs[connection.to];
      if (!source || !target) continue;
      const strength = Math.abs(connection.weight);
      const active = 0.4 + source.value * 0.6;
      const positive = connection.weight >= 0;
      ctx.strokeStyle = positive
        ? `rgba(105, 239, 209, ${Math.min(0.34, 0.045 + strength * 0.07) * active})`
        : `rgba(255, 110, 155, ${Math.min(0.3, 0.04 + strength * 0.06) * active})`;
      ctx.lineWidth = 0.35 + Math.min(1.2, strength * 0.32);
      ctx.beginPath();
      ctx.moveTo(source.point.x, source.point.y);
      ctx.lineTo(target.point.x, target.point.y);
      ctx.stroke();
    }

    const pulseCandidates = shownConnections
      .filter((connection) => Math.abs(connection.weight) > 0.5)
      .slice(-16);
    pulseCandidates.forEach((connection, index) => {
      const source =
        connection.fromKind === 'input'
          ? inputs[connection.from]
          : hidden[connection.from];
      const target =
        connection.toKind === 'hidden'
          ? hidden[connection.to]
          : outputs[connection.to];
      if (!source || !target) return;
      const phase = (clock * 0.34 + index * 0.12) % 1;
      const px = source.point.x + (target.point.x - source.point.x) * phase;
      const py = source.point.y + (target.point.y - source.point.y) * phase;
      const alpha = Math.sin(phase * Math.PI) * 0.62;
      ctx.fillStyle =
        connection.weight >= 0
          ? `rgba(154, 255, 223, ${alpha})`
          : `rgba(255, 154, 183, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, 1.1 + Math.abs(connection.weight) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    for (const input of inputs) {
      const color =
        input.kind === 'food'
          ? foodColor()
          : input.kind === 'hazard'
            ? hazardColor()
            : input.kind === 'energy'
              ? '#ffc96b'
              : '#85a99a';
      const radius = 2.1 + Math.min(2.4, input.value * 2.4);
      this.drawNode(ctx, input.point.x, input.point.y, radius, color, 0.3 + input.value * 0.7);
      if (input.kind === 'food' && [0, 2, 4, 6].includes(input.index)) {
        this.drawLabel(ctx, input.label, input.point.x, input.point.y - 7, 'rgba(194, 232, 207, 0.54)');
      } else if (input.kind === 'energy') {
        this.drawLabel(ctx, 'E', input.point.x + 6, input.point.y, 'rgba(255, 201, 107, 0.68)');
      } else if (input.kind === 'bias') {
        this.drawLabel(ctx, 'B', input.point.x + 6, input.point.y, 'rgba(133, 169, 154, 0.5)');
      }
    }

    for (const node of hidden) {
      const radius = 2.35 + Math.min(2.1, Math.abs(node.value) * 2.1);
      this.drawNode(ctx, node.point.x, node.point.y, radius, '#69efd1', 0.45);
    }

    for (const output of outputs) {
      this.drawNode(ctx, output.point.x, output.point.y, 4, '#c8ff6d', 0.78);
      this.drawLabel(
        ctx,
        output.label,
        output.point.x,
        output.point.y + 11,
        'rgba(216, 247, 216, 0.72)',
        'center',
      );
    }
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

  drawLabel(ctx, text, x, y, color, align = 'left') {
    ctx.save();
    ctx.font = '500 6.2px "JetBrains Mono Variable", monospace';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
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

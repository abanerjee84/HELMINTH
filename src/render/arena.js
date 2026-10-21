import * as THREE from 'three';
import { CONFIG, WORLD } from '../config.js';
import { mulberry32 } from '../sim/random.js';

const COLORS = {
  clear: '#050c0b',
  acid: '#c8ff6d',
  aqua: '#69efd1',
  food: '#b9ff68',
  hazard: '#ff5f8f',
  ink: '#04110d',
};

function makeCanvas(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function makeRadialTexture(inner, mid, outer, size = 128) {
  const { canvas, ctx } = makeCanvas(size);
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.28, mid);
  gradient.addColorStop(0.64, outer);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makeFoodTexture() {
  const { canvas, ctx } = makeCanvas(128);
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, 'rgba(255,255,236,1)');
  glow.addColorStop(0.18, 'rgba(220,255,170,0.98)');
  glow.addColorStop(0.35, 'rgba(172,255,100,0.38)');
  glow.addColorStop(0.7, 'rgba(120,255,90,0.06)');
  glow.addColorStop(1, 'rgba(100,255,80,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);

  ctx.strokeStyle = 'rgba(236,255,196,0.75)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(64, 64, 18, 0, Math.PI * 2);
  ctx.stroke();

  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    ctx.fillStyle = 'rgba(227,255,185,0.82)';
    ctx.beginPath();
    ctx.arc(64 + Math.cos(angle) * 11, 64 + Math.sin(angle) * 11, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeHazardTexture() {
  const { canvas, ctx } = makeCanvas(256);
  const rng = mulberry32(731);

  const base = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  base.addColorStop(0, 'rgba(255,188,199,0.6)');
  base.addColorStop(0.14, 'rgba(255,95,143,0.5)');
  base.addColorStop(0.44, 'rgba(156,45,91,0.24)');
  base.addColorStop(0.76, 'rgba(101,32,71,0.07)');
  base.addColorStop(1, 'rgba(40,10,30,0)');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  ctx.globalCompositeOperation = 'lighter';
  for (let index = 0; index < 32; index += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = 20 + rng() * 82;
    const x = 128 + Math.cos(angle) * radius;
    const y = 128 + Math.sin(angle) * radius;
    const blob = ctx.createRadialGradient(x, y, 0, x, y, 8 + rng() * 22);
    blob.addColorStop(0, `rgba(255,${90 + rng() * 60},${130 + rng() * 50},${0.05 + rng() * 0.09})`);
    blob.addColorStop(1, 'rgba(255,60,120,0)');
    ctx.fillStyle = blob;
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(255,130,165,0.13)';
  for (let index = 0; index < 4; index += 1) {
    ctx.beginPath();
    ctx.arc(128, 128, 54 + index * 15 + rng() * 7, 0, Math.PI * 2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function circleGeometry(radius = 1, segments = 24) {
  return new THREE.CircleGeometry(radius, segments);
}

function makeRibbonGeometry(segmentCount) {
  const positions = new Float32Array(segmentCount * 2 * 3);
  const colors = new Float32Array(segmentCount * 2 * 3);
  const indices = [];

  for (let index = 0; index < segmentCount - 1; index += 1) {
    const left = index * 2;
    const right = left + 1;
    const nextLeft = left + 2;
    const nextRight = left + 3;
    indices.push(left, right, nextLeft, right, nextRight, nextLeft);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(WORLD.width * 0.5, WORLD.height * 0.5, 0),
    WORLD.width,
  );
  return geometry;
}

function makeTrailGeometry(maxPoints = 120) {
  const positions = new Float32Array(maxPoints * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(WORLD.width * 0.5, WORLD.height * 0.5, 0),
    WORLD.width,
  );
  return { geometry, positions, maxPoints };
}

function makeCirclePoints(radius, segments = 64) {
  const points = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function colorValue(color, amount = 1) {
  return new THREE.Color(color).multiplyScalar(amount);
}

class WormVisual {
  constructor(agent, shared) {
    this.agent = agent;
    this.shared = shared;
    this.baseColor = new THREE.Color(agent.color);
    this.deathFade = 1;
    this.hidden = false;

    const group = new THREE.Group();
    group.position.set(0, 0, 0);
    this.group = group;

    const segments = agent.worm.body.length;

    this.trail = makeTrailGeometry();
    this.trailMaterial = new THREE.LineBasicMaterial({
      color: this.baseColor,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.trailLine = new THREE.Line(this.trail.geometry, this.trailMaterial);
    this.trailLine.frustumCulled = false;
    this.trailLine.renderOrder = 18;

    this.outlineGeometry = makeRibbonGeometry(segments);
    this.outlineMaterial = new THREE.MeshBasicMaterial({
      color: COLORS.ink,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this.outlineMesh = new THREE.Mesh(this.outlineGeometry, this.outlineMaterial);
    this.outlineMesh.frustumCulled = false;
    this.outlineMesh.renderOrder = 20;

    this.bodyGeometry = makeRibbonGeometry(segments);
    this.bodyMaterial = new THREE.MeshBasicMaterial({
      color: this.baseColor,
      vertexColors: true,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this.bodyMesh = new THREE.Mesh(this.bodyGeometry, this.bodyMaterial);
    this.bodyMesh.frustumCulled = false;
    this.bodyMesh.renderOrder = 21;

    this.headMaterial = new THREE.MeshBasicMaterial({
      color: this.baseColor.clone().lerp(new THREE.Color('#ffffff'), 0.22),
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this.headMesh = new THREE.Mesh(shared.headGeometry, this.headMaterial);
    this.headMesh.renderOrder = 23;
    this.headMesh.scale.setScalar(agent.worm.config.worm.headRadius * 0.92);

    const haloTexture = shared.glowTexture;
    this.haloMaterial = new THREE.SpriteMaterial({
      map: haloTexture,
      color: this.baseColor,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.halo = new THREE.Sprite(this.haloMaterial);
    this.halo.scale.setScalar(72);
    this.halo.renderOrder = 19;

    this.eyeMaterial = new THREE.MeshBasicMaterial({
      color: '#062019',
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this.eyeLeft = new THREE.Mesh(shared.eyeGeometry, this.eyeMaterial);
    this.eyeRight = new THREE.Mesh(shared.eyeGeometry, this.eyeMaterial);
    this.eyeLeft.scale.setScalar(2.05);
    this.eyeRight.scale.setScalar(2.05);
    this.eyeLeft.renderOrder = 24;
    this.eyeRight.renderOrder = 24;

    this.hairGeometry = new THREE.BufferGeometry();
    this.hairGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(Math.ceil(segments / 2) * 2 * 3), 3),
    );
    this.hairMaterial = new THREE.LineBasicMaterial({
      color: this.baseColor,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.hairLine = new THREE.LineSegments(this.hairGeometry, this.hairMaterial);
    this.hairLine.frustumCulled = false;
    this.hairLine.renderOrder = 22;

    this.leaderMaterial = shared.leaderMaterial.clone();
    this.leaderRing = new THREE.Mesh(shared.leaderGeometry, this.leaderMaterial);
    this.leaderRing.renderOrder = 25;
    this.leaderRing.visible = false;

    group.add(
      this.trailLine,
      this.halo,
      this.outlineMesh,
      this.bodyMesh,
      this.hairLine,
      this.headMesh,
      this.eyeLeft,
      this.eyeRight,
      this.leaderRing,
    );
    this.colorCache = new THREE.Color();
  }

  update(time, dt, isLeader) {
    const worm = this.agent.worm;
    const alive = worm.alive;

    if (alive) {
      this.deathFade = 1;
    } else {
      this.deathFade = Math.max(0, this.deathFade - dt * 1.8);
    }

    if (this.deathFade <= 0.01 && !this.hidden) {
      this.group.visible = false;
      this.hidden = true;
      return;
    }

    this.hidden = false;
    this.group.visible = true;

    const fade = this.deathFade;
    const leaderBoost = isLeader ? 1 : 0;
    const eatPulse = worm.ateRecently;
    const segments = worm.body.length;

    const centers = [];
    const normals = [];
    const radii = [];
    const wiggleAmplitude = 0.7 + Math.min(worm.speed / 150, 1) * 1.4;

    for (let index = 0; index < segments; index += 1) {
      const point = worm.body[index];
      const previous = worm.body[Math.max(0, index - 1)];
      const next = worm.body[Math.min(segments - 1, index + 1)];
      let tangentX = next.x - previous.x;
      let tangentY = next.y - previous.y;
      const tangentLength = Math.hypot(tangentX, tangentY) || 1;
      tangentX /= tangentLength;
      tangentY /= tangentLength;
      const normalX = -tangentY;
      const normalY = tangentX;
      const progress = index / (segments - 1);
      const wave =
        Math.sin(time * 8.2 - index * 0.7 + this.agent.index * 0.3) *
        wiggleAmplitude *
        Math.min(1, progress * 3.2) *
        (alive ? 1 : 0.35);
      centers.push({
        x: point.x + normalX * wave,
        y: point.y + normalY * wave,
      });
      normals.push({ x: normalX, y: normalY });
      const taper = Math.pow(progress, 0.78);
      const radius = worm.config.worm.headRadius * (1 - taper * 0.62);
      radii.push(radius * (1 + eatPulse * 0.08 * (1 - progress)));
    }

    this.updateRibbon(this.outlineGeometry, centers, normals, radii, 2.6);
    this.updateRibbon(this.bodyGeometry, centers, normals, radii, 0);

    const colors = this.bodyGeometry.getAttribute('color');
    for (let index = 0; index < segments; index += 1) {
      const progress = index / (segments - 1);
      const shade = 0.95 - progress * 0.4;
      const headGlow = index === 0 ? 0.12 : 0;
      colors.setXYZ(index * 2, shade * 1.04 + headGlow, shade * 1.04 + headGlow, shade * 1.04 + headGlow);
      colors.setXYZ(index * 2 + 1, shade * 0.76, shade * 0.76, shade * 0.76);
    }
    colors.needsUpdate = true;

    this.headMesh.position.set(worm.x, worm.y, 0);
    this.headMesh.scale.setScalar(
      worm.config.worm.headRadius * (0.92 + eatPulse * 0.18 + leaderBoost * 0.04),
    );
    this.headMaterial.color.copy(this.baseColor).lerp(new THREE.Color('#ffffff'), 0.22);

    const eyeDistance = 5.2;
    const eyeWide = 0.63;
    this.eyeLeft.position.set(
      worm.x + Math.cos(worm.heading - eyeWide) * eyeDistance,
      worm.y + Math.sin(worm.heading - eyeWide) * eyeDistance,
      0,
    );
    this.eyeRight.position.set(
      worm.x + Math.cos(worm.heading + eyeWide) * eyeDistance,
      worm.y + Math.sin(worm.heading + eyeWide) * eyeDistance,
      0,
    );

    this.halo.position.set(worm.x, worm.y, 0);
    this.halo.scale.setScalar(isLeader ? 96 + Math.sin(time * 4.2) * 8 : 64);

    this.leaderRing.visible = isLeader && alive;
    this.leaderRing.position.set(worm.x, worm.y, 0);
    this.leaderRing.scale.setScalar(24 + Math.sin(time * 4.4) * 2.4);
    this.leaderRing.rotation.z = time * 0.7;

    const hairPositions = this.hairGeometry.getAttribute('position');
    let hairIndex = 0;
    for (let index = 3; index < segments - 1; index += 2) {
      const side = index % 4 === 3 ? 1 : -1;
      const center = centers[index];
      const normal = normals[index];
      const baseX = center.x + normal.x * side * (radii[index] + 1);
      const baseY = center.y + normal.y * side * (radii[index] + 1);
      const sway = Math.sin(time * 5.2 + index * 0.8) * 1.4;
      const length = 4.2 - (index / segments) * 1.3;
      const outX = normal.x * side * length + Math.cos(worm.heading) * sway;
      const outY = normal.y * side * length + Math.sin(worm.heading) * sway;
      hairPositions.setXYZ(hairIndex, baseX, baseY, 0);
      hairPositions.setXYZ(hairIndex + 1, baseX + outX, baseY + outY, 0);
      hairIndex += 2;
    }
    hairPositions.needsUpdate = true;
    this.hairGeometry.setDrawRange(0, hairIndex);

    this.updateTrail(alive, isLeader);
    this.applyOpacity(fade, isLeader, eatPulse);
  }

  updateRibbon(geometry, centers, normals, radii, extra) {
    const positions = geometry.getAttribute('position');
    const count = centers.length;
    for (let index = 0; index < count; index += 1) {
      const center = centers[index];
      const normal = normals[index];
      const radius = radii[index] + extra;
      positions.setXYZ(
        index * 2,
        center.x + normal.x * radius,
        center.y + normal.y * radius,
        0,
      );
      positions.setXYZ(
        index * 2 + 1,
        center.x - normal.x * radius,
        center.y - normal.y * radius,
        0,
      );
    }
    positions.needsUpdate = true;
  }

  updateTrail(alive, isLeader) {
    const trail = this.agent.worm.trail;
    if (!trail.length) return;
    const positions = this.trail.geometry.getAttribute('position');
    const maxPoints = this.trail.maxPoints;
    const offset = Math.max(0, trail.length - maxPoints);
    const count = Math.min(trail.length, maxPoints);
    for (let index = 0; index < count; index += 1) {
      const point = trail[offset + index];
      positions.setXYZ(index, point.x, point.y, 0);
    }
    positions.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, count);
    this.trailBaseOpacity = alive ? (isLeader ? 0.34 : 0.1) : 0.04;
  }

  applyOpacity(fade, isLeader, eatPulse) {
    this.outlineMaterial.opacity = 0.9 * fade;
    this.bodyMaterial.opacity = 0.98 * fade;
    this.headMaterial.opacity = fade;
    this.haloMaterial.opacity = ((isLeader ? 0.48 : 0.22) + eatPulse * 0.35) * fade;
    this.eyeMaterial.opacity = fade;
    this.hairMaterial.opacity = 0.34 * fade;
    this.trailMaterial.opacity = (this.trailBaseOpacity ?? 0.1) * fade;
    this.leaderMaterial.opacity = 0.72 * fade;
  }

  dispose() {
    this.bodyGeometry.dispose();
    this.outlineGeometry.dispose();
    this.trail.geometry.dispose();
    this.hairGeometry.dispose();
    this.trailMaterial.dispose();
    this.outlineMaterial.dispose();
    this.bodyMaterial.dispose();
    this.headMaterial.dispose();
    this.haloMaterial.dispose();
    this.eyeMaterial.dispose();
    this.hairMaterial.dispose();
    this.leaderMaterial.dispose();
  }
}

export class ArenaRenderer {
  constructor(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.clear);
    this.clockTime = 0;
    this.populationSource = null;
    this.ecologySource = null;
    this.wormVisuals = [];
    this.foodVisuals = [];
    this.hazardVisuals = [];
    this.events = [];
    this.particles = [];
    this.rings = [];
    this.motes = [];
    this.rng = mulberry32(31);
    this.leaderId = null;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.camera.position.set(WORLD.width * 0.5, WORLD.height * 0.5, 500);
    this.camera.lookAt(WORLD.width * 0.5, WORLD.height * 0.5, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(COLORS.clear, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setSize(host.clientWidth || 1, host.clientHeight || 1);
    this.renderer.domElement.setAttribute('aria-label', 'Live worm ecology arena');
    host.appendChild(this.renderer.domElement);

    this.createSharedAssets();
    this.createFloor();
    this.createMotes();
    this.createEffectPools();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  createSharedAssets() {
    this.glowTexture = makeRadialTexture(
      'rgba(255,255,255,1)',
      'rgba(180,255,210,0.52)',
      'rgba(80,255,180,0.05)',
    );
    this.foodTexture = makeFoodTexture();
    this.hazardTexture = makeHazardTexture();
    this.dotTexture = makeRadialTexture(
      'rgba(255,255,255,1)',
      'rgba(255,255,255,0.75)',
      'rgba(255,255,255,0.08)',
      64,
    );
    this.headGeometry = circleGeometry(1, 28);
    this.eyeGeometry = circleGeometry(1, 12);
    this.leaderGeometry = new THREE.RingGeometry(0.9, 1, 48);
    this.leaderMaterial = new THREE.MeshBasicMaterial({
      color: COLORS.acid,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this.foodGlowMaterial = new THREE.SpriteMaterial({
      map: this.foodTexture,
      color: COLORS.food,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.foodCoreMaterial = new THREE.SpriteMaterial({
      map: this.foodTexture,
      color: '#f0ffc9',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.hazardMaterial = new THREE.SpriteMaterial({
      map: this.hazardTexture,
      color: '#ff6a95',
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.hazardRingMaterial = new THREE.LineBasicMaterial({
      color: COLORS.hazard,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.hazardRingGeometry = makeCirclePoints(1, 72);
    this.shared = {
      headGeometry: this.headGeometry,
      eyeGeometry: this.eyeGeometry,
      leaderGeometry: this.leaderGeometry,
      leaderMaterial: this.leaderMaterial,
      glowTexture: this.glowTexture,
    };
  }

  createFloor() {
    const uniforms = {
      uTime: { value: 0 },
      uWorld: { value: new THREE.Vector2(WORLD.width, WORLD.height) },
    };

    const geometry = new THREE.PlaneGeometry(WORLD.width, WORLD.height);
    const material = new THREE.ShaderMaterial({
      uniforms,
      depthWrite: false,
      depthTest: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        uniform vec2 uWorld;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise21(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float roundedBox(vec2 p, vec2 halfSize, float radius) {
          vec2 q = abs(p) - halfSize + radius;
          return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
        }

        void main() {
          vec2 p = (vUv - 0.5) * uWorld;
          vec2 halfSize = uWorld * 0.5 - vec2(18.0);
          float sdf = roundedBox(p, halfSize, 46.0);
          float inside = 1.0 - smoothstep(-1.0, 1.0, sdf);

          vec3 outside = vec3(0.018, 0.037, 0.031);
          vec3 deep = vec3(0.020, 0.075, 0.060);
          vec3 warm = vec3(0.038, 0.095, 0.068);
          float broad = noise21(p * 0.0032 + vec2(19.0, 8.0));
          float fine = noise21(p * 0.014 - vec2(4.0, 11.0));
          vec3 floorColor = mix(deep, warm, broad * 0.8 + fine * 0.16);

          float radial = exp(-length(p * vec2(0.85, 0.7)) * 0.0028);
          floorColor += vec3(0.016, 0.08, 0.058) * radial;

          vec2 gridP = p / 74.0;
          vec2 gridF = abs(fract(gridP) - 0.5);
          float grid = smoothstep(0.477, 0.5, gridF.x) + smoothstep(0.477, 0.5, gridF.y);
          floorColor += vec3(0.18, 0.44, 0.34) * grid * 0.035;

          vec2 majorP = p / 296.0;
          vec2 majorF = abs(fract(majorP) - 0.5);
          float major = smoothstep(0.485, 0.5, majorF.x) + smoothstep(0.485, 0.5, majorF.y);
          floorColor += vec3(0.28, 0.62, 0.48) * major * 0.03;

          vec2 cell = floor(p / 37.0);
          vec2 cellLocal = fract(p / 37.0) - 0.5;
          float sparkle = step(0.954, hash21(cell));
          sparkle *= 1.0 - smoothstep(0.025, 0.075, length(cellLocal));
          sparkle *= 0.5 + 0.5 * sin(uTime * 0.7 + hash21(cell + 4.0) * 12.0);
          floorColor += vec3(0.28, 0.72, 0.53) * sparkle * 0.11;

          float border = 1.0 - smoothstep(0.0, 4.0, abs(sdf));
          float borderHaze = exp(-abs(sdf) * 0.055) * 0.45;
          float perimeter = atan(p.y, p.x);
          float runner = pow(max(0.0, sin(perimeter * 2.0 - uTime * 0.26)), 28.0);
          vec3 borderColor = vec3(0.30, 0.72, 0.55);
          vec3 borderLight = vec3(0.65, 1.0, 0.72);

          vec3 color = mix(outside, floorColor, inside);
          color += borderColor * border * 0.2;
          color += borderColor * borderHaze * inside;
          color += borderLight * runner * border * 0.55;

          vec2 safeUv = vUv;
          float vignette = smoothstep(0.28, 0.82, length((safeUv - 0.5) * vec2(1.0, 0.95)));
          color *= 1.0 - vignette * 0.38;

          float scan = 0.988 + 0.012 * sin(vUv.y * uWorld.y * 0.95);
          color *= scan;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    this.floorMaterial = material;
    this.floor = new THREE.Mesh(geometry, material);
    this.floor.position.set(WORLD.width * 0.5, WORLD.height * 0.5, -20);
    this.floor.renderOrder = -20;
    this.scene.add(this.floor);

    const vignette = document.createElement('div');
    vignette.className = 'arena-vignette';
    this.host.appendChild(vignette);
  }

  createMotes() {
    const count = 110;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = 30 + this.rng() * (WORLD.width - 60);
      positions[index * 3 + 1] = 30 + this.rng() * (WORLD.height - 60);
      positions[index * 3 + 2] = 0;
      this.motes.push({
        x: positions[index * 3],
        y: positions[index * 3 + 1],
        vx: (this.rng() - 0.5) * 2.8,
        vy: 1.2 + this.rng() * 3.5,
        phase: this.rng() * Math.PI * 2,
      });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: '#73b896',
      size: 2.2,
      transparent: true,
      opacity: 0.27,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: false,
    });
    this.moteGeometry = geometry;
    this.moteMaterial = material;
    this.motePoints = new THREE.Points(geometry, material);
    this.motePoints.renderOrder = -10;
    this.scene.add(this.motePoints);
  }

  createEffectPools() {
    for (let index = 0; index < 130; index += 1) {
      const material = new THREE.SpriteMaterial({
        map: this.dotTexture,
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 40;
      this.scene.add(sprite);
      this.particles.push({
        sprite,
        material,
        active: false,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        baseScale: 4,
        phase: 0,
      });
    }

    for (let index = 0; index < 22; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: COLORS.acid,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.leaderGeometry, material);
      mesh.visible = false;
      mesh.renderOrder = 39;
      this.scene.add(mesh);
      this.rings.push({
        mesh,
        material,
        active: false,
        life: 0,
        maxLife: 0.7,
        scale: 1,
      });
    }
  }

  ingest(events) {
    for (const event of events) {
      if (event.type === 'eat') {
        this.burst(event.x, event.y, COLORS.food, 5, 64, 0.45);
        this.ring(event.x, event.y, COLORS.food, 20, 0.36);
      } else if (event.type === 'death') {
        this.burst(event.x, event.y, event.color, 16, 105, 0.9);
        this.ring(event.x, event.y, event.color, 26, 0.6);
      } else if (event.type === 'hazard') {
        this.burst(event.x, event.y, COLORS.hazard, 2, 45, 0.35);
      } else if (event.type === 'generation') {
        this.ring(WORLD.width * 0.5, WORLD.height * 0.5, event.color, 160, 1.2);
      }
    }
  }

  burst(x, y, color, count, speed, life) {
    for (let index = 0; index < count; index += 1) {
      const particle = this.particles.find((candidate) => !candidate.active);
      if (!particle) return;
      const angle = this.rng() * Math.PI * 2;
      const velocity = speed * (0.28 + this.rng() * 0.72);
      particle.active = true;
      particle.sprite.visible = true;
      particle.sprite.position.set(x, y, 0);
      particle.sprite.scale.setScalar(2.5 + this.rng() * 4);
      particle.material.color.set(color);
      particle.material.opacity = 0.85;
      particle.vx = Math.cos(angle) * velocity;
      particle.vy = Math.sin(angle) * velocity;
      particle.life = life;
      particle.maxLife = life;
      particle.baseScale = 3.5 + this.rng() * 5;
      particle.phase = this.rng() * Math.PI * 2;
    }
  }

  ring(x, y, color, radius, life) {
    const effect = this.rings.find((candidate) => !candidate.active);
    if (!effect) return;
    effect.active = true;
    effect.mesh.visible = true;
    effect.mesh.position.set(x, y, 0);
    effect.mesh.scale.setScalar(8);
    effect.material.color.set(color);
    effect.material.opacity = 0.6;
    effect.life = life;
    effect.maxLife = life;
    effect.scale = radius;
  }

  syncEnvironment(ecology) {
    if (this.ecologySource === ecology) {
      this.updateEnvironmentObjects();
      return;
    }

    for (const visual of this.foodVisuals) {
      this.scene.remove(visual.group);
    }
    for (const visual of this.hazardVisuals) {
      this.scene.remove(visual.group);
    }
    this.foodVisuals = [];
    this.hazardVisuals = [];
    this.ecologySource = ecology;

    for (const hazard of ecology.hazards) {
      const group = new THREE.Group();
      const glow = new THREE.Sprite(this.hazardMaterial);
      glow.scale.setScalar(hazard.radius * 2.8);
      group.add(glow);
      const ring = new THREE.Line(this.hazardRingGeometry, this.hazardRingMaterial);
      ring.scale.setScalar(hazard.radius);
      group.add(ring);
      group.position.set(hazard.x, hazard.y, -8);
      group.renderOrder = -8;
      this.scene.add(group);
      this.hazardVisuals.push({ hazard, group, glow, ring });
    }

    for (const food of ecology.foods) {
      const group = new THREE.Group();
      const glow = new THREE.Sprite(this.foodGlowMaterial);
      glow.scale.setScalar(47);
      glow.renderOrder = 0;
      const core = new THREE.Sprite(this.foodCoreMaterial);
      core.scale.setScalar(18);
      core.renderOrder = 1;
      group.add(glow, core);
      group.position.set(food.x, food.y, 0);
      this.scene.add(group);
      this.foodVisuals.push({ food, group, glow, core });
    }

    this.updateEnvironmentObjects();
  }

  updateEnvironmentObjects() {
    for (const visual of this.foodVisuals) {
      visual.group.visible = visual.food.active;
      visual.group.position.x = visual.food.x;
      visual.group.position.y = visual.food.y;
    }
  }

  syncPopulation(agents) {
    if (this.populationSource === agents) return;
    for (const visual of this.wormVisuals) {
      this.scene.remove(visual.group);
      visual.dispose();
    }
    this.wormVisuals = agents.map((agent) => {
      const visual = new WormVisual(agent, this.shared);
      this.scene.add(visual.group);
      return visual;
    });
    this.populationSource = agents;
  }

  setLeader(agent) {
    this.leaderId = agent?.id ?? null;
  }

  resize() {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const paddedWidth = WORLD.width + 28;
    const paddedHeight = WORLD.height + 28;
    let viewWidth;
    let viewHeight;

    if (aspect > paddedWidth / paddedHeight) {
      viewHeight = paddedHeight;
      viewWidth = viewHeight * aspect;
    } else {
      viewWidth = paddedWidth;
      viewHeight = viewWidth / aspect;
    }

    this.camera.left = -viewWidth * 0.5;
    this.camera.right = viewWidth * 0.5;
    this.camera.top = viewHeight * 0.5;
    this.camera.bottom = -viewHeight * 0.5;
    this.camera.updateProjectionMatrix();
  }

  update(dt, evolution) {
    const safeDt = Math.min(dt, 0.05);
    this.clockTime += safeDt;
    this.floorMaterial.uniforms.uTime.value = this.clockTime;

    this.syncEnvironment(evolution.ecology);
    this.syncPopulation(evolution.agents);
    this.setLeader(evolution.leader);

    this.updateEnvironmentAnimation();
    this.updateMotes(safeDt);
    this.updateParticles(safeDt);
    this.updateRings(safeDt);

    for (const visual of this.wormVisuals) {
      visual.update(this.clockTime, safeDt, visual.agent.id === this.leaderId);
    }

    this.renderer.render(this.scene, this.camera);
  }

  updateEnvironmentAnimation() {
    for (const visual of this.foodVisuals) {
      if (!visual.food.active) continue;
      const pulse = 0.88 + Math.sin(this.clockTime * 2.4 + visual.food.phase) * 0.12;
      visual.glow.scale.setScalar(47 * pulse);
      visual.core.scale.setScalar(18 * (1.03 - pulse * 0.04));
    }

    for (const visual of this.hazardVisuals) {
      const pulse = 1 + Math.sin(this.clockTime * 0.9 + visual.hazard.phase) * 0.035;
      visual.glow.scale.setScalar(visual.hazard.radius * 2.8 * pulse);
      visual.ring.rotation.z = this.clockTime * 0.05 + visual.hazard.phase;
      visual.ring.material.opacity = 0.18 + Math.sin(this.clockTime + visual.hazard.phase) * 0.06;
    }
  }

  updateMotes(dt) {
    const positions = this.moteGeometry.getAttribute('position');
    for (let index = 0; index < this.motes.length; index += 1) {
      const mote = this.motes[index];
      mote.x += mote.vx * dt;
      mote.y += mote.vy * dt;
      if (mote.x < 24) mote.x = WORLD.width - 24;
      if (mote.x > WORLD.width - 24) mote.x = 24;
      if (mote.y > WORLD.height - 24) mote.y = 24;
      positions.setXYZ(index, mote.x, mote.y, 0);
    }
    positions.needsUpdate = true;
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        particle.sprite.visible = false;
        particle.material.opacity = 0;
        continue;
      }
      particle.sprite.position.x += particle.vx * dt;
      particle.sprite.position.y += particle.vy * dt;
      particle.vx *= Math.exp(-2.2 * dt);
      particle.vy *= Math.exp(-2.2 * dt);
      const progress = 1 - particle.life / particle.maxLife;
      particle.material.opacity = (1 - progress) * 0.82;
      const scale =
        particle.baseScale * (0.55 + progress * 1.2) +
        Math.sin(this.clockTime * 6 + particle.phase) * 0.5;
      particle.sprite.scale.setScalar(scale);
    }
  }

  updateRings(dt) {
    for (const effect of this.rings) {
      if (!effect.active) continue;
      effect.life -= dt;
      if (effect.life <= 0) {
        effect.active = false;
        effect.mesh.visible = false;
        effect.material.opacity = 0;
        continue;
      }
      const progress = 1 - effect.life / effect.maxLife;
      const scale = 8 + progress * effect.scale;
      effect.mesh.scale.setScalar(scale);
      effect.material.opacity = (1 - progress) * 0.55;
    }
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }
}

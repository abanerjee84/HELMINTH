import { WORLD } from '../config.js';

const TWO_PI = Math.PI * 2;
const WALL_MARGIN = 26;

function wrapAngle(angle) {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= TWO_PI;
  while (wrapped < -Math.PI) wrapped += TWO_PI;
  return wrapped;
}

function deflect(worm, nx, ny) {
  const collision = worm.config.worm.collision;
  const awayAngle = Math.atan2(ny, nx);
  const delta = wrapAngle(awayAngle - worm.heading);
  worm.heading = wrapAngle(worm.heading + delta * collision.response);
}

function registerImpact(worm, isSelf) {
  if (worm.collisionCooldown > 0) return;
  const collision = worm.config.worm.collision;
  worm.collisionCooldown = collision.cooldown;
  worm.collisionHits += 1;
  if (isSelf) {
    worm.selfCollisionHits += 1;
  } else {
    worm.otherCollisionHits += 1;
  }
  worm.speed *= collision.impactSpeedLoss;
  worm.throttle *= collision.impactSpeedLoss;
}

function overlapNormal(a, b) {
  let nx = a.x - b.x;
  let ny = a.y - b.y;
  const distance = Math.hypot(nx, ny);
  if (distance > 0.0001) {
    nx /= distance;
    ny /= distance;
  } else {
    const fallback = a.heading + Math.PI * 0.5;
    nx = Math.cos(fallback);
    ny = Math.sin(fallback);
  }
  return { nx, ny, distance };
}

function findDeepestBodyOverlap(head, bodyWorm, startSegment) {
  let best = null;

  for (let index = startSegment; index < bodyWorm.body.length - 1; index += 1) {
    const a = bodyWorm.body[index];
    const b = bodyWorm.body[index + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lengthSq = abx * abx + aby * aby;
    const t = lengthSq > 0.0001
      ? Math.max(0, Math.min(1, ((head.x - a.x) * abx + (head.y - a.y) * aby) / lengthSq))
      : 0;
    const pointX = a.x + abx * t;
    const pointY = a.y + aby * t;
    let nx = head.x - pointX;
    let ny = head.y - pointY;
    const distance = Math.hypot(nx, ny);

    if (distance > 0.0001) {
      nx /= distance;
      ny /= distance;
    } else {
      const inverseLength = 1 / (Math.sqrt(lengthSq) || 1);
      nx = -aby * inverseLength;
      ny = abx * inverseLength;
    }

    const radius =
      bodyWorm.collisionRadii[index] +
      (bodyWorm.collisionRadii[index + 1] - bodyWorm.collisionRadii[index]) * t;
    const minimum = head.collisionRadii[0] + radius;
    const penetration = minimum - distance;
    if (penetration > 0 && (!best || penetration > best.penetration)) {
      best = { nx, ny, penetration };
    }
  }

  return best;
}

function resolveSelf(worm) {
  const guard = worm.config.worm.collision.selfGuardSegments;
  const overlap = findDeepestBodyOverlap(worm, worm, guard);
  if (!overlap) return;

  worm.x += overlap.nx * overlap.penetration;
  worm.y += overlap.ny * overlap.penetration;
  worm.syncBody();
  deflect(worm, overlap.nx, overlap.ny);
  registerImpact(worm, true);
}

function resolveHeadHead(a, b) {
  const { nx, ny, distance } = overlapNormal(a, b);
  const minimum = a.collisionRadii[0] + b.collisionRadii[0];
  const penetration = minimum - distance;
  if (penetration <= 0) return;

  const push = penetration * 0.5;
  a.translate(nx * push, ny * push);
  b.translate(-nx * push, -ny * push);
  deflect(a, nx, ny);
  deflect(b, -nx, -ny);
  registerImpact(a, false);
  registerImpact(b, false);
}

function resolveHeadBody(head, bodyWorm) {
  const overlap = findDeepestBodyOverlap(head, bodyWorm, 0);
  if (!overlap) return;

  head.translate(
    overlap.nx * overlap.penetration,
    overlap.ny * overlap.penetration,
  );
  deflect(head, overlap.nx, overlap.ny);
  registerImpact(head, false);
}

function contain(worm) {
  let dx = 0;
  let dy = 0;
  if (worm.x < WALL_MARGIN) dx = WALL_MARGIN - worm.x;
  else if (worm.x > WORLD.width - WALL_MARGIN) dx = WORLD.width - WALL_MARGIN - worm.x;
  if (worm.y < WALL_MARGIN) dy = WALL_MARGIN - worm.y;
  else if (worm.y > WORLD.height - WALL_MARGIN) dy = WORLD.height - WALL_MARGIN - worm.y;
  if (dx !== 0 || dy !== 0) worm.translate(dx, dy);
}

export function resolveWormCollisions(agents) {
  const worms = agents
    .filter((agent) => agent.worm.alive)
    .map((agent) => agent.worm);

  for (const worm of worms) {
    resolveSelf(worm);
  }

  for (let first = 0; first < worms.length; first += 1) {
    for (let second = first + 1; second < worms.length; second += 1) {
      const a = worms[first];
      const b = worms[second];
      resolveHeadHead(a, b);
      resolveHeadBody(a, b);
      resolveHeadBody(b, a);
    }
  }

  for (const worm of worms) contain(worm);
}

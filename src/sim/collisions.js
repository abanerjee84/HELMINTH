function bodyOverlap(head, bodyWorm, startSegment) {
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
    const distance = Math.hypot(head.x - pointX, head.y - pointY);
    const radius =
      bodyWorm.collisionRadii[index] +
      (bodyWorm.collisionRadii[index + 1] - bodyWorm.collisionRadii[index]) * t;
    if (distance < head.collisionRadii[0] + radius) return true;
  }

  return false;
}

function headOverlap(a, b) {
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  return distance < a.collisionRadii[0] + b.collisionRadii[0];
}

function kill(worm, cause, killed) {
  if (!worm.alive) return;
  worm.alive = false;
  worm.deathCause = cause;
  worm.collisionHits += 1;
  if (cause === 'self-collision') {
    worm.selfCollisionHits += 1;
  } else {
    worm.otherCollisionHits += 1;
  }
  killed.push(worm);
}

export function resolveWormCollisions(agents) {
  const worms = agents
    .filter((agent) => agent.worm.alive)
    .map((agent) => agent.worm);
  const killed = [];

  for (const worm of worms) {
    const guard = worm.config.worm.collision.selfGuardSegments;
    if (bodyOverlap(worm, worm, guard)) {
      kill(worm, 'self-collision', killed);
    }
  }

  for (let first = 0; first < worms.length; first += 1) {
    for (let second = first + 1; second < worms.length; second += 1) {
      const a = worms[first];
      const b = worms[second];
      if (!a.alive || !b.alive) continue;

      if (headOverlap(a, b)) {
        kill(a, 'collision', killed);
        kill(b, 'collision', killed);
        continue;
      }

      const aHit = bodyOverlap(a, b, 0);
      const bHit = bodyOverlap(b, a, 0);
      if (aHit) kill(a, 'collision', killed);
      if (bHit) kill(b, 'collision', killed);
    }
  }

  return killed;
}

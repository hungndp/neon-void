// The screenshot scenes behind ?shot=start|play|upgrade|boss|end. Each plays the real rules
// forward from a fresh world at a fixed step, steered by an autopilot, so a screenshot is a
// frame the game itself produced and the same seed always gives the same frame. The play
// pilot fights properly (keeps its distance, aims with lead, dashes out of trouble, takes its
// levels); the end pilot flies at the nearest enemy and never fires, so the swarm collects its
// due and the game-over screen is a real one. The play and boss scenes go further: they fight
// on and keep the single densest frame they pass through — a battle at its loudest, not the
// quiet that happens to follow one — by copying the world aside and restoring the best copy.

import { FIELD, STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';

// Upgrade picks, best first: the pilot builds the way the cards suggest a player should.
const UPGRADE_PRIORITY = ['split', 'damage', 'rate', 'plating', 'pierce', 'dash', 'magnet', 'speed'];

function nearestEnemy(state) {
  let best = null;
  let bestGap = Infinity;
  for (const enemy of state.enemies) {
    const gap = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
    if (gap < bestGap) {
      bestGap = gap;
      best = enemy;
    }
  }
  return best;
}

function nearestShard(state) {
  let best = null;
  let bestGap = Infinity;
  for (const shard of state.shards) {
    const gap = Math.hypot(shard.x - state.player.x, shard.y - state.player.y);
    if (gap < bestGap) {
      bestGap = gap;
      best = shard;
    }
  }
  return best;
}

/** Spend any pending levels the way the priority list says, as a player clicking cards would. */
function takeLevels(world) {
  const state = world.state;
  while (state.pendingLevels > 0 && state.choices.length > 0) {
    let index = 0;
    let bestRank = Infinity;
    state.choices.forEach((choice, at) => {
      const rank = UPGRADE_PRIORITY.indexOf(choice.id);
      if (rank !== -1 && rank < bestRank) {
        bestRank = rank;
        index = at;
      }
    });
    if (!world.applyChoice(index)) break;
  }
}

/** A competent pilot: hold range on the nearest enemy, strafe, gather shards, dash from danger. */
function pilotControl(state) {
  const player = state.player;
  const control = { moveX: 0, moveY: 0, aimX: player.x + 1, aimY: player.y, firing: false, dash: false };
  const enemy = nearestEnemy(state);
  if (enemy !== null) {
    const gap = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    const toward = Math.atan2(enemy.y - player.y, enemy.x - player.x);
    const strafe = toward + Math.PI / 2;
    let moveAngle = null;
    if (gap > 300) moveAngle = toward;
    else if (gap < 190) moveAngle = toward + Math.PI;
    else moveAngle = strafe;
    control.moveX = Math.cos(moveAngle);
    control.moveY = Math.sin(moveAngle);
    // Aim with lead: where the enemy will be when the shot arrives.
    const lead = gap / 760;
    control.aimX = enemy.x + enemy.vx * lead;
    control.aimY = enemy.y + enemy.vy * lead;
    control.firing = gap < 640;
    control.dash = gap < 105;
  } else {
    const shard = nearestShard(state);
    const target = shard ?? { x: FIELD.width / 2, y: FIELD.height / 2 };
    control.moveX = target.x - player.x;
    control.moveY = target.y - player.y;
    control.aimX = target.x;
    control.aimY = target.y;
  }
  // An enemy shot about to land is worth a dash on its own.
  if (!control.dash) {
    for (const bullet of state.enemyBullets) {
      if (Math.hypot(bullet.x - player.x, bullet.y - player.y) < 74) {
        control.dash = true;
        control.moveX = -(bullet.vx);
        control.moveY = -(bullet.vy);
      }
    }
  }
  return control;
}

/** A doomed pilot: straight at the nearest enemy, no shots, no dash. The swarm does the rest. */
function recklessControl(state) {
  const player = state.player;
  const enemy = nearestEnemy(state);
  const target = enemy ?? { x: FIELD.width / 2, y: FIELD.height / 2 };
  return {
    moveX: target.x - player.x,
    moveY: target.y - player.y,
    aimX: target.x,
    aimY: target.y,
    firing: false,
    dash: false,
  };
}

/** An idle drift for the title backdrop: a slow patrol that never fires. */
function patrolControl(state) {
  const player = state.player;
  const angle = state.time * 0.45;
  return {
    moveX: Math.cos(angle),
    moveY: Math.sin(angle) * 0.6,
    aimX: player.x + Math.cos(angle),
    aimY: player.y + Math.sin(angle),
    firing: false,
    dash: false,
  };
}

function run(world, seconds, controlFor, { spendLevels = true } = {}) {
  const steps = Math.floor(seconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    world.step(STEP, controlFor(world.state));
    if (spendLevels) takeLevels(world);
    if (world.state.over) break;
  }
}

/** The world is plain data, so a frame can be put aside whole and brought back later. */
function snapshot(state) {
  return JSON.stringify(state);
}

function restore(state, text) {
  const fresh = JSON.parse(text);
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, fresh);
}

/**
 * How crowded a play frame is: hunters within close distance above all, then the ship's own
 * fire, the enemy's fire (capped, so a boss's leftover ring cannot buy the frame), fresh
 * score floaters, and a capped word for sparks.
 */
function clusterScore(state) {
  const player = state.player;
  let near = 0;
  for (const enemy of state.enemies) {
    if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < 430) near += 1;
  }
  return near * 5 + state.bullets.length * 1.2 + Math.min(state.enemyBullets.length, 10)
    + state.floaters.length * 1.5 + Math.min(state.particles.length, 20) * 0.3;
}



/**
 * Set `world` to the named scene and return the screen to draw over it and the score to call
 * the best. Unknown names stage the title.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name === 'play') {
    // The pilot flies a long run, judging every step, and the scene keeps the most crowded
    // frame passed through: at least four hunters close in and the ship's own fire in the
    // air. The boss waves are skipped — their frames belong to the boss scene — so the best
    // of the swarm war is what remains: usually a late wave, the ship grown dangerous, the
    // swarm pressing in from several sides at once.
    let bestText = null;
    let bestScore = -1;
    for (let index = 0; index < 200 / STEP && !state.over; index += 1) {
      world.step(STEP, pilotControl(state));
      takeLevels(world);
      if (state.phase !== 'combat' || state.player.hp < 45) continue;
      if (state.wave < 3 || state.wave === 5 || state.wave >= 10) continue;
      if (state.particles.length > 60) continue; // an explosion's aftermath, not a battle
      if (state.enemies.some((enemy) => enemy.kind === 'warden')) continue;
      let near = 0;
      for (const enemy of state.enemies) {
        if (Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y) < 430) near += 1;
      }
      if (near < 4 || state.bullets.length < 3) continue;
      const score = clusterScore(state);
      if (score > bestScore) {
        bestScore = score;
        bestText = snapshot(state);
      }
      if (bestScore >= 46) break;
    }
    if (bestText !== null) restore(state, bestText);
    return { screen: SCREEN_PLAY, best: state.score };
  }
  if (name === 'boss') {
    // Fight honestly through the early waves to the Warden, then keep the frame where its
    // fight is loudest: the boss wounded but standing, its fire in the air, the ship close
    // enough to be answering it.
    let bestText = null;
    let bestScore = -1;
    for (let index = 0; index < 420 / STEP && !state.over; index += 1) {
      world.step(STEP, pilotControl(state));
      takeLevels(world);
      const boss = state.enemies.find((enemy) => enemy.kind === 'warden');
      if (boss === undefined) {
        // Both boss fights are searched — the second is the fiercer — so only stop once the
        // last one is done and a frame is already kept.
        if (bestText !== null && state.wave >= 10) break;
        continue;
      }
      const fraction = boss.hp / boss.maxHp;
      if (fraction > 0.85 || fraction < 0.25 || state.bullets.length < 4 || state.enemyBullets.length < 6) continue;
      const gap = Math.hypot(boss.x - state.player.x, boss.y - state.player.y);
      let score = state.enemyBullets.length * 1.2 + state.bullets.length * 1.5
        + Math.min(state.particles.length, 30) * 0.5 + (gap < 640 ? 10 : 0) + (fraction < 0.75 ? 6 : 0);
      // A duel reads best with both fighters in the open, not pinned to a wall.
      if (state.player.x < 200 || state.player.x > FIELD.width - 200 || state.player.y < 130 || state.player.y > FIELD.height - 120) score -= 10;
      if (score > bestScore) {
        bestScore = score;
        bestText = snapshot(state);
      }
      if (bestScore >= 52) break;
    }
    if (bestText !== null) restore(state, bestText);
    return { screen: SCREEN_PLAY, best: state.score };
  }
  if (name === 'upgrade') {
    // Fight until the first level is earned, then stop on the choice itself.
    for (let index = 0; index < 150 / STEP && state.pendingLevels === 0 && !state.over; index += 1) {
      world.step(STEP, pilotControl(state));
    }
    if (state.pendingLevels > 0) return { screen: SCREEN_UPGRADE, best: state.score };
    return { screen: SCREEN_PLAY, best: state.score };
  }
  if (name === 'end') {
    // A short, brave fight first (shots fired, a wave cleared), so the fall reads as the end
    // of a real run; then the reckless pilot takes over and the swarm collects its due.
    run(world, 24, pilotControl);
    run(world, 300, recklessControl, { spendLevels: false });
    return { screen: SCREEN_OVER, best: state.score };
  }
  // start: a few seconds of patrol behind the title, the swarm already closing in. Any hunter
  // that wandered into the headline's own band is walked down to the arena floor first, so
  // the name reads clean over the living backdrop.
  state.player.invulnTimer = 999;
  run(world, 4.5, patrolControl);
  state.player.invulnTimer = 0;
  for (const enemy of state.enemies) {
    if (enemy.x > 240 && enemy.x < 1040 && enemy.y > 60 && enemy.y < 310) enemy.y = 615 + (enemy.y % 55);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}

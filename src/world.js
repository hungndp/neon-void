// The simulation: every rule of Neon Void lives here and nowhere else. The world holds the
// ship, the enemies, the shots, the shards and the score; step() advances it one fixed slice
// under one frame of control (move, aim, fire, dash) and returns the events that happened, so
// the shell can answer them with sound and shake. Rendering reads the state; it never changes
// it. All chance comes from the seeded random handed in at creation.

import { BOSS, COLORS, COMBO, ENEMIES, FIELD, PLAYER, WAVES, xpForLevel } from './config.js';
import { rollChoices, upgradeById } from './upgrades.js';

export const EVENT_SHOOT = 'shoot';
export const EVENT_ENEMY_SHOOT = 'enemyShoot';
export const EVENT_EXPLODE = 'explode';
export const EVENT_SPLIT = 'split';
export const EVENT_PICKUP = 'pickup';
export const EVENT_LEVELUP = 'levelup';
export const EVENT_DASH = 'dash';
export const EVENT_HURT = 'hurt';
export const EVENT_WAVE = 'wave';
export const EVENT_BOSS = 'boss';
export const EVENT_BOSS_DOWN = 'bossDown';
export const EVENT_WIN = 'win';
export const EVENT_OVER = 'over';

function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

function freshStats() {
  return {
    damageScale: 1,
    rateScale: 1,
    speedScale: 1,
    dashScale: 1,
    magnetScale: 1,
    projectiles: 1,
    pierce: 0,
  };
}

export function createWorld(random) {
  const state = {
    time: 0,
    wave: 0,
    phase: 'intermission',
    phaseTimer: 1.2, // a breath before wave 1
    spawnBudget: 0,
    spawnTimer: 0,
    score: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    multiplier: 1,
    level: 1,
    xp: 0,
    xpNext: xpForLevel(1),
    pendingLevels: 0,
    choices: [],
    taken: {},
    won: false,
    endless: false,
    over: false,
    hitStop: 0, // seconds of freeze the shell owes the eye after a heavy kill; the shell spends it, the rules only set it
    player: null,
    bullets: [],
    enemyBullets: [],
    enemies: [],
    shards: [],
    particles: [],
    floaters: [],
  };

  function freshPlayer() {
    return {
      x: FIELD.width / 2,
      y: FIELD.height / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      radius: PLAYER.radius,
      hp: PLAYER.hp,
      maxHp: PLAYER.hp,
      fireTimer: 0,
      dashTimer: 0,
      dashCooldownTimer: 0,
      dashX: 1,
      dashY: 0,
      invulnTimer: 0,
      stats: freshStats(),
    };
  }

  function reset() {
    state.time = 0;
    state.wave = 0;
    state.phase = 'intermission';
    state.phaseTimer = 1.2;
    state.spawnBudget = 0;
    state.spawnTimer = 0;
    state.score = 0;
    state.kills = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.multiplier = 1;
    state.level = 1;
    state.xp = 0;
    state.xpNext = xpForLevel(1);
    state.pendingLevels = 0;
    state.choices = [];
    state.taken = {};
    state.won = false;
    state.endless = false;
    state.over = false;
    state.hitStop = 0;
    state.player = freshPlayer();
    state.bullets = [];
    state.enemyBullets = [];
    state.enemies = [];
    state.shards = [];
    state.particles = [];
    state.floaters = [];
  }

  // ---- effects the renderer draws but the rules only spawn -------------------------------

  function burst(x, y, color, count, speed, size, life) {
    for (let index = 0; index < count; index += 1) {
      const angle = random.next() * Math.PI * 2;
      const velocity = speed * (0.3 + random.next() * 0.7);
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: life * (0.6 + random.next() * 0.4),
        maxLife: life,
        size: size * (0.6 + random.next() * 0.8),
        color,
      });
    }
  }

  /** A shockwave ring: a particle that stays where it was born and only grows; render.js
   *  reads its age off its life, so the rules just name the size it should reach. */
  function ring(x, y, color, maxRadius, life) {
    state.particles.push({ x, y, vx: 0, vy: 0, life, maxLife: life, size: 3, color, ring: true, maxRadius });
  }

  function floater(x, y, text, color, size) {
    state.floaters.push({ x, y, text, color, size: size ?? 15, life: 0.9, maxLife: 0.9 });
  }

  // ---- waves and spawning ---------------------------------------------------------------

  function startWave(events) {
    state.wave += 1;
    state.phase = 'combat';
    state.spawnBudget = WAVES.baseBudget + state.wave * WAVES.budgetPerWave;
    state.spawnTimer = 0.4;
    floater(FIELD.width / 2, 150, `WAVE ${state.wave}`, '#e8f6ff', 30);
    events.push(EVENT_WAVE);
    if (BOSS.waves.includes(state.wave)) {
      spawnWarden();
      floater(FIELD.width / 2, 196, `${BOSS.name} AWAKENS`, COLORS.warden, 24);
      events.push(EVENT_BOSS);
    }
  }

  function spawnableKinds() {
    return Object.keys(ENEMIES).filter(
      (kind) => ENEMIES[kind].firstWave <= state.wave && kind !== 'mini' && kind !== 'warden',
    );
  }

  /** The boss takes the field: opposite the ship, hull enough for a long fight. It is an enemy
   *  in every list, so bullets, contact and the wave-clear rule all treat it as one; only its
   *  behaviour (stepWarden) and its death (killEnemy) are special. */
  function spawnWarden() {
    const hp = BOSS.baseHp + state.wave * BOSS.hpPerWave;
    const away = Math.atan2(state.player.y - FIELD.height / 2, state.player.x - FIELD.width / 2) + Math.PI;
    state.enemies.push({
      kind: 'warden',
      x: FIELD.width / 2 + Math.cos(away) * 330,
      y: FIELD.height / 2 + Math.sin(away) * 210,
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      radius: ENEMIES.warden.radius,
      elite: false,
      age: 0,
      flash: 0,
      mode: 'stalk',
      modeTimer: 1.6, // a breath of approach before the first attack
      fireTimer: 0,
      orbit: random.chance(0.5) ? 1 : -1,
      orbitTimer: BOSS.orbitSeconds,
      summonTimer: BOSS.summonEvery,
      spiralAngle: 0,
      attack: 0,
    });
    ring(state.enemies[state.enemies.length - 1].x, state.enemies[state.enemies.length - 1].y, COLORS.warden, 130, 0.6);
  }

  function spawnEnemy() {
    const kinds = spawnableKinds().filter((kind) => ENEMIES[kind].cost <= state.spawnBudget);
    if (kinds.length === 0) {
      state.spawnBudget = 0;
      return;
    }
    const kind = random.pick(kinds);
    const spec = ENEMIES[kind];
    state.spawnBudget -= spec.cost;
    // Enter from a random edge, never on top of the player.
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 12; tries += 1) {
      const side = random.int(0, 3);
      x = side === 0 ? 30 : side === 1 ? FIELD.width - 30 : random.range(30, FIELD.width - 30);
      y = side === 2 ? 30 : side === 3 ? FIELD.height - 30 : random.range(30, FIELD.height - 30);
      if (distance(x, y, state.player.x, state.player.y) > 280) break;
    }
    const elite = state.wave >= WAVES.eliteFromWave && random.chance(WAVES.eliteChance);
    const hpScale = (1 + (state.wave - 1) * 0.12) * (elite ? WAVES.eliteHpScale : 1);
    state.enemies.push({
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: spec.hp * hpScale,
      maxHp: spec.hp * hpScale,
      radius: spec.radius * (elite ? 1.35 : 1),
      elite,
      age: random.range(0, 10),
      flash: 0,
      mode: 'stalk',
      modeTimer: random.range(0.7, 1.3),
      fireTimer: random.range(1.2, 2.4),
      orbit: random.chance(0.5) ? 1 : -1,
    });
  }

  // ---- the Warden ------------------------------------------------------------------------

  /** Which of its three tempers the boss fights in, by the hull it has left. */
  function wardenPhase(enemy) {
    const fraction = enemy.hp / enemy.maxHp;
    return fraction > 2 / 3 ? 0 : fraction > 1 / 3 ? 1 : 2;
  }

  function wardenShot(enemy, angle, speed, events) {
    state.enemyBullets.push({
      x: enemy.x + Math.cos(angle) * (enemy.radius + 6),
      y: enemy.y + Math.sin(angle) * (enemy.radius + 6),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage: 10,
      life: 4.5,
    });
    events.push(EVENT_ENEMY_SHOOT);
  }

  /** A ring of fire in every direction at once: the ship must be somewhere the gaps are. */
  function wardenRing(enemy, phase, events) {
    const count = BOSS.ringCount[phase];
    const offset = random.next() * Math.PI * 2;
    for (let index = 0; index < count; index += 1) {
      wardenShot(enemy, offset + (index / count) * Math.PI * 2, BOSS.ringSpeed, events);
    }
  }

  /** An aimed fan at the ship: the ship must move sideways, not back. */
  function wardenFan(enemy, phase, events) {
    const count = BOSS.fanCount[phase];
    const aim = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
    for (let index = 0; index < count; index += 1) {
      wardenShot(enemy, aim + (index - (count - 1) / 2) * 0.16, BOSS.fanSpeed, events);
    }
  }

  /** Two minis peel off the boss and join the hunt. */
  function wardenSummon(enemy) {
    const mini = ENEMIES.mini;
    for (let index = 0; index < 2; index += 1) {
      if (state.enemies.length >= WAVES.maxAlive) return;
      state.enemies.push({
        kind: 'mini',
        x: enemy.x + random.range(-64, 64),
        y: enemy.y + random.range(-64, 64),
        vx: random.range(-90, 90),
        vy: random.range(-90, 90),
        hp: mini.hp * (1 + (state.wave - 1) * 0.12),
        maxHp: mini.hp * (1 + (state.wave - 1) * 0.12),
        radius: mini.radius,
        elite: false,
        age: random.range(0, 10),
        flash: 0,
        mode: 'stalk',
        modeTimer: 1,
        fireTimer: 0,
        orbit: 1,
      });
    }
    ring(enemy.x, enemy.y, COLORS.warden, 96, 0.4);
  }

  /**
   * The boss's step: hold the range, strafe and reverse, and run the attack cycle — approach,
   * a telegraphed windup (the renderer flashes it), then a ring or a fan, alternating. Wounded
   * bosses cycle faster, summon minis, and at the last third keep a turning spiral of fire
   * going between attacks.
   */
  function stepWarden(enemy, dt, events) {
    const player = state.player;
    const phase = wardenPhase(enemy);
    const gap = distance(enemy.x, enemy.y, player.x, player.y);
    const toPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    enemy.orbitTimer -= dt;
    if (enemy.orbitTimer <= 0) {
      enemy.orbit = -enemy.orbit;
      enemy.orbitTimer = BOSS.orbitSeconds * random.range(0.8, 1.2);
    }
    let radial = 0;
    if (gap > BOSS.keepRange + 40) radial = 1;
    else if (gap < BOSS.keepRange - 60) radial = -1;
    const speed = ENEMIES.warden.speed * (1 + phase * 0.22);
    enemy.vx = (Math.cos(toPlayer) * radial + Math.cos(toPlayer + Math.PI / 2) * 0.75 * enemy.orbit) * speed;
    enemy.vy = (Math.sin(toPlayer) * radial + Math.sin(toPlayer + Math.PI / 2) * 0.75 * enemy.orbit) * speed;

    enemy.modeTimer -= dt;
    if (enemy.mode === 'stalk' && enemy.modeTimer <= 0) {
      enemy.mode = 'windup';
      enemy.modeTimer = BOSS.telegraphSeconds;
    } else if (enemy.mode === 'windup' && enemy.modeTimer <= 0) {
      enemy.attack += 1;
      if (enemy.attack % 2 === 1) wardenRing(enemy, phase, events);
      else wardenFan(enemy, phase, events);
      enemy.mode = 'stalk';
      enemy.modeTimer = BOSS.attackSeconds[phase] * random.range(0.85, 1.15);
    }
    if (phase >= 1) {
      enemy.summonTimer -= dt;
      if (enemy.summonTimer <= 0) {
        enemy.summonTimer = BOSS.summonEvery;
        wardenSummon(enemy);
      }
    }
    if (phase === 2) {
      enemy.fireTimer -= dt;
      if (enemy.fireTimer <= 0) {
        enemy.fireTimer = BOSS.spiralInterval;
        enemy.spiralAngle += 0.42;
        wardenShot(enemy, enemy.spiralAngle, 190, events);
      }
    }
  }

  // ---- combat ---------------------------------------------------------------------------

  function damagePlayer(amount, events) {
    const player = state.player;
    if (player.invulnTimer > 0 || player.dashTimer > 0 || state.over) return;
    player.hp -= amount;
    player.invulnTimer = 0.7;
    burst(player.x, player.y, '#ff5d73', 14, 240, 3, 0.4);
    events.push(EVENT_HURT);
    if (player.hp <= 0) {
      player.hp = 0;
      state.over = true;
      burst(player.x, player.y, '#4df3ff', 46, 340, 4, 0.8);
      burst(player.x, player.y, '#e8f6ff', 24, 200, 3, 0.6);
      ring(player.x, player.y, COLORS.player, 150, 0.5);
      state.hitStop = 0.12;
      events.push(EVENT_OVER);
    }
  }

  function killEnemy(enemy, events) {
    const spec = ENEMIES[enemy.kind];
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = COMBO.window;
    state.multiplier = 1 + Math.min(COMBO.maxMultiplier - 1, Math.floor(state.combo / COMBO.killsPerStep));
    const gained = spec.score * (enemy.elite ? WAVES.eliteScoreScale : 1) * state.multiplier;
    state.score += gained;
    floater(enemy.x, enemy.y - enemy.radius - 4, `+${gained}`, '#aef7ff', 14);
    if (enemy.kind === 'warden') {
      // The boss goes down like a small sun: two bursts, two rings, and a beat of frozen time.
      burst(enemy.x, enemy.y, COLORS.warden, 70, 380, 4.4, 0.9);
      burst(enemy.x, enemy.y, '#e8f6ff', 36, 240, 3, 0.7);
      ring(enemy.x, enemy.y, COLORS.warden, 190, 0.55);
      ring(enemy.x, enemy.y, '#e8f6ff', 120, 0.4);
      state.hitStop = 0.12;
      events.push(EVENT_BOSS_DOWN);
    } else {
      burst(enemy.x, enemy.y, enemy.elite ? '#ffd43b' : COLORS[enemy.kind], enemy.elite ? 30 : 16, 260, 3.4, 0.5);
      if (enemy.elite) {
        ring(enemy.x, enemy.y, '#ffd43b', 84, 0.38);
        state.hitStop = Math.max(state.hitStop, 0.03);
      }
      events.push(enemy.kind === 'splitter' ? EVENT_SPLIT : EVENT_EXPLODE);
    }
    const xpValue = spec.xp * (enemy.elite ? 2 : 1);
    for (let index = 0; index < xpValue; index += 1) {
      state.shards.push({
        x: enemy.x + random.range(-12, 12),
        y: enemy.y + random.range(-12, 12),
        vx: random.range(-40, 40),
        vy: random.range(-40, 40),
        value: 1,
        age: random.range(0, 6),
      });
    }
    if (enemy.kind === 'splitter') {
      for (let index = 0; index < 3; index += 1) {
        const mini = ENEMIES.mini;
        state.enemies.push({
          kind: 'mini',
          x: enemy.x + random.range(-18, 18),
          y: enemy.y + random.range(-18, 18),
          vx: random.range(-90, 90),
          vy: random.range(-90, 90),
          hp: mini.hp * (1 + (state.wave - 1) * 0.12),
          maxHp: mini.hp * (1 + (state.wave - 1) * 0.12),
          radius: mini.radius,
          elite: false,
          age: random.range(0, 10),
          flash: 0,
          mode: 'stalk',
          modeTimer: 1,
          fireTimer: 0,
          orbit: 1,
        });
      }
    }
  }

  function gainXp(value, events) {
    state.xp += value;
    while (state.xp >= state.xpNext) {
      state.xp -= state.xpNext;
      state.level += 1;
      state.xpNext = xpForLevel(state.level);
      state.pendingLevels += 1;
      events.push(EVENT_LEVELUP);
      floater(state.player.x, state.player.y - 30, 'LEVEL UP!', '#ffe066', 20);
    }
    if (state.pendingLevels > 0 && state.choices.length === 0) {
      state.choices = rollChoices(random, state.taken);
    }
  }

  /** Take the level-up card at `index` (0-2); returns false when there is nothing to take. */
  function applyChoice(index) {
    const choice = state.choices[index];
    if (choice === undefined || state.pendingLevels === 0) return false;
    choice.apply(state.player.stats, state.player);
    state.taken[choice.id] = (state.taken[choice.id] ?? 0) + 1;
    state.pendingLevels -= 1;
    state.choices = state.pendingLevels > 0 ? rollChoices(random, state.taken) : [];
    return true;
  }

  // ---- the step --------------------------------------------------------------------------

  function step(dt, control) {
    const events = [];
    const player = state.player;
    state.time += dt;

    // Particles and floaters always drift on, even over a finished game.
    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.92;
      particle.vy *= 0.92;
      particle.life -= dt;
    }
    state.particles = state.particles.filter((particle) => particle.life > 0);
    for (const item of state.floaters) {
      item.y -= 34 * dt;
      item.life -= dt;
    }
    state.floaters = state.floaters.filter((item) => item.life > 0);
    if (state.over) return events;

    // Combo decay.
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
        state.multiplier = 1;
      }
    }

    // Wave flow.
    if (state.phase === 'intermission') {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) startWave(events);
    } else if (state.spawnBudget > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && state.enemies.length < WAVES.maxAlive) {
        spawnEnemy();
        state.spawnTimer = WAVES.spawnInterval * random.range(0.7, 1.3);
      }
    } else if (state.enemies.length === 0) {
      const bonus = 25 * state.wave;
      state.score += bonus;
      floater(FIELD.width / 2, 190, `WAVE ${state.wave} CLEAR  +${bonus}`, '#51ff9e', 22);
      if (state.wave >= WAVES.winWave && !state.won) {
        state.won = true;
        events.push(EVENT_WIN);
      }
      state.phase = 'intermission';
      state.phaseTimer = WAVES.intermission;
    }

    // Player movement and dash.
    player.fireTimer -= dt;
    player.dashCooldownTimer -= dt;
    player.invulnTimer -= dt;
    const length = Math.hypot(control.moveX, control.moveY);
    const moveX = length > 0 ? control.moveX / Math.max(1, length) : 0;
    const moveY = length > 0 ? control.moveY / Math.max(1, length) : 0;
    player.angle = Math.atan2(control.aimY - player.y, control.aimX - player.x);
    if (control.dash && player.dashCooldownTimer <= 0 && player.dashTimer <= 0) {
      player.dashTimer = PLAYER.dashTime;
      player.dashCooldownTimer = PLAYER.dashCooldown * player.stats.dashScale;
      player.dashX = length > 0 ? moveX : Math.cos(player.angle);
      player.dashY = length > 0 ? moveY : Math.sin(player.angle);
      events.push(EVENT_DASH);
    }
    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      player.vx = player.dashX * PLAYER.dashSpeed;
      player.vy = player.dashY * PLAYER.dashSpeed;
      state.particles.push({
        x: player.x,
        y: player.y,
        vx: 0,
        vy: 0,
        life: 0.28,
        maxLife: 0.28,
        size: 9,
        color: '#4df3ff',
      });
    } else {
      player.vx = moveX * PLAYER.speed * player.stats.speedScale;
      player.vy = moveY * PLAYER.speed * player.stats.speedScale;
    }
    player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - player.radius, Math.max(player.radius, player.y + player.vy * dt));

    // Firing: a fan of projectiles around the aim, one extra per Split Cannon.
    if (control.firing && player.fireTimer <= 0 && state.phase === 'combat') {
      player.fireTimer = PLAYER.fireInterval / player.stats.rateScale;
      const count = player.stats.projectiles;
      for (let index = 0; index < count; index += 1) {
        const spread = (index - (count - 1) / 2) * 0.09;
        const angle = player.angle + spread;
        state.bullets.push({
          x: player.x + Math.cos(player.angle) * (player.radius + 6),
          y: player.y + Math.sin(player.angle) * (player.radius + 6),
          vx: Math.cos(angle) * PLAYER.bulletSpeed,
          vy: Math.sin(angle) * PLAYER.bulletSpeed,
          damage: PLAYER.bulletDamage * player.stats.damageScale,
          pierce: player.stats.pierce,
          life: PLAYER.bulletLife,
        });
      }
      // A tongue of light at the nose, gone in a blink: the shot made visible at its birth.
      state.particles.push({
        x: player.x + Math.cos(player.angle) * (player.radius + 10),
        y: player.y + Math.sin(player.angle) * (player.radius + 10),
        vx: Math.cos(player.angle) * 60,
        vy: Math.sin(player.angle) * 60,
        life: 0.07,
        maxLife: 0.07,
        size: 7,
        color: '#e8feff',
      });
      events.push(EVENT_SHOOT);
    }

    // Player bullets fly and bite.
    for (const bullet of state.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.x < 0 || bullet.x > FIELD.width || bullet.y < 0 || bullet.y > FIELD.height) bullet.life = 0;
      if (bullet.life <= 0) continue;
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0) continue;
        if (distance(bullet.x, bullet.y, enemy.x, enemy.y) > enemy.radius + PLAYER.bulletRadius) continue;
        enemy.hp -= bullet.damage;
        enemy.flash = 0.09;
        burst(bullet.x, bullet.y, '#aef7ff', 3, 150, 2.2, 0.25);
        if (bullet.pierce > 0) bullet.pierce -= 1;
        else bullet.life = 0;
        break;
      }
    }
    state.bullets = state.bullets.filter((bullet) => bullet.life > 0);
    for (const enemy of [...state.enemies]) {
      if (enemy.hp <= 0) killEnemy(enemy, events);
    }
    state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);

    // Enemies act by kind.
    for (const enemy of state.enemies) {
      enemy.age += dt;
      enemy.flash -= dt;
      const spec = ENEMIES[enemy.kind];
      const speedScale = 1 + Math.min(0.5, (state.wave - 1) * 0.03);
      const toPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      if (enemy.kind === 'drifter' || enemy.kind === 'mini' || enemy.kind === 'splitter') {
        const wobble = Math.sin(enemy.age * 3.1) * 0.35;
        enemy.vx = Math.cos(toPlayer + wobble) * spec.speed * speedScale;
        enemy.vy = Math.sin(toPlayer + wobble) * spec.speed * speedScale;
      } else if (enemy.kind === 'darter') {
        enemy.modeTimer -= dt;
        if (enemy.mode === 'stalk') {
          enemy.vx = Math.cos(toPlayer) * spec.speed * speedScale;
          enemy.vy = Math.sin(toPlayer) * spec.speed * speedScale;
          if (enemy.modeTimer <= 0) {
            enemy.mode = 'windup';
            enemy.modeTimer = 0.45;
          }
        } else if (enemy.mode === 'windup') {
          enemy.vx *= 0.8;
          enemy.vy *= 0.8;
          if (enemy.modeTimer <= 0) {
            enemy.mode = 'lunge';
            enemy.modeTimer = 0.38;
            enemy.vx = Math.cos(toPlayer) * 540;
            enemy.vy = Math.sin(toPlayer) * 540;
          }
        } else {
          if (enemy.modeTimer <= 0) {
            enemy.mode = 'stalk';
            enemy.modeTimer = random.range(0.8, 1.4);
          }
        }
      } else if (enemy.kind === 'sentry') {
        const gap = distance(enemy.x, enemy.y, player.x, player.y);
        let radial = 0;
        if (gap > 320) radial = 1;
        else if (gap < 230) radial = -1;
        enemy.vx = (Math.cos(toPlayer) * radial + Math.cos(toPlayer + Math.PI / 2) * 0.6 * enemy.orbit) * spec.speed * speedScale;
        enemy.vy = (Math.sin(toPlayer) * radial + Math.sin(toPlayer + Math.PI / 2) * 0.6 * enemy.orbit) * spec.speed * speedScale;
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0 && gap < 480 && state.phase === 'combat') {
          enemy.fireTimer = 2.2;
          state.enemyBullets.push({
            x: enemy.x,
            y: enemy.y,
            vx: Math.cos(toPlayer) * 245,
            vy: Math.sin(toPlayer) * 245,
            damage: spec.damage,
            life: 3.2,
          });
          events.push(EVENT_ENEMY_SHOOT);
        }
      } else if (enemy.kind === 'warden') {
        stepWarden(enemy, dt, events);
      }
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.x = Math.min(FIELD.width - enemy.radius, Math.max(enemy.radius, enemy.x));
      enemy.y = Math.min(FIELD.height - enemy.radius, Math.max(enemy.radius, enemy.y));

      // Contact: a dashing ship tears through (once a pass per enemy, by the dash-hit timer);
      // anything else trades the enemy for hull — except the Warden, which is far too big to
      // die by being touched: it only deals its damage and holds its ground.
      enemy.dashHitTimer = Math.max(0, (enemy.dashHitTimer ?? 0) - dt);
      if (distance(enemy.x, enemy.y, player.x, player.y) < enemy.radius + player.radius) {
        if (player.dashTimer > 0) {
          if (enemy.dashHitTimer <= 0) {
            enemy.dashHitTimer = 0.3;
            enemy.hp -= 34;
            enemy.flash = 0.09;
            if (enemy.hp <= 0) killEnemy(enemy, events);
          }
        } else if (player.invulnTimer <= 0) {
          damagePlayer(spec.damage, events);
          if (enemy.kind !== 'warden') {
            enemy.hp = 0;
            burst(enemy.x, enemy.y, '#ff8fa3', 10, 200, 3, 0.35);
          }
        }
      }
    }
    state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);

    // Enemy shots.
    for (const bullet of state.enemyBullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.x < 0 || bullet.x > FIELD.width || bullet.y < 0 || bullet.y > FIELD.height) bullet.life = 0;
      if (bullet.life > 0 && distance(bullet.x, bullet.y, player.x, player.y) < player.radius + 5) {
        bullet.life = 0;
        damagePlayer(bullet.damage, events);
      }
    }
    state.enemyBullets = state.enemyBullets.filter((bullet) => bullet.life > 0);

    // Shards drift, gather and feed the level.
    const magnet = PLAYER.magnetRadius * player.stats.magnetScale;
    for (const shard of state.shards) {
      shard.age += dt;
      const gap = distance(shard.x, shard.y, player.x, player.y);
      if (gap < magnet) {
        const pull = 1 - gap / magnet;
        shard.vx += ((player.x - shard.x) / Math.max(1, gap)) * 1500 * pull * dt;
        shard.vy += ((player.y - shard.y) / Math.max(1, gap)) * 1500 * pull * dt;
      }
      shard.vx *= 0.9;
      shard.vy *= 0.9;
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      if (gap < PLAYER.pickupRadius) {
        shard.value = 0;
        events.push(EVENT_PICKUP);
        gainXp(1, events);
      }
    }
    state.shards = state.shards.filter((shard) => shard.value > 0);

    return events;
  }

  reset();
  return { state, reset, step, applyChoice };
}

// Neon Void's tuning table: the arena, the ship, every enemy kind and the wave curve live here,
// so the balance of the game can be read (and changed) in one place. Nothing in this file moves:
// it only names numbers the rest of the game obeys.

// The play field, in logical pixels. The canvas is exactly this size and CSS scales it to fit
// the window, so a position in the world is a position on the screen.
export const FIELD = { width: 1280, height: 720 };

// The fixed step the world advances in (seconds). The main loop accumulates real time and spends
// it in these slices, so the game plays the same on a fast or a slow machine.
export const STEP = 1 / 60;

// Where the best score is kept between visits.
export const BEST_KEY = 'neon-void-best-score';

// The player's ship: a fast, fragile arrow that survives on its dash.
export const PLAYER = {
  radius: 13,
  speed: 265, // pixels a second
  hp: 100,
  fireInterval: 0.16, // seconds between shots at the base fire rate
  bulletSpeed: 760,
  bulletDamage: 12,
  bulletRadius: 4,
  bulletLife: 0.95, // seconds before a shot fizzles out
  dashTime: 0.18, // seconds the dash burst lasts
  dashSpeed: 880, // pixels a second while dashing
  dashCooldown: 2.1, // seconds between dashes
  magnetRadius: 92, // shards inside this drift to the ship
  pickupRadius: 22, // shards inside this are collected
};

// Kills inside this window keep the combo alive; the multiplier grows with the chain.
export const COMBO = { window: 2.6, killsPerStep: 7, maxMultiplier: 8 };

// Experience: shards are worth XP, and each level asks for more than the last.
export function xpForLevel(level) {
  return 6 + (level - 1) * 4;
}

// The five enemy kinds. Each is a shape and a behaviour in world.js; this table is their stats:
// hull, speed, touch damage, score, XP and the first wave they appear in. The warden is not in
// the spawn pool: it is the boss, placed by the wave flow itself (see BOSS below), and its row
// here is only its touch damage and reward.
export const ENEMIES = {
  drifter: { hp: 24, speed: 96, radius: 15, damage: 12, score: 40, xp: 1, firstWave: 1, cost: 1 },
  mini: { hp: 10, speed: 168, radius: 9, damage: 8, score: 25, xp: 1, firstWave: 1, cost: 1 },
  darter: { hp: 20, speed: 74, radius: 13, damage: 14, score: 70, xp: 2, firstWave: 2, cost: 2 },
  sentry: { hp: 32, speed: 58, radius: 16, damage: 10, score: 90, xp: 2, firstWave: 3, cost: 2 },
  splitter: { hp: 66, speed: 44, radius: 26, damage: 16, score: 130, xp: 4, firstWave: 4, cost: 3 },
  warden: { hp: 1, speed: 52, radius: 46, damage: 18, score: 1500, xp: 10, firstWave: 5, cost: 0 },
};

// The Warden: the sector's boss, met on the boss waves and again as the last thing standing
// between the ship and the win. It keeps its distance and fights in patterns — rings of fire,
// aimed fans, summoned minis — and the lower its hull falls, the faster and denser they come.
export const BOSS = {
  name: 'THE WARDEN',
  waves: [5, 10], // the waves it guards; wave 10's fall is the win
  baseHp: 1050,
  hpPerWave: 110, // hull = baseHp + wave * hpPerWave
  keepRange: 300, // the distance it tries to hold from the ship
  orbitSeconds: 4.2, // how long it strafes one way before reversing
  telegraphSeconds: 0.5, // the flash of warning before a ring of fire
  ringCount: [12, 16, 20], // bullets in a ring of fire, by phase (full, two-thirds, one-third hull)
  ringSpeed: 168,
  fanCount: [3, 5, 5], // bullets in an aimed fan, by phase
  fanSpeed: 262,
  attackSeconds: [2.6, 2.1, 1.7], // the pause between attacks, by phase
  summonEvery: 7, // seconds between summoning a pair of minis (phases 2 and 3)
  spiralInterval: 0.11, // phase 3 only: a turning stream of single shots between attacks
};

// Waves: each wave buys its enemies with points, trickles them in, and grows teeth as it goes.
export const WAVES = {
  winWave: 10, // clear this wave and the sector is won (endless play continues after)
  baseBudget: 5,
  budgetPerWave: 3,
  maxAlive: 14, // never more than this many enemies on screen at once
  spawnInterval: 0.85, // seconds between spawns while the wave still has budget
  intermission: 2.6, // seconds of quiet between waves
  eliteFromWave: 5, // from here, some enemies are elites: bigger, tougher, worth more
  eliteChance: 0.14,
  eliteHpScale: 3.2,
  eliteScoreScale: 3,
};

// The palette: deep space, one neon colour per actor so a scene reads at a glance.
export const COLORS = {
  background: '#070812',
  star: '#aab7ff',
  grid: '#131a33',
  player: '#4df3ff',
  playerBullet: '#aef7ff',
  enemyBullet: '#ff8fa3',
  shard: '#ffe066',
  text: '#e8f6ff',
  dimText: '#8fa3c8',
  hp: '#51ff9e',
  hpLow: '#ff5d73',
  xp: '#ffe066',
  drifter: '#ff4d6d',
  mini: '#f783ac',
  darter: '#ffa94d',
  sentry: '#b197fc',
  splitter: '#69db7c',
  warden: '#ff2e88',
};

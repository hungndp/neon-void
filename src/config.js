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

// The Orbital Drone upgrade's little escorts: they circle the ship and fire on their own at
// whatever hunter is nearest, and their shots draw on the ship's damage fittings, so Heavy
// Rounds feeds them too — the upgrade board's one true synergy.
export const DRONE = {
  orbitRadius: 36, // pixels from the ship's centre
  orbitSpeed: 2.6, // radians a second around the ship
  range: 430, // how far a drone can see to shoot
  fireInterval: 0.55, // seconds between one drone's shots
  bulletSpeed: 720,
  bulletDamage: 8, // before the ship's damage scale
};

// Experience: shards are worth XP, and each level asks for more than the last.
export function xpForLevel(level) {
  return 6 + (level - 1) * 4;
}

// The six enemy kinds. Each is a shape and a behaviour in world.js; this table is their stats:
// hull, speed, touch damage, score, XP and the first wave they appear in. The warden is not in
// the spawn pool: it is the boss, placed by the wave flow itself (see BOSS below), and its row
// here is only its touch damage and reward.
export const ENEMIES = {
  drifter: { hp: 24, speed: 96, radius: 15, damage: 12, score: 40, xp: 1, firstWave: 1, cost: 1 },
  mini: { hp: 10, speed: 168, radius: 9, damage: 8, score: 25, xp: 1, firstWave: 1, cost: 1 },
  darter: { hp: 20, speed: 74, radius: 13, damage: 14, score: 70, xp: 2, firstWave: 2, cost: 2 },
  sentry: { hp: 32, speed: 58, radius: 16, damage: 10, score: 90, xp: 2, firstWave: 3, cost: 2 },
  splitter: { hp: 66, speed: 44, radius: 26, damage: 16, score: 130, xp: 4, firstWave: 4, cost: 3 },
  bulwark: { hp: 95, speed: 40, radius: 24, damage: 14, score: 220, xp: 5, firstWave: 4, cost: 3 },
  warden: { hp: 1, speed: 52, radius: 46, damage: 18, score: 1500, xp: 10, firstWave: 5, cost: 0 },
};

// The Bulwark's shield: a frontal arc, this many radians to either side of the way it faces,
// and a facing that swings toward the ship at only this many radians a second — a heavy
// shield on a heavy frame. Shots and dash hits that arrive inside the arc are stopped cold
// with a spark; the same hits land in full from the flank or the rear, so the fight is about
// position: keep strafing so the arc lags, or dash through it and turn.
export const SHIELD = { halfArc: 0.62, turnRate: 0.8 };

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

// The sector's biomes: the arena itself changes temper as the run deepens. Each band of waves
// gets its own darkness, grid and nebula washes (the washes keep their places — the geography
// is the same sector — and only their colours turn), so a screenshot from wave 2 and one from
// wave 8 never look like the same room, and the two boss gates burn their own reds. Past the
// win, endless play cycles the four hunting grounds in turn.
export const BIOMES = {
  void: {
    name: 'VOID REACHES',
    background: '#070812',
    grid: '#131a33',
    wall: 'rgba(77, 243, 255, 0.35)',
    nebula: ['rgba(64, 60, 180, 0.16)', 'rgba(14, 116, 144, 0.14)', 'rgba(150, 40, 90, 0.10)'],
  },
  violet: {
    name: 'VIOLET NEBULA',
    background: '#0c0716',
    grid: '#241239',
    wall: 'rgba(177, 151, 252, 0.35)',
    nebula: ['rgba(112, 40, 190, 0.18)', 'rgba(190, 40, 150, 0.12)', 'rgba(60, 40, 170, 0.14)'],
  },
  gate: {
    name: "WARDEN'S GATE",
    background: '#10060f',
    grid: '#2e1130',
    wall: 'rgba(255, 46, 136, 0.38)',
    nebula: ['rgba(170, 30, 90, 0.16)', 'rgba(120, 30, 140, 0.13)', 'rgba(90, 20, 60, 0.12)'],
  },
  ember: {
    name: 'EMBER DRIFT',
    background: '#120806',
    grid: '#33160e',
    wall: 'rgba(255, 169, 77, 0.35)',
    nebula: ['rgba(190, 80, 20, 0.15)', 'rgba(160, 40, 30, 0.13)', 'rgba(200, 130, 30, 0.10)'],
  },
  toxic: {
    name: 'TOXIC BLOOM',
    background: '#061208',
    grid: '#0f2e1a',
    wall: 'rgba(105, 219, 124, 0.35)',
    nebula: ['rgba(30, 150, 70, 0.14)', 'rgba(20, 130, 110, 0.13)', 'rgba(120, 170, 30, 0.10)'],
  },
  lastGate: {
    name: 'THE LAST GATE',
    background: '#130509',
    grid: '#360f1c',
    wall: 'rgba(255, 46, 77, 0.42)',
    nebula: ['rgba(190, 20, 50, 0.17)', 'rgba(140, 20, 90, 0.13)', 'rgba(100, 10, 40, 0.12)'],
  },
};

const BIOME_BANDS = ['void', 'void', 'violet', 'violet', 'gate', 'ember', 'ember', 'toxic', 'toxic', 'lastGate'];
const ENDLESS_CYCLE = ['void', 'violet', 'ember', 'toxic'];

/** The biome a wave is fought in: bands of two waves, the boss gates at 5 and 10, and a
 *  four-band cycle once endless play runs past the win. */
export function biomeForWave(wave) {
  if (wave >= 1 && wave <= BIOME_BANDS.length) return BIOMES[BIOME_BANDS[wave - 1]];
  if (wave > BIOME_BANDS.length) return BIOMES[ENDLESS_CYCLE[(wave - BIOME_BANDS.length - 1) % ENDLESS_CYCLE.length]];
  return BIOMES.void;
}

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
  bulwark: '#a5d8ff',
  warden: '#ff2e88',
};

// The level-up choices. Every level, the game pauses and offers three of these; each stacks a
// few times and then leaves the pool, so a run bends toward a build: raw damage, a spray of
// split shots, a dash that is always ready, or a magnet that hoovers the field. The choice is
// the game's depth, so each entry says plainly what it does and how much of it you already hold.

// Each upgrade: its card text, how many times it may be taken, and the change it makes to the
// ship's stats in world.js (the stats object is the one the world keeps on the player).
export const UPGRADES = [
  {
    id: 'damage',
    name: 'Heavy Rounds',
    blurb: '+35% bullet damage',
    max: 5,
    apply(stats) {
      stats.damageScale *= 1.35;
    },
  },
  {
    id: 'rate',
    name: 'Rapid Cycler',
    blurb: '+22% fire rate',
    max: 5,
    apply(stats) {
      stats.rateScale *= 1.22;
    },
  },
  {
    id: 'split',
    name: 'Split Cannon',
    blurb: '+1 projectile per shot',
    max: 3,
    apply(stats) {
      stats.projectiles += 1;
    },
  },
  {
    id: 'pierce',
    name: 'Lance Rounds',
    blurb: 'Shots pierce +1 enemy',
    max: 2,
    apply(stats) {
      stats.pierce += 1;
    },
  },
  {
    id: 'speed',
    name: 'Swift Hull',
    blurb: '+12% move speed',
    max: 4,
    apply(stats) {
      stats.speedScale *= 1.12;
    },
  },
  {
    id: 'dash',
    name: 'Dash Recharger',
    blurb: '-28% dash cooldown',
    max: 3,
    apply(stats) {
      stats.dashScale *= 0.72;
    },
  },
  {
    id: 'magnet',
    name: 'Magnet Core',
    blurb: '+70% shard magnet radius',
    max: 3,
    apply(stats) {
      stats.magnetScale *= 1.7;
    },
  },
  {
    id: 'plating',
    name: 'Vital Plating',
    blurb: '+25 max hull, heal 25',
    max: 4,
    apply(stats, player) {
      player.maxHp += 25;
      player.hp = Math.min(player.maxHp, player.hp + 25);
    },
  },
];

export function upgradeById(id) {
  return UPGRADES.find((upgrade) => upgrade.id === id);
}

/**
 * Roll the three choices a level offers: distinct upgrades the ship has not maxed, drawn with
 * the game's own random so a seed replays the same offers. Fewer than three come back only
 * when the pool itself runs dry late in a run.
 */
export function rollChoices(random, taken) {
  const pool = UPGRADES.filter((upgrade) => (taken[upgrade.id] ?? 0) < upgrade.max);
  const choices = [];
  while (choices.length < 3 && pool.length > 0) {
    const index = Math.floor(random.next() * pool.length);
    choices.push(pool.splice(index, 1)[0]);
  }
  return choices;
}

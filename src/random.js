// A small seeded random generator (mulberry32). The world draws every chance from one of these,
// never from Math.random, so a seed always grows the same game: the screenshot scenes and any
// replay see exactly the run the seed describes.

export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    /** A float in [0, 1). */
    next,
    /** A float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** An integer in [min, max], both ends included. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** One member of a non-empty array. */
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    /** True with the given probability. */
    chance(probability) {
      return next() < probability;
    },
  };
}

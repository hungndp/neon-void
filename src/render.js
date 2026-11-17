// Everything the player sees. The renderer reads the world state and a view (which screen, the
// best score, the hurt flash) and paints one frame: a starfield arena, neon shapes with one
// silhouette and colour per enemy kind, the HUD, and the full-screen menus. It never changes
// the game; the same state always paints the same frame.

import { BOSS, COLORS, ENEMIES, FIELD, PLAYER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

// A fixed starfield, generated once from its own little generator so it never touches the
// game's random stream: three depths of stars that twinkle as time passes.
const STARS = (() => {
  let seed = 987654321;
  const next = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  const stars = [];
  for (let index = 0; index < 130; index += 1) {
    stars.push({ x: next() * FIELD.width, y: next() * FIELD.height, depth: 0.3 + next() * 0.7, phase: next() * 6.28 });
  }
  return stars;
})();

function polygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index][0], points[index][1]);
  ctx.closePath();
}

function bar(ctx, x, y, width, height, fraction, color, backColor) {
  ctx.fillStyle = backColor;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * Math.min(1, Math.max(0, fraction)), height);
}

function centredText(ctx, text, y, font, color) {
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(text, FIELD.width / 2, y);
}

/** The level-up cards' rectangles, in field coordinates: the renderer draws them here and
 *  main.js reads clicks against the same boxes, so the two can never drift apart. */
export function upgradeCardRects() {
  const cardWidth = 300;
  const cardHeight = 190;
  const gap = 26;
  const total = cardWidth * 3 + gap * 2;
  const startX = (FIELD.width - total) / 2;
  const y = 258;
  return [0, 1, 2].map((index) => ({ x: startX + index * (cardWidth + gap), y, width: cardWidth, height: cardHeight }));
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function drawBackground(state) {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Two soft nebula washes, fixed in place, so the arena has a geography.
    for (const [x, y, radius, color] of [
      [300, 170, 340, 'rgba(64, 60, 180, 0.16)'],
      [1010, 560, 380, 'rgba(14, 116, 144, 0.14)'],
      [880, 120, 240, 'rgba(150, 40, 90, 0.10)'],
    ]) {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    // Faint grid.
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 80; x < FIELD.width; x += 80) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD.height);
    }
    for (let y = 80; y < FIELD.height; y += 80) {
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.width, y);
    }
    ctx.stroke();
    // Stars.
    for (const star of STARS) {
      const twinkle = 0.55 + 0.45 * Math.sin(state.time * (0.6 + star.depth) + star.phase);
      ctx.globalAlpha = 0.25 + 0.55 * star.depth * twinkle;
      ctx.fillStyle = COLORS.star;
      const size = star.depth < 0.6 ? 1.6 : 2.4;
      ctx.fillRect(star.x, star.y, size, size);
    }
    ctx.globalAlpha = 1;
    // The arena wall.
    ctx.strokeStyle = 'rgba(77, 243, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, FIELD.width - 2, FIELD.height - 2);
  }

  function drawShard(shard) {
    const pulse = 1 + Math.sin(shard.age * 5) * 0.18;
    ctx.save();
    ctx.translate(shard.x, shard.y);
    ctx.rotate(shard.age * 1.8);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = COLORS.shard;
    ctx.shadowBlur = 10;
    ctx.fillStyle = COLORS.shard;
    polygon(ctx, [[0, -7], [5, 0], [0, 7], [-5, 0]]);
    ctx.fill();
    ctx.restore();
  }

  function drawShip(state) {
    const player = state.player;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    if (player.invulnTimer > 0 && player.dashTimer <= 0) ctx.globalAlpha = 0.45 + 0.3 * Math.sin(state.time * 34);
    // Engine flame, longer the faster the ship flies.
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > 30) {
      const flame = 10 + Math.min(16, speed / 34) + Math.sin(state.time * 41) * 3;
      ctx.fillStyle = '#ffb347';
      polygon(ctx, [[-11, 5], [-11 - flame, 0], [-11, -5]]);
      ctx.fill();
    }
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 16;
    ctx.fillStyle = COLORS.player;
    polygon(ctx, [[19, 0], [-12, 12], [-7, 0], [-12, -12]]);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e8feff';
    ctx.beginPath();
    ctx.arc(3, 0, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Dash readiness ring.
    if (player.dashCooldownTimer > 0) {
      const total = PLAYER.dashCooldown * player.stats.dashScale;
      ctx.strokeStyle = 'rgba(77, 243, 255, 0.5)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius + 7, -Math.PI / 2, -Math.PI / 2 + (1 - player.dashCooldownTimer / total) * Math.PI * 2);
      ctx.stroke();
    }
  }

  /**
   * The Warden, drawn in the enemy's own translated space: a crown of twelve spikes turning
   * one way, a counter-turning inner star, and a core whose colour is its temper — gold while
   * it is whole, amber wounded, red at the edge of death. In its windup it flashes and grows a
   * warning ring, so the ring of fire that follows is always the player's own fault.
   */
  function drawWardenBody(state, enemy) {
    const r = enemy.radius;
    const fraction = enemy.hp / enemy.maxHp;
    const phase = fraction > 2 / 3 ? 0 : fraction > 1 / 3 ? 1 : 2;
    const coreColors = ['#ffd43b', '#ff922b', '#ff2e4d'];
    if (enemy.mode === 'windup') {
      const pulse = 0.5 + 0.5 * Math.sin(state.time * 34);
      ctx.strokeStyle = `rgba(255, 46, 136, ${0.35 + 0.4 * pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r + 16 + 5 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = Math.sin(state.time * 34) > 0 ? '#ffffff' : COLORS.warden;
    }
    // The crown: twelve spikes on a slow turn.
    ctx.save();
    ctx.rotate(enemy.age * 0.45);
    const crown = [];
    for (let index = 0; index < 12; index += 1) {
      const a = (index / 12) * Math.PI * 2;
      const inner = a + Math.PI / 12;
      crown.push([Math.cos(a) * (r + 13), Math.sin(a) * (r + 13)]);
      crown.push([Math.cos(inner) * r * 0.88, Math.sin(inner) * r * 0.88]);
    }
    polygon(ctx, crown);
    ctx.fill();
    ctx.restore();
    // The body and its counter-turning star.
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.rotate(-enemy.age * 0.8);
    ctx.fillStyle = 'rgba(7, 8, 18, 0.55)';
    const star = [];
    for (let index = 0; index < 8; index += 1) {
      const a = (index / 8) * Math.PI * 2;
      const inner = a + Math.PI / 8;
      star.push([Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62]);
      star.push([Math.cos(inner) * r * 0.34, Math.sin(inner) * r * 0.34]);
    }
    polygon(ctx, star);
    ctx.fill();
    ctx.restore();
    // The core: one bright eye that changes colour as the fight turns.
    ctx.shadowColor = coreColors[phase];
    ctx.shadowBlur = 18;
    ctx.fillStyle = enemy.flash > 0 ? '#ffffff' : coreColors[phase];
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawEnemy(state, enemy) {
    const spec = ENEMIES[enemy.kind];
    const color = enemy.flash > 0 ? '#ffffff' : COLORS[enemy.kind];
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.shadowColor = COLORS[enemy.kind];
    ctx.shadowBlur = 13;
    ctx.fillStyle = color;
    const r = enemy.radius;
    if (enemy.kind === 'drifter' || enemy.kind === 'mini') {
      ctx.rotate(enemy.age * 1.6);
      polygon(ctx, [[r, 0], [0, r], [-r, 0], [0, -r]]);
      ctx.fill();
      ctx.fillStyle = 'rgba(7, 8, 18, 0.75)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.kind === 'darter') {
      const angle = Math.atan2(enemy.vy, enemy.vx);
      ctx.rotate(angle);
      if (enemy.mode === 'windup') {
        // Telegraph: the darter flashes and a line shows the lunge to come.
        ctx.strokeStyle = 'rgba(255, 169, 77, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(120, 0);
        ctx.stroke();
        ctx.fillStyle = Math.sin(state.time * 40) > 0 ? '#ffffff' : color;
      }
      polygon(ctx, [[r + 4, 0], [-r, r * 0.72], [-r * 0.5, 0], [-r, -r * 0.72]]);
      ctx.fill();
    } else if (enemy.kind === 'sentry') {
      ctx.rotate(enemy.age * 0.7);
      const points = [];
      for (let index = 0; index < 6; index += 1) {
        const a = (index / 6) * Math.PI * 2;
        points.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      polygon(ctx, points);
      ctx.fill();
      ctx.fillStyle = '#0b0d1d';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = enemy.flash > 0 ? '#ffffff' : COLORS.enemyBullet;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.kind === 'splitter') {
      const pulse = 1 + Math.sin(enemy.age * 2.2) * 0.045;
      ctx.scale(pulse, pulse);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(7, 8, 18, 0.5)';
      for (const [ox, oy] of [[-0.35, -0.2], [0.3, 0.28], [0.05, -0.42]]) {
        ctx.beginPath();
        ctx.arc(ox * r, oy * r, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (enemy.kind === 'warden') {
      drawWardenBody(state, enemy);
    }
    ctx.restore();
    if (enemy.elite) {
      ctx.strokeStyle = '#ffd43b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (enemy.hp < enemy.maxHp && enemy.radius >= 14 && enemy.kind !== 'warden') {
      bar(ctx, enemy.x - enemy.radius, enemy.y - enemy.radius - 11, enemy.radius * 2, 4, enemy.hp / enemy.maxHp, '#ff8fa3', 'rgba(255,255,255,0.14)');
    }
    void spec;
  }

  function drawHud(state, view) {
    const player = state.player;
    ctx.textAlign = 'left';
    // Hull, top left.
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText('HULL', 18, 26);
    bar(ctx, 18, 32, 210, 13, player.hp / player.maxHp, player.hp <= 30 ? COLORS.hpLow : COLORS.hp, 'rgba(255,255,255,0.12)');
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(`${Math.ceil(player.hp)} / ${player.maxHp}`, 234, 43);
    // Dash state under the hull.
    ctx.fillStyle = player.dashCooldownTimer <= 0 ? COLORS.player : COLORS.dimText;
    ctx.fillText(player.dashCooldownTimer <= 0 ? 'DASH READY (SHIFT)' : 'DASH CHARGING…', 18, 62);
    // Wave, top centre.
    if (state.wave > 0) {
      centredText(ctx, `WAVE ${state.wave}${state.endless ? ' · ENDLESS' : ''}`, 34, 'bold 21px system-ui, sans-serif', COLORS.text);
    }
    // The boss bar, under the wave: while the Warden lives, its name and hull own the top.
    const boss = state.enemies.find((enemy) => enemy.kind === 'warden');
    if (boss !== undefined) {
      centredText(ctx, BOSS.name, 62, 'bold 13px system-ui, sans-serif', COLORS.warden);
      bar(ctx, FIELD.width / 2 - 190, 68, 380, 9, boss.hp / boss.maxHp, COLORS.warden, 'rgba(255,255,255,0.12)');
    }
    if (state.phase === 'intermission' && !state.over) {
      centredText(ctx, `next wave in ${Math.max(0, state.phaseTimer).toFixed(1)}`, 56, '13px system-ui, sans-serif', COLORS.dimText);
    }
    // Score, top right.
    ctx.textAlign = 'right';
    ctx.font = 'bold 21px system-ui, sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(String(state.score), FIELD.width - 18, 34);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText(`BEST ${Math.max(view.best, state.score)}`, FIELD.width - 18, 53);
    if (state.multiplier > 1) {
      ctx.fillStyle = '#ffe066';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(`COMBO ×${state.multiplier}`, FIELD.width - 18, 76);
      bar(ctx, FIELD.width - 118, 82, 100, 4, state.comboTimer / 2.6, '#ffe066', 'rgba(255,255,255,0.12)');
    }
    // Experience, bottom: level and the bar to the next choice.
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText(`LEVEL ${state.level}`, 18, FIELD.height - 34);
    bar(ctx, 18, FIELD.height - 28, 320, 10, state.xp / state.xpNext, COLORS.xp, 'rgba(255,255,255,0.12)');
    // Controls reminder, bottom right, and the mute state.
    ctx.textAlign = 'right';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText(`WASD move · mouse aim · hold to fire · SHIFT dash · P pause${view.muted ? ' · M sound: OFF' : ''}`, FIELD.width - 18, FIELD.height - 16);
  }

  /** A centred panel; returns its top edge so callers lay text out from the same box. */
  function panel(width, height) {
    const top = (FIELD.height - height) / 2;
    ctx.fillStyle = 'rgba(5, 6, 16, 0.78)';
    ctx.fillRect((FIELD.width - width) / 2, top, width, height);
    ctx.strokeStyle = 'rgba(77, 243, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect((FIELD.width - width) / 2, top, width, height);
    return top;
  }

  function drawTitle(state, view) {
    ctx.fillStyle = 'rgba(4, 5, 13, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.save();
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 36;
    centredText(ctx, 'NEON VOID', 196, 'bold 84px system-ui, sans-serif', COLORS.player);
    ctx.restore();
    centredText(ctx, 'Survive the swarm. Clear wave 10 to win the sector.', 238, '19px system-ui, sans-serif', COLORS.text);
    const panelTop = panel(620, 218);
    ctx.textAlign = 'left';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = COLORS.text;
    const lines = [
      'WASD / arrows — fly        Mouse — aim, hold to fire',
      'SHIFT / right mouse — dash (you are untouchable mid-dash)',
      'Collect gold shards to level up and choose an upgrade.',
      'Chain kills to raise the combo multiplier. Do not get touched.',
      'Five enemy kinds hunt you — and on waves 5 and 10, the WARDEN awaits.',
    ];
    lines.forEach((line, index) => ctx.fillText(line, FIELD.width / 2 - 282, panelTop + 42 + index * 32));
    centredText(ctx, 'CLICK OR PRESS ENTER TO LAUNCH', 592, 'bold 21px system-ui, sans-serif', '#ffe066');
    if (view.best > 0) centredText(ctx, `BEST SCORE ${view.best}`, 628, '14px system-ui, sans-serif', COLORS.dimText);
    void state;
  }

  function drawUpgrade(state) {
    ctx.fillStyle = 'rgba(4, 5, 13, 0.88)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    centredText(ctx, `LEVEL ${state.level}`, 168, 'bold 34px system-ui, sans-serif', '#ffe066');
    centredText(ctx, 'Choose an upgrade — click a card or press 1, 2 or 3', 202, '16px system-ui, sans-serif', COLORS.text);
    const rects = upgradeCardRects();
    state.choices.forEach((choice, index) => {
      const { x, y, width: cardWidth, height: cardHeight } = rects[index];
      ctx.fillStyle = 'rgba(13, 18, 38, 0.95)';
      ctx.fillRect(x, y, cardWidth, cardHeight);
      ctx.strokeStyle = 'rgba(255, 224, 102, 0.65)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cardWidth, cardHeight);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe066';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText(String(index + 1), x + cardWidth / 2, y + 42);
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 21px system-ui, sans-serif';
      ctx.fillText(choice.name, x + cardWidth / 2, y + 88);
      ctx.fillStyle = COLORS.dimText;
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillText(choice.blurb, x + cardWidth / 2, y + 122);
      const owned = state.taken[choice.id] ?? 0;
      ctx.fillText(owned > 0 ? `already fitted ×${owned}` : 'new fitting', x + cardWidth / 2, y + 156);
    });
  }

  function drawEnd(state, view, won) {
    ctx.fillStyle = won ? 'rgba(4, 16, 10, 0.66)' : 'rgba(16, 4, 8, 0.66)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    centredText(ctx, won ? 'SECTOR CLEARED!' : 'SHIP DOWN', 218, 'bold 62px system-ui, sans-serif', won ? '#51ff9e' : '#ff5d73');
    centredText(
      ctx,
      won ? 'You cleared wave 10 and won the sector.' : `Your ship fell on wave ${state.wave}.`,
      262,
      '18px system-ui, sans-serif',
      COLORS.text,
    );
    const panelTop = panel(430, 196);
    ctx.textAlign = 'left';
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillStyle = COLORS.text;
    const rows = [
      ['Final score', String(state.score)],
      ['Best score', String(Math.max(view.best, state.score))],
      ['Wave reached', String(state.wave)],
      ['Kills', String(state.kills)],
      ['Level', String(state.level)],
    ];
    rows.forEach(([label, value], index) => {
      ctx.fillText(label, FIELD.width / 2 - 180, panelTop + 40 + index * 30);
      ctx.textAlign = 'right';
      ctx.fillText(value, FIELD.width / 2 + 180, panelTop + 40 + index * 30);
      ctx.textAlign = 'left';
    });
    centredText(
      ctx,
      won ? 'PRESS C TO KEEP FLYING (ENDLESS) · R FOR A NEW RUN' : 'PRESS R OR CLICK TO FLY AGAIN',
      566,
      'bold 17px system-ui, sans-serif',
      '#ffe066',
    );
  }

  function draw(state, view) {
    ctx.save();
    if (view.shake > 0.2) {
      const t = state.time * 61;
      ctx.translate(Math.sin(t * 1.3) * view.shake, Math.cos(t * 1.7) * view.shake);
    }
    drawBackground(state);
    for (const shard of state.shards) drawShard(shard);
    // Enemy shots, then enemies, then the ship, then its shots: the eye ends on the player.
    ctx.fillStyle = COLORS.enemyBullet;
    ctx.shadowColor = COLORS.enemyBullet;
    ctx.shadowBlur = 9;
    for (const bullet of state.enemyBullets) {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (const enemy of state.enemies) drawEnemy(state, enemy);
    if (!state.over) drawShip(state);
    // Player shots wear short light trails, so a stream of fire reads as a stream.
    ctx.strokeStyle = 'rgba(174, 247, 255, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const bullet of state.bullets) {
      ctx.moveTo(bullet.x - bullet.vx * 0.03, bullet.y - bullet.vy * 0.03);
      ctx.lineTo(bullet.x, bullet.y);
    }
    ctx.stroke();
    ctx.fillStyle = COLORS.playerBullet;
    ctx.shadowColor = COLORS.playerBullet;
    ctx.shadowBlur = 8;
    for (const bullet of state.bullets) {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, PLAYER.bulletRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (const particle of state.particles) {
      if (particle.ring) {
        // A shockwave: born small, it spends its life growing and thinning out.
        const grown = 1 - particle.life / particle.maxLife;
        ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife) * 0.9;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 3.2 * (1 - grown) + 0.4;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.maxRadius * (0.12 + 0.88 * grown), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const item of state.floaters) {
      ctx.globalAlpha = Math.max(0, item.life / item.maxLife);
      ctx.font = `bold ${item.size}px system-ui, sans-serif`;
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, item.x, item.y);
    }
    ctx.globalAlpha = 1;
    // A soft vignette: the arena's corners fall away and the eye stays in the fight.
    const vignette = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 320, FIELD.width / 2, FIELD.height / 2, 780);
    vignette.addColorStop(0, 'rgba(2, 3, 8, 0)');
    vignette.addColorStop(1, 'rgba(2, 3, 8, 0.34)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    if (view.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255, 40, 70, ${0.22 * view.hurtFlash})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (state.player.hp <= 30 && !state.over && view.screen === SCREEN_PLAY) {
      const pulse = 0.1 + 0.07 * Math.sin(state.time * 5);
      const gradient = ctx.createRadialGradient(640, 360, 260, 640, 360, 640);
      gradient.addColorStop(0, 'rgba(255,0,40,0)');
      gradient.addColorStop(1, `rgba(255,0,40,${pulse})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    drawHud(state, view);
    if (view.screen === SCREEN_TITLE) drawTitle(state, view);
    else if (view.screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(4, 5, 13, 0.6)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      centredText(ctx, 'PAUSED', 330, 'bold 52px system-ui, sans-serif', COLORS.text);
      centredText(ctx, 'Press P to resume', 378, '17px system-ui, sans-serif', COLORS.dimText);
    } else if (view.screen === SCREEN_UPGRADE) drawUpgrade(state);
    else if (view.screen === SCREEN_OVER) drawEnd(state, view, false);
    else if (view.screen === SCREEN_WIN) drawEnd(state, view, true);
    ctx.restore();
  }

  return { draw };
}

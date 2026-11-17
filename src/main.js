// Boot and the one loop. The shell owns the screens (title, play, paused, the level-up choice,
// game over, victory) and everything around the rules: input, sound, the best score, the hurt
// flash and the screen shake. The world in world.js owns the rules themselves and advances in
// fixed 1/60 s steps, however fast frames arrive.
//
// ?seed=N fixes the run's random stream. ?shot=start|play|upgrade|end (with &seed=N) stages
// that screenshot scene instead of running the loop, paints it twice and sets
// window.__shotReady, the maker's way of taking the screenshots in screenshots/.

import { BEST_KEY, FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_BOSS, EVENT_BOSS_DOWN, EVENT_DASH, EVENT_ENEMY_SHOOT, EVENT_EXPLODE, EVENT_HURT, EVENT_LEVELUP, EVENT_OVER, EVENT_PICKUP, EVENT_SHOOT, EVENT_SPLIT, EVENT_WAVE, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_CONTINUE, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WIN, upgradeCardRects } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25; // a longer stall (a hidden tab) is dropped, not replayed

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

window.addEventListener('error', (event) => {
  status.textContent = `Neon Void hit an error: ${event.message}`;
});

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

if (shot !== null) {
  const scene = stageShot(shot, world);
  const view = { screen: scene.screen, best: Math.max(scene.best, readBest()), muted: false, shake: 0, hurtFlash: 0 };
  let painted = 0;
  const paint = () => {
    renderer.draw(world.state, view);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  runGame();
}

function runGame() {
  const input = createInput(canvas, FIELD);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let shake = 0;
  let hurtFlash = 0;
  let statusClock = 0;

  function announce() {
    const state = world.state;
    status.textContent = `Neon Void: ${screen}, wave ${state.wave}, score ${state.score}, hull ${Math.ceil(state.player.hp)} of ${state.player.maxHp}, level ${state.level}.`;
  }

  function startRun() {
    world.reset();
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.play('ui');
    announce();
  }

  function finishRun() {
    best = Math.max(best, world.state.score);
    saveBest(best);
  }

  function answerEvents(events) {
    for (const event of events) {
      if (event === EVENT_SHOOT) audio.play('shoot');
      else if (event === EVENT_ENEMY_SHOOT) audio.play('enemyShoot');
      else if (event === EVENT_EXPLODE) {
        audio.play('explode');
        shake = Math.max(shake, 2.5);
      } else if (event === EVENT_BOSS) {
        audio.play('boss');
        shake = Math.max(shake, 8);
      } else if (event === EVENT_BOSS_DOWN) {
        audio.play('bossDown');
        audio.play('explode');
        shake = Math.max(shake, 12);
      } else if (event === EVENT_SPLIT) audio.play('split');
      else if (event === EVENT_PICKUP) audio.play('pickup');
      else if (event === EVENT_LEVELUP) audio.play('levelup');
      else if (event === EVENT_DASH) audio.play('dash');
      else if (event === EVENT_WAVE) audio.play('ui');
      else if (event === EVENT_HURT) {
        audio.play('hurt');
        hurtFlash = 1;
        shake = Math.max(shake, 6);
      } else if (event === EVENT_WIN) {
        audio.play('win');
        finishRun();
        screen = SCREEN_WIN;
      } else if (event === EVENT_OVER) {
        audio.play('over');
        finishRun();
        shake = Math.max(shake, 10);
        screen = SCREEN_OVER;
      }
    }
    if (world.state.pendingLevels > 0 && screen === SCREEN_PLAY) screen = SCREEN_UPGRADE;
  }

  function stepPlay() {
    const move = input.move();
    const events = world.step(STEP, {
      moveX: move.x,
      moveY: move.y,
      aimX: input.mouse.x,
      aimY: input.mouse.y,
      firing: input.firing(),
      dash: input.dashing(),
    });
    answerEvents(events);
  }

  function stepTitleBackdrop() {
    // The title floats over a living arena: the ship patrols, untouchable, while the swarm
    // gathers. It is the game's own world stepping, never a recording.
    const state = world.state;
    state.player.invulnTimer = 999;
    const angle = state.time * 0.45;
    world.step(STEP, {
      moveX: Math.cos(angle),
      moveY: Math.sin(angle) * 0.6,
      aimX: state.player.x + Math.cos(angle),
      aimY: state.player.y + Math.sin(angle),
      firing: false,
      dash: false,
    });
    state.player.invulnTimer = 0;
    if (state.over) world.reset();
  }

  function choose(index) {
    if (world.applyChoice(index)) {
      audio.play('ui');
      if (world.state.pendingLevels === 0) screen = SCREEN_PLAY;
    }
  }

  canvas.addEventListener('mousedown', () => {
    audio.unlock();
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER) startRun();
    else if (screen === SCREEN_WIN) {
      world.state.endless = true;
      screen = SCREEN_PLAY;
      audio.play('ui');
    } else if (screen === SCREEN_UPGRADE) {
      const rects = upgradeCardRects();
      const index = rects.findIndex(
        (rect) => input.mouse.x >= rect.x && input.mouse.x <= rect.x + rect.width && input.mouse.y >= rect.y && input.mouse.y <= rect.y + rect.height,
      );
      if (index !== -1) choose(index);
    }
  });

  function handleActions() {
    let action = input.takeAction();
    while (action !== null) {
      if (action === ACTION_MUTE) audio.toggleMute();
      else if (action === ACTION_PAUSE) {
        if (screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
        else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
      } else if (action === ACTION_CONFIRM) {
        if (screen === SCREEN_TITLE || screen === SCREEN_OVER) startRun();
        else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
      } else if (action === ACTION_RESTART) {
        if (screen === SCREEN_OVER || screen === SCREEN_WIN || screen === SCREEN_PAUSED) startRun();
      } else if (action === ACTION_CONTINUE) {
        if (screen === SCREEN_WIN) {
          world.state.endless = true;
          screen = SCREEN_PLAY;
        }
      }
      action = input.takeAction();
    }
    if (screen === SCREEN_UPGRADE) {
      const choice = input.takeChoice();
      if (choice >= 1 && choice <= 3) choose(choice - 1);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > MAX_FRAME) elapsed = MAX_FRAME;
    handleActions();
    if (screen === SCREEN_PLAY) {
      // Hit-stop: after a heavy kill the rules freeze the world for a blink. The frame still
      // draws — only the stepping waits — so the pause reads as impact, not as a stall.
      if (world.state.hitStop > 0) {
        world.state.hitStop -= elapsed;
        accumulator = 0;
      } else {
        accumulator += elapsed;
        while (accumulator >= STEP && screen === SCREEN_PLAY) {
          accumulator -= STEP;
          stepPlay();
        }
      }
      if (screen !== SCREEN_PLAY) accumulator = 0;
    } else if (screen === SCREEN_TITLE) {
      accumulator += elapsed;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        stepTitleBackdrop();
      }
    }
    shake *= 0.86;
    hurtFlash *= 0.88;
    renderer.draw(world.state, { screen, best, muted: audio.muted, shake, hurtFlash });
    statusClock += elapsed;
    if (statusClock > 0.5) {
      statusClock = 0;
      announce();
    }
  }

  announce();
  requestAnimationFrame(frame);
}

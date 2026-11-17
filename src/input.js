// Keyboard and mouse, gathered in one place. The world never listens to the DOM: main.js asks
// this module each frame where the player wants to go, what they aim at and whether they fired
// or dashed, and reads one-shot actions (pause, confirm, mute) from a queue the listeners fill.
// Mouse positions are converted from client coordinates into the game's logical field, so the
// aim is right whatever size the window is.

export const ACTION_PAUSE = 'pause';
export const ACTION_CONFIRM = 'confirm';
export const ACTION_MUTE = 'mute';
export const ACTION_RESTART = 'restart';
export const ACTION_CONTINUE = 'continue';

const ACTION_KEYS = {
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  Enter: ACTION_CONFIRM,
  KeyM: ACTION_MUTE,
  KeyR: ACTION_RESTART,
  KeyC: ACTION_CONTINUE,
};

export function createInput(canvas, field) {
  const keys = new Set();
  const actions = [];
  const mouse = { x: field.width / 2, y: field.height / 3, down: false, rightDown: false };
  let choice = 0; // a number key 1-3 pressed since the last read, for the level-up cards

  function toField(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * field.width;
    mouse.y = ((event.clientY - rect.top) / rect.height) * field.height;
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') event.preventDefault();
    keys.add(event.code);
    const action = ACTION_KEYS[event.code];
    if (action !== undefined && !event.repeat) actions.push(action);
    if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') {
      choice = Number(event.code.slice(-1));
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousemove', toField);
  canvas.addEventListener('mousedown', (event) => {
    toField(event);
    if (event.button === 0) mouse.down = true;
    if (event.button === 2) mouse.rightDown = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
    if (event.button === 2) mouse.rightDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    /** The movement the player is asking for, as a direction in [-1, 1] on each axis. */
    move() {
      const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    /** Firing: the left mouse button, or Space held. */
    firing() {
      return mouse.down || keys.has('Space');
    },
    /** Dashing: Shift, or the right mouse button. */
    dashing() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight') || mouse.rightDown;
    },
    /** Take the next queued one-shot action, or null when there is none. */
    takeAction() {
      return actions.length > 0 ? actions.shift() : null;
    },
    /** Take a pending level-up choice (1-3), or 0 when no number key was pressed. */
    takeChoice() {
      const value = choice;
      choice = 0;
      return value;
    },
  };
}

'use strict';

// Session shape: { step, posts: string[], temp: {}, _lastAccess: number }
const STEPS = Object.freeze({
  IDLE:                'idle',
  ONBOARDING_STYLE:    'onboarding_style',
  ONBOARDING_LAYOUT:   'onboarding_layout',
  ONBOARDING_TONE:     'onboarding_tone',
  WAITING_VOICE:       'waiting_voice',
  WAITING_REVISE_PICK: 'waiting_revise_pick',
  WAITING_REVISE_INPUT:'waiting_revise_input',
});

const store = new Map();

function getSession(telegramId) {
  if (!store.has(telegramId)) {
    store.set(telegramId, { step: STEPS.IDLE, posts: [], temp: {}, _lastAccess: Date.now() });
  }
  const session = store.get(telegramId);
  session._lastAccess = Date.now();
  return session;
}

function updateSession(telegramId, patch) {
  Object.assign(getSession(telegramId), patch, { _lastAccess: Date.now() });
}

// Prune sessions older than 30 minutes every 10 minutes
setInterval(() => {
  const threshold = Date.now() - 30 * 60 * 1000;
  let pruned = 0;
  for (const [id, session] of store.entries()) {
    if (session._lastAccess < threshold) { store.delete(id); pruned++; }
  }
  if (pruned) console.log(`[SessionStore] Pruned ${pruned} stale session(s). Active: ${store.size}`);
}, 10 * 60 * 1000).unref();

module.exports = { STEPS, getSession, updateSession };

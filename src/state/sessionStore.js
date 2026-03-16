// src/state/sessionStore.js
// ─────────────────────────────────────────────────────────────────────────────
// In-memory Finite-State-Machine (FSM) session store.
//
// WHY IN-MEMORY (not MongoDB)?
//   Telegram conversations are short-lived and stateful only for the duration
//   of the interaction. Persisting every ephemeral step to the DB adds latency
//   and complexity with no benefit — if the server restarts mid-conversation
//   the user simply sends /start again. Long-lived data (preferences, tokens)
//   IS stored in MongoDB via the User model.
//
// SESSION SHAPE
//   {
//     step     : string   — current FSM state (see STEPS export below)
//     posts    : string[] — the 3 most recently generated LinkedIn posts
//     temp     : {}       — scratch space for multi-step flows
//   }
//
// FSM STATE TRANSITIONS
//
//   /start (new user)
//     idle → onboarding_style → onboarding_layout → onboarding_tone → waiting_voice
//
//   /start (returning user)
//     idle → waiting_voice
//
//   voice note received (step === waiting_voice)
//     waiting_voice → waiting_voice   (stays ready for next voice note after action)
//
//   "🔄 Refine" button pressed
//     waiting_voice → waiting_revise_pick
//
//   revise_pick_X button pressed
//     waiting_revise_pick → waiting_revise_input
//
//   refinement voice note or text received
//     waiting_revise_input → waiting_voice
//
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// Named step constants — use these everywhere instead of raw strings to avoid
// typo-induced bugs that are silently swallowed by string comparisons.
const STEPS = Object.freeze({
  IDLE:                'idle',
  ONBOARDING_STYLE:    'onboarding_style',
  ONBOARDING_LAYOUT:   'onboarding_layout',
  ONBOARDING_TONE:     'onboarding_tone',
  WAITING_VOICE:       'waiting_voice',
  WAITING_REVISE_PICK: 'waiting_revise_pick',
  WAITING_REVISE_INPUT:'waiting_revise_input',
});

// The backing store. We deliberately keep sessions TTL-limited so memory does
// not grow unbounded in a long-running production process.
const store = new Map(); // key: telegramId (string) → value: SessionData

// Sessions older than this are pruned by the periodic cleanup below.
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Returns the session for the given telegramId, creating a fresh one if none
 * exists. Accessing a session refreshes its TTL (touch behaviour).
 *
 * @param {string} telegramId
 * @returns {{ step: string, posts: string[], temp: object, _lastAccess: number }}
 */
function getSession(telegramId) {
  if (!store.has(telegramId)) {
    store.set(telegramId, _makeSession());
  }
  const session = store.get(telegramId);
  session._lastAccess = Date.now(); // refresh TTL on read
  return session;
}

/**
 * Overwrites the session for telegramId with the provided partial update.
 * Any field not provided is preserved from the existing session.
 *
 * @param {string} telegramId
 * @param {Partial<SessionData>} patch
 */
function updateSession(telegramId, patch) {
  const session = getSession(telegramId);
  Object.assign(session, patch, { _lastAccess: Date.now() });
}

/**
 * Resets the session for telegramId back to its initial idle state but keeps
 * nothing — useful after a fatal error or /start with a returning user.
 *
 * @param {string} telegramId
 */
function clearSession(telegramId) {
  store.set(telegramId, _makeSession());
}

/**
 * Returns true if the given telegramId has an active (non-expired) session.
 *
 * @param {string} telegramId
 * @returns {boolean}
 */
function hasSession(telegramId) {
  return store.has(telegramId);
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _makeSession() {
  return {
    step:        STEPS.IDLE,
    posts:       [],   // string[3] — last generated posts
    temp:        {},   // scratch pad
    _lastAccess: Date.now(),
  };
}

// Periodic TTL pruning — runs every 10 minutes to evict stale sessions.
// This prevents unbounded memory growth in long-running processes without
// requiring a full Redis/external cache setup.
const PRUNE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

setInterval(() => {
  const threshold = Date.now() - SESSION_TTL_MS;
  let pruned = 0;
  for (const [id, session] of store.entries()) {
    if (session._lastAccess < threshold) {
      store.delete(id);
      pruned++;
    }
  }
  if (pruned > 0) {
    console.log(`[SessionStore] Pruned ${pruned} stale session(s). Active: ${store.size}`);
  }
}, PRUNE_INTERVAL_MS).unref(); // .unref() so the interval doesn't block process exit

module.exports = { STEPS, getSession, updateSession, clearSession, hasSession };

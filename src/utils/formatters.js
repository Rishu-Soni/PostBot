'use strict';

/**
 * Sanitizes raw, untrusted text (e.g., Gemini output) for safe transmission
 * via Telegraf's MarkdownV2 parse_mode.
 *
 * Telegram's MarkdownV2 spec requires ALL of the following characters to be
 * backslash-escaped when they appear as literal text (not as formatting syntax):
 *   _ * [ ] ( ) ~ ` > # + - = | { } . !
 *
 * IMPORTANT: Only call this function on raw/untrusted content (e.g., Gemini
 * output). For your own hardcoded bot strings that contain intentional bold/
 * italic Markdown, keep using parse_mode: 'Markdown' (v1) and do NOT pass
 * them through this function.
 *
 * @param {string} text - Raw text to sanitize (e.g., a Gemini-generated post)
 * @returns {string} - Fully escaped string safe for MarkdownV2 payloads
 */
function escapeMarkdownV2(text) {
  if (!text) return '';
  // Escape ALL MarkdownV2 reserved characters, including the backslash itself first.
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

module.exports = { escapeMarkdownV2 };

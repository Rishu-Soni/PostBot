const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const PREFIX = 'enc:';

/**
 * Derives a consistent 32-byte Buffer key from the configured ENCRYPTION_KEY.
 * Accepts 64-char hex, 44-char base64, or any UTF-8 passphrase (hashed via SHA-256).
 */
const getEncryptionKey = () => {
  const rawKey = process.env.ENCRYPTION_KEY;

  if (!rawKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[Security] FATAL: ENCRYPTION_KEY environment variable is missing in production. App cannot start.'
      );
    }
    // Safe deterministic development fallback for local testing
    return crypto.createHash('sha256').update('dev-postbot-encryption-key-local-only').digest();
  }

  // 64-hex string (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }

  // 44-char base64 string (32 bytes)
  if (/^[A-Za-z0-9+/]{43}=$/.test(rawKey)) {
    return Buffer.from(rawKey, 'base64');
  }

  // General string passphrase -> normalize to 32 bytes via SHA-256
  return crypto.createHash('sha256').update(rawKey, 'utf8').digest();
};

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: enc:<iv-hex>:<authTag-hex>:<ciphertext-hex>
 *
 * @param {string|null|undefined} text - Plaintext to encrypt
 * @returns {string|null} Encrypted string or original value if empty
 */
const encrypt = (text) => {
  if (text === null || text === undefined || text === '') {
    return text;
  }

  if (typeof text !== 'string') {
    text = String(text);
  }

  // Avoid re-encrypting already encrypted values
  if (text.startsWith(PREFIX)) {
    return text;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
};

/**
 * Decrypts an AES-256-GCM encrypted string.
 *
 * @param {string|null|undefined} encryptedText - Encrypted string
 * @returns {string|null} Decrypted plaintext
 */
const decrypt = (encryptedText) => {
  if (!encryptedText || typeof encryptedText !== 'string' || !encryptedText.startsWith(PREFIX)) {
    return encryptedText;
  }

  try {
    const key = getEncryptionKey();
    const parts = encryptedText.slice(PREFIX.length).split(':');

    if (parts.length !== 3) {
      console.warn('[Crypto] Invalid encrypted payload format, returning raw string');
      return encryptedText;
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('[Crypto] Decryption failed:', error.message);
    return encryptedText;
  }
};

module.exports = {
  encrypt,
  decrypt,
  getEncryptionKey,
};

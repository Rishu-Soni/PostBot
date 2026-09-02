import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes recommended for AES-GCM

/**
 * Derives a 32-byte key from process.env.TOKEN_ENCRYPTION_KEY
 */
const getEncryptionKey = () => {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not defined');
  }

  // If already a 64-char hex string (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, 'hex');
  }

  // If exactly 32 bytes in UTF-8
  if (Buffer.byteLength(secret, 'utf8') === 32) {
    return Buffer.from(secret, 'utf8');
  }

  // Fallback: derive 32-byte key via SHA-256
  return crypto.createHash('sha256').update(secret).digest();
};

/**
 * Encrypt a plaintext string using AES-256-GCM
 * @param {string} text Plaintext to encrypt
 * @returns {string} Colon-delimited serialized string (iv:authTag:encryptedContent)
 */
export const encrypt = (text) => {
  if (text === null || text === undefined) {
    return text;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
};

/**
 * Decrypt a ciphertext string using AES-256-GCM
 * @param {string} encryptedText Colon-delimited serialized string (iv:authTag:encryptedContent)
 * @returns {string} Decrypted plaintext string
 */
export const decrypt = (encryptedText) => {
  if (encryptedText === null || encryptedText === undefined) {
    return encryptedText;
  }

  const parts = String(encryptedText).split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format: expected iv:authTag:encryptedContent');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

export default {
  encrypt,
  decrypt,
};

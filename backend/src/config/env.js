/**
 * Centralized Environment Configuration & Production Guard.
 * Fails loud on startup if required secrets or secure connection strings
 * are missing or insecure when NODE_ENV === 'production'.
 */

const validateEnv = () => {
  const isProd = process.env.NODE_ENV === 'production';
  const missingSecrets = [];

  // A1: JWT_SECRET & ADMIN_KEY checks
  if (!process.env.JWT_SECRET) {
    if (isProd) {
      missingSecrets.push('JWT_SECRET (cannot use dev fallback in production)');
    } else {
      console.warn('[Security Warning] JWT_SECRET is unset. Using insecure dev fallback for local development only.');
    }
  }

  if (!process.env.ADMIN_KEY) {
    if (isProd) {
      missingSecrets.push('ADMIN_KEY (cannot use dev fallback in production)');
    } else {
      console.warn('[Security Warning] ADMIN_KEY is unset. Using insecure dev fallback for local development only.');
    }
  }

  // D1: ENCRYPTION_KEY check
  if (!process.env.ENCRYPTION_KEY) {
    if (isProd) {
      missingSecrets.push('ENCRYPTION_KEY (required for field-level token encryption at rest)');
    } else {
      console.warn('[Security Warning] ENCRYPTION_KEY is unset. Using insecure local fallback for development only.');
    }
  }

  // G2: MONGO_URI in production check
  if (isProd) {
    const mongoUri = process.env.MONGO_URI || '';
    if (!mongoUri) {
      missingSecrets.push('MONGO_URI (production database connection string is required)');
    } else if (
      mongoUri.includes('127.0.0.1') ||
      mongoUri.includes('localhost')
    ) {
      missingSecrets.push('MONGO_URI points to localhost in production');
    } else if (
      !mongoUri.startsWith('mongodb+srv://') &&
      !mongoUri.includes('tls=true') &&
      !mongoUri.includes('ssl=true')
    ) {
      missingSecrets.push('MONGO_URI must enforce TLS/SSL in production (use mongodb+srv:// or add ?tls=true)');
    }
  }

  if (missingSecrets.length > 0) {
    const errorMsg = `[FATAL CONFIG ERROR] Security requirements not satisfied for production:\n  - ${missingSecrets.join(
      '\n  - '
    )}\nServer boot aborted.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
};

const getJwtSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET must be configured in production.');
  }
  return 'dev-postbot-jwt-secret-key';
};

const getAdminKey = () => {
  if (process.env.ADMIN_KEY) return process.env.ADMIN_KEY;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: ADMIN_KEY must be configured in production.');
  }
  return 'dev-postbot-admin-secret';
};

module.exports = {
  validateEnv,
  getJwtSecret,
  getAdminKey,
};

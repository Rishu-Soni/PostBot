import jwt from 'jsonwebtoken';

/**
 * Middleware to verify JWT authentication token from Authorization header.
 * Attaches req.userId on successful verification.
 * Returns 401 status if token is missing, expired, or invalid.
 */
export const requireAuth = (req, res, next) => {
  let token = null;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized: Authentication token is missing or malformed',
    });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not configured in environment variables');
      return res.status(500).json({
        error: 'Internal server configuration error',
      });
    }

    const decoded = jwt.verify(token, secret);

    if (!decoded || !decoded.userId) {
      return res.status(401).json({
        error: 'Unauthorized: Invalid token payload',
      });
    }

    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Unauthorized: Authentication token has expired',
      });
    }
    return res.status(401).json({
      error: 'Unauthorized: Invalid authentication token',
    });
  }
};

export default requireAuth;

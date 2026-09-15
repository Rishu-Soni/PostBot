const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-postbot-jwt-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Signs a standard JWT token for the given user ID.
 */
const signToken = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

/**
 * Filters out private internal fields from user object before sending response.
 */
const sanitizeUser = (userDoc) => {
  const userObj = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  delete userObj.passwordHash;
  if (userObj.linkedin) {
    delete userObj.linkedin.accessToken;
    delete userObj.linkedin.refreshToken;
  }
  delete userObj.imageGenApiKey;
  return userObj;
};

/**
 * Register a new user account.
 * Route: POST /api/v1/auth/register
 */
const register = asyncHandler(async (req, res, next) => {
  const { name, email, password } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('An account with this email address already exists.', 409));
  }

  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);

  const newUser = await User.create({
    name,
    email,
    passwordHash,
    creditBalance: 0,
  });

  const token = signToken(newUser._id);

  res.status(201).json({
    success: true,
    data: {
      token,
      user: sanitizeUser(newUser),
    },
  });
});

/**
 * Authenticate existing user with email and password.
 * Route: POST /api/v1/auth/login
 */
const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    return next(new AppError('Invalid email or password.', 401));
  }

  const isPasswordCorrect = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordCorrect) {
    return next(new AppError('Invalid email or password.', 401));
  }

  const token = signToken(user._id);

  res.status(200).json({
    success: true,
    data: {
      token,
      user: sanitizeUser(user),
    },
  });
});

/**
 * Get current authenticated user profile.
 * Route: GET /api/v1/auth/me
 */
const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      user: sanitizeUser(req.user),
    },
  });
});

/**
 * Update current authenticated user profile and settings.
 * Route: PATCH /api/v1/auth/me
 */
const updateMe = asyncHandler(async (req, res) => {
  const allowedUpdates = ['name', 'timezone', 'defaultPostTime', 'notificationPrefs'];
  const user = req.user;

  if (req.body.name !== undefined) user.name = req.body.name.trim();
  if (req.body.timezone !== undefined) user.timezone = req.body.timezone.trim();
  if (req.body.defaultPostTime !== undefined) user.defaultPostTime = req.body.defaultPostTime.trim();

  if (req.body.notificationPrefs && typeof req.body.notificationPrefs === 'object') {
    if (!user.notificationPrefs) {
      user.notificationPrefs = {};
    }
    if (req.body.notificationPrefs.email !== undefined) {
      user.notificationPrefs.email = req.body.notificationPrefs.email;
    }
    if (req.body.notificationPrefs.phone !== undefined) {
      user.notificationPrefs.phone = req.body.notificationPrefs.phone;
    }
    if (req.body.notificationPrefs.emailEnabled !== undefined) {
      user.notificationPrefs.emailEnabled = Boolean(req.body.notificationPrefs.emailEnabled);
    }
    if (req.body.notificationPrefs.smsEnabled !== undefined) {
      user.notificationPrefs.smsEnabled = Boolean(req.body.notificationPrefs.smsEnabled);
    }
  }

  await user.save();

  res.status(200).json({
    success: true,
    data: {
      user: sanitizeUser(user),
    },
  });
});

module.exports = {
  register,
  login,
  getMe,
  updateMe,
};

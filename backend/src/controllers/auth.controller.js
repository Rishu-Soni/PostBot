import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Generate a JWT token for a given user id (7-day expiration).
 */
const generateToken = (userId) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not defined');
  }
  return jwt.sign({ userId }, secret, { expiresIn: '7d' });
};

/**
 * Helper to sanitize user object for client responses
 */
const sanitizeUser = (user) => {
  const userObj = user.toObject ? user.toObject() : { ...user };
  delete userObj.passwordHash;
  if (userObj.linkedin) {
    delete userObj.linkedin.accessTokenEnc;
    delete userObj.linkedin.refreshTokenEnc;
  }
  return userObj;
};

/**
 * POST /api/auth/signup
 * Register a new user with name, email, and password
 */
export const signup = async (req, res) => {
  try {
    const { name, email, password, timezone } = req.body;

    // Validate input presence
    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Name, email, and password are required',
      });
    }

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (trimmedName.length === 0) {
      return res.status(400).json({
        error: 'Name cannot be empty',
      });
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        error: 'Please provide a valid email address',
      });
    }

    // Password length validation
    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters long',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        error: 'An account with this email already exists',
      });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const newUser = new User({
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
      timezone: timezone || 'UTC',
    });

    await newUser.save();

    // Generate JWT
    const token = generateToken(newUser._id);

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: sanitizeUser(newUser),
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({
      error: 'Failed to register user. Please try again.',
    });
  }
};

/**
 * POST /api/auth/login
 * Authenticate user with email and password
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user by email
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password',
      });
    }

    // Compare password hash
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid email or password',
      });
    }

    // Generate JWT
    const token = generateToken(user._id);

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      error: 'Failed to log in. Please try again.',
    });
  }
};

/**
 * GET /api/auth/me
 * Get current authenticated user profile
 */
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      '-passwordHash -linkedin.accessTokenEnc -linkedin.refreshTokenEnc'
    );

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    return res.status(200).json({
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({
      error: 'Failed to fetch user profile',
    });
  }
};

export default {
  signup,
  login,
  getMe,
};

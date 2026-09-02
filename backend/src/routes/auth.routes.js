import express from 'express';
import { signup, login, getMe } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// Public routes
router.post('/signup', signup);
router.post('/login', login);

// Protected routes
router.get('/me', requireAuth, getMe);

export default router;

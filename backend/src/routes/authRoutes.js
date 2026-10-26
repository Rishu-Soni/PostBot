const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { authRateLimiter } = require('../middleware/rateLimiter');
const { registerSchema, loginSchema } = require('../validators');

// Public authentication routes (guarded against brute-force & credential stuffing)
router.post('/register', authRateLimiter, validate(registerSchema), authController.register);
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);

// Protected session route
router.get('/me', auth, authController.getMe);
router.patch('/me', auth, authController.updateMe);

module.exports = router;

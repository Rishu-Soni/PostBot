const express = require('express');
const router = express.Router();
const linkedinController = require('../controllers/linkedinController');
const auth = require('../middleware/auth');

// Connect LinkedIn account (starts OAuth flow) — accepts /connect and /auth
router.get('/connect', auth, linkedinController.connect);
router.get('/auth', auth, linkedinController.connect);

// OAuth callback endpoint (supports both browser GET redirect / frontend GET, and authenticated POST)
router.get('/callback', linkedinController.callback);
router.post('/callback', auth, linkedinController.callback);

// Check LinkedIn connection status
router.get('/status', auth, linkedinController.getStatus);

// Disconnect LinkedIn account — supports DELETE and POST
router.delete('/disconnect', auth, linkedinController.disconnect);
router.post('/disconnect', auth, linkedinController.disconnect);

module.exports = router;

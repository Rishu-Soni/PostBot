const express = require('express');
const router = express.Router();
const linkedinController = require('../controllers/linkedinController');
const auth = require('../middleware/auth');

// Connect LinkedIn account (starts OAuth flow)
router.get('/connect', auth, linkedinController.connect);

// OAuth callback endpoint (invoked directly by LinkedIn redirect)
router.get('/callback', linkedinController.callback);

// Disconnect LinkedIn account
router.delete('/disconnect', auth, linkedinController.disconnect);

module.exports = router;

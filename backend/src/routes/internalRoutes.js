const express = require('express');
const router = express.Router();
const internalController = require('../controllers/internalController');
const adminAuth = require('../middleware/adminAuth');

// Manually trigger a scheduler pass for testing without cron (protected by x-admin-key)
router.post('/scheduler/run-now', adminAuth, internalController.runSchedulerNow);

module.exports = router;

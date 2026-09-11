const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { Notification } = require('../models');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ownsResource } = require('../middleware/ownership');
const { queryNotificationsSchema, notificationIdParamSchema } = require('../validators');

// List alert notifications
router.get(
  '/',
  auth,
  validate(queryNotificationsSchema),
  notificationController.listNotifications
);

// Resolve alert notification
router.patch(
  '/:id/resolve',
  auth,
  validate(notificationIdParamSchema),
  ownsResource(Notification, 'id'),
  notificationController.resolveNotification
);

module.exports = router;

const express = require('express');
const router = express.Router();
const batchController = require('../controllers/batchController');
const { ContentBatch } = require('../models');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ownsResource } = require('../middleware/ownership');
const linkedinGuard = require('../middleware/linkedinGuard');
const {
  createBatchSchema,
  updateDayCountSchema,
  listBatchesQuerySchema,
} = require('../validators');

// Intake and initialize new batch
router.post('/', auth, validate(createBatchSchema), batchController.createBatch);

// List user's batches
router.get('/', auth, validate(listBatchesQuerySchema), batchController.listBatches);

// Fetch single batch and its posts
router.get(
  '/:batchId',
  auth,
  ownsResource(ContentBatch, 'batchId'),
  batchController.getBatch
);

// Adjust day count and trigger post generation
router.patch(
  '/:batchId/day-count',
  auth,
  ownsResource(ContentBatch, 'batchId'),
  validate(updateDayCountSchema),
  batchController.updateDayCount
);

// Confirm batch and schedule all posts
router.post(
  '/:batchId/confirm',
  auth,
  ownsResource(ContentBatch, 'batchId'),
  linkedinGuard,
  batchController.confirmBatch
);

// Cancel and delete draft batch
router.delete(
  '/:batchId',
  auth,
  ownsResource(ContentBatch, 'batchId'),
  batchController.deleteBatch
);

module.exports = router;

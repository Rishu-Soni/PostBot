const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const linkedinRoutes = require('./linkedinRoutes');
const batchRoutes = require('./batchRoutes');
const postRoutes = require('./postRoutes');
const creditRoutes = require('./creditRoutes');
const notificationRoutes = require('./notificationRoutes');
const internalRoutes = require('./internalRoutes');

// Mount sub-routers under their respective resource paths
router.use('/auth', authRoutes);
router.use('/linkedin', linkedinRoutes);
router.use('/batches', batchRoutes);
router.use('/posts', postRoutes);
router.use('/credits', creditRoutes);
router.use('/notifications', notificationRoutes);
router.use('/internal', internalRoutes);

module.exports = router;

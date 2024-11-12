// src/routes/index.js
const express = require('express');
const router = express.Router();
const patientRoutes = require('./patientRoutes');
const appointmentRoutes = require('./appointmentRoutes');
const doctorRoutes = require('./doctorRoutes');
const insuranceRoutes = require('./insuranceRoutes');
const billingRoutes = require('./billingRoutes');

// Mount routes
router.use('/patients', patientRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/doctors', doctorRoutes);
router.use('/insurance', insuranceRoutes);
router.use('/billing', billingRoutes);

module.exports = router;
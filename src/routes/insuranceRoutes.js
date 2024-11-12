// src/routes/insuranceRoutes.js
const express = require('express');
const router = express.Router();
const insuranceController = require('../controllers/insuranceController');

// POST /api/insurance/verify - Verify insurance
router.post('/verify', insuranceController.verifyInsurance);

// GET /api/insurance/providers - Get insurance providers
router.get('/providers', insuranceController.getProviders);

// POST /api/insurance/claims - Submit insurance claim
router.post('/claims', insuranceController.submitClaim);

// GET /api/insurance/claims/:id - Get claim status
router.get('/claims/:id', insuranceController.getClaimStatus);

// GET /api/insurance/coverage/:patientId - Get patient coverage
router.get('/coverage/:patientId', insuranceController.getPatientCoverage);

module.exports = router;
// src/routes/billingRoutes.js
const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');

// GET /api/billing/invoices - Get all invoices
router.get('/invoices', billingController.getAllInvoices);

// GET /api/billing/invoices/:id - Get single invoice
router.get('/invoices/:id', billingController.getInvoiceById);

// POST /api/billing/invoices - Create new invoice
router.post('/invoices', billingController.createInvoice);

// POST /api/billing/payments - Process payment
router.post('/payments', billingController.processPayment);

// GET /api/billing/payments/:patientId - Get patient payments
router.get('/payments/:patientId', billingController.getPatientPayments);

// GET /api/billing/statements/:patientId - Get billing statements
router.get('/statements/:patientId', billingController.getBillingStatements);

module.exports = router;
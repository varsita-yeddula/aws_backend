// src/routes/patientRoutes.js
const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');

// GET /api/patients - Get all patients
router.get('/', patientController.getAllPatients);

// GET /api/patients/:id - Get single patient
router.get('/:id', patientController.getPatientById);

// POST /api/patients - Create new patient
router.post('/', patientController.createPatient);

// PUT /api/patients/:id - Update patient
router.put('/:id', patientController.updatePatient);

// DELETE /api/patients/:id - Delete patient
router.delete('/:id', patientController.deletePatient);

// GET /api/patients/:id/appointments - Get patient's appointments
router.get('/:id/appointments', patientController.getPatientAppointments);

// GET /api/patients/:id/medical-history - Get patient's medical history
router.get('/:id/medical-history', patientController.getMedicalHistory);

module.exports = router;
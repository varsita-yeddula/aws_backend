// src/routes/doctorRoutes.js
const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');

// GET /api/doctors - Get all doctors
router.get('/', doctorController.getAllDoctors);

// GET /api/doctors/:id - Get single doctor
router.get('/:id', doctorController.getDoctorById);

// POST /api/doctors - Add new doctor
router.post('/', doctorController.createDoctor);

// PUT /api/doctors/:id - Update doctor
router.put('/:id', doctorController.updateDoctor);

// DELETE /api/doctors/:id - Remove doctor
router.delete('/:id', doctorController.deleteDoctor);

// GET /api/doctors/:id/schedule - Get doctor's schedule
router.get('/:id/schedule', doctorController.getDoctorSchedule);

module.exports = router;
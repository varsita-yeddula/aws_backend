// src/routes/appointmentRoutes.js
const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');

// GET /api/appointments - Get all appointments
router.get('/', appointmentController.getAllAppointments);

// GET /api/appointments/:id - Get single appointment
router.get('/:id', appointmentController.getAppointmentById);

// POST /api/appointments - Create new appointment
router.post('/', appointmentController.createAppointment);

// PUT /api/appointments/:id - Update appointment
router.put('/:id', appointmentController.updateAppointment);

// DELETE /api/appointments/:id - Cancel appointment
router.delete('/:id', appointmentController.cancelAppointment);

// GET /api/appointments/doctor/:doctorId - Get doctor's appointments
router.get('/doctor/:doctorId', appointmentController.getDoctorAppointments);

// GET /api/appointments/slots/:doctorId - Get available slots
router.get('/slots/:doctorId', appointmentController.getAvailableSlots);

module.exports = router;
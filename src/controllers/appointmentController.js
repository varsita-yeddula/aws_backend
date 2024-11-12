// src/controllers/appointmentController.js
const { 
    PutCommand, 
    GetCommand, 
    QueryCommand, 
    UpdateCommand, 
    DeleteCommand 
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = 'Appointments';

const appointmentController = {
    // Get all appointments with filtering and pagination
    getAllAppointments: async (req, res) => {
        try {
            const { 
                limit = 10, 
                lastEvaluatedKey,
                date,
                status
            } = req.query;

            let params = {
                TableName: TABLE_NAME,
                Limit: parseInt(limit)
            };

            // Add filtering if date or status is provided
            if (date || status) {
                let filterExpression = [];
                let expressionAttributeValues = {};

                if (date) {
                    filterExpression.push('appointmentDate = :date');
                    expressionAttributeValues[':date'] = date;
                }

                if (status) {
                    filterExpression.push('appointmentStatus = :status');
                    expressionAttributeValues[':status'] = status;
                }

                params.FilterExpression = filterExpression.join(' AND ');
                params.ExpressionAttributeValues = expressionAttributeValues;
            }

            if (lastEvaluatedKey) {
                params.ExclusiveStartKey = JSON.parse(lastEvaluatedKey);
            }

            const command = new QueryCommand(params);
            const data = await req.app.locals.ddbDocClient.send(command);

            res.json({
                success: true,
                data: data.Items,
                lastEvaluatedKey: data.LastEvaluatedKey ? 
                    JSON.stringify(data.LastEvaluatedKey) : 
                    null,
                count: data.Items.length
            });
        } catch (error) {
            console.error('Error fetching appointments:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching appointments',
                error: error.message
            });
        }
    },

    // Get single appointment by ID
    getAppointmentById: async (req, res) => {
        try {
            const command = new GetCommand({
                TableName: TABLE_NAME,
                Key: {
                    appointmentId: req.params.id
                }
            });

            const data = await req.app.locals.ddbDocClient.send(command);

            if (!data.Item) {
                return res.status(404).json({
                    success: false,
                    message: 'Appointment not found'
                });
            }

            res.json({
                success: true,
                data: data.Item
            });
        } catch (error) {
            console.error('Error fetching appointment:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching appointment',
                error: error.message
            });
        }
    },

    // Create new appointment with validation and conflict checking
    createAppointment: async (req, res) => {
        try {
            const {
                patientId,
                doctorId,
                appointmentDate,
                appointmentTime,
                appointmentType,
                notes
            } = req.body;

            // Basic validation
            if (!patientId || !doctorId || !appointmentDate || !appointmentTime) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields'
                });
            }

            // Check for conflicting appointments
            const conflictCommand = new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'DoctorScheduleIndex',
                KeyConditionExpression: 'doctorId = :doctorId AND appointmentDate = :appointmentDate',
                FilterExpression: 'appointmentTime = :appointmentTime',
                ExpressionAttributeValues: {
                    ':doctorId': doctorId,
                    ':appointmentDate': appointmentDate,
                    ':appointmentTime': appointmentTime
                }
            });

            const conflictCheck = await req.app.locals.ddbDocClient.send(conflictCommand);

            if (conflictCheck.Items && conflictCheck.Items.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Time slot is already booked'
                });
            }

            // Create appointment
            const appointment = {
                appointmentId: uuidv4(),
                patientId,
                doctorId,
                appointmentDate,
                appointmentTime,
                appointmentType,
                notes,
                status: 'scheduled',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const command = new PutCommand({
                TableName: TABLE_NAME,
                Item: appointment
            });

            await req.app.locals.ddbDocClient.send(command);

            res.status(201).json({
                success: true,
                message: 'Appointment created successfully',
                data: appointment
            });
        } catch (error) {
            console.error('Error creating appointment:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating appointment',
                error: error.message
            });
        }
    },


    // Continuing updateAppointment method
    updateAppointment: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            // Verify appointment exists
            const getCommand = new GetCommand({
                TableName: TABLE_NAME,
                Key: { appointmentId: id }
            });

            const existingAppointment = await req.app.locals.ddbDocClient.send(getCommand);

            if (!existingAppointment.Item) {
                return res.status(404).json({
                    success: false,
                    message: 'Appointment not found'
                });
            }

            // Check for time slot conflicts if date or time is being updated
            if (updates.appointmentDate || updates.appointmentTime) {
                const conflictCommand = new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: 'DoctorScheduleIndex',
                    KeyConditionExpression: 'doctorId = :doctorId AND appointmentDate = :appointmentDate',
                    FilterExpression: 'appointmentTime = :appointmentTime AND appointmentId <> :currentId',
                    ExpressionAttributeValues: {
                        ':doctorId': updates.doctorId || existingAppointment.Item.doctorId,
                        ':appointmentDate': updates.appointmentDate || existingAppointment.Item.appointmentDate,
                        ':appointmentTime': updates.appointmentTime || existingAppointment.Item.appointmentTime,
                        ':currentId': id
                    }
                });

                const conflictCheck = await req.app.locals.ddbDocClient.send(conflictCommand);

                if (conflictCheck.Items && conflictCheck.Items.length > 0) {
                    return res.status(409).json({
                        success: false,
                        message: 'Time slot is already booked'
                    });
                }
            }

            // Build update expression
            let updateExpression = 'set updatedAt = :updatedAt';
            const expressionAttributeValues = {
                ':updatedAt': new Date().toISOString()
            };
            const expressionAttributeNames = {};

            Object.keys(updates).forEach(key => {
                if (key !== 'appointmentId' && key !== 'createdAt') {
                    updateExpression += `, #${key} = :${key}`;
                    expressionAttributeValues[`:${key}`] = updates[key];
                    expressionAttributeNames[`#${key}`] = key;
                }
            });

            const command = new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { appointmentId: id },
                UpdateExpression: updateExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                ExpressionAttributeNames: expressionAttributeNames,
                ReturnValues: 'ALL_NEW'
            });

            const data = await req.app.locals.ddbDocClient.send(command);

            res.json({
                success: true,
                message: 'Appointment updated successfully',
                data: data.Attributes
            });
        } catch (error) {
            console.error('Error updating appointment:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating appointment',
                error: error.message
            });
        }
    },

    // Cancel appointment
    cancelAppointment: async (req, res) => {
        try {
            const { id } = req.params;
            const { cancellationReason } = req.body;

            const command = new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { appointmentId: id },
                UpdateExpression: 'set #status = :status, cancellationReason = :reason, updatedAt = :updatedAt',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':status': 'cancelled',
                    ':reason': cancellationReason || 'No reason provided',
                    ':updatedAt': new Date().toISOString()
                },
                ReturnValues: 'ALL_NEW'
            });

            const data = await req.app.locals.ddbDocClient.send(command);

            res.json({
                success: true,
                message: 'Appointment cancelled successfully',
                data: data.Attributes
            });
        } catch (error) {
            console.error('Error cancelling appointment:', error);
            res.status(500).json({
                success: false,
                message: 'Error cancelling appointment',
                error: error.message
            });
        }
    },

    // Get doctor's appointments
    getDoctorAppointments: async (req, res) => {
        try {
            const { doctorId } = req.params;
            const { date, status } = req.query;

            let params = {
                TableName: TABLE_NAME,
                IndexName: 'DoctorScheduleIndex',
                KeyConditionExpression: 'doctorId = :doctorId'
            };

            const expressionAttributeValues = {
                ':doctorId': doctorId
            };

            if (date) {
                params.KeyConditionExpression += ' AND appointmentDate = :date';
                expressionAttributeValues[':date'] = date;
            }

            if (status) {
                params.FilterExpression = 'appointmentStatus = :status';
                expressionAttributeValues[':status'] = status;
            }

            params.ExpressionAttributeValues = expressionAttributeValues;

            const command = new QueryCommand(params);
            const data = await req.app.locals.ddbDocClient.send(command);

            res.json({
                success: true,
                data: data.Items,
                count: data.Items.length
            });
        } catch (error) {
            console.error('Error fetching doctor appointments:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching doctor appointments',
                error: error.message
            });
        }
    },

    // Get available appointment slots
    getAvailableSlots: async (req, res) => {
        try {
            const { doctorId } = req.params;
            const { date } = req.query;

            if (!date) {
                return res.status(400).json({
                    success: false,
                    message: 'Date is required'
                });
            }

            // Get doctor's schedule
            const doctorScheduleCommand = new GetCommand({
                TableName: 'Doctors',
                Key: { doctorId },
                ProjectionExpression: 'workingHours, slotDuration'
            });

            const doctorData = await req.app.locals.ddbDocClient.send(doctorScheduleCommand);

            if (!doctorData.Item) {
                return res.status(404).json({
                    success: false,
                    message: 'Doctor not found'
                });
            }

            // Get existing appointments
            const appointmentsCommand = new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'DoctorScheduleIndex',
                KeyConditionExpression: 'doctorId = :doctorId AND appointmentDate = :date',
                ExpressionAttributeValues: {
                    ':doctorId': doctorId,
                    ':date': date
                }
            });

            const appointments = await req.app.locals.ddbDocClient.send(appointmentsCommand);

            // Calculate available slots
            const workingHours = doctorData.Item.workingHours;
            const slotDuration = doctorData.Item.slotDuration || 30; // default 30 minutes
            const bookedSlots = appointments.Items.map(apt => apt.appointmentTime);
            
            const availableSlots = [];
            const startTime = new Date(`${date}T${workingHours.start}`);
            const endTime = new Date(`${date}T${workingHours.end}`);

            while (startTime < endTime) {
                const timeSlot = startTime.toLocaleTimeString('en-US', { 
                    hour12: false, 
                    hour: '2-digit', 
                    minute: '2-digit'
                });

                if (!bookedSlots.includes(timeSlot)) {
                    availableSlots.push(timeSlot);
                }

                startTime.setMinutes(startTime.getMinutes() + slotDuration);
            }

            res.json({
                success: true,
                data: {
                    date,
                    availableSlots,
                    slotDuration
                }
            });
        } catch (error) {
            console.error('Error fetching available slots:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching available slots',
                error: error.message
            });
        }
    }
};

module.exports = appointmentController;
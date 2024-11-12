// src/controllers/doctorController.js
const { 
    PutCommand, 
    GetCommand, 
    ScanCommand, 
    UpdateCommand, 
    QueryCommand 
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = 'Doctors';

const doctorController = {
    // Get all doctors with filtering and pagination
    getAllDoctors: async (req, res) => {
        try {
            const { 
                limit = 10, 
                lastEvaluatedKey,
                department,
                specialization 
            } = req.query;

            let params = {
                TableName: TABLE_NAME,
                Limit: parseInt(limit)
            };

            // Add filtering if department or specialization is provided
            if (department || specialization) {
                let filterExpression = [];
                let expressionAttributeValues = {};

                if (department) {
                    filterExpression.push('department = :dept');
                    expressionAttributeValues[':dept'] = department;
                }

                if (specialization) {
                    filterExpression.push('specialization = :spec');
                    expressionAttributeValues[':spec'] = specialization;
                }

                params.FilterExpression = filterExpression.join(' AND ');
                params.ExpressionAttributeValues = expressionAttributeValues;
            }

            if (lastEvaluatedKey) {
                params.ExclusiveStartKey = JSON.parse(lastEvaluatedKey);
            }

            const command = new ScanCommand(params);
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
            console.error('Error fetching doctors:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching doctors',
                error: error.message
            });
        }
    },

    // Get single doctor by ID
    getDoctorById: async (req, res) => {
        try {
            const command = new GetCommand({
                TableName: TABLE_NAME,
                Key: {
                    doctorId: req.params.id
                }
            });

            const data = await req.app.locals.ddbDocClient.send(command);

            if (!data.Item) {
                return res.status(404).json({
                    success: false,
                    message: 'Doctor not found'
                });
            }

            res.json({
                success: true,
                data: data.Item
            });
        } catch (error) {
            console.error('Error fetching doctor:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching doctor',
                error: error.message
            });
        }
    },
// src/controllers/doctorController.js (continued)

    // Create new doctor
    createDoctor: async (req, res) => {
        try {
            const {
                firstName,
                lastName,
                email,
                phone,
                department,
                specialization,
                qualifications,
                experience,
                workingHours,
                consultationFee
            } = req.body;

            // Basic validation
            if (!firstName || !lastName || !email || !department || !specialization) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields'
                });
            }

            // Email format validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid email format'
                });
            }

            // Create doctor object
            const doctor = {
                doctorId: uuidv4(),
                firstName,
                lastName,
                email,
                phone,
                department,
                specialization,
                qualifications,
                experience,
                workingHours: workingHours || {
                    start: '09:00',
                    end: '17:00'
                },
                consultationFee,
                status: 'active',
                slotDuration: 30, // default 30 minutes per slot
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const command = new PutCommand({
                TableName: TABLE_NAME,
                Item: doctor,
                ConditionExpression: 'attribute_not_exists(doctorId)'
            });

            await req.app.locals.ddbDocClient.send(command);

            res.status(201).json({
                success: true,
                message: 'Doctor created successfully',
                data: doctor
            });
        } catch (error) {
            console.error('Error creating doctor:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating doctor',
                error: error.message
            });
        }
    },

    // Update doctor information
    updateDoctor: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            // Verify doctor exists
            const getCommand = new GetCommand({
                TableName: TABLE_NAME,
                Key: { doctorId: id }
            });

            const existingDoctor = await req.app.locals.ddbDocClient.send(getCommand);

            if (!existingDoctor.Item) {
                return res.status(404).json({
                    success: false,
                    message: 'Doctor not found'
                });
            }

            // Build update expression
            let updateExpression = 'set updatedAt = :updatedAt';
            const expressionAttributeValues = {
                ':updatedAt': new Date().toISOString()
            };
            const expressionAttributeNames = {};

            Object.keys(updates).forEach(key => {
                if (key !== 'doctorId' && key !== 'createdAt') {
                    updateExpression += `, #${key} = :${key}`;
                    expressionAttributeValues[`:${key}`] = updates[key];
                    expressionAttributeNames[`#${key}`] = key;
                }
            });

            const command = new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { doctorId: id },
                UpdateExpression: updateExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                ExpressionAttributeNames: expressionAttributeNames,
                ReturnValues: 'ALL_NEW'
            });

            const data = await req.app.locals.ddbDocClient.send(command);

            res.json({
                success: true,
                message: 'Doctor updated successfully',
                data: data.Attributes
            });
        } catch (error) {
            console.error('Error updating doctor:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating doctor',
                error: error.message
            });
        }
    },

    // Delete doctor (soft delete)
    deleteDoctor: async (req, res) => {
        try {
            const command = new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { doctorId: req.params.id },
                UpdateExpression: 'set #status = :status, updatedAt = :updatedAt',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':status': 'inactive',
                    ':updatedAt': new Date().toISOString()
                },
                ReturnValues: 'ALL_NEW'
            });

            await req.app.locals.ddbDocClient.send(command);

            res.json({
                success: true,
                message: 'Doctor deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting doctor:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting doctor',
                error: error.message
            });
        }
    },

    // Get doctor's schedule
    getDoctorSchedule: async (req, res) => {
        try {
            const { id } = req.params;
            const { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Start date and end date are required'
                });
            }

            const command = new QueryCommand({
                TableName: 'Appointments',
                IndexName: 'DoctorScheduleIndex',
                KeyConditionExpression: 'doctorId = :doctorId AND appointmentDate BETWEEN :startDate AND :endDate',
                ExpressionAttributeValues: {
                    ':doctorId': id,
                    ':startDate': startDate,
                    ':endDate': endDate
                }
            });

            const data = await req.app.locals.ddbDocClient.send(command);

            // Get doctor's working hours
            const doctorCommand = new GetCommand({
                TableName: TABLE_NAME,
                Key: { doctorId: id },
                ProjectionExpression: 'workingHours, slotDuration'
            });

            const doctorData = await req.app.locals.ddbDocClient.send(doctorCommand);

            if (!doctorData.Item) {
                return res.status(404).json({
                    success: false,
                    message: 'Doctor not found'
                });
            }

            // Organize schedule by date
            const schedule = {};
            data.Items.forEach(appointment => {
                if (!schedule[appointment.appointmentDate]) {
                    schedule[appointment.appointmentDate] = [];
                }
                schedule[appointment.appointmentDate].push(appointment);
            });

            res.json({
                success: true,
                data: {
                    workingHours: doctorData.Item.workingHours,
                    slotDuration: doctorData.Item.slotDuration,
                    appointments: schedule
                }
            });
        } catch (error) {
            console.error('Error fetching doctor schedule:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching doctor schedule',
                error: error.message
            });
        }
    },

    // Get doctor's statistics
    getDoctorStats: async (req, res) => {
        try {
            const { id } = req.params;
            const { startDate, endDate } = req.query;

            const appointmentsCommand = new QueryCommand({
                TableName: 'Appointments',
                IndexName: 'DoctorScheduleIndex',
                KeyConditionExpression: 'doctorId = :doctorId AND appointmentDate BETWEEN :startDate AND :endDate',
                ExpressionAttributeValues: {
                    ':doctorId': id,
                    ':startDate': startDate || new Date().toISOString().split('T')[0],
                    ':endDate': endDate || new Date().toISOString().split('T')[0]
                }
            });

            const appointments = await req.app.locals.ddbDocClient.send(appointmentsCommand);

            // Calculate statistics
            const stats = {
                totalAppointments: appointments.Items.length,
                completed: 0,
                cancelled: 0,
                pending: 0,
                byType: {}
            };

            appointments.Items.forEach(apt => {
                // Count by status
                stats[apt.status.toLowerCase()]++;

                // Count by type
                if (!stats.byType[apt.appointmentType]) {
                    stats.byType[apt.appointmentType] = 0;
                }
                stats.byType[apt.appointmentType]++;
            });

            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Error fetching doctor statistics:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching doctor statistics',
                error: error.message
            });
        }
    }
};

module.exports = doctorController;
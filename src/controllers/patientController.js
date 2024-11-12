// src/controllers/patientController.js
const { 
    PutCommand, 
    GetCommand, 
    ScanCommand, 
    UpdateCommand, 
    DeleteCommand, 
    QueryCommand 
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = 'Patients';
const APPOINTMENTS_TABLE = 'Appointments';
const MEDICAL_HISTORY_TABLE = 'MedicalHistory';

const patientController = {
    // Get all patients with pagination
    getAllPatients: async (req, res) => {
        try {
            const { limit = 10, lastEvaluatedKey } = req.query;
            
            const params = {
                TableName: TABLE_NAME,
                Limit: parseInt(limit)
            };

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
            console.error('Error fetching patients:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching patients',
                error: error.message
            });
        }
    },

    // Get single patient by ID with detailed information
    getPatientById: async (req, res) => {
        try {
            const command = new GetCommand({
                TableName: TABLE_NAME,
                Key: {
                    patientId: req.params.id
                }
            });

            const data = await req.app.locals.ddbDocClient.send(command);

            if (!data.Item) {
                return res.status(404).json({
                    success: false,
                    message: 'Patient not found'
                });
            }

            // Get patient's latest appointments
            const appointmentsCommand = new QueryCommand({
                TableName: APPOINTMENTS_TABLE,
                IndexName: 'PatientIdIndex',
                KeyConditionExpression: 'patientId = :patientId',
                ExpressionAttributeValues: {
                    ':patientId': req.params.id
                },
                Limit: 5,
                ScanIndexForward: false // Get most recent appointments first
            });

            const appointmentsData = await req.app.locals.ddbDocClient.send(appointmentsCommand);

            // Combine patient data with appointments
            const patientData = {
                ...data.Item,
                recentAppointments: appointmentsData.Items || []
            };

            res.json({
                success: true,
                data: patientData
            });
        } catch (error) {
            console.error('Error fetching patient:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching patient',
                error: error.message
            });
        }
    },

    // Create new patient with validation
    createPatient: async (req, res) => {
        try {
            const {
                firstName,
                lastName,
                email,
                phone,
                dateOfBirth,
                address,
                insuranceInfo,
                emergencyContact
            } = req.body;

            // Basic validation
            if (!firstName || !lastName || !email || !phone) {
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

            // Create patient object
            const patient = {
                patientId: uuidv4(),
                firstName,
                lastName,
                email,
                phone,
                dateOfBirth,
                address,
                insuranceInfo,
                emergencyContact,
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const command = new PutCommand({
                TableName: TABLE_NAME,
                Item: patient,
                ConditionExpression: 'attribute_not_exists(patientId)'
            });

            await req.app.locals.ddbDocClient.send(command);

            res.status(201).json({
                success: true,
                message: 'Patient created successfully',
                data: patient
            });
        } catch (error) {
            console.error('Error creating patient:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating patient',
                error: error.message
            });
        }
    },

    // Update patient with validation
    updatePatient: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            // Verify patient exists
            const getCommand = new GetCommand({
                TableName: TABLE_NAME,
                Key: { patientId: id }
            });

            const existingPatient = await req.app.locals.ddbDocClient.send(getCommand);

            if (!existingPatient.Item) {
                return res.status(404).json({
                    success: false,
                    message: 'Patient not found'
                });
            }

            // Build update expression dynamically
            let updateExpression = 'set updatedAt = :updatedAt';
            const expressionAttributeValues = {
                ':updatedAt': new Date().toISOString()
            };
            const expressionAttributeNames = {};

            Object.keys(updates).forEach(key => {
                if (key !== 'patientId' && key !== 'createdAt') {
                    updateExpression += `, #${key} = :${key}`;
                    expressionAttributeValues[`:${key}`] = updates[key];
                    expressionAttributeNames[`#${key}`] = key;
                }
            });

            const command = new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { patientId: id },
                UpdateExpression: updateExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                ExpressionAttributeNames: expressionAttributeNames,
                ReturnValues: 'ALL_NEW'
            });

            const data = await req.app.locals.ddbDocClient.send(command);

            res.json({
                success: true,
                message: 'Patient updated successfully',
                data: data.Attributes
            });
        } catch (error) {
            console.error('Error updating patient:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating patient',
                error: error.message
            });
        }
    },

    // Delete patient (soft delete)
    deletePatient: async (req, res) => {
        try {
            const command = new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { patientId: req.params.id },
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
                message: 'Patient deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting patient:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting patient',
                error: error.message
            });
        }
    },

    // Get patient's appointments
    getPatientAppointments: async (req, res) => {
        try {
            const command = new QueryCommand({
                TableName: APPOINTMENTS_TABLE,
                IndexName: 'PatientIdIndex',
                KeyConditionExpression: 'patientId = :patientId',
                ExpressionAttributeValues: {
                    ':patientId': req.params.id
                },
                ScanIndexForward: false // Most recent first
            });

            const data = await req.app.locals.ddbDocClient.send(command);

            res.json({
                success: true,
                data: data.Items
            });
        } catch (error) {
            console.error('Error fetching patient appointments:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching patient appointments',
                error: error.message
            });
        }
    },

    // Get patient's medical history
    getMedicalHistory: async (req, res) => {
        try {
            const command = new QueryCommand({
                TableName: MEDICAL_HISTORY_TABLE,
                KeyConditionExpression: 'patientId = :patientId',
                ExpressionAttributeValues: {
                    ':patientId': req.params.id
                },
                ScanIndexForward: false // Most recent first
            });

            const data = await req.app.locals.ddbDocClient.send(command);

            res.json({
                success: true,
                data: data.Items
            });
        } catch (error) {
            console.error('Error fetching medical history:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching medical history',
                error: error.message
            });
        }
    }
};

module.exports = patientController;
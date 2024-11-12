// src/controllers/insuranceController.js
const { 
    PutCommand, 
    GetCommand, 
    QueryCommand, 
    UpdateCommand 
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const INSURANCE_TABLE = 'Insurance';
const CLAIMS_TABLE = 'InsuranceClaims';
const COVERAGE_TABLE = 'InsuranceCoverage';

const insuranceController = {
    // Verify insurance coverage
    verifyInsurance: async (req, res) => {
        try {
            const {
                policyNumber,
                patientId,
                insuranceProvider,
                serviceType
            } = req.body;

            // Validate required fields
            if (!policyNumber || !patientId || !insuranceProvider) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields'
                });
            }

            // Check if policy exists and is active
            const policyCommand = new GetCommand({
                TableName: INSURANCE_TABLE,
                Key: {
                    policyNumber: policyNumber,
                    patientId: patientId
                }
            });

            const policyData = await req.app.locals.ddbDocClient.send(policyCommand);

            if (!policyData.Item) {
                return res.status(404).json({
                    success: false,
                    message: 'Insurance policy not found'
                });
            }

            const policy = policyData.Item;

            // Check policy status and expiration
            const currentDate = new Date();
            const expirationDate = new Date(policy.expirationDate);

            if (currentDate > expirationDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Insurance policy has expired',
                    expirationDate: policy.expirationDate
                });
            }

            if (policy.status !== 'active') {
                return res.status(400).json({
                    success: false,
                    message: `Insurance policy is ${policy.status}`
                });
            }

            // Get coverage details if service type is provided
            let coverageDetails = null;
            if (serviceType) {
                const coverageCommand = new GetCommand({
                    TableName: COVERAGE_TABLE,
                    Key: {
                        policyNumber: policyNumber,
                        serviceType: serviceType
                    }
                });

                const coverageData = await req.app.locals.ddbDocClient.send(coverageCommand);
                coverageDetails = coverageData.Item;
            }

            res.json({
                success: true,
                message: 'Insurance verified successfully',
                data: {
                    policyStatus: 'active',
                    policyHolder: policy.policyHolder,
                    coverage: {
                        startDate: policy.startDate,
                        expirationDate: policy.expirationDate,
                        type: policy.coverageType,
                        ...coverageDetails
                    },
                    provider: policy.provider,
                    verificationId: uuidv4()
                }
            });
        } catch (error) {
            console.error('Error verifying insurance:', error);
            res.status(500).json({
                success: false,
                message: 'Error verifying insurance',
                error: error.message
            });
        }
    },

    // Get list of insurance providers
    getProviders: async (req, res) => {
        try {
            const command = new ScanCommand({
                TableName: INSURANCE_TABLE,
                ProjectionExpression: 'provider, coverageTypes, contactInfo',
                FilterExpression: 'attribute_exists(provider)'
            });

            const data = await req.app.locals.ddbDocClient.send(command);

            // Deduplicate providers
            const providers = [...new Set(data.Items.map(item => item.provider))];

            const providersDetails = providers.map(provider => {
                const providerData = data.Items.find(item => item.provider === provider);
                return {
                    name: provider,
                    coverageTypes: providerData.coverageTypes,
                    contactInfo: providerData.contactInfo
                };
            });

            res.json({
                success: true,
                data: providersDetails
            });
        } catch (error) {
            console.error('Error fetching insurance providers:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching insurance providers',
                error: error.message
            });
        }
    },

    // Submit insurance claim
    submitClaim: async (req, res) => {
        try {
            const {
                patientId,
                policyNumber,
                serviceDate,
                serviceType,
                providerId,
                diagnosisCodes,
                procedureCodes,
                claimAmount,
                documents
            } = req.body;

            // Validate required fields
            if (!patientId || !policyNumber || !serviceDate || !claimAmount) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields'
                });
            }

            // Verify insurance is active
            const policyCommand = new GetCommand({
                TableName: INSURANCE_TABLE,
                Key: {
                    policyNumber: policyNumber,
                    patientId: patientId
                }
            });

            const policyData = await req.app.locals.ddbDocClient.send(policyCommand);

            if (!policyData.Item || policyData.Item.status !== 'active') {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or inactive insurance policy'
                });
            }

            // Create claim
            const claim = {
                claimId: uuidv4(),
                patientId,
                policyNumber,
                serviceDate,
                serviceType,
                providerId,
                diagnosisCodes,
                procedureCodes,
                claimAmount,
                documents,
                status: 'submitted',
                submissionDate: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const command = new PutCommand({
                TableName: CLAIMS_TABLE,
                Item: claim
            });

            await req.app.locals.ddbDocClient.send(command);

            res.status(201).json({
                success: true,
                message: 'Claim submitted successfully',
                data: {
                    claimId: claim.claimId,
                    status: claim.status,
                    submissionDate: claim.submissionDate
                }
            });
        } catch (error) {
            console.error('Error submitting claim:', error);
            res.status(500).json({
                success: false,
                message: 'Error submitting claim',
                error: error.message
            });
        }
    },

    // Get claim status
    getClaimStatus: async (req, res) => {
        try {
            const { id } = req.params;

            const command = new GetCommand({
                TableName: CLAIMS_TABLE,
                Key: {
                    claimId: id
                }
            });

            const data = await req.app.locals.ddbDocClient.send(command);

            if (!data.Item) {
                return res.status(404).json({
                    success: false,
                    message: 'Claim not found'
                });
            }

            const claim = data.Item;

            // Get processing history if available
            const historyCommand = new QueryCommand({
                TableName: 'ClaimHistory',
                KeyConditionExpression: 'claimId = :claimId',
                ExpressionAttributeValues: {
                    ':claimId': id
                },
                ScanIndexForward: false // Latest first
            });

            const historyData = await req.app.locals.ddbDocClient.send(historyCommand);

            res.json({
                success: true,
                data: {
                    claimId: claim.claimId,
                    status: claim.status,
                    submissionDate: claim.submissionDate,
                    processingStatus: claim.processingStatus,
                    amount: {
                        claimed: claim.claimAmount,
                        approved: claim.approvedAmount,
                        rejected: claim.rejectedAmount
                    },
                    processingHistory: historyData.Items || [],
                    expectedCompletionDate: claim.expectedCompletionDate,
                    notes: claim.notes
                }
            });
        } catch (error) {
            console.error('Error fetching claim status:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching claim status',
                error: error.message
            });
        }
    },

    // Get patient coverage details
    getPatientCoverage: async (req, res) => {
        try {
            const { patientId } = req.params;

            const command = new QueryCommand({
                TableName: INSURANCE_TABLE,
                KeyConditionExpression: 'patientId = :patientId',
                ExpressionAttributeValues: {
                    ':patientId': patientId
                }
            });

            const data = await req.app.locals.ddbDocClient.send(command);

            if (!data.Items || data.Items.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No insurance coverage found for patient'
                });
            }

            // Get detailed coverage information
            const activePolicies = data.Items.filter(policy => 
                policy.status === 'active' && 
                new Date(policy.expirationDate) > new Date()
            );

            const coveragePromises = activePolicies.map(async policy => {
                const coverageCommand = new QueryCommand({
                    TableName: COVERAGE_TABLE,
                    KeyConditionExpression: 'policyNumber = :policyNumber',
                    ExpressionAttributeValues: {
                        ':policyNumber': policy.policyNumber
                    }
                });

                const coverageData = await req.app.locals.ddbDocClient.send(coverageCommand);
                return {
                    ...policy,
                    coverageDetails: coverageData.Items || []
                };
            });

            const coverageResults = await Promise.all(coveragePromises);

            res.json({
                success: true,
                data: {
                    activePolicies: coverageResults,
                    count: coverageResults.length
                }
            });
        } catch (error) {
            console.error('Error fetching patient coverage:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching patient coverage',
                error: error.message
            });
        }
    }
};

module.exports = insuranceController;
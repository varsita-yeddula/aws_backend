// src/controllers/billingController.js
const { 
    PutCommand, 
    GetCommand, 
    QueryCommand, 
    UpdateCommand,
    ScanCommand 
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const INVOICES_TABLE = 'Invoices';
const PAYMENTS_TABLE = 'Payments';
const BILLING_ITEMS_TABLE = 'BillingItems';

const billingController = {
    // Get all invoices with filtering and pagination
    getAllInvoices: async (req, res) => {
        try {
            const { 
                limit = 10, 
                lastEvaluatedKey,
                startDate,
                endDate,
                status 
            } = req.query;

            let params = {
                TableName: INVOICES_TABLE,
                Limit: parseInt(limit)
            };

            // Add date range and status filters if provided
            if (startDate || endDate || status) {
                let filterExpressions = [];
                let expressionAttributeValues = {};

                if (startDate && endDate) {
                    filterExpressions.push('createdAt BETWEEN :startDate AND :endDate');
                    expressionAttributeValues[':startDate'] = startDate;
                    expressionAttributeValues[':endDate'] = endDate;
                }

                if (status) {
                    filterExpressions.push('invoiceStatus = :status');
                    expressionAttributeValues[':status'] = status;
                }

                params.FilterExpression = filterExpressions.join(' AND ');
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
            console.error('Error fetching invoices:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching invoices',
                error: error.message
            });
        }
    },

    // Get single invoice by ID
    getInvoiceById: async (req, res) => {
        try {
            const { id } = req.params;

            // Get invoice details
            const invoiceCommand = new GetCommand({
                TableName: INVOICES_TABLE,
                Key: { invoiceId: id }
            });

            const invoiceData = await req.app.locals.ddbDocClient.send(invoiceCommand);

            if (!invoiceData.Item) {
                return res.status(404).json({
                    success: false,
                    message: 'Invoice not found'
                });
            }

            // Get invoice items
            const itemsCommand = new QueryCommand({
                TableName: BILLING_ITEMS_TABLE,
                KeyConditionExpression: 'invoiceId = :invoiceId',
                ExpressionAttributeValues: {
                    ':invoiceId': id
                }
            });

            const itemsData = await req.app.locals.ddbDocClient.send(itemsCommand);

            // Get associated payments
            const paymentsCommand = new QueryCommand({
                TableName: PAYMENTS_TABLE,
                IndexName: 'InvoiceIndex',
                KeyConditionExpression: 'invoiceId = :invoiceId',
                ExpressionAttributeValues: {
                    ':invoiceId': id
                }
            });

            const paymentsData = await req.app.locals.ddbDocClient.send(paymentsCommand);

            // Combine all data
            const invoice = {
                ...invoiceData.Item,
                items: itemsData.Items || [],
                payments: paymentsData.Items || []
            };

            res.json({
                success: true,
                data: invoice
            });
        } catch (error) {
            console.error('Error fetching invoice:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching invoice',
                error: error.message
            });
        }
    },

    // Create new invoice
    createInvoice: async (req, res) => {
        try {
            const {
                patientId,
                items,
                dueDate,
                notes,
                insuranceInfo
            } = req.body;

            // Validate required fields
            if (!patientId || !items || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields'
                });
            }

            // Calculate totals
            const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
            const taxRate = 0.0; // Typically medical services are tax-exempt
            const tax = subtotal * taxRate;
            const total = subtotal + tax;

            // Create invoice
            const invoice = {
                invoiceId: uuidv4(),
                patientId,
                invoiceDate: new Date().toISOString(),
                dueDate: dueDate || new Date(Date.now() + 30*24*60*60*1000).toISOString(), // 30 days from now
                subtotal,
                tax,
                total,
                status: 'pending',
                notes,
                insuranceInfo,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const invoiceCommand = new PutCommand({
                TableName: INVOICES_TABLE,
                Item: invoice
            });

            await req.app.locals.ddbDocClient.send(invoiceCommand);

            // Create billing items
            const itemPromises = items.map(item => {
                const billingItem = {
                    itemId: uuidv4(),
                    invoiceId: invoice.invoiceId,
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    total: item.quantity * item.unitPrice,
                    serviceDate: item.serviceDate,
                    serviceCode: item.serviceCode
                };

                const itemCommand = new PutCommand({
                    TableName: BILLING_ITEMS_TABLE,
                    Item: billingItem
                });

                return req.app.locals.ddbDocClient.send(itemCommand);
            });

            await Promise.all(itemPromises);

            res.status(201).json({
                success: true,
                message: 'Invoice created successfully',
                data: {
                    invoiceId: invoice.invoiceId,
                    total: invoice.total,
                    dueDate: invoice.dueDate,
                    status: invoice.status
                }
            });
        } catch (error) {
            console.error('Error creating invoice:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating invoice',
                error: error.message
            });
        }
    },

    // Process payment
    processPayment: async (req, res) => {
        try {
            const {
                invoiceId,
                amount,
                paymentMethod,
                transactionId,
                paymentDate = new Date().toISOString()
            } = req.body;

            // Validate payment
            if (!invoiceId || !amount || !paymentMethod) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields'
                });
            }

            // Get invoice
            const invoiceCommand = new GetCommand({
                TableName: INVOICES_TABLE,
                Key: { invoiceId }
            });

            const invoiceData = await req.app.locals.ddbDocClient.send(invoiceCommand);

            if (!invoiceData.Item) {
                return res.status(404).json({
                    success: false,
                    message: 'Invoice not found'
                });
            }

            // Create payment record
            const payment = {
                paymentId: uuidv4(),
                invoiceId,
                amount,
                paymentMethod,
                transactionId,
                paymentDate,
                status: 'completed',
                createdAt: new Date().toISOString()
            };

            const paymentCommand = new PutCommand({
                TableName: PAYMENTS_TABLE,
                Item: payment
            });

            await req.app.locals.ddbDocClient.send(paymentCommand);

            // Update invoice status and paid amount
            const totalPaid = (invoiceData.Item.paidAmount || 0) + amount;
            const remainingBalance = invoiceData.Item.total - totalPaid;
            const newStatus = remainingBalance <= 0 ? 'paid' : 'partially_paid';

            const updateInvoiceCommand = new UpdateCommand({
                TableName: INVOICES_TABLE,
                Key: { invoiceId },
                UpdateExpression: 'set paidAmount = :paid, status = :status, updatedAt = :updated',
                ExpressionAttributeValues: {
                    ':paid': totalPaid,
                    ':status': newStatus,
                    ':updated': new Date().toISOString()
                },
                ReturnValues: 'ALL_NEW'
            });

            const updatedInvoice = await req.app.locals.ddbDocClient.send(updateInvoiceCommand);

            res.json({
                success: true,
                message: 'Payment processed successfully',
                data: {
                    payment,
                    invoiceStatus: updatedInvoice.Attributes.status,
                    remainingBalance
                }
            });
        } catch (error) {
            console.error('Error processing payment:', error);
            res.status(500).json({
                success: false,
                message: 'Error processing payment',
                error: error.message
            });
        }
    },

    // Get patient payments history
    getPatientPayments: async (req, res) => {
        try {
            const { patientId } = req.params;
            const { startDate, endDate } = req.query;

            // Get patient's invoices
            const invoiceCommand = new QueryCommand({
                TableName: INVOICES_TABLE,
                IndexName: 'PatientIndex',
                KeyConditionExpression: 'patientId = :patientId',
                ExpressionAttributeValues: {
                    ':patientId': patientId
                }
            });

            const invoiceData = await req.app.locals.ddbDocClient.send(invoiceCommand);
            const invoiceIds = invoiceData.Items.map(invoice => invoice.invoiceId);

            // Get payments for these invoices
            const paymentPromises = invoiceIds.map(invoiceId => {
                const paymentCommand = new QueryCommand({
                    TableName: PAYMENTS_TABLE,
                    IndexName: 'InvoiceIndex',
                    KeyConditionExpression: 'invoiceId = :invoiceId',
                    ExpressionAttributeValues: {
                        ':invoiceId': invoiceId
                    }
                });
                return req.app.locals.ddbDocClient.send(paymentCommand);
            });

            const paymentResults = await Promise.all(paymentPromises);

            // Combine and filter payments
            let payments = paymentResults
                .flatMap(result => result.Items)
                .filter(payment => {
                    if (!startDate && !endDate) return true;
                    const paymentDate = new Date(payment.paymentDate);
                    return (!startDate || paymentDate >= new Date(startDate)) &&
                           (!endDate || paymentDate <= new Date(endDate));
                });

            // Calculate statistics
            const stats = {
                totalPayments: payments.length,
                totalAmount: payments.reduce((sum, payment) => sum + payment.amount, 0),
                byMethod: payments.reduce((acc, payment) => {
                    acc[payment.paymentMethod] = (acc[payment.paymentMethod] || 0) + payment.amount;
                    return acc;
                }, {})
            };

            res.json({
                success: true,
                data: {
                    payments,
                    statistics: stats
                }
            });
        } catch (error) {
            console.error('Error fetching patient payments:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching patient payments',
                error: error.message
            });
        }
    },

    // Generate billing statement
    getBillingStatements: async (req, res) => {
        try {
            const { patientId } = req.params;
            const { month, year } = req.query;

            const startDate = new Date(year, month - 1, 1).toISOString();
            const endDate = new Date(year, month, 0).toISOString();

            // Get invoices for the period
            const invoiceCommand = new QueryCommand({
                TableName: INVOICES_TABLE,
                IndexName: 'PatientIndex',
                KeyConditionExpression: 'patientId = :patientId AND createdAt BETWEEN :startDate AND :endDate',
                ExpressionAttributeValues: {
                    ':patientId': patientId,
                    ':startDate': startDate,
                    ':endDate': endDate
                }
            });

            const invoiceData = await req.app.locals.ddbDocClient.send(invoiceCommand);

            // Get payments for the period
            const paymentCommand = new QueryCommand({
                TableName: PAYMENTS_TABLE,
                IndexName: 'PatientIndex',
                KeyConditionExpression: 'patientId = :patientId AND paymentDate BETWEEN :startDate AND :endDate',
                ExpressionAttributeValues: {
                    ':patientId': patientId,
                    ':startDate': startDate,
                    ':endDate': endDate
                }
            });

            const paymentData = await req.app.locals.ddbDocClient.send(paymentCommand);

            // Calculate statement summary
            const statement = {
                period: {
                    month,
                    year,
                    startDate,
                    endDate
                },
                invoices: invoiceData.Items,
                payments: paymentData.Items,
                summary: {
                    totalCharged: invoiceData.Items.reduce((sum, inv) => sum + inv.total, 0),
                    totalPaid: paymentData.Items.reduce((sum, pay) => sum + pay.amount, 0),
                    balance: invoiceData.Items.reduce((sum, inv) => sum + inv.total, 0) - 
                            paymentData.Items.reduce((sum, pay) => sum + pay.amount, 0)
                }
            };

            res.json({
                success: true,
                data: statement
            });
        } catch (error) {
            console.error('Error generating billing statement:', error);
            res.status(500).json({
                success: false,
                message: 'Error generating billing statement',
                error: error.message
            });
        }
    }
};

module.exports = billingController;
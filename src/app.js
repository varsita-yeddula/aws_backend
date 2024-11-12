// src/app.js
const express = require('express');
const cors = require('cors');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config();

const app = express();

// CORS Configuration
const corsOptions = {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'], // Add your frontend URL(s)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
};

// Apply CORS middleware before other routes
app.use(cors(corsOptions));

// Parse JSON bodies
app.use(express.json());

// Configure AWS DynamoDB
const ddbClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Create a DynamoDB Document client
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// Make DynamoDB client available to all routes
app.locals.ddbDocClient = ddbDocClient;

// Basic test route
app.get('/test', (req, res) => {
    res.json({ message: 'Backend is working!' });
});

// Import and use routes
const routes = require('./routes');
app.use('/api', routes);

// Handle preflight requests
app.options('*', cors(corsOptions));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

module.exports = app;
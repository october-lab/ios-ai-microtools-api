require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
const port = process.env.PORT || 5000;

// Increase payload size limits
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Swagger definition
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'OpenAI API Express Server',
            version: '1.0.0',
            description: 'Express server for OpenAI API integration',
        },
        servers: [
            {
                url: '/api3',
                description: 'Development server',
            },
        ],
    },
    apis: ['./server.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api3', express.static('public'));
app.use('/api3/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(bodyParser.json());

/**
 * @swagger
 * /send-message:
 *   post:
 *     summary: Send a message to OpenAI API
 *     description: Sends a message to OpenAI API with an optional system prompt
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The message to send to OpenAI
 *               systemPrompt:
 *                 type: string
 *                 description: Optional system prompt
 *     responses:
 *       200:
 *         description: Successful response from OpenAI
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *       500:
 *         description: Server error
 */
app.post('/api3/send-message', async (req, res) => {
    const { message, systemPrompt = '' } = req.body;

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
    ];

    const requestBody = {
        model: 'gpt-4o',
        messages: messages,
        temperature: 0.7,
        max_tokens: 2000
    };

    try {
        const response = await axios.post(process.env.OPENAI_BASE_URL, requestBody, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({
            message: response.data.choices[0].message.content
        });
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
        res.status(500).send('Error processing request');
    }
});

/**
 * @swagger
 * /analyze-image:
 *   post:
 *     summary: Analyze an image using OpenAI API
 *     description: Sends an image and prompt to OpenAI API for analysis
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - base64Image
 *               - prompt
 *             properties:
 *               base64Image:
 *                 type: string
 *                 description: Base64 encoded image data
 *               prompt:
 *                 type: string
 *                 description: Prompt for image analysis
 *     responses:
 *       200:
 *         description: Successful analysis response
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *       500:
 *         description: Server error
 */
app.post('/api3/analyze-image', async (req, res) => {
    const { image, prompt } = req.body;

    const messages = [
        {
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }
            ]
        }
    ];

    const requestBody = {
        model: 'gpt-4o',
        messages: messages,
        max_tokens: 500
    };

    try {
        const response = await axios.post(process.env.OPENAI_BASE_URL, requestBody, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({
            analysis: response.data.choices[0].message.content
        });
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
        res.status(500).send('Error processing request');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Swagger documentation available at http://localhost:${port}/api-docs`);
}); 
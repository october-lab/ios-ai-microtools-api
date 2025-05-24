require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const multer = require('multer');
const fs = require('fs');
const openaiService = require('./services/openaiService');
const googleBooksService = require('./services/googleBooksService');

const app = express();
const port = process.env.PORT || 5000;

// Response time middleware
app.use((req, res, next) => {
    const startTime = Date.now();

    // Override res.json to include time taken
    const originalJson = res.json;
    res.json = function (body) {
        const endTime = Date.now();
        const timeTaken = endTime - startTime;

        // Add timeTaken to response body
        if (body && typeof body === 'object') {
            body.timeTaken = `${timeTaken}ms`;
        }

        return originalJson.call(this, body);
    };

    next();
});

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
        components: {
            schemas: {
                Base64Image: {
                    type: 'object',
                    properties: {
                        image: {
                            type: 'string',
                            format: 'byte',
                            description: 'Base64 encoded image'
                        }
                    }
                }
            }
        }
    },
    apis: ['./server.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api3', express.static('public'));
app.use('/api3/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(bodyParser.json());

const upload = multer({ dest: 'uploads/' });

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

    try {
        const response = await openaiService.sendMessage(message, systemPrompt);
        res.json({ message: response });
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
 *               - image
 *               - prompt
 *             properties:
 *               image:
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

    try {
        const analysis = await openaiService.analyzeImage(image, prompt);
        res.json({ analysis });
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
        res.status(500).send('Error processing request');
    }
});

/**
 * @swagger
 * /scan-books:
 *   post:
 *     summary: Scan books from image
 *     description: Analyze a bookshelf image and identify all books with their details
 *     tags:
 *       - Books
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               imageFile:
 *                 type: string
 *                 format: binary
 *                 description: Image file to upload and analyze
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 description: Base64 encoded image data
 *     responses:
 *       200:
 *         description: Successfully analyzed books
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 books:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                       author:
 *                         type: string
 *                       isbn:
 *                         type: string
 *                       genre:
 *                         type: string
 *                       pageCount:
 *                         type: integer
 *       400:
 *         description: Bad request - image data missing
 *       500:
 *         description: Server error
 */
app.post('/api3/scan-books', upload.single('imageFile'), async (req, res) => {
    let imageBase64;

    // Check if image is uploaded as a file or provided as base64
    if (req.file) {
        // Image uploaded as a file - convert to base64
        const imageBuffer = fs.readFileSync(req.file.path);
        imageBase64 = imageBuffer.toString('base64');

        // Delete temporary file
        fs.unlinkSync(req.file.path);
    } else if (req.body.image) {
        // Image provided as base64 string
        imageBase64 = req.body.image;
    } else {
        return res.status(400).json({ error: "Image data is required. Either upload a file or provide base64 image data." });
    }

    try {
        const books = await openaiService.scanBooks(imageBase64);
        res.json({ books });
    } catch (error) {
        console.error("API error:", error.message);

        if (error.status) {
            // Custom error with status
            return res.status(error.status).json({ error: error.message });
        }

        const status = error.response?.status || 500;
        const errorMessage = error.response?.data?.error?.message || "Error processing image";

        res.status(status).json({ error: errorMessage });
    }
});

/**
 * @swagger
 * /convert-image:
 *   post:
 *     summary: Convert image to base64
 *     description: Upload an image and get its base64 representation for testing other endpoints
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file to convert
 *     responses:
 *       200:
 *         description: Successfully converted image
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 image:
 *                   type: string
 *                   description: Base64 encoded image
 */
app.post('/api3/convert-image', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded' });
        }

        // Read the file and convert to base64
        const imageBuffer = fs.readFileSync(req.file.path);
        const base64Image = imageBuffer.toString('base64');

        // Delete the temporary file
        fs.unlinkSync(req.file.path);

        res.json({
            image: base64Image
        });
    } catch (error) {
        console.error('Error converting image:', error);
        res.status(500).json({ error: 'Failed to convert image' });
    }
});

/**
 * @swagger
 * /extract-book-titles:
 *   post:
 *     summary: Extract book titles from an image and get book details
 *     description: Analyze a bookshelf image, extract the titles, and fetch details from Google Books API
 *     tags:
 *       - Books
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               imageFile:
 *                 type: string
 *                 format: binary
 *                 description: Image file to upload and analyze
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 description: Base64 encoded image data
 *     responses:
 *       200:
 *         description: Successfully extracted book titles and details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 books:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                       found:
 *                         type: boolean
 *                       authors:
 *                         type: array
 *                         items:
 *                           type: string
 *                       publishedDate:
 *                         type: string
 *                       description:
 *                         type: string
 *                       pageCount:
 *                         type: integer
 *                       categories:
 *                         type: array
 *                         items:
 *                           type: string
 *                       averageRating:
 *                         type: number
 *                       isbn10:
 *                         type: string
 *                         description: ISBN-10 identifier
 *                       isbn13:
 *                         type: string
 *                         description: ISBN-13 identifier
 *                       imageLinks:
 *                         type: object
 *                         properties:
 *                           thumbnail:
 *                             type: string
 *                             description: URL to book thumbnail
 *                       previewLink:
 *                         type: string
 *                         description: URL to book preview
 *       400:
 *         description: Bad request - image data missing
 *       500:
 *         description: Server error
 */
app.post('/api3/extract-book-titles', upload.single('imageFile'), async (req, res) => {
    let imageBase64;

    // Check if image is uploaded as a file or provided as base64
    if (req.file) {
        // Image uploaded as a file - convert to base64
        const imageBuffer = fs.readFileSync(req.file.path);
        imageBase64 = imageBuffer.toString('base64');

        // Delete temporary file
        fs.unlinkSync(req.file.path);
    } else if (req.body.image) {
        // Image provided as base64 string
        imageBase64 = req.body.image;
    } else {
        return res.status(400).json({ error: "Image data is required. Either upload a file or provide base64 image data." });
    }

    try {
        // First extract titles from the image
        const titles = await openaiService.extractBookTitles(imageBase64);

        // Then search each title on Google Books API
        const booksPromises = titles.map(title => googleBooksService.searchBookByTitle(title));
        const books = await Promise.all(booksPromises);

        res.json({ books });
    } catch (error) {
        console.error("API error:", error.message);

        if (error.status) {
            // Custom error with status
            return res.status(error.status).json({ error: error.message });
        }

        const status = error.response?.status || 500;
        const errorMessage = error.response?.data?.error?.message || "Error processing image";

        res.status(status).json({ error: errorMessage });
    }
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Check if the API server is running and get basic status information
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: Server is up and running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                 uptime:
 *                   type: number
 *                   description: Server uptime in seconds
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: Current server time
 *                 environment:
 *                   type: string
 *                   example: "development"
 */
app.get('/api3/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

/**
 * @swagger
 * /compress-image:
 *   post:
 *     summary: Compress an image and return stats
 *     description: Upload an image, compress it, and get compression statistics
 *     tags:
 *       - Utility
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file to compress
 *     responses:
 *       200:
 *         description: Compression statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 originalSize:
 *                   type: number
 *                   description: Original size in bytes
 *                 compressedSize:
 *                   type: number
 *                   description: Compressed size in bytes
 *                 savingsPercent:
 *                   type: number
 *                   description: Percentage of size reduction
 */
app.post('/api3/compress-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded' });
        }

        // Read the file and convert to base64
        const imageBuffer = fs.readFileSync(req.file.path);
        const base64Image = imageBuffer.toString('base64');
        const originalSize = base64Image.length;

        // Compress the image
        const compressedImage = await openaiService.compressImage(base64Image);
        const compressedSize = compressedImage.length;

        // Calculate savings
        const savingsPercent = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);

        // Delete the temporary file
        fs.unlinkSync(req.file.path);

        res.json({
            originalSize,
            compressedSize,
            savingsPercent: `${savingsPercent}%`,
            message: `Image compressed from ${(originalSize / 1024).toFixed(2)}KB to ${(compressedSize / 1024).toFixed(2)}KB (${savingsPercent}% reduction)`
        });
    } catch (error) {
        console.error('Error compressing image:', error);
        res.status(500).json({ error: 'Failed to compress image' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Swagger documentation available at http://localhost:${port}/api3/api-docs`);
}); 
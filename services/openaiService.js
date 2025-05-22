const axios = require('axios');
const sharp = require('sharp');

class OpenAIService {
    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY;
        this.baseURL = process.env.OPENAI_BASE_URL;
    }

    // ipconfig getifaddr en0
    // Add a new method for image compression
    async compressImage(base64Image) {
        try {
            // Convert base64 to buffer
            const buffer = Buffer.from(base64Image, 'base64');

            // Process the image: resize and compress
            const compressedBuffer = await sharp(buffer)
                .resize(1000, 1000, { // Resize to max dimensions while maintaining aspect ratio
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality: 80 }) // Convert to JPEG with 80% quality
                .toBuffer();

            // Convert back to base64
            return compressedBuffer.toString('base64');
        } catch (error) {
            console.error('Image compression error:', error);
            // If compression fails, return the original image
            return base64Image;
        }
    }

    async sendMessage(message, systemPrompt = '') {
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
            const response = await axios.post(this.baseURL, requestBody, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('OpenAI API Error:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    async analyzeImage(image, prompt) {
        // Compress the image first
        const compressedImage = await this.compressImage(image);

        const messages = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${compressedImage}` } }
                ]
            }
        ];

        const requestBody = {
            model: 'gpt-4o',
            messages: messages,
            max_tokens: 500
        };

        try {
            const response = await axios.post(this.baseURL, requestBody, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('OpenAI API Error:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    async scanBooks(imageBase64) {
        // Compress the image first
        const compressedImage = await this.compressImage(imageBase64);

        const messages = [
            {
                role: "system",
                content: "You are a specialized bookshelf analyzer. Extract detailed information about all books visible in images and return as a JSON array. Each book should have its own entry in the array."
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "Analyze this image of a bookshelf and identify all books visible. For each book, extract: title, author, isbn (if visible), genre, publication year, page count. Return the data as a JSON array of book objects. If no books are detected, reply with {\"error\": \"No books detected\"}. Format: [{book1}, {book2}, ...]"
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/jpeg;base64,${compressedImage}`
                        }
                    }
                ]
            }
        ];

        const requestBody = {
            model: 'gpt-4o',
            messages: messages,
            max_tokens: 1000
        };

        try {
            const response = await axios.post(this.baseURL, requestBody, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000 // 2 minute timeout
            });

            const content = response.data.choices[0].message.content;

            // Extract JSON from the response
            let jsonMatch = content.match(/(\[.*\]|\{.*\})/s);

            if (!jsonMatch) {
                throw new Error("No JSON found in response");
            }

            const jsonString = jsonMatch[0];
            const booksData = JSON.parse(jsonString);

            // Check if it's an error response
            if (typeof booksData === 'object' && !Array.isArray(booksData) && booksData.error) {
                throw { status: 404, message: booksData.error };
            }

            // Ensure we have an array
            if (!Array.isArray(booksData)) {
                throw new Error("Unexpected response format");
            }

            // Map the response to match the Swift model
            return booksData.map(book => ({
                title: book.title || "Unknown Title",
                author: book.author || "Unknown Author",
                isbn: book.isbn || null,
                genre: book.genre || null,
                pageCount: book.page_count || book.pageCount || null
            }));
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                throw { status: 408, message: "The API request timed out. Please try again." };
            }
            throw error;
        }
    }

    async extractBookTitles(imageBase64) {
        // Compress the image first
        const compressedImage = await this.compressImage(imageBase64);

        const messages = [
            {
                role: "system",
                content: "You are a quick book title extractor. Only identify book titles from images."
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "Extract just the book titles (no author, no summary) from this image. Return the data as a JSON array of strings. If no books are detected, return an empty array. Format: [\"Title 1\", \"Title 2\", ...]"
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/jpeg;base64,${compressedImage}`
                        }
                    }
                ]
            }
        ];

        const requestBody = {
            model: 'gpt-4o',
            messages: messages,
            max_tokens: 500,  // Reduced tokens since we only need titles
            temperature: 0.3  // Lower temperature for more focused extraction
        };

        try {
            const response = await axios.post(this.baseURL, requestBody, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000 // 1 minute timeout (half of the full scan)
            });

            const content = response.data.choices[0].message.content;

            // Extract JSON from the response
            let jsonMatch = content.match(/(\[.*\]|\{.*\})/s);

            if (!jsonMatch) {
                throw new Error("No JSON found in response");
            }

            const jsonString = jsonMatch[0];
            const titlesData = JSON.parse(jsonString);

            // Check if it's an array
            if (!Array.isArray(titlesData)) {
                throw new Error("Unexpected response format");
            }

            return titlesData;
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                throw { status: 408, message: "The API request timed out. Please try again." };
            }
            throw error;
        }
    }
}

module.exports = new OpenAIService(); 
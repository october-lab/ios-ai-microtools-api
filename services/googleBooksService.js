const axios = require('axios');

/**
 * Search for a book by title on Google Books API
 * @param {string} title - The book title to search for
 * @returns {Promise<Object>} - Book data from Google Books
 */
async function searchBookByTitle(title) {
    try {
        const response = await axios.get('https://www.googleapis.com/books/v1/volumes', {
            params: {
                q: `intitle:${title}`,
                maxResults: 1,
                printType: 'books'
            }
        });

        if (response.data.totalItems === 0) {
            return { title, found: false };
        }

        const book = response.data.items[0];
        const volumeInfo = book.volumeInfo || {};

        // Extract ISBN numbers
        const industryIdentifiers = volumeInfo.industryIdentifiers || [];
        const isbn10 = industryIdentifiers.find(id => id.type === 'ISBN_10')?.identifier;
        const isbn13 = industryIdentifiers.find(id => id.type === 'ISBN_13')?.identifier;

        return {
            title,
            found: true,
            id: book.id,
            authors: volumeInfo.authors || [],
            publishedDate: volumeInfo.publishedDate,
            description: volumeInfo.description ?
                volumeInfo.description.substring(0, 200) + (volumeInfo.description.length > 200 ? '...' : '') :
                null,
            pageCount: volumeInfo.pageCount,
            categories: volumeInfo.categories || [],
            averageRating: volumeInfo.averageRating,
            imageLinks: volumeInfo.imageLinks || {},
            previewLink: volumeInfo.previewLink,
            isbn10,
            isbn13
        };
    } catch (error) {
        console.error(`Error searching for book "${title}":`, error.message);
        return { title, found: false, error: error.message };
    }
}

module.exports = {
    searchBookByTitle
}; 
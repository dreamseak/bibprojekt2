// Fetch a detailed description for a book from Open Library's works API
// id: Open Library key (e.g. '/works/OL12345W') or ISBN
async function fetchOpenLibraryDescription(bookId) {
    // If the id is an Open Library work key
    if (typeof bookId === 'string' && bookId.startsWith('/works/')) {
        const url = `https://openlibrary.org${bookId}.json`;
        try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            // Try description
            if (typeof data.description === 'string') return data.description;
            if (data.description && data.description.value) return data.description.value;
            // Fallback: first_sentence
            if (typeof data.first_sentence === 'string') return data.first_sentence;
            if (data.first_sentence && data.first_sentence.value) return data.first_sentence.value;
            // Fallback: subjects
            if (Array.isArray(data.subjects) && data.subjects.length > 0) {
                return 'Kategorien: ' + data.subjects.slice(0, 8).join(', ');
            }
            // Fallback: title
            if (data.title) return 'Titel: ' + data.title;
        } catch (e) {
            // ignore
        }
    }
    // Could add ISBN fallback here if needed
    return null;
}

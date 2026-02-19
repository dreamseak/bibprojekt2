// Translate text to German using the LibreTranslate API (free, no key required for demo)
// Returns the translated text or the original if translation fails
async function translateToGerman(text) {
    if (!text || typeof text !== 'string') return text;
    try {
        const res = await fetch('https://libretranslate.de/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                q: text,
                source: 'auto',
                target: 'de',
                format: 'text'
            })
        });
        if (!res.ok) return text;
        const data = await res.json();
        if (data && data.translatedText) return data.translatedText;
    } catch (e) {
        // ignore
    }
    return text;
}

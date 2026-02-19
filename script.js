// Book Reading Checklist App

// API Configuration - points to backend
const API_URL = 'https://meineleseabenteuer-production.up.railway.app';
// Local offline app version - update at build time or manually
const LOCAL_APP_VERSION = '0.0.1';

// Attempt to fetch a machine-readable remote version. Tries two endpoints:
// 1) API version endpoint: /api/version (preferred)
// 2) Static version file at /version.json (fallback)
async function fetchRemoteVersion() {
    try {
        // try API endpoint first
        const apiRes = await fetch(API_URL + '/api/version', { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (apiRes.ok) {
            const j = await apiRes.json();
            if (j && j.version) return j;
        }
    } catch (e) {
        // ignore and try fallback
    }
    try {
        const fileRes = await fetch(API_URL + '/version.json', { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (fileRes.ok) {
            const j = await fileRes.json();
            if (j && j.version) return j;
        }
    } catch (e) {
        // network/CORS failure - return null
    }
    return null;
}

function showVersionBanner(localVer, remoteVer) {
    const b = document.createElement('div');
    b.id = 'version-banner';
    b.style = 'position:fixed;bottom:0;left:0;right:0;background:#fff3cd;color:#856404;padding:10px;border-top:1px solid #ffeeba;text-align:center;z-index:9999;font-size:0.95rem';
    b.innerHTML = `Offline: ${localVer} — Server: ${remoteVer} — <a href="#" id="reloadFromServer">Open server</a>`;
    document.body.appendChild(b);
    document.getElementById('reloadFromServer').addEventListener('click', e => { e.preventDefault(); window.open(API_URL, '_blank'); });
}

// Compare local and remote versions on load and show a non-blocking banner if they differ.
async function checkAppVersionOnLoad() {
    try {
        const remote = await fetchRemoteVersion();
        if (!remote || !remote.version) return; // couldn't determine remote version
        if (remote.version !== LOCAL_APP_VERSION) {
            showVersionBanner(LOCAL_APP_VERSION, remote.version);
        }
    } catch (e) {
        // silently ignore version check errors (e.g. if backend is offline or doesn't expose API)
    }
}
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

// Sample library books
const libraryBooks = [
    { id: 1, title: 'The Lion, the Witch and the Wardrobe', author: 'C.S. Lewis', icon: '🦁', description: 'Eine wunderbare Fantasy-Abenteuergeschichte über vier Kinder, die in ein mystisches Königreich namens Narnia hineingelangen, wo eine ewige Luftfeuchtigkeit und das Schöne gegenüber dem Bösen kämpft.' },
    { id: 2, title: 'Harry Potter and the Philosopher\'s Stone', author: 'J.K. Rowling', icon: '🪄', description: 'Der Klassiker über einen jungen Zauberer, der in die Hogwarts-Schule für Magie eintritt und erfährt, dass er eine große Kraft gegen die dunkle Magie hat.' },
    { id: 3, title: 'Charlotte\'s Web', author: 'E.B. White', icon: '🕷️', description: 'Eine herzerwärmende Geschichte über die Freundschaft zwischen Wilbur, einem Schwein, und Charlotte, einer intelligenten Spinne, die ihm hilft zu überleben.' },
    { id: 4, title: 'The Hobbit', author: 'J.R.R. Tolkien', icon: '🧝', description: 'Das Abenteuer eines Hobbits namens Bilbo, der sich auf eine epische Reise begibt, um einem Zauberer und Zwergen zu helfen, ihren verlorenen Schatz zurückzugewinnen.' },
    { id: 5, title: 'Alice in Wonderland', author: 'Lewis Carroll', icon: '🐰', description: 'Alice folgt einem Kaninchen in ein fantastisches Wunderland, wo sie auf seltsame Charaktere trifft und an verrückten Abenteuern und logischen Rätseln teilnimmt.' },
    { id: 6, title: 'Matilda', author: 'Roald Dahl', icon: '📚', description: 'Die Geschichte eines außergewöhnlichen Mädchens mit übermenschlichen intellektuellen Kräften, das gegen ihren Missbrauch kämpft und ihre Lehrer mit ihrer Intelligenz überrascht.' }
];

// Load books from localStorage
let myBooks = JSON.parse(localStorage.getItem('myBooks')) || [];
let borrowedBooks = [];

// helper for loading/normalizing borrowedBooks structure
function loadBorrowedBooks() {
    let raw = JSON.parse(localStorage.getItem('borrowedBooks')) || [];
    // migrate old format (array of ids) to objects
    if (raw.length && (typeof raw[0] !== 'object' || raw[0] === null)) {
        raw = raw.map(id => ({ id: String(id), user: '', endDate: null }));
    }
    // normalize any existing entries to string ids as well
    raw = raw.map(b => ({ id: String(b.id), user: b.user || '', endDate: b.endDate || null }));
    // remove any loans whose endDate has already passed so books become available again
    const now = new Date();
    raw = raw.filter(b => {
        if (!b.endDate) return true;
        return new Date(b.endDate) > now;
    });
    // persist cleaned/normalized list (in case we dropped expired entries)
    localStorage.setItem('borrowedBooks', JSON.stringify(raw));
    borrowedBooks = raw;
}

// Fetch borrowed books from server (shared state)
async function fetchBorrowedBooksFromServer() {
    try {
        const res = await fetch(API_URL + '/api/loans');
        if (res.ok) {
            const data = await res.json();
            borrowedBooks = data.loans || [];
            localStorage.setItem('borrowedBooks', JSON.stringify(borrowedBooks));
            return;
        }
    } catch (e) {
        // fallback to localStorage on network error
    }
    loadBorrowedBooks();
}

// initially load global list
loadBorrowedBooks();

// state for library display (query/page) so modal can refresh view after borrow
let libraryCurrentQuery = '';
let libraryCurrentPage = 1;

// current book being borrowed by modal
let currentBorrowId = null;

// cache for book info to avoid onclick string escaping issues
let bookInfoCache = {};

// Account system
let currentUser = null;
let currentUserRole = 'student';

// Create a new account
async function createAccount(username, password) {
    // New accounts are always students; role selection removed from the UI
    if (!username || !password) {
        alert('Benutzername und Passwort erforderlich!');
        return false;
    }
    try {
        const response = await fetch(API_URL + '/api/account/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (!response.ok) {
            alert('❌ ' + (data.error || 'Fehler beim Erstellen des Kontos'));
            return false;
        }
        alert('✓ Konto erfolgreich erstellt! Du kannst dich jetzt anmelden.');
        return true;
    } catch (error) {
        alert('❌ Fehler beim Verbinden mit dem Server: ' + error.message);
        return false;
    }
}

// Login to an account
async function loginAccount(username, password) {
    if (!username || !password) {
        alert('Benutzername und Passwort erforderlich!');
        return false;
    }
    try {
        const response = await fetch(API_URL + '/api/account/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (!response.ok) {
            alert('❌ ' + (data.error || 'Fehler beim Anmelden'));
            return false;
        }
        // Store original username casing for display, but use the normalized one for lookups
        currentUser = username;  // Keep original casing
        currentUserRole = data.role || 'student';
        console.log('[LOGIN] Frontend received role:', currentUserRole, 'from API response:', data);
        myBooks = [];
        localStorage.setItem('currentUser', username);  // Store original casing
        alert('✓ Willkommen, ' + username + '!');
        location.reload();
        return true;
    } catch (error) {
        alert('❌ Fehler beim Verbinden mit dem Server: ' + error.message);
        return false;
    }
}

// Logout from account
function logoutAccount() {
    if (currentUser) {
        currentUser = null;
        currentUserRole = 'student';
        localStorage.removeItem('currentUser');
        myBooks = [];
        borrowedBooks = [];
        alert('✓ Abgemeldet!');
        location.reload();
    }
}

// Load account from localStorage/API
async function loadAccount() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = savedUser;  // Keep original casing for display
        myBooks = [];
        // Fetch role from server using lowercase for API call
        try {
            const r = await fetch(API_URL + '/api/account/me?username=' + encodeURIComponent(savedUser.toLowerCase()));
            if (r.ok) {
                const data = await r.json();
                if (data && data.role) {
                    currentUserRole = data.role;
                    console.log('[LOAD] Set currentUserRole to:', currentUserRole, 'from /api/account/me response:', data);
                } else {
                    currentUserRole = 'student';
                    console.log('[LOAD] No role in response, defaulting to student');
                }
            } else {
                currentUserRole = 'student';
                console.log('[LOAD] API returned error, defaulting to student');
            }
        } catch (e) {
            currentUserRole = 'student';
            console.log('[LOAD] Error fetching role, defaulting to student:', e);
        }
    }
    // always refresh global borrowedBooks after possible login status change
    loadBorrowedBooks();
    updateLoanCount();
}

// Fetch and update the current user's role from the backend (in case it changed)
async function refreshCurrentUserRole() {
    if (!currentUser) return;
    try {
        const res = await fetch(API_URL + '/api/account/me?username=' + encodeURIComponent(currentUser.toLowerCase()));
        if (res.ok) {
            const data = await res.json();
            if (data.role && data.role !== currentUserRole) {
                // Role has changed! Update it and reload to re-render UI with new permissions
                console.log('User role updated from', currentUserRole, 'to:', data.role);
                currentUserRole = data.role;
                // Reload page so teacher buttons and features appear/disappear
                location.reload();
            }
        }
    } catch (e) {
        // silently fail if backend is unavailable
    }
}

// Periodically check if current user's role has been updated by an admin
setInterval(() => {
    if (currentUser) refreshCurrentUserRole();
}, 30000); // check every 30 seconds

// Export account data to JSON
function exportAccountData() {
    if (!currentUser) {
        alert('Du musst angemeldet sein um Daten zu exportieren!');
        return;
    }
    const accountData = JSON.parse(localStorage.getItem('account_' + currentUser));
    const dataStr = JSON.stringify(accountData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = currentUser + '_backup.json';
    link.click();
    alert('✓ Daten exportiert!');
}

// Initialize the page
window.addEventListener('DOMContentLoaded', async function() {
    await loadAccount();
    checkAppVersionOnLoad();
    
    // Fetch loaned books from server (shared state)
    fetchBorrowedBooksFromServer();
    
    // Refresh role when page comes back into focus (e.g., user switches tabs)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && currentUser) {
            refreshCurrentUserRole();
            fetchBorrowedBooksFromServer();  // Also refresh loans when returning to tab
            displayAnnouncements();  // Refresh announcements
        }
    });
    
    // Auto-refresh announcements every 10 seconds so all users see new ones
    setInterval(() => {
        if (document.getElementById('announcementsContainer')) {
            displayAnnouncements();
        }
    }, 10000);
    
    if (document.getElementById('booksList')) displayMyBooks();
    if (document.getElementById('loanedList')) displayLoanedBooks();
    if (document.getElementById('announcementsContainer')) displayAnnouncements();
    if (document.getElementById('libraryBooks')) {
        displayLibraryBooks();
        const searchEl = document.getElementById('librarySearch');
        if (searchEl) {
            // debounce input to avoid excessive API calls; reset to page 1 on new query
            searchEl.addEventListener('input', debounce(() => displayLibraryBooks(searchEl.value, 1), 300));
        }
    }
    if (document.getElementById('booksRead')) updateStats();
    
    // nothing needed here for dialog; the <dialog> handles backdrop clicks
});

// Helper: get book details by id from available sources
function getBookDetailsById(id) {
    id = String(id);
    // check myBooks
    const mb = myBooks.find(b => String(b.id) === id);
    if (mb) return { title: mb.title, author: mb.author, icon: mb.icon || '📘' };
    // check libraryBooks
    const lb = libraryBooks.find(b => String(b.id) === id);
    if (lb) return { title: lb.title, author: lb.author, icon: lb.icon || '📗' };
    // check cached info
    if (bookInfoCache[id]) return { title: bookInfoCache[id].title || 'Unbekannt', author: bookInfoCache[id].author || '', icon: bookInfoCache[id].icon || '📗' };
    return null;
}

// Sanitize title strings that may accidentally contain URLs or newlines
function sanitizeTitle(title) {
    if (!title || typeof title !== 'string') return title;
    const parts = title.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return title.trim();
    // prefer first part that doesn't look like a URL
    for (const p of parts) {
        if (!/^https?:\/\//i.test(p)) return p;
    }
    // fallback to last part
    return parts[parts.length - 1];
}

// Render the current user's loaned books and their end dates
async function displayLoanedBooks() {
    const container = document.getElementById('loanedList');
    if (!container) return;
    // refresh global borrowed list
    loadBorrowedBooks();
    if (!currentUser) {
        container.innerHTML = '<p style="color:#666;">🔒 Bitte melde dich an, um deine ausgeliehenen Bücher zu sehen.</p>';
        return;
    }
    const userLoans = borrowedBooks.filter(b => b.user === currentUser);
    if (!userLoans || userLoans.length === 0) {
        container.innerHTML = '<p style="color:#666;">Du hast derzeit keine ausgeliehenen Bücher.</p>';
        return;
    }
    // ensure we have details for all loans; if missing, try fetching from OpenLibrary
    container.innerHTML = '';
    const missingIds = userLoans.map(r => String(r.id)).filter(id => !getBookDetailsById(id));
    if (missingIds.length) {
        await Promise.all(missingIds.map(id => fetchOpenLibraryDetails(id).catch(() => null)));
    }
        userLoans.forEach(async rec => {
        const info = getBookDetailsById(rec.id) || { title: `Unbekannt (ID ${rec.id})`, author: '', icon: '📗' };
        const cleanTitle = sanitizeTitle(info.title || `Unbekannt (ID ${rec.id})`);
        const end = rec.endDate ? new Date(rec.endDate).toLocaleDateString('de-DE') : 'unbekannt';
        // determine if the loan ends today or is overdue
        let isDueToday = false;
        let isOverdue = false;
        if (rec.endDate) {
            const endObj = new Date(rec.endDate);
            const now = new Date();
            isDueToday = endObj.getFullYear() === now.getFullYear() && endObj.getMonth() === now.getMonth() && endObj.getDate() === now.getDate();
            isOverdue = endObj < new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }
        const item = document.createElement('div');
        item.className = 'loaned-item';
        // render cover image if icon is a URL, otherwise show emoji/text
        let iconHtml = '';
        if (typeof info.icon === 'string' && info.icon.startsWith('http')) {
            iconHtml = `<img class="loaned-cover" src="${escapeHtmlAttr(info.icon)}" alt="cover">`;
        } else {
            iconHtml = escapeHtmlAttr(info.icon || '📗');
        }
        item.innerHTML = `
            <div class="loaned-icon">${iconHtml}</div>
            <div style="flex:1;">
                <strong>${escapeHtmlAttr(info.title)}</strong>
                <div style="font-size:0.9rem; color:#444;">${escapeHtmlAttr(info.author)} — bis <strong>${end}</strong></div>
                ${isDueToday ? '<div class="due-today">🔔 Rückgabe heute — bitte sofort zurückgeben!</div>' : ''}
                ${isOverdue ? '<div class="overdue">⚠️ Überfällig — bitte zurückgeben!</div>' : ''}
            </div>
        `;
        container.appendChild(item);
        // show browser notification for due/overdue items (once per day per book)
        if ((isDueToday || isOverdue) && typeof Notification !== 'undefined') {
            const permGranted = Notification.permission === 'granted' || await ensureNotificationPermission();
            if (permGranted && shouldNotifyToday(String(rec.id))) {
                sendDueNotification(info, end, isOverdue, String(rec.id));
            }
        }
    });
}

// Try to fetch details from OpenLibrary for a work or book id like "/works/OL...W" or "/books/OL...M"
async function fetchOpenLibraryDetails(id) {
    try {
        id = String(id);
        // ensure it starts with a slash; OpenLibrary uses paths like /works/OL...W
        const path = id.startsWith('/') ? id : `/${id}`;
        const url = `https://openlibrary.org${path}.json`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const title = data.title || `Unbekannt (ID ${id})`;
        // try to get author name(s)
        let author = '';
        if (Array.isArray(data.authors) && data.authors.length) {
            // author entries contain author.key like "/authors/OL...A"
            const akey = data.authors[0].author ? data.authors[0].author.key : data.authors[0].key;
            if (akey) {
                try {
                    const ares = await fetch(`https://openlibrary.org${akey}.json`);
                    if (ares.ok) {
                        const ad = await ares.json();
                        author = ad.name || '';
                    }
                } catch (e) {
                    // ignore author fetch errors
                }
            }
        } else if (data.by_statement) {
            author = data.by_statement;
        }
        // cover image if available
        let icon = '📗';
        if (data.covers && Array.isArray(data.covers) && data.covers.length) {
            icon = `https://covers.openlibrary.org/b/id/${data.covers[0]}-S.jpg`;
        }
        // store in cache for later
        bookInfoCache[id] = { title: sanitizeTitle(title), author, icon };
        return bookInfoCache[id];
    } catch (e) {
        return null;
    }
}

// Notification helpers: request permission and send a notification once per book per day
async function ensureNotificationPermission() {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    try {
        const perm = await Notification.requestPermission();
        return perm === 'granted';
    } catch (e) {
        return false;
    }
}

function shouldNotifyToday(bookId) {
    try {
        const key = 'lastDueNotifications';
        const map = JSON.parse(localStorage.getItem(key) || '{}');
        const today = new Date().toISOString().slice(0,10);
        if (map[bookId] === today) return false;
        map[bookId] = today;
        localStorage.setItem(key, JSON.stringify(map));
        return true;
    } catch (e) {
        return true;
    }
}

function sendDueNotification(info, end, isOverdue, id) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
        const title = isOverdue ? `Überfällig: ${info.title}` : `Rückgabe heute: ${info.title}`;
        const body = isOverdue ? `Bis ${end}. Bitte sofort zurückgeben.` : `Bis ${end} (heute). Bitte sofort zurückgeben.`;
        const options = { body };
        if (typeof info.icon === 'string' && info.icon.startsWith('http')) options.icon = info.icon;
        const n = new Notification(title, options);
        n.onclick = () => {
            try { window.focus(); } catch (e) {}
        };
    } catch (e) {
        // ignore
    }
}

// --- Announcements (homepage) --------------------------------------------
function getAnnouncements() {
    try {
        return JSON.parse(localStorage.getItem('announcements') || '[]');
    } catch (e) { return []; }
}

function saveAnnouncements(anns) {
    try { localStorage.setItem('announcements', JSON.stringify(anns)); } catch (e) {}
}

async function fetchAnnouncementsFromServer() {
    try {
        const res = await fetch(API_URL + '/api/announcements');
        if (res.ok) {
            const data = await res.json();
            return data.announcements || [];
        }
    } catch (e) {
        // fallback to localStorage if server fetch fails
    }
    return getAnnouncements();
}

function displayAnnouncements() {
    const container = document.getElementById('announcementsContainer');
    if (!container) return;
    
    // Fetch from server, fallback to localStorage
    fetchAnnouncementsFromServer().then(anns => {
        let announcements = anns;
        // seed a default welcome announcement if none exist
        if (!announcements || announcements.length === 0) {
            announcements = [{ id: 'welcome_1', title: 'Willkommen!', body: 'Neu: Gruppenverwaltung für Lehrkräfte ist jetzt verfügbar. Schau in dein Konto für mehr.', created: new Date().toISOString() }];
        }
        container.innerHTML = '';
        for (const a of announcements) {
            const card = document.createElement('div');
            card.className = 'announcement-card';
            const left = document.createElement('div');
            left.className = 'announcement-left';
            const title = document.createElement('div');
            title.className = 'announcement-title';
            title.textContent = a.title || '';
            const body = document.createElement('div');
            body.className = 'announcement-body';
            body.textContent = a.body || '';
            const meta = document.createElement('div');
            meta.className = 'announcement-meta';
            try { meta.textContent = new Date(a.created).toLocaleDateString('de-DE'); } catch (e) { meta.textContent = ''; }
            left.appendChild(title);
            left.appendChild(body);
            left.appendChild(meta);
            card.appendChild(left);
            container.appendChild(card);
        }
    });
}

// --- Events (list-style calendar) ----------------------------------------
function getEvents() {
    try { return JSON.parse(localStorage.getItem('events') || '[]'); } catch (e) { return []; }
}

function saveEvents(ev) {
    try { localStorage.setItem('events', JSON.stringify(ev)); } catch (e) {}
    try { promoteUpcomingEventsToAnnouncements(); } catch (e) {}
}


// Promote upcoming events (within 7 days) to announcements so they appear on the homepage
function promoteUpcomingEventsToAnnouncements() {
    try {
        const events = getEvents() || [];
        const anns = getAnnouncements() || [];
        const now = new Date();
        const oneWeek = 7 * 24 * 3600 * 1000;
        for (const ev of events) {
            if (!ev || !ev.date) continue;
            const d = new Date(ev.date);
            if (isNaN(d)) continue;
            const delta = d - now;
            if (delta >= 0 && delta <= oneWeek) {
                const annId = 'event_ann_' + ev.id;
                if (!anns.find(a => a.id === annId)) {
                    const title = `Bevorstehendes Ereignis: ${ev.title || ''}`;
                    const body = `${ev.desc || ''} \nDatum: ${d.toLocaleDateString('de-DE')}`;
                    anns.unshift({ id: annId, title, body, created: new Date().toISOString(), sourceEvent: ev.id });
                }
            }
        }
        // persist if changed
        saveAnnouncements(anns);
    } catch (e) {
        // ignore errors
    }
}

function displayEvents() {
    // Backwards-compatible wrapper: render into #eventsContainer if present
    const container = document.getElementById('eventsContainer');
    if (container) renderEventsListInto(container);
}

// Render events into a supplied container element (used by modal)
function renderEventsListInto(container) {
    if (!container) return;
    // ensure upcoming events are promoted to announcements
    promoteUpcomingEventsToAnnouncements();
    let events = getEvents() || [];
    // seed sample events if none
    if (!events || events.length === 0) {
        events = [
            { id: 'e_' + Date.now().toString(36), title: 'Bücherflohmarkt', date: new Date(Date.now()+5*24*3600*1000).toISOString(), desc: 'Schüler verkaufen gebrauchte Bücher in der Aula.' },
            { id: 'e_' + (Date.now()+1).toString(36), title: 'Lesewettbewerb', date: new Date(Date.now()+14*24*3600*1000).toISOString(), desc: 'Schulweiter Lesewettbewerb mit tollen Preisen.' }
        ];
        saveEvents(events);
    }
    // sort by date ascending
    events.sort((a,b)=> new Date(a.date) - new Date(b.date));
    container.innerHTML = '';
    for (const ev of events) {
        const row = document.createElement('div');
        row.className = 'event-item';
        const left = document.createElement('div'); left.className = 'event-left';
        const date = document.createElement('div'); date.className = 'event-date';
        try { date.textContent = new Date(ev.date).toLocaleDateString('de-DE'); } catch (e) { date.textContent = ev.date || ''; }
        const info = document.createElement('div');
        const title = document.createElement('div'); title.className = 'event-title'; title.textContent = ev.title || '';
        const desc = document.createElement('div'); desc.className = 'event-desc'; desc.textContent = ev.desc || '';
        info.appendChild(title); info.appendChild(desc);
        left.appendChild(date); left.appendChild(info);
        // no detail button by request — just show date + info
        row.appendChild(left);
        container.appendChild(row);
    }
}

// Open modal showing events list
function openEventsModal() {
    const existing = document.getElementById('eventsModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'eventsModal';
    modal.className = 'dynamic-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '9999';
    modal.style.background = 'rgba(0,0,0,0.6)';
    modal.style.backdropFilter = 'blur(3px)';

    modal.innerHTML = `
        <div class="modal-content">
            <h2>📅 Kommende Ereignisse</h2>
            <div id="eventsModalList" style="max-height:60vh; overflow:auto; margin-bottom:0.8rem;"></div>
            <div style="display:flex; gap:0.6rem;">
                <button class="btn btn-cancel" onclick="document.getElementById('eventsModal').remove()">Schließen</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const listEl = document.getElementById('eventsModalList');
    renderEventsListInto(listEl);
}

// Admin: Manage announcements modal (create/delete announcements)
function openManageAnnouncementsModal() {
    if (!currentUser || (currentUserRole !== 'admin' && currentUserRole !== 'teacher')) {
        alert('Nur Admins/Lehrkräfte können Ankündigungen verwalten.');
        return;
    }
    const existing = document.getElementById('manageAnnouncementsModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'manageAnnouncementsModal';
    modal.className = 'dynamic-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '9999';
    modal.style.background = 'rgba(0,0,0,0.6)';
    modal.style.backdropFilter = 'blur(3px)';

    const anns = getAnnouncements();
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Ankündigungen verwalten</h2>
            <div style="max-height:50vh; overflow:auto; margin-bottom:1rem;" id="manageAnnouncementsList"></div>
            <div style="display:flex; gap:0.6rem; margin-bottom:0.8rem;">
                <input id="annTitle" placeholder="Titel" style="flex:1; padding:0.6rem; border-radius:8px; border:1px solid rgba(0,0,0,0.08);">
                <input id="annBody" placeholder="Kurztext" style="flex:2; padding:0.6rem; border-radius:8px; border:1px solid rgba(0,0,0,0.08);">
            </div>
            <div style="display:flex; gap:0.6rem;">
                <button class="btn btn-cta" id="createAnnBtn">Erstellen</button>
                <button class="btn btn-cancel" onclick="document.getElementById('manageAnnouncementsModal').remove()">Schließen</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const listEl = document.getElementById('manageAnnouncementsList');
    function renderList() {
        const a = getAnnouncements();
        listEl.innerHTML = '';
        if (!a || a.length === 0) {
            listEl.innerHTML = '<div style="color:#666;">Keine Ankündigungen.</div>';
            return;
        }
        for (const an of a) {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '0.45rem 0';
            row.innerHTML = `<div><strong>${escapeHtmlAttr(an.title||'')}</strong><div style="font-size:0.9rem;color:#444;">${escapeHtmlAttr(an.body||'')}</div></div>`;
            const del = document.createElement('button');
            del.className = 'btn delete';
            del.textContent = 'Löschen';
            del.onclick = () => { if (confirm('Ankündigung löschen?')) { const remaining = getAnnouncements().filter(x=>x.id!==an.id); saveAnnouncements(remaining); renderList(); displayAnnouncements(); } };
            row.appendChild(del);
            listEl.appendChild(row);
        }
    }
    renderList();

    document.getElementById('createAnnBtn').addEventListener('click', async () => {
        const t = (document.getElementById('annTitle').value || '').trim();
        const b = (document.getElementById('annBody').value || '').trim();
        if (!t && !b) return alert('Bitte Titel oder Text eingeben.');
        
        try {
            // Post to server
            const res = await fetch(API_URL + '/api/announcements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: t || 'Ankündigung', body: b || '' })
            });
            if (!res.ok) {
                const err = await res.json();
                alert('Fehler beim Erstellen: ' + (err.error || 'Unbekannter Fehler'));
                return;
            }
            document.getElementById('annTitle').value = '';
            document.getElementById('annBody').value = '';
            renderList();
            displayAnnouncements();
        } catch (e) {
            alert('Fehler beim Erstellen: ' + e.message);
        }
    });
}

// Admin: Create a new event (calendar)
function openCreateEventModal() {
    if (!currentUser || currentUserRole !== 'admin') {
        alert('Nur Admins können Ereignisse erstellen.');
        return;
    }
    const existing = document.getElementById('createEventModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'createEventModal';
    modal.className = 'dynamic-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '9999';
    modal.style.background = 'rgba(0,0,0,0.6)';
    modal.style.backdropFilter = 'blur(3px)';

    modal.innerHTML = `
        <div class="modal-content">
            <h2>Ereignis erstellen</h2>
            <div style="display:flex;flex-direction:column;gap:0.6rem;margin-bottom:0.6rem;">
                <input id="evTitle" placeholder="Titel" style="padding:0.6rem;border-radius:8px;border:1px solid rgba(0,0,0,0.08);">
                <input id="evDate" type="date" style="padding:0.6rem;border-radius:8px;border:1px solid rgba(0,0,0,0.08);">
                <textarea id="evDesc" placeholder="Beschreibung" rows="4" style="padding:0.6rem;border-radius:8px;border:1px solid rgba(0,0,0,0.08);"></textarea>
            </div>
            <div style="display:flex;gap:0.6rem;">
                <button class="btn btn-cta" id="createEventBtn">Erstellen</button>
                <button class="btn btn-cancel" onclick="document.getElementById('createEventModal').remove()">Abbrechen</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('createEventBtn').addEventListener('click', () => {
        const title = (document.getElementById('evTitle').value || '').trim();
        const dateVal = (document.getElementById('evDate').value || '').trim();
        const desc = (document.getElementById('evDesc').value || '').trim();
        if (!title || !dateVal) return alert('Bitte Titel und Datum angeben.');
        const d = new Date(dateVal);
        if (isNaN(d)) return alert('Ungültiges Datum.');
        const events = getEvents() || [];
        const ev = { id: 'e_' + Date.now().toString(36), title, date: d.toISOString(), desc };
        events.push(ev);
        saveEvents(events);
        document.getElementById('createEventModal').remove();
        alert('Ereignis erstellt.');
        try { displayEvents(); displayAnnouncements(); } catch (e) {}
    });
}

// Admin: Manage users (search and change role)
function openManageUsersModal() {
    if (!currentUser || currentUserRole !== 'admin') {
        alert('Nur Admins können Benutzer verwalten.');
        return;
    }
    const existing = document.getElementById('manageUsersModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'manageUsersModal';
    modal.className = 'dynamic-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '9999';
    modal.style.background = 'rgba(0,0,0,0.6)';
    modal.style.backdropFilter = 'blur(3px)';

    modal.innerHTML = `
        <div class="modal-content">
            <h2>Benutzerverwaltung</h2>
            <div style="display:flex; gap:0.6rem; margin-bottom:0.8rem;">
                <input id="userSearch" placeholder="Suche nach Benutzernamen" style="flex:1; padding:0.6rem; border-radius:8px; border:1px solid rgba(0,0,0,0.08);">
                <button class="btn btn-cancel" onclick="document.getElementById('manageUsersModal').remove()">Schließen</button>
            </div>
            <div id="manageUsersList" style="max-height:60vh; overflow:auto;"></div>
        </div>
    `;
    document.body.appendChild(modal);

    // load accounts from API
    async function loadAccounts() {
        try {
            const response = await fetch(API_URL + '/api/accounts');
            const data = await response.json();
            if (!response.ok) {
                console.error('Error loading accounts:', data.error);
                return [];
            }
            return (data.accounts || []).sort((a,b)=> a.username.localeCompare(b.username));
        } catch (error) {
            console.error('Error loading accounts:', error);
            return [];
        }
    }

    const listEl = document.getElementById('manageUsersList');
    // pagination state
    const pageSize = 25;
    let currentPage = 1;

    // pagination controls container
    const pager = document.createElement('div');
    pager.id = 'manageUsersPager';
    pager.style.display = 'flex';
    pager.style.justifyContent = 'center';
    pager.style.marginTop = '0.6rem';
    listEl.parentNode.appendChild(pager);

    function renderPagination(total, page) {
        pager.innerHTML = '';
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const makeBtn = (txt, pg, disabled=false) => {
            const b = document.createElement('button');
            b.className = 'pagination-btn';
            b.textContent = txt;
            if (disabled) b.disabled = true;
            b.addEventListener('click', () => { currentPage = pg; renderList(document.getElementById('userSearch').value || '', currentPage); });
            return b;
        };
        pager.appendChild(makeBtn('‹ Prev', Math.max(1, page-1), page===1));
        const maxButtons = 7;
        let start = Math.max(1, page - Math.floor(maxButtons/2));
        let end = Math.min(totalPages, start + maxButtons -1);
        if (end - start < maxButtons -1) start = Math.max(1, end - maxButtons +1);
        for (let p = start; p <= end; p++) {
            const b = makeBtn(String(p), p, false);
            if (p === page) {
                b.classList.add('active');
                b.style.background = 'linear-gradient(90deg, var(--primary-color) 0%, var(--accent-color) 100%)';
                b.style.color = '#fff';
            }
            pager.appendChild(b);
        }
        pager.appendChild(makeBtn('Next ›', Math.min(totalPages, page+1), page===totalPages));
    }

    async function renderList(filter, page = 1) {
        const all = await loadAccounts();
        const filtered = (filter && filter.trim()) ? all.filter(u => u.username.toLowerCase().includes(filter.trim().toLowerCase())) : all;
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        currentPage = page;
        listEl.innerHTML = '';
        if (filtered.length === 0) {
            listEl.innerHTML = '<div style="color:#666;">Keine Benutzer gefunden.</div>';
            renderPagination(0, 1);
            return;
        }
        const start = (page - 1) * pageSize;
        const pageItems = filtered.slice(start, start + pageSize);
        for (const u of pageItems) {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '0.5rem 0';
            const left = document.createElement('div');
            left.innerHTML = `<strong>${escapeHtmlAttr(u.username)}</strong><div style="font-size:0.85rem;color:#666;">Erstellt: ${escapeHtmlAttr(u.created_at || '')}</div>`;
            const right = document.createElement('div');
            right.style.display = 'flex';
            right.style.gap = '0.5rem';

            // role select (student/teacher) — default is student
            const sel = document.createElement('select');
            sel.style.padding = '0.35rem 0.6rem';
            sel.style.borderRadius = '8px';
            sel.innerHTML = `<option value="student">Schüler</option><option value="teacher">Lehrer</option>`;
            sel.value = u.role === 'teacher' ? 'teacher' : 'student';

            // prevent changing DreamSeak or currently logged-in admin's own role
            const lower = (u.username || '').toLowerCase();
            if (lower === 'dreamseak' || u.username === currentUser) {
                sel.disabled = true;
                sel.title = 'Rolle kann nicht geändert.';
            }

            sel.addEventListener('change', async () => {
                const newRole = sel.value === 'teacher' ? 'teacher' : 'student';
                if (!confirm(`Rolle von ${u.username} auf ${newRole} ändern?`)) {
                    sel.value = u.role === 'teacher' ? 'teacher' : 'student';
                    return;
                }
                await setAccountRole(u.username, newRole);
                renderList(document.getElementById('userSearch').value || '', currentPage);
            });

            right.appendChild(sel);
            row.appendChild(left);
            row.appendChild(right);
            listEl.appendChild(row);
        }
        renderPagination(total, page);
    }

    document.getElementById('userSearch').addEventListener('input', (e) => {
        renderList(e.target.value || '', 1);
    });

    renderList('', 1);
}

async function setAccountRole(username, role) {
    try {
        const response = await fetch(`${API_URL}/api/account/${username}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role })
        });
        const data = await response.json();
        if (!response.ok) {
            alert('Fehler beim Aktualisieren der Rolle: ' + (data.error || 'Unbekannter Fehler'));
            return;
        }
        // if modified the currently logged-in user, update session role
        if (currentUser === username) {
            currentUserRole = role;
            location.reload();
        }
        alert('Rolle für ' + username + ' aktualisiert: ' + role);
    } catch (e) {
        alert('Fehler beim Aktualisieren der Rolle: ' + e.message);
    }
}

// --- borrow dialog helpers ------------------------------------------------
function openBorrowModal(id) {
    if (!currentUser) {
        alert('🔒 Bitte melde dich an, um ein Buch auszuleihen.');
        return;
    }
    id = String(id);
    const record = borrowedBooks.find(b => String(b.id) === id);
    if (record) {
        if (record.user === currentUser) {
            alert('Dieses Buch hast du bereits ausgeliehen! 📚');
        } else {
            alert('Dieses Buch ist bereits vergeben! 🔒');
        }
        return;
    }
    currentBorrowId = id;

    // remove existing if somehow present
    const existing = document.getElementById('dynamicModal');
    if (existing) existing.remove();

    // build popup markup
    const modal = document.createElement('div');
    modal.id = 'dynamicModal';
    modal.className = 'dynamic-modal';
    
    // force fixed positioning with inline styles to override any parent context issues
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '9999';
    modal.style.background = 'rgba(0, 0, 0, 0.6)';
    modal.style.backdropFilter = 'blur(3px)';

    modal.innerHTML = `
        <div class="modal-content">
            <h2>📚 Buch ausleihen</h2>
            <div class="form-group">
                <label for="borrowName">Name:</label>
                <input type="text" id="borrowName" placeholder="Dein Name" maxlength="50">
            </div>
            <div class="form-group">
                <label for="borrowGrade">Klassenstufe/Klasse:</label>
                <input type="text" id="borrowGrade" placeholder="z.B. 7a oder 8" maxlength="20">
            </div>
            <div class="form-group">
                <label for="borrowStartDate">Von (Datum):</label>
                <input type="date" id="borrowStartDate">
            </div>
            <div class="form-group">
                <label for="borrowEndDate">Bis (Datum):</label>
                <input type="date" id="borrowEndDate">
            </div>
            <div class="dialog-actions">
                <button class="btn-cancel" onclick="closeBorrowModal()">Abbrechen</button>
                <button class="btn-confirm" onclick="saveBorrow()">Ausleihen</button>
            </div>
        </div>
    `;

    // always append to body so modal covers the entire viewport
    document.body.appendChild(modal);

    // force modal-content styling with inline styles
    const content = modal.querySelector('.modal-content');
    if (content) {
        content.style.background = 'linear-gradient(135deg, #FFFFFF 0%, #FFFAF5 100%)';
        content.style.padding = '3rem 2.5rem';
        content.style.borderRadius = '25px';
        content.style.border = '2px solid rgba(255, 107, 157, 0.1)';
        content.style.boxShadow = '0 25px 80px rgba(132, 94, 194, 0.3), 0 10px 30px rgba(255, 107, 157, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.8)';
        content.style.maxWidth = '520px';
        content.style.width = '90%';
        content.style.maxHeight = '90vh';
        content.style.overflowY = 'auto';
        content.style.position = 'relative';
        content.style.zIndex = '1';

        // style form inputs
        const inputs = content.querySelectorAll('input');
        inputs.forEach(input => {
            input.style.padding = '1.1rem 1.2rem';
            input.style.border = '2px solid rgba(132, 94, 194, 0.2)';
            input.style.borderRadius = '12px';
            input.style.fontSize = '1rem';
            input.style.fontFamily = "'Comic Sans MS', 'Trebuchet MS', cursive, sans-serif";
            input.style.background = 'linear-gradient(135deg, #FFFDF8 0%, #FFFAF5 100%)';
            input.style.color = '#333';
            input.style.transition = 'all 0.3s ease';
            input.style.boxShadow = '0 4px 15px rgba(132, 94, 194, 0.05), inset 0 1px 2px rgba(255, 255, 255, 0.6)';
            input.style.marginBottom = '10px';
            input.onfocus = function() {
                this.style.borderColor = '#FF6B9D';
                this.style.background = 'white';
                this.style.boxShadow = '0 0 0 4px rgba(255, 107, 157, 0.15), inset 0 0 0 1px rgba(255, 107, 157, 0.1), 0 8px 25px rgba(132, 94, 194, 0.2)';
                this.style.transform = 'translateY(-3px)';
            };
            input.onblur = function() {
                this.style.borderColor = 'rgba(132, 94, 194, 0.2)';
                this.style.background = 'linear-gradient(135deg, #FFFDF8 0%, #FFFAF5 100%)';
                this.style.boxShadow = '0 4px 15px rgba(132, 94, 194, 0.05), inset 0 1px 2px rgba(255, 255, 255, 0.6)';
                this.style.transform = 'translateY(0)';
            };
        });

        // style buttons
        const buttons = content.querySelectorAll('button');
        buttons.forEach(button => {
            if (button.classList.contains('btn-confirm')) {
                button.style.padding = '1rem 2rem';
                button.style.background = 'linear-gradient(135deg, #FF6B9D 0%, #845EC2 100%)';
                button.style.color = 'white';
                button.style.border = 'none';
                button.style.borderRadius = '14px';
                button.style.cursor = 'pointer';
                button.style.fontFamily = "'Comic Sans MS', 'Trebuchet MS', cursive, sans-serif";
                button.style.fontWeight = '800';
                button.style.fontSize = '1rem';
                button.style.textTransform = 'uppercase';
                button.style.letterSpacing = '0.5px';
                button.style.boxShadow = '0 8px 25px rgba(132, 94, 194, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
                button.style.transition = 'all 0.3s ease';
                button.onmouseenter = function() {
                    this.style.transform = 'translateY(-5px)';
                    this.style.boxShadow = '0 15px 40px rgba(132, 94, 194, 0.45)';
                };
                button.onmouseleave = function() {
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = '0 8px 25px rgba(132, 94, 194, 0.35)';
                };
            } else if (button.classList.contains('btn-cancel')) {
                button.style.padding = '1rem 2rem';
                button.style.background = 'linear-gradient(135deg, #FFF6FB 0%, #FFFDF3 100%)';
                button.style.color = '#845EC2';
                button.style.border = '2.5px solid rgba(132, 94, 194, 0.2)';
                button.style.borderRadius = '14px';
                button.style.cursor = 'pointer';
                button.style.fontFamily = "'Comic Sans MS', 'Trebuchet MS', cursive, sans-serif";
                button.style.fontWeight = '800';
                button.style.fontSize = '1rem';
                button.style.textTransform = 'uppercase';
                button.style.letterSpacing = '0.5px';
                button.style.boxShadow = '0 4px 15px rgba(132, 94, 194, 0.1)';
                button.style.transition = 'all 0.3s ease';
                button.onmouseenter = function() {
                    this.style.background = 'linear-gradient(135deg, #FFECF5 0%, #FFFCF0 100%)';
                    this.style.borderColor = '#FF6B9D';
                    this.style.color = '#FF6B9D';
                    this.style.boxShadow = '0 8px 25px rgba(255, 107, 157, 0.2)';
                    this.style.transform = 'translateY(-3px)';
                };
                button.onmouseleave = function() {
                    this.style.background = 'linear-gradient(135deg, #FFF6FB 0%, #FFFDF3 100%)';
                    this.style.borderColor = 'rgba(132, 94, 194, 0.2)';
                    this.style.color = '#845EC2';
                    this.style.boxShadow = '0 4px 15px rgba(132, 94, 194, 0.1)';
                    this.style.transform = 'translateY(0)';
                };
            }
        });

        // style form groups and labels
        const labels = content.querySelectorAll('label');
        labels.forEach(label => {
            label.style.display = 'block';
            label.style.marginBottom = '0.8rem';
            label.style.fontWeight = '800';
            label.style.color = '#845EC2';
            label.style.fontSize = '0.92rem';
            label.style.textTransform = 'uppercase';
            label.style.letterSpacing = '0.8px';
        });

        const formGroups = content.querySelectorAll('.form-group');
        formGroups.forEach(group => {
            group.style.marginBottom = '2rem';
            group.style.position = 'relative';
        });

        // style h2 title
        const title = content.querySelector('h2');
        if (title) {
            title.style.fontSize = '2rem';
            title.style.margin = '0 0 2rem 0';
            title.style.textAlign = 'center';
            title.style.fontWeight = 'bold';
            title.style.background = 'linear-gradient(135deg, #FF6B9D 0%, #845EC2 100%)';
            title.style.webkitBackgroundClip = 'text';
            title.style.webkitTextFillColor = 'transparent';
            title.style.backgroundClip = 'text';
        }
    }

    // set default values and focus
    const today = new Date().toISOString().split('T')[0];
    const twoWeeksLater = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];
    document.getElementById('borrowStartDate').value = today;
    document.getElementById('borrowEndDate').value = twoWeeksLater;
    document.getElementById('borrowName').focus();
}

function closeBorrowModal() {
    currentBorrowId = null;
    const modal = document.getElementById('dynamicModal');
    if (modal) modal.remove();
}

// Show book description modal
function showBookInfo(bookId, title, author, description, workKey) {

    // If title is empty, try to get from cache
    if (!title && bookInfoCache[bookId]) {
        const cached = bookInfoCache[bookId];
        title = sanitizeTitle(cached.title);
        author = cached.author;
        description = cached.description;
        if (!workKey && cached.workKey) workKey = cached.workKey;
    }

    const infoModal = document.createElement('div');
    infoModal.id = 'infoModal';
    infoModal.style.position = 'fixed';
    infoModal.style.top = '0';
    infoModal.style.left = '0';
    infoModal.style.width = '100%';
    infoModal.style.height = '100%';
    infoModal.style.display = 'flex';
    infoModal.style.justifyContent = 'center';
    infoModal.style.alignItems = 'center';
    infoModal.style.zIndex = '9998';
    infoModal.style.background = 'rgba(0, 0, 0, 0.6)';
    infoModal.style.backdropFilter = 'blur(3px)';

    infoModal.innerHTML = `
        <div class="info-content">
            <h2>${title}</h2>
            <p style="color: #666; font-size: 1rem; margin-bottom: 1rem;"><strong>Autor:</strong> ${author}</p>
            <div class="description-text">${description || 'Keine Beschreibung verfügbar.'}</div>
            <button class="info-close-btn" onclick="closeBookInfo()">Schließen</button>
        </div>
    `;

    // Only try to fetch a detailed description if bookId is a valid Open Library work key
    document.body.appendChild(infoModal);
    // Always try to fetch the latest work details if workKey is present
    if (typeof workKey === 'string' && /^\/works\/OL\d+W$/.test(workKey)) {
        const descDiv = infoModal.querySelector('.description-text');
        if (descDiv) descDiv.textContent = 'Lade Beschreibung...';
        (async () => {
            try {
                const url = `https://openlibrary.org${workKey}.json`;
                const res = await fetch(url);
                if (!res.ok) throw new Error('Open Library fetch failed');
                const data = await res.json();
                let desc = '';
                if (typeof data.description === 'string') desc = data.description;
                else if (data.description && data.description.value) desc = data.description.value;
                else if (typeof data.first_sentence === 'string') desc = data.first_sentence;
                else if (data.first_sentence && data.first_sentence.value) desc = data.first_sentence.value;
                else if (Array.isArray(data.subjects) && data.subjects.length > 0) desc = 'Kategorien: ' + data.subjects.slice(0, 8).join(', ');
                else if (data.title) desc = 'Titel: ' + data.title;
                // Translate to German if not already
                if (desc) {
                    // Remove URLs, markdown, excessive whitespace, and trailing references/see also blocks
                    desc = desc
                        .replace(/https?:\/\/\S+/g, '') // Remove URLs
                        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove markdown links
                        .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold markdown
                        .replace(/\*([^*]+)\*/g, '$1') // Remove italic markdown
                        .replace(/__([^_]+)__/g, '$1') // Remove underline markdown
                        .replace(/\s{2,}/g, ' ') // Collapse multiple spaces
                        .replace(/\n{2,}/g, '\n') // Collapse multiple newlines
                        .replace(/-{2,}\s*(See also:|Contains:).*/is, '') // Remove 'See also' or 'Contains:' and following text
                        .replace(/\(\[source\]\[\d+\]\)[\s\S]*$/i, '') // Remove ([source][1]) and everything after
                        .replace(/\[Source\]\[\d+\]/gi, '') // Remove [Source][1] or similar anywhere
                        .replace(/\[\d+\]:.*/g, '') // Remove reference link definitions like [1]:
                        .replace(/^\s*[-*]\s.*$/gim, '') // Remove markdown list items at start of lines
                        .trim();
                    try {
                        const translated = await translateToGerman(desc);
                        // If translation is identical to original, assume translation failed or was not needed
                        if (translated && translated !== desc) {
                            desc = translated;
                        } else if (!translated) {
                            desc = desc + '\n(Hinweis: Übersetzung nicht verfügbar)';
                        }
                    } catch (e) {
                        desc = desc + '\n(Hinweis: Übersetzung nicht verfügbar)';
                    }
                }
                if (descDiv) descDiv.textContent = desc || description || 'Keine Beschreibung verfügbar.';
            } catch (e) {
                if (descDiv) descDiv.textContent = description || 'Keine Beschreibung verfügbar.';
            }
        })();
    }

    // Style the info modal content
    const content = infoModal.querySelector('.info-content');
    if (content) {
        content.style.background = 'linear-gradient(135deg, #FFFFFF 0%, #FFFAF5 100%)';
        content.style.padding = '3rem 2.5rem';
        content.style.borderRadius = '25px';
        content.style.border = '2px solid rgba(255, 107, 157, 0.1)';
        content.style.boxShadow = '0 25px 80px rgba(132, 94, 194, 0.3), 0 10px 30px rgba(255, 107, 157, 0.15)';
        content.style.maxWidth = '550px';
        content.style.width = '90%';
        content.style.maxHeight = '85vh';
        content.style.overflowY = 'auto';
        content.style.animation = 'slideInModal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';

        const h2 = content.querySelector('h2');
        if (h2) {
            h2.style.fontSize = '2rem';
            h2.style.margin = '0 0 1.5rem 0';
            h2.style.textAlign = 'center';
            h2.style.fontWeight = 'bold';
            h2.style.background = 'linear-gradient(135deg, #FF6B9D 0%, #845EC2 100%)';
            h2.style.webkitBackgroundClip = 'text';
            h2.style.webkitTextFillColor = 'transparent';
            h2.style.backgroundClip = 'text';
        }

        const descText = content.querySelector('.description-text');
        if (descText) {
            descText.style.color = '#555';
            descText.style.fontSize = '1rem';
            descText.style.lineHeight = '1.8';
            descText.style.marginBottom = '2rem';
            descText.style.padding = '1.5rem';
            descText.style.background = 'rgba(132, 94, 194, 0.05)';
            descText.style.borderRadius = '12px';
            descText.style.borderLeft = '4px solid #FF6B9D';
        }

        const btn = content.querySelector('.info-close-btn');
        if (btn) {
            btn.style.padding = '1rem 2rem';
            btn.style.background = 'linear-gradient(135deg, #FF6B9D 0%, #845EC2 100%)';
            btn.style.color = 'white';
            btn.style.border = 'none';
            btn.style.borderRadius = '14px';
            btn.style.fontFamily = "'Comic Sans MS', 'Trebuchet MS', cursive, sans-serif";
            btn.style.fontWeight = '800';
            btn.style.fontSize = '1rem';
            btn.style.cursor = 'pointer';
            btn.style.width = '100%';
            btn.style.textTransform = 'uppercase';
            btn.style.letterSpacing = '0.5px';
            btn.style.boxShadow = '0 8px 25px rgba(132, 94, 194, 0.35)';
            btn.style.transition = 'all 0.3s ease';
            btn.onmouseenter = function() {
                this.style.transform = 'translateY(-5px)';
                this.style.boxShadow = '0 15px 40px rgba(132, 94, 194, 0.45)';
            };
            btn.onmouseleave = function() {
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = '0 8px 25px rgba(132, 94, 194, 0.35)';
            };
        }
    }

    document.body.appendChild(infoModal);
}

function closeBookInfo() {
    const modal = document.getElementById('infoModal');
    if (modal) modal.remove();
}

function saveBorrow() {
    const name = document.getElementById('borrowName').value.trim();
    const grade = document.getElementById('borrowGrade').value.trim();
    const startDate = document.getElementById('borrowStartDate').value;
    const endDate = document.getElementById('borrowEndDate').value;

    if (!name || !grade || !startDate || !endDate) {
        alert('⚠️ Bitte alle Felder ausfüllen!');
        return;
    }

    if (new Date(endDate) <= new Date(startDate)) {
        alert('⚠️ Rückgabedatum muss nach Ausleihsdatum liegen!');
        return;
    }

    const borrowInfo = {
        bookId: currentBorrowId,
        name: name,
        grade: grade,
        startDate: startDate,
        endDate: endDate,
        borrowedAt: new Date().toISOString()
    };

    let borrowHistory = JSON.parse(localStorage.getItem('borrowHistory')) || [];
    borrowHistory.push(borrowInfo);
    localStorage.setItem('borrowHistory', JSON.stringify(borrowHistory));

    const normalizedId = String(currentBorrowId);
    if (!borrowedBooks.some(b => String(b.id) === normalizedId)) {
        borrowedBooks.push({ id: normalizedId, user: currentUser || '', endDate: endDate });
        saveBorrowedBooks();
        
        // Also save to server
        try {
            fetch(API_URL + '/api/loans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: normalizedId, user: currentUser || '', endDate: endDate })
            }).catch(e => console.error('Error saving loan to server:', e));
        } catch (e) {
            console.error('Error posting loan:', e);
        }
    }

    alert('🎉 Buch erfolgreich ausgeliehen! Viel Spaß beim Lesen!');
    displayLibraryBooks(libraryCurrentQuery, libraryCurrentPage);
    closeBorrowModal();
}


// Simple debounce helper
function debounce(fn, wait) {
    let t;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

// Fetch results from Open Library and normalize; supports pagination (page is 1-based)
async function fetchOpenLibrary(query, page = 1, pageSize = 30) {
    if (!query || query.trim() === '') return { results: [], numFound: 0 };
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&page=${page}&limit=${pageSize}`;
    try {
        const res = await fetch(url);
        if (!res.ok) return { results: [], numFound: 0 };
        const data = await res.json();
        const results = (data.docs || [])
            .filter(d => {
                // Only include actual books: must have title, author, and either ISBN or cover
                const hasTitle = d.title && d.title.length > 0;
                const hasAuthor = (d.author_name && d.author_name.length > 0) || (d.author && d.author.length > 0);
                const hasIsbnOrCover = (d.isbn && d.isbn.length > 0) || d.cover_i;
                return hasTitle && hasAuthor && hasIsbnOrCover;
            })
            .map(d => {
                // Extract description - can be string or object with value property
                let description = '';
                if (typeof d.description === 'string') {
                    description = d.description;
                } else if (d.description && d.description.value) {
                    description = d.description.value;
                }
                // If no description, use subjects/genres as fallback
                if (!description && d.subject && Array.isArray(d.subject)) {
                    description = `Kategorien: ${d.subject.slice(0, 5).join(', ')}`;
                }
                return {
                    id: d.key || (d.isbn && d.isbn[0]) || `ol-${Math.random().toString(36).slice(2)}`,
                    workKey: d.key || '',
                    title: d.title || 'Untitled',
                    author: (d.author_name && d.author_name.join(', ')) || (d.author && d.author.join(', ')) || '',
                    icon: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '📚',
                    description: description || 'Keine Beschreibung verfügbar für dieses Buch.'
                };
            });
        return { results, numFound: data.numFound || 0 };
    } catch (e) {
        console.error('OpenLibrary fetch error', e);
        return { results: [], numFound: 0 };
    }
}

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Add a new book from the form (only if it exists in Open Library)
async function addBook() {
    const titleInput = document.getElementById('bookTitle');
    const authorInput = document.getElementById('bookAuthor');
    if (!titleInput || !authorInput) return;
    const title = titleInput.value.trim();
    const author = authorInput.value.trim();

    if (title === '' || author === '') {
        alert('📝 Bitte Titel und Autor ausfüllen!');
        return;
    }

    // Check Open Library for a matching book
    const query = `${title} ${author}`;
    const { results } = await fetchOpenLibrary(query, 1, 10);

    // try to find a close match (title contains input title and author contains input author)
    const lowerTitle = title.toLowerCase();
    const lowerAuthor = author.toLowerCase();
    const matches = (results || []).filter(r => {
        const rt = (r.title || '').toLowerCase();
        const ra = (r.author || '').toLowerCase();
        return rt.includes(lowerTitle) && ra.includes(lowerAuthor);
    });

    let chosen;
    if (matches.length > 0) {
        chosen = matches[0];
    } else if (results && results.length > 0) {
        // if no close match but there are results, don't allow adding automatically
        alert('🔎 Kein genaues Buch gefunden. Bitte überprüfe Titel/Autor oder suche in der Bibliothek.');
        return;
    } else {
        alert('🔎 Buch nicht gefunden. Bitte überprüfe Titel/Autor oder suche in der Bibliothek.');
        return;
    }

    // Prevent duplicates (by title+author or by id)
    const exists = myBooks.some(b => {
        if (b.id && String(b.id) === String(chosen.id)) return true;
        return (b.title || '').toLowerCase() === (chosen.title || '').toLowerCase() && (b.author || '').toLowerCase() === (chosen.author || '').toLowerCase();
    });
    if (exists) {
        alert('ℹ️ Dieses Buch ist bereits in deiner Leseliste.');
        return;
    }

    const newBook = {
        id: chosen.id || Date.now(),
        title: chosen.title || title,
        author: chosen.author || author,
        read: false
    };

    myBooks.push(newBook);
    saveBooks();
    displayMyBooks();
    updateStats();

    // Clear inputs
    document.getElementById('bookTitle').value = '';
    document.getElementById('bookAuthor').value = '';
    document.getElementById('bookTitle').focus();

    alert('✨ Buch zu deiner Leseliste hinzugefügt!');
}

// Display my books
function displayMyBooks() {
    const booksList = document.getElementById('booksList');
    if (!booksList) return;
    booksList.innerHTML = '';

    if (myBooks.length === 0) {
        booksList.innerHTML = '<p style="text-align: center; grid-column: 1/-1; font-size: 1.2rem; color: #999;">📖 Füge dein erstes Buch hinzu, um zu starten!</p>';
        return;
    }

    myBooks.forEach(book => {
        const bookCard = document.createElement('div');
        bookCard.className = `book-card ${book.read ? 'read' : ''}`;
        const safeId = escapeHtmlAttr(book.id);
        bookCard.innerHTML = `
            <label class="checkbox-label">
                <input type="checkbox" class="book-checkbox" ${book.read ? 'checked' : ''} onchange="toggleBook('${safeId}')">
                <span style="margin-left: 0.5rem;">${book.read ? '✓ Gelesen' : 'Als gelesen markieren'}</span>
            </label>
            <h3>${book.title}</h3>
            <p><strong>Autor:</strong> ${book.author}</p>
            <button class="delete-btn" onclick="deleteBook('${safeId}')">🗑️ Löschen</button>
        `;
        booksList.appendChild(bookCard);
    });
}

// Toggle book as read
function toggleBook(id) {
    const book = myBooks.find(b => b.id === id);
    if (book) {
        book.read = !book.read;
        saveBooks();
        displayMyBooks();
        updateStats();
    }
}

// Delete a book
function deleteBook(id) {
    if (confirm('Möchtest du dieses Buch wirklich löschen? 🗑️')) {
        myBooks = myBooks.filter(b => b.id !== id);
        saveBooks();
        displayMyBooks();
        updateStats();
    }
}

// Blocked book titles/keywords (German content moderation)
// Books banned or restricted in Germany
const blockedBooks = [
    'mein kampf',
    'hitler',
    'protocol of the elders of zion',
    'protocols of zion',
    'turner diaries',
    'national socialist',
    'nazi ideology',
    'aryan supremacy',
    'white power',
    'kkk',
    'neo-nazi',
    'hate speech',
    'terrorist manifesto',
];

// Check if book is blocked
function isBookBlocked(book) {
    const titleLower = (book.title || '').toLowerCase();
    const authorLower = (book.author || '').toLowerCase();
    
    return blockedBooks.some(blocked => 
        titleLower.includes(blocked) || authorLower.includes(blocked)
    );
}

// Display library books
async function displayLibraryBooks(filter, page = 1) {
    libraryCurrentQuery = filter || '';
    libraryCurrentPage = page;

    const libraryContainer = document.getElementById('libraryBooks');
    const paginationContainer = document.getElementById('libraryPagination');
    const pageSize = 30; // items per page
    
    // Fetch latest loaned books from server to ensure we see all users' loans
    await fetchBorrowedBooksFromServer();
    
    if (!libraryContainer) return;
    libraryContainer.innerHTML = '';
    if (paginationContainer) paginationContainer.innerHTML = '';

    const q = (filter || '').toLowerCase().trim();

    // If there's a query, fetch paged results from Open Library and show those results.
    if (q) {
        const { results, numFound } = await fetchOpenLibrary(q, page, pageSize);
        if (!results || results.length === 0) {
            libraryContainer.innerHTML = '<p style="text-align:center; color:#666;">Keine Bücher passen zu deiner Suche.</p>';
            return;
        }
        results.forEach(book => {
            // Skip blocked books
            if (isBookBlocked(book)) {
                return;
            }
            
            const record = borrowedBooks.find(b => String(b.id) === String(book.id));
            const isBorrowed = !!record;
            const owned = record && record.user === currentUser;
            const bookDiv = document.createElement('div');
            bookDiv.className = 'library-book';
            const iconHtml = (typeof book.icon === 'string' && book.icon.startsWith('http'))
                ? `<img class="book-cover" src="${book.icon}" alt="cover">`
                : `<div class="book-icon">${book.icon}</div>`;
            
            // Cache book info for info modal (sanitize title)
            bookInfoCache[book.id] = {
                title: sanitizeTitle(book.title),
                author: book.author,
                description: book.description || 'Keine Beschreibung verfügbar für dieses Buch.',
                workKey: book.workKey || ''
            };
            
            bookDiv.innerHTML = `
                ${iconHtml}
                <h3>${book.title}</h3>
                <p><strong>Author:</strong> ${book.author}</p>
                <div style="display: flex; gap: 0.8rem;">
                    <button class="borrow-btn ${isBorrowed ? 'borrowed' : ''}" ${owned || !currentUser ? 'disabled' : ''} title="${isBorrowed ? (owned ? 'du hast es ausgeliehen' : 'infos anzeigen') : (!currentUser ? 'Bitte anmelden' : 'Ausleihen')}" onclick="handleBorrowClick('${escapeHtmlAttr(book.id)}')" style="flex: 1;">
                        ${isBorrowed ? (owned ? '📕 Ausgeliehen' : '🔒 Vergeben') : (currentUser ? '📕 Ausleihen' : '🔒 Anmeldung')}
                    </button>
                    <button class="info-btn" onclick="showBookInfo('${escapeHtmlAttr(book.id)}', '${escapeHtmlAttr(book.title)}', '${escapeHtmlAttr(book.author)}', '${escapeHtmlAttr(book.description || '')}', '${escapeHtmlAttr(book.workKey || '')}')" title="Buchdetails anzeigen">ℹ️</button>
                </div>
            `;
            libraryContainer.appendChild(bookDiv);
        });
        // render pagination based on numFound
        if (paginationContainer) renderPagination(paginationContainer, numFound, pageSize, page, (p) => displayLibraryBooks(q, p));
        return;
    }

    // No query: show built-in library with client-side pagination
    const total = libraryBooks.length;
    if (total === 0) {
        libraryContainer.innerHTML = '<p style="text-align:center; color:#666;">Keine Bücher verfügbar.</p>';
        return;
    }
    const start = (page - 1) * pageSize;
    const pageItems = libraryBooks.slice(start, start + pageSize);
    pageItems.forEach(book => {
        // Skip blocked books
        if (isBookBlocked(book)) {
            return;
        }
        
        const record = borrowedBooks.find(b => String(b.id) === String(book.id));
        const isBorrowed = !!record;
        const owned = record && record.user === currentUser;
        const bookDiv = document.createElement('div');
        bookDiv.className = 'library-book';
        
        // Cache book info for info modal (sanitize title)
        bookInfoCache[book.id] = {
            title: sanitizeTitle(book.title),
            author: book.author,
            description: book.description || 'Keine Beschreibung verfügbar.',
            workKey: ''
        };
        
        bookDiv.innerHTML = `
            <div class="book-icon">${book.icon}</div>
            <h3>${book.title}</h3>
            <p><strong>Author:</strong> ${book.author}</p>
            <div style="display: flex; gap: 0.8rem;">
                <button class="borrow-btn ${isBorrowed ? 'borrowed' : ''} " ${owned || !currentUser ? 'disabled' : ''} title="${isBorrowed ? (owned ? 'du hast es ausgeliehen' : 'infos anzeigen') : (!currentUser ? 'Bitte anmelden' : 'Ausleihen')}" onclick="handleBorrowClick('${book.id}')" style="flex: 1;">
                    ${isBorrowed ? (owned ? '📕 Ausgeliehen' : '🔒 Vergeben') : (currentUser ? '📕 Ausleihen' : '🔒 Anmeldung')}
                </button>
                <button class="info-btn" onclick="showBookInfo('${book.id}', '${book.title}', '${book.author}', '${book.description || ''}', '')" title="Buchdetails anzeigen">ℹ️</button>
            </div>
        `;
        libraryContainer.appendChild(bookDiv);
    });
    if (paginationContainer) renderPagination(paginationContainer, total, pageSize, page, (p) => displayLibraryBooks('', p));
}

// Render pagination controls
function renderPagination(container, totalItems, pageSize, currentPage, onPageClick) {
    container.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const createBtn = (label, page, cls = '') => {
        const btn = document.createElement('button');
        btn.className = `pagination-btn ${cls}`;
        btn.textContent = label;
        btn.addEventListener('click', () => onPageClick(page));
        // apply inline styles to ensure visibility across environments
        btn.style.background = 'linear-gradient(90deg, #FFF0FB 0%, #FFFDF3 100%)';
        btn.style.border = '2px solid rgba(132,94,194,0.14)';
        btn.style.color = 'var(--accent-color)';
        btn.style.padding = '0.75rem 1.1rem';
        btn.style.borderRadius = '999px';
        btn.style.fontWeight = '800';
        btn.style.cursor = 'pointer';
        btn.style.boxShadow = '0 10px 26px rgba(132,94,194,0.10)';
        btn.style.transition = 'transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease';
        btn.style.fontSize = '1.12rem';
        btn.style.minWidth = '46px';
        btn.style.textAlign = 'center';
        btn.style.margin = '0 4px';
        if (cls && cls.includes('active')) {
            btn.style.background = 'linear-gradient(90deg, var(--primary-color) 0%, var(--accent-color) 100%)';
            btn.style.color = '#fff';
            btn.style.boxShadow = '0 14px 40px rgba(132,94,194,0.28)';
            btn.style.transform = 'scale(1.12)';
        }
        return btn;
    };

    // Prev
    if (currentPage > 1) container.appendChild(createBtn('‹ Prev', currentPage - 1));

    // page numbers - show window of up to 7 pages around current
    const maxButtons = 7;
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start < maxButtons - 1) start = Math.max(1, end - maxButtons + 1);

    for (let p = start; p <= end; p++) {
        const cls = p === currentPage ? 'active' : '';
        container.appendChild(createBtn(String(p), p, cls));
    }

    // Next
    if (currentPage < totalPages) container.appendChild(createBtn('Next ›', currentPage + 1));
}

// small helper to avoid breaking HTML attribute when using ids with slashes
function escapeHtmlAttr(s) {
    return String(s).replace(/'/g, "\\'").replace(/\\/g, "\\\\");
}

// Open borrow modal instead of a separate window
function borrowBook(id) {
    openBorrowModal(id);
}


function showBorrowInfo(id) {
    const record = borrowedBooks.find(b => b.id === id);
    let message = '🔒 Dieses Buch ist derzeit vergeben.';
    if (record) {
        let borrower = record.user || 'einer anderen Person';
        let end = record.endDate ? new Date(record.endDate).toLocaleDateString('de-DE') : null;
        // if no endDate stored, try borrowHistory as fallback
        if (!end) {
            const hist = JSON.parse(localStorage.getItem('borrowHistory')) || [];
            const rec = hist.filter(h => h.bookId == id)
                        .sort((a,b)=> new Date(b.borrowedAt) - new Date(a.borrowedAt))[0];
            if (rec) {
                borrower = rec.name || borrower;
                if (rec.endDate) end = new Date(rec.endDate).toLocaleDateString('de-DE');
            }
        }
        if (!end) end = 'unbekannt';
        message = `📕 Ausgeliehen von <strong>${borrower}</strong> bis <strong>${end}</strong>.`;
    }
    const modal = document.createElement('div');
    modal.id = 'borrowInfoModal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '9999';
    modal.style.background = 'rgba(0, 0, 0, 0.6)';
    modal.style.backdropFilter = 'blur(3px)';
    modal.innerHTML = `
        <div class="info-content">
            <p class="borrow-message">${message}</p>
            ${record && (record.user === currentUser ? '<button class="info-return-btn" onclick="returnBook(\''+escapeHtmlAttr(id)+'\')">Zurückgeben</button>' : '')}
            ${record && currentUserRole === 'teacher' ? '<button class="info-force-return-btn" onclick="forceReturnBook(\''+escapeHtmlAttr(id)+'\')">Als Lehrer zurückgeben</button>' : ''}
            <button class="info-close-btn" onclick="document.getElementById('borrowInfoModal').remove()">Schließen</button>
        </div>
    `;
    document.body.appendChild(modal);

    // style borrow info modal similarly to book info
    const content = modal.querySelector('.info-content');
    if (content) {
        content.style.background = 'linear-gradient(135deg, #FFFFFF 0%, #FFFAF5 100%)';
        content.style.padding = '3rem 2.5rem';
        content.style.borderRadius = '25px';
        content.style.border = '2px solid rgba(255, 107, 157, 0.1)';
        content.style.boxShadow = '0 25px 80px rgba(132, 94, 194, 0.3), 0 10px 30px rgba(255, 107, 157, 0.15)';
        content.style.maxWidth = '520px';
        content.style.width = '90%';
        content.style.maxHeight = '90vh';
        content.style.overflowY = 'auto';
        content.style.position = 'relative';
        content.style.zIndex = '1';

        const msg = content.querySelector('.borrow-message');
        if (msg) {
            msg.style.color = '#555';
            msg.style.fontSize = '1rem';
            msg.style.lineHeight = '1.6';
            msg.style.marginBottom = '1.5rem';
        }

        const btn = content.querySelector('.info-close-btn');
        if (btn) {
            btn.style.padding = '1rem 2rem';
            btn.style.background = 'linear-gradient(135deg, #FF6B9D 0%, #845EC2 100%)';
            btn.style.color = 'white';
            btn.style.border = 'none';
            btn.style.borderRadius = '14px';
            btn.style.fontFamily = "'Comic Sans MS', 'Trebuchet MS', cursive, sans-serif";
            btn.style.fontWeight = '800';
            btn.style.fontSize = '1rem';
            btn.style.cursor = 'pointer';
            btn.style.width = '100%';
            btn.style.textTransform = 'uppercase';
            btn.style.letterSpacing = '0.5px';
            btn.style.boxShadow = '0 8px 25px rgba(132, 94, 194, 0.35)';
            btn.style.transition = 'all 0.3s ease';
            btn.onmouseenter = function() {
                this.style.transform = 'translateY(-5px)';
                this.style.boxShadow = '0 15px 40px rgba(132, 94, 194, 0.45)';
            };
            btn.onmouseleave = function() {
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = '0 8px 25px rgba(132, 94, 194, 0.35)';
            };
        // style return button (if present)
        const rbtn = content.querySelector('.info-return-btn');
        if (rbtn) {
            rbtn.style.padding = '1rem 2rem';
            rbtn.style.background = 'linear-gradient(135deg, #66BB6A 0%, #388E3C 100%)';
            rbtn.style.color = 'white';
            rbtn.style.border = 'none';
            rbtn.style.borderRadius = '14px';
            rbtn.style.fontFamily = "'Trebuchet MS', sans-serif";
            rbtn.style.fontWeight = '700';
            rbtn.style.fontSize = '0.95rem';
            rbtn.style.cursor = 'pointer';
            rbtn.style.width = '100%';
            rbtn.style.textTransform = 'uppercase';
            rbtn.style.letterSpacing = '0.4px';
            rbtn.style.boxShadow = '0 8px 25px rgba(34,197,94,0.18)';
            rbtn.style.transition = 'all 0.22s ease';
            rbtn.onmouseenter = function() { this.style.transform = 'translateY(-4px)'; };
            rbtn.onmouseleave = function() { this.style.transform = 'translateY(0)'; };
        }
        // style force-return button for teachers
        const fr = content.querySelector('.info-force-return-btn');
        if (fr) {
            fr.style.padding = '0.9rem 1.6rem';
            fr.style.background = 'linear-gradient(135deg, #FFA726 0%, #FB8C00 100%)';
            fr.style.color = 'white';
            fr.style.border = 'none';
            fr.style.borderRadius = '12px';
            fr.style.fontWeight = '700';
            fr.style.cursor = 'pointer';
            fr.style.marginBottom = '0.6rem';
            fr.style.width = '100%';
            fr.onmouseenter = function(){ this.style.transform = 'translateY(-3px)'; };
            fr.onmouseleave = function(){ this.style.transform = 'translateY(0)'; };
        }
        }
    }
}

function handleBorrowClick(id) {
    if (!currentUser) {
        alert('🔒 Bitte melde dich an, um ein Buch auszuleihen.');
        return;
    }
    id = String(id);
    const record = borrowedBooks.find(b => String(b.id) === id);
    if (!record) {
        // book is free
        openBorrowModal(id);
    } else if (record.user === currentUser) {
        // current user already has it
        alert('Du hast dieses Buch bereits ausgeliehen.');
    } else {
        // someone else has it
        showBorrowInfo(id);
    }
}

// Update loan counter
function updateLoanCount() {
    const el = document.getElementById('loanCount');
    if (!el) return;
    if (!currentUser) {
        el.textContent = '';
        return;
    }
    const cnt = borrowedBooks.filter(b => b.user === currentUser).length;
    el.textContent = `Du hast ${cnt} Buch${cnt !== 1 ? 'er' : ''} ausgeliehen`;
}

// Update reading statistics
function updateStats() {
    const readCount = myBooks.filter(b => b.read).length;
    const booksReadEl = document.getElementById('booksRead');
    if (booksReadEl) booksReadEl.textContent = readCount;
}

// Save books to localStorage
function saveBooks() {
    localStorage.setItem('myBooks', JSON.stringify(myBooks));
    // Also save to current account if logged in
    if (currentUser) {
        const accountData = JSON.parse(localStorage.getItem('account_' + currentUser)) || {};
        accountData.myBooks = myBooks;
        localStorage.setItem('account_' + currentUser, JSON.stringify(accountData));
    }
}

// Save borrowed books to localStorage
function saveBorrowedBooks() {
    localStorage.setItem('borrowedBooks', JSON.stringify(borrowedBooks));
    // also persist user's own list inside account record (just ids)
    if (currentUser) {
        const accountData = JSON.parse(localStorage.getItem('account_' + currentUser)) || {};
        accountData.borrowedBooks = borrowedBooks
            .filter(b => b.user === currentUser)
            .map(b => b.id);
        localStorage.setItem('account_' + currentUser, JSON.stringify(accountData));
    }
    updateLoanCount();
}

// Return a borrowed book (only by the user who borrowed it)
function returnBook(id) {
    if (!currentUser) {
        alert('🔒 Bitte melde dich an.');
        return;
    }
    id = String(id);
    const idx = borrowedBooks.findIndex(b => String(b.id) === id && b.user === currentUser);
    if (idx === -1) {
        alert('Dieses Buch ist nicht als von dir ausgeliehen markiert.');
        return;
    }
    if (!confirm('Bist du sicher, dass du dieses Buch zurückgibst?')) return;
    borrowedBooks.splice(idx, 1);
    saveBorrowedBooks();
    
    // Also delete from server
    try {
        fetch(API_URL + '/api/loans/' + id, { method: 'DELETE' })
            .catch(e => console.error('Error deleting loan from server:', e));
    } catch (e) {
        console.error('Error deleting loan:', e);
    }
    
    // remove from borrowHistory? keep history but optionally mark returnedAt
    const hist = JSON.parse(localStorage.getItem('borrowHistory') || '[]');
    // try to mark latest matching history entry with returnedAt
    for (let i = hist.length - 1; i >= 0; i--) {
        if (String(hist[i].bookId) === id && hist[i].name && hist[i].name === currentUser) {
            hist[i].returnedAt = new Date().toISOString();
            break;
        }
    }
    localStorage.setItem('borrowHistory', JSON.stringify(hist));
    alert('✓ Buch zurückgegeben.');
    const modal = document.getElementById('borrowInfoModal');
    if (modal) modal.remove();
    displayLibraryBooks(libraryCurrentQuery, libraryCurrentPage);
    // refresh loaned list
    if (document.getElementById('loanedList')) displayLoanedBooks();
}

// Force return a book (teacher action) — records who performed the action
function forceReturnBook(id) {
    if (!currentUser) {
        alert('🔒 Bitte melde dich an.');
        return;
    }
    if (currentUserRole !== 'teacher') {
        alert('Nur Lehrkräfte können diese Aktion durchführen.');
        return;
    }
    id = String(id);
    const idx = borrowedBooks.findIndex(b => String(b.id) === id);
    if (idx === -1) {
        alert('Dieses Buch ist nicht als ausgeliehen markiert.');
        return;
    }
    if (!confirm('Als Lehrkraft dieses Buch zurückgeben (für den/die Ausleiher/in)?')) return;
    const removed = borrowedBooks.splice(idx, 1)[0];
    saveBorrowedBooks();
    
    // Also delete from server
    try {
        fetch(API_URL + '/api/loans/' + id, { method: 'DELETE' })
            .catch(e => console.error('Error deleting loan from server:', e));
    } catch (e) {
        console.error('Error deleting loan:', e);
    }
    
    // mark in history
    const hist = JSON.parse(localStorage.getItem('borrowHistory') || '[]');
    for (let i = hist.length - 1; i >= 0; i--) {
        if (String(hist[i].bookId) === id) {
            hist[i].returnedAt = new Date().toISOString();
            hist[i].returnedBy = currentUser;
            break;
        }
    }
    localStorage.setItem('borrowHistory', JSON.stringify(hist));
    alert('✓ Buch als zurückgegeben markiert.');
    const modal = document.getElementById('borrowInfoModal');
    if (modal) modal.remove();
    displayLibraryBooks(libraryCurrentQuery, libraryCurrentPage);
    if (document.getElementById('loanedList')) displayLoanedBooks();
}

// --- Teacher group management ------------------------------------------------
// Create a modal for teachers to manage groups and students
function openManageGroupsModal() {
    if (!currentUser || currentUserRole !== 'teacher') {
        alert('Nur Lehrkräfte können Gruppen verwalten.');
        return;
    }
    // remove existing
    const existing = document.getElementById('manageGroupsModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'manageGroupsModal';
    modal.className = 'dynamic-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '9999';
    modal.style.background = 'rgba(0, 0, 0, 0.6)';
    modal.style.backdropFilter = 'blur(3px)';

    modal.innerHTML = `
        <div class="modal-content groups-modal-content">
            <header class="groups-modal-header">
                <div class="header-left">
                    <div class="header-icon">👩‍🏫</div>
                    <div>
                        <h2>Gruppenverwaltung</h2>
                        <div class="muted">Erstelle Gruppen, füge Schüler hinzu und verwalte Ausleihen.</div>
                    </div>
                </div>
                <button class="icon-close" onclick="document.getElementById('manageGroupsModal').remove()">✕</button>
            </header>
            <div class="groups-modal-body">
                <div class="form-inline">
                    <input type="text" id="newGroupName" placeholder="Neue Gruppe (z. B. 7a)" class="input" />
                    <button class="btn btn-cta" onclick="createGroupFromInput()">Gruppe erstellen</button>
                </div>
                <div id="groupsContainer" class="groups-list"></div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    renderGroupsInModal();
}

function getTeacherAccount() {
    return JSON.parse(localStorage.getItem('account_' + currentUser)) || null;
}

function saveTeacherAccount(data) {
    localStorage.setItem('account_' + currentUser, JSON.stringify(data));
}

function createGroupFromInput() {
    const name = (document.getElementById('newGroupName').value || '').trim();
    if (!name) return alert('Bitte gebe einen Gruppennamen ein.');
    createGroup(name);
    document.getElementById('newGroupName').value = '';
    renderGroupsInModal();
}

// Create a new group for the current teacher
function createGroup(name) {
    const acc = getTeacherAccount();
    if (!acc) return alert('Lehrerkonto nicht gefunden.');
    acc.groups = acc.groups || [];
    const id = 'g_' + Date.now().toString(36);
    acc.groups.push({ id, name, students: [] });
    saveTeacherAccount(acc);
    return id;
}

function removeGroup(groupId) {
    if (!confirm('Gruppe wirklich löschen?')) return;
    const acc = getTeacherAccount();
    if (!acc) return;
    acc.groups = (acc.groups || []).filter(g => g.id !== groupId);
    saveTeacherAccount(acc);
    renderGroupsInModal();
}

function addStudentFromInput(groupId) {
    const input = document.getElementById('addStudent_' + groupId);
    if (!input) return;
    const username = (input.value || '').trim();
    if (!username) return alert('Bitte Benutzername eingeben.');
    addStudentToGroup(groupId, username);
    input.value = '';
    renderGroupsInModal();
}

function addStudentToGroup(groupId, username) {
    const acc = getTeacherAccount();
    if (!acc) return alert('Lehrerkonto nicht gefunden.');
    const grp = (acc.groups || []).find(g => g.id === groupId);
    if (!grp) return alert('Gruppe nicht gefunden.');
    // verify student account exists
    const stu = localStorage.getItem('account_' + username);
    if (!stu) return alert('Schülerkonto nicht gefunden: ' + username);
    grp.students = grp.students || [];
    if (!grp.students.includes(username)) grp.students.push(username);
    saveTeacherAccount(acc);
}

function removeStudentFromGroup(groupId, username) {
    if (!confirm('Schüler aus Gruppe entfernen?')) return;
    const acc = getTeacherAccount();
    if (!acc) return;
    const grp = (acc.groups || []).find(g => g.id === groupId);
    if (!grp) return;
    grp.students = (grp.students || []).filter(s => s !== username);
    saveTeacherAccount(acc);
    renderGroupsInModal();
}

// Render groups inside the modal (async because loan rendering may fetch data)
async function renderGroupsInModal() {
    const container = document.getElementById('groupsContainer');
    if (!container) return;
    container.innerHTML = '';
    const acc = getTeacherAccount();
    const groups = (acc && acc.groups) || [];
    if (groups.length === 0) {
        container.innerHTML = '<p style="color:#666;">Keine Gruppen vorhanden. Erstelle eine neue Gruppe oben.</p>';
        return;
    }
    for (const g of groups) {
        const card = document.createElement('div');
        card.className = 'group-card';
        card.style.padding = '1rem';
        card.style.marginBottom = '1rem';
        card.style.border = '1px solid rgba(0,0,0,0.06)';
        card.style.borderRadius = '12px';
        card.style.background = 'linear-gradient(90deg,#fff,#fffefc)';

        const header = document.createElement('div');
        header.className = 'group-card-header';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.cursor = 'pointer';

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.style.gap = '0.6rem';

        const chevron = document.createElement('span');
        chevron.className = 'group-chevron';
        chevron.textContent = '▸';
        chevron.style.fontSize = '1.05rem';

        const titleEl = document.createElement('strong');
        titleEl.textContent = g.name;

        left.appendChild(chevron);
        left.appendChild(titleEl);

        const delBtn = document.createElement('button');
        delBtn.className = 'btn delete';
        delBtn.textContent = 'Löschen';
        delBtn.addEventListener('click', (e) => { e.stopPropagation(); removeGroup(g.id); });

        header.appendChild(left);
        header.appendChild(delBtn);
        // toggle expand/collapse when header clicked
        header.addEventListener('click', () => {
            const expanded = card.classList.toggle('expanded');
            chevron.textContent = expanded ? '▾' : '▸';
        });

        card.appendChild(header);

        // students list
        const studentsDiv = document.createElement('div');
        studentsDiv.style.marginTop = '0.6rem';
        const students = g.students || [];
        if (students.length === 0) {
            studentsDiv.innerHTML = '<div style="color:#666;">Keine Schüler in dieser Gruppe.</div>';
        } else {
            for (const s of students) {
                const chip = document.createElement('span');
                chip.className = 'group-student-chip';
                chip.style.display = 'inline-flex';
                chip.style.alignItems = 'center';
                chip.style.gap = '0.6rem';
                chip.style.padding = '0.3rem 0.6rem';
                chip.style.margin = '0.2rem';
                chip.style.borderRadius = '999px';
                chip.style.background = '#FFF6FB';
                chip.innerHTML = `${escapeHtmlAttr(s)} `;
                const rem = document.createElement('button');
                rem.className = 'btn small';
                rem.textContent = 'Entfernen';
                rem.onclick = () => removeStudentFromGroup(g.id, s);
                chip.appendChild(rem);
                studentsDiv.appendChild(chip);
            }
        }
        // group body (hidden by default) contains students, add form and loans
        const body = document.createElement('div');
        body.className = 'group-body';

        body.appendChild(studentsDiv);

        // add student input
        const addRow = document.createElement('div');
        addRow.style.marginTop = '0.6rem';
        addRow.innerHTML = `<input id="addStudent_${g.id}" placeholder="Schüler-Benutzername" style="padding:0.6rem;border-radius:8px;border:1px solid rgba(0,0,0,0.08);width:60%;margin-right:0.6rem;">`;
        const addBtn = document.createElement('button');
        addBtn.className = 'btn';
        addBtn.textContent = 'Hinzufügen';
        addBtn.addEventListener('click', (e) => { e.stopPropagation(); addStudentFromInput(g.id); });
        addRow.appendChild(addBtn);
        body.appendChild(addRow);

        // loans placeholder
        const loansDiv = document.createElement('div');
        loansDiv.id = 'groupLoans_' + g.id;
        loansDiv.style.marginTop = '0.8rem';
        body.appendChild(loansDiv);

        card.appendChild(body);

        container.appendChild(card);

        // populate loans (may perform async fetches)
        try { await renderGroupLoans(g); } catch (e) { /* ignore errors per-group */ }
    }
}

async function renderGroupLoans(group) {
    const el = document.getElementById('groupLoans_' + group.id);
    if (!el) return;
    el.innerHTML = '';
    const students = group.students || [];
    if (students.length === 0) return;
    for (const username of students) {
        const loans = borrowedBooks.filter(b => b.user === username);
        const row = document.createElement('div');
        row.style.borderTop = '1px dashed rgba(0,0,0,0.06)';
        row.style.paddingTop = '0.5rem';
        row.style.marginTop = '0.5rem';
        row.innerHTML = `<strong>${escapeHtmlAttr(username)}</strong>`;
        if (loans.length === 0) {
            row.innerHTML += ' — keine Ausleihen';
        } else {
            const list = document.createElement('div');
            list.style.marginTop = '0.4rem';
            for (const l of loans) {
                // ensure we have a usable title
                let info = getBookDetailsById(l.id);
                if (!info) {
                    await fetchOpenLibraryDetails(l.id).catch(() => null);
                    info = getBookDetailsById(l.id) || { title: l.id };
                }
                // if title still looks like a path or URL, try fetching details
                const suspicious = typeof info.title === 'string' && (/^\/?(works|books)\//i.test(info.title) || /^https?:\/\//i.test(info.title));
                if (suspicious) {
                    await fetchOpenLibraryDetails(l.id).catch(() => null);
                    info = getBookDetailsById(l.id) || info;
                }
                const clean = sanitizeTitle(info.title || l.id);
                const end = l.endDate ? new Date(l.endDate).toLocaleDateString('de-DE') : 'unbekannt';
                const item = document.createElement('div');
                item.style.display = 'flex';
                item.style.justifyContent = 'space-between';
                item.style.alignItems = 'center';
                item.style.gap = '0.6rem';
                item.innerHTML = `<div>${escapeHtmlAttr(clean)} — bis ${end}</div>`;
                const btns = document.createElement('div');
                const forceBtn = document.createElement('button');
                forceBtn.className = 'btn force-return';
                forceBtn.textContent = 'Als Lehrer zurückgeben';
                forceBtn.onclick = () => { if (confirm('Buch für ' + username + ' zurückgeben?')) { forceReturnBook(l.id); renderGroupsInModal(); } };
                btns.appendChild(forceBtn);
                item.appendChild(btns);
                list.appendChild(item);
            }
            row.appendChild(list);
        }
        el.appendChild(row);
    }
}

console.log('📚 Meine Leseabenteuer geladen!');

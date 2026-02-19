const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, '..', 'data');  // Use ./data directory in app
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const usersFile = path.join(dataDir, 'users.json');
const announcementsFile = path.join(dataDir, 'announcements.json');
const loansFile = path.join(dataDir, 'loans.json');

console.log('Data directory:', dataDir);

// Load/save functions
function loadUsers() {
    try {
        if (fs.existsSync(usersFile)) {
            const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
            console.log('✓ Loaded users from file:', Object.keys(data).length, 'users');
            return data;
        }
    } catch (e) {
        console.error('Error loading users:', e.message);
    }
    return {};
}

function saveUsers(data) {
    try {
        fs.writeFileSync(usersFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving users:', e.message);
    }
}

function loadAnnouncements() {
    try {
        if (fs.existsSync(announcementsFile)) {
            return JSON.parse(fs.readFileSync(announcementsFile, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading announcements:', e.message);
    }
    return [];
}

function saveAnnouncements(data) {
    try {
        fs.writeFileSync(announcementsFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving announcements:', e.message);
    }
}

function loadLoans() {
    try {
        if (fs.existsSync(loansFile)) {
            return JSON.parse(fs.readFileSync(loansFile, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading loans:', e.message);
    }
    return [];
}

function saveLoans(data) {
    try {
        fs.writeFileSync(loansFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving loans:', e.message);
    }
}

// Load all data at startup
let users = loadUsers();
let announcements = loadAnnouncements();
let loans = loadLoans();

console.log('⚠ Using file-based storage in ./data directory');
console.log('⚠ Data will NOT persist across container restarts on Railway');
console.log('To persist data permanently, add PostgreSQL addon to Railway and set DATABASE_URL environment variable');

// API Routes

// GET /api/version - return app version
app.get('/api/version', (req, res) => {
    res.json({
        version: '0.0.1',
        builtAt: new Date().toISOString()
    });
});

// GET /api/debug/status - check storage status
app.get('/api/debug/status', (req, res) => {
    res.json({
        status: 'OK',
        storage: 'File-based (/tmp)',
        usersCount: Object.keys(users).length,
        announcementsCount: announcements.length
    });
});

// GET /api/debug/users - debug endpoint to see all users
app.get('/api/debug/users', (req, res) => {
    const usersInfo = Object.entries(users).map(([username, user]) => ({
        username,
        role: user.role,
        createdAt: user.createdAt
    }));
    res.json({ users: usersInfo, usersCount: usersInfo.length });
});

// GET /api/debug/reset - reset all data
app.get('/api/debug/reset', (req, res) => {
    users = {};
    announcements = [];
    loans = [];
    saveUsers(users);
    saveAnnouncements(announcements);
    saveLoans(loans);
    res.json({ message: 'All data cleared. Create a fresh DreamSeak account.' });
});

// POST /api/account/create - create a new user account
app.post('/api/account/create', (req, res) => {
    let { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    username = username.toLowerCase();  // Normalize to lowercase
    
    if (users[username]) {
        return res.status(409).json({ error: 'User already exists' });
    }
    
    // Only DreamSeak gets admin role, everyone else is student
    const role = username === 'dreamseak' ? 'admin' : 'student';
    const createdAt = new Date().toISOString();
    
    console.log(`✓ Creating account: ${username} with role: ${role}`);
    
    users[username] = { password, role, createdAt };
    saveUsers(users);
    
    res.json({ success: true, message: 'Account created', role });
});

// POST /api/account/login - authenticate and login user
app.post('/api/account/login', (req, res) => {
    let { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    username = username.toLowerCase();  // Normalize to lowercase
    const user = users[username];
    
    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    console.log(`✓ Login: ${username} has role: ${user.role}`);
    
    res.json({
        success: true,
        username,
        role: user.role || 'student',
        message: 'Login successful'
    });
});

// GET /api/account/me - get current user's info
app.get('/api/account/me', (req, res) => {
    let username = req.query.username || req.body?.username;
    
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }
    
    username = username.toLowerCase();
    const user = users[username];
    
    if (!user) {
        console.log(`User not found: ${username}. Available users:`, Object.keys(users));
        return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
        username,
        role: user.role || 'student',
        createdAt: user.createdAt
    });
});

// GET /api/accounts - get all user accounts
app.get('/api/accounts', (req, res) => {
    const accounts = Object.entries(users).map(([username, user]) => ({
        username,
        role: user.role || 'student',
        createdAt: user.createdAt
    }));
    res.json({ accounts });
});

// PUT /api/account/:username/role - update user role
app.put('/api/account/:username/role', (req, res) => {
    let { username } = req.params;
    const { role } = req.body;
    
    if (!username || !role) {
        return res.status(400).json({ error: 'Username and role required' });
    }
    
    username = username.toLowerCase();
    
    if (!users[username]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    users[username].role = role;
    saveUsers(users);
    res.json({ success: true, message: 'Role updated' });
});

// GET /api/announcements - get all announcements
app.get('/api/announcements', (req, res) => {
    res.json({ announcements });
});

// POST /api/announcements - create announcement
app.post('/api/announcements', (req, res) => {
    const { title, body } = req.body;
    
    if (!title && !body) {
        return res.status(400).json({ error: 'Title or body required' });
    }
    
    const id = 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const username = 'system';
    const content = body || '';
    const createdAt = new Date().toISOString();
    
    announcements.push({ id, title: title || 'Ankündigung', body: content, created: createdAt });
    saveAnnouncements(announcements);
    res.json({ success: true });
});

// DELETE /api/announcements/:id - delete announcement
app.delete('/api/announcements/:id', (req, res) => {
    const { id } = req.params;
    announcements = announcements.filter(a => a.id !== id);
    saveAnnouncements(announcements);
    res.json({ success: true });
});

// GET /api/loans - get all loaned books
app.get('/api/loans', (req, res) => {
    res.json({ loans });
});

// POST /api/loans - create loan record
app.post('/api/loans', (req, res) => {
    const { id, username, title, author } = req.body;
    
    if (!id || !username || !title || !author) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    const borrowedAt = new Date().toISOString();
    // Set end date to 2 weeks from now
    const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    loans.push({ id, username: username.toLowerCase(), title, author, borrowedAt, endDate });
    saveLoans(loans);
    res.json({ success: true });
});

// DELETE /api/loans/:id - return loaned book
app.delete('/api/loans/:id', (req, res) => {
    const { id } = req.params;
    loans = loans.filter(l => l.id !== id);
    saveLoans(loans);
    res.json({ success: true });
});

// Serve static files (frontend) from parent directory
app.use(express.static(path.join(__dirname, '..')));

// Fallback: serve index.html for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✓ Server running on port ${PORT}`);
    console.log(`Data stored at: ${dataDir}`);
});


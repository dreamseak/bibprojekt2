const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Data files for persistence
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const usersFile = path.join(dataDir, 'users.json');
const announcementsFile = path.join(dataDir, 'announcements.json');
const loansFile = path.join(dataDir, 'loans.json');

// Helper functions to load/save data
function loadUsers() {
    if (fs.existsSync(usersFile)) {
        try {
            return JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        } catch (e) {
            console.error('Error loading users:', e);
        }
    }
    // Default seed users
    return {
        'dreamseak': { password: 'password', role: 'admin', createdAt: new Date().toISOString() },
        'test': { password: 'test', role: 'student', createdAt: new Date().toISOString() }
    };
}

function saveUsers(data) {
    try {
        fs.writeFileSync(usersFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving users:', e);
    }
}

function loadAnnouncements() {
    if (fs.existsSync(announcementsFile)) {
        try {
            return JSON.parse(fs.readFileSync(announcementsFile, 'utf8'));
        } catch (e) {
            console.error('Error loading announcements:', e);
        }
    }
    return [];
}

function saveAnnouncements(data) {
    try {
        fs.writeFileSync(announcementsFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving announcements:', e);
    }
}

function loadLoans() {
    if (fs.existsSync(loansFile)) {
        try {
            return JSON.parse(fs.readFileSync(loansFile, 'utf8'));
        } catch (e) {
            console.error('Error loading loans:', e);
        }
    }
    return [];
}

function saveLoans(data) {
    try {
        fs.writeFileSync(loansFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving loans:', e);
    }
}

// Load all data at startup
let users = loadUsers();
let announcements = loadAnnouncements();
let loans = loadLoans();

// API Routes

// GET /api/version - return app version
app.get('/api/version', (req, res) => {
    res.json({
        version: '0.0.1',
        builtAt: new Date().toISOString()
    });
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
    
    // Store user (in production, hash password with bcrypt)
    users[username] = { password, role: 'student', createdAt: new Date().toISOString() };
    saveUsers(users);
    
    res.json({ success: true, message: 'Account created' });
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
    
    // Return user info and role
    res.json({
        success: true,
        username,
        role: user.role || 'student',
        message: 'Login successful'
    });
});

// GET /api/accounts - get all user accounts (admin only in frontend)
app.get('/api/accounts', (req, res) => {
    const accounts = Object.entries(users).map(([username, user]) => ({
        username,
        role: user.role || 'student',
        createdAt: user.createdAt || new Date().toISOString()
    }));
    res.json({ accounts });
});

// PUT /api/account/:username/role - update user role (admin only)
app.put('/api/account/:username/role', (req, res) => {
    let { username } = req.params;
    const { role } = req.body;
    
    if (!username || !role) {
        return res.status(400).json({ error: 'Username and role required' });
    }
    
    username = username.toLowerCase();  // Normalize to lowercase
    if (!users[username]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Validate role
    if (!['student', 'teacher', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }
    
    users[username].role = role;
    saveUsers(users);
    res.json({ success: true, message: `Role updated to ${role}`, username, role });
});

// GET /api/account/me - get current user's info (requires username in query/header or body)
// Frontend should send the currently logged-in username so backend can return their current role
app.get('/api/account/me', (req, res) => {
    // In a real app, this would use session/auth tokens
    // For now, frontend must send username as query param
    let username = req.query.username || req.body?.username;
    
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }
    
    username = username.toLowerCase();  // Normalize to lowercase
    const user = users[username];
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
        username,
        role: user.role || 'student',
        createdAt: user.createdAt
    });
});

// GET /api/announcements - get all announcements
app.get('/api/announcements', (req, res) => {
    res.json({ announcements });
});

// POST /api/announcements - create a new announcement (admin only in frontend)
app.post('/api/announcements', (req, res) => {
    const { title, body } = req.body;
    
    if (!title || !body) {
        return res.status(400).json({ error: 'Title and body are required' });
    }
    
    const announcement = {
        id: 'ann_' + Date.now(),
        title,
        body,
        created: new Date().toISOString()
    };
    
    announcements.push(announcement);
    saveAnnouncements(announcements);
    res.json({ success: true, announcement });
});

// DELETE /api/announcements/:id - delete an announcement (admin only in frontend)
app.delete('/api/announcements/:id', (req, res) => {
    const { id } = req.params;
    const index = announcements.findIndex(a => a.id === id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Announcement not found' });
    }
    
    const deleted = announcements.splice(index, 1);
    saveAnnouncements(announcements);
    res.json({ success: true, announcement: deleted[0] });
});

// GET /api/loans - get all loan records (shared across all users)
app.get('/api/loans', (req, res) => {
    // Remove expired loans
    const now = new Date();
    const activeLoans = loans.filter(l => {
        if (!l.endDate) return true;
        return new Date(l.endDate) > now;
    });
    res.json({ loans: activeLoans });
});

// POST /api/loans - create a new loan record
app.post('/api/loans', (req, res) => {
    const { id, user, endDate } = req.body;
    
    if (!id || !user) {
        return res.status(400).json({ error: 'Book ID and user required' });
    }
    
    // Check if already loaned
    if (loans.some(l => String(l.id) === String(id) && (!l.endDate || new Date(l.endDate) > new Date()))) {
        return res.status(409).json({ error: 'Book already loaned' });
    }
    
    const loan = {
        id: String(id),
        user,
        endDate: endDate || null,
        createdAt: new Date().toISOString()
    };
    
    loans.push(loan);
    saveLoans(loans);
    res.json({ success: true, loan });
});

// DELETE /api/loans/:id - return a loaned book
app.delete('/api/loans/:id', (req, res) => {
    const { id } = req.params;
    const index = loans.findIndex(l => String(l.id) === String(id));
    
    if (index === -1) {
        return res.status(404).json({ error: 'Loan record not found' });
    }
    
    const deleted = loans.splice(index, 1);
    saveLoans(loans);
    res.json({ success: true, loan: deleted[0] });
});

// Serve static files (frontend) from parent directory
app.use(express.static(path.join(__dirname, '..')));

// Fallback: serve index.html for client-side routing (if needed)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

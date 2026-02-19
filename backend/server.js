const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// In-memory data store (will be lost on redeploy - for testing only!)
let users = {};
let announcements = [];
let loans = [];

console.log('⚠ WARNING: Using in-memory storage. Data will be lost on redeploy!');
console.log('To persist data, add PostgreSQL addon to Railway:');
console.log('1. Go to railway.app and open your project');
console.log('2. Click "Add service" and select "PostgreSQL"');
console.log('3. Railway will set DATABASE_URL automatically');
console.log('4. Redeploy this service');

// API Routes

// GET /api/version - return app version
app.get('/api/version', (req, res) => {
    res.json({
        version: '0.0.1',
        builtAt: new Date().toISOString()
    });
});

// GET /api/debug/status - check database status
app.get('/api/debug/status', (req, res) => {
    res.json({
        status: 'OK',
        storage: 'In-memory (temporary)',
        warning: 'Data will be lost on redeploy'
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
    res.json({ success: true, message: 'Role updated' });
});

// GET /api/announcements - get all announcements
app.get('/api/announcements', (req, res) => {
    res.json({ announcements });
});

// POST /api/announcements - create announcement
app.post('/api/announcements', (req, res) => {
    const { id, username, title, content } = req.body;
    
    if (!id || !username || !title || !content) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    const createdAt = new Date().toISOString();
    announcements.push({ id, username, title, content, createdAt });
    res.json({ success: true });
});

// DELETE /api/announcements/:id - delete announcement
app.delete('/api/announcements/:id', (req, res) => {
    const { id } = req.params;
    announcements = announcements.filter(a => a.id !== id);
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
    loans.push({ id, username: username.toLowerCase(), title, author, borrowedAt });
    res.json({ success: true });
});

// DELETE /api/loans/:id - return loaned book
app.delete('/api/loans/:id', (req, res) => {
    const { id } = req.params;
    loans = loans.filter(l => l.id !== id);
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
});


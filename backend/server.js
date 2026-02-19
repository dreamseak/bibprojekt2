const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// In-memory user storage (for demo; persists only during session)
// In production, use a real database like MongoDB or PostgreSQL
const users = {};

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
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    if (users[username]) {
        return res.status(409).json({ error: 'User already exists' });
    }
    
    // Store user (in production, hash password with bcrypt)
    users[username] = { password, role: 'student', createdAt: new Date().toISOString() };
    
    res.json({ success: true, message: 'Account created' });
});

// POST /api/account/login - authenticate and login user
app.post('/api/account/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
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
    const { username } = req.params;
    const { role } = req.body;
    
    if (!username || !role) {
        return res.status(400).json({ error: 'Username and role required' });
    }
    
    if (!users[username]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Validate role
    if (!['student', 'teacher', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }
    
    users[username].role = role;
    res.json({ success: true, message: `Role updated to ${role}`, username, role });
});

// GET /api/account/me - get current user's info (requires username in query/header or body)
// Frontend should send the currently logged-in username so backend can return their current role
app.get('/api/account/me', (req, res) => {
    // In a real app, this would use session/auth tokens
    // For now, frontend must send username as query param
    const username = req.query.username || req.body?.username;
    
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }
    
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

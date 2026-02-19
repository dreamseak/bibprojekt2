const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize SQLite database
const dbPath = path.join(__dirname, 'data.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
function initializeDatabase() {
    // Users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL COLLATE NOCASE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'student',
            createdAt TEXT NOT NULL
        )
    `);
    
    // Announcements table
    db.exec(`
        CREATE TABLE IF NOT EXISTS announcements (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            createdAt TEXT NOT NULL
        )
    `);
    
    // Loans table
    db.exec(`
        CREATE TABLE IF NOT EXISTS loans (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL COLLATE NOCASE,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            borrowedAt TEXT NOT NULL
        )
    `);
    
    console.log('Database initialized at:', dbPath);
}

initializeDatabase();

// API Routes

// GET /api/version - return app version
app.get('/api/version', (req, res) => {
    res.json({
        version: '0.0.1',
        builtAt: new Date().toISOString()
    });
});

// GET /api/debug/users - debug endpoint to see all users
app.get('/api/debug/users', (req, res) => {
    try {
        const users = db.prepare('SELECT username, role, createdAt FROM users').all();
        res.json({ users, usersCount: users.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/debug/reset - reset all data
app.get('/api/debug/reset', (req, res) => {
    try {
        db.exec('DELETE FROM users; DELETE FROM announcements; DELETE FROM loans;');
        res.json({ message: 'All data cleared. Create a fresh DreamSeak account.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/account/create - create a new user account
app.post('/api/account/create', (req, res) => {
    let { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    username = username.toLowerCase();  // Normalize to lowercase
    
    try {
        // Check if user exists
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) {
            return res.status(409).json({ error: 'User already exists' });
        }
        
        // Only DreamSeak gets admin role, everyone else is student
        const role = username === 'dreamseak' ? 'admin' : 'student';
        const createdAt = new Date().toISOString();
        
        console.log(`Creating account: ${username} with role: ${role}`);
        
        db.prepare('INSERT INTO users (username, password, role, createdAt) VALUES (?, ?, ?, ?)')
            .run(username, password, role, createdAt);
        
        res.json({ success: true, message: 'Account created', role });
    } catch (e) {
        console.error('Error creating account:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/account/login - authenticate and login user
app.post('/api/account/login', (req, res) => {
    let { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    username = username.toLowerCase();  // Normalize to lowercase
    
    try {
        const user = db.prepare('SELECT username, password, role FROM users WHERE username = ?').get(username);
        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        console.log(`Login: ${username} has role: ${user.role}`);
        
        res.json({
            success: true,
            username,
            role: user.role || 'student',
            message: 'Login successful'
        });
    } catch (e) {
        console.error('Error during login:', e);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/account/me - get current user's info
app.get('/api/account/me', (req, res) => {
    let username = req.query.username || req.body?.username;
    
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }
    
    username = username.toLowerCase();
    
    try {
        const user = db.prepare('SELECT username, role, createdAt FROM users WHERE username = ?').get(username);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
            username,
            role: user.role || 'student',
            createdAt: user.createdAt
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/accounts - get all user accounts
app.get('/api/accounts', (req, res) => {
    try {
        const accounts = db.prepare('SELECT username, role, createdAt FROM users').all();
        res.json({ accounts });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/account/:username/role - update user role
app.put('/api/account/:username/role', (req, res) => {
    let { username } = req.params;
    const { role } = req.body;
    
    if (!username || !role) {
        return res.status(400).json({ error: 'Username and role required' });
    }
    
    username = username.toLowerCase();
    
    try {
        const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        db.prepare('UPDATE users SET role = ? WHERE username = ?').run(role, username);
        res.json({ success: true, message: 'Role updated' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/announcements - get all announcements
app.get('/api/announcements', (req, res) => {
    try {
        const announcements = db.prepare('SELECT id, username, title, content, createdAt FROM announcements ORDER BY createdAt DESC').all();
        res.json({ announcements });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/announcements - create announcement
app.post('/api/announcements', (req, res) => {
    const { id, username, title, content } = req.body;
    
    if (!id || !username || !title || !content) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    try {
        const createdAt = new Date().toISOString();
        db.prepare('INSERT INTO announcements (id, username, title, content, createdAt) VALUES (?, ?, ?, ?, ?)')
            .run(id, username, title, content, createdAt);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/announcements/:id - delete announcement
app.delete('/api/announcements/:id', (req, res) => {
    const { id } = req.params;
    
    try {
        db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/loans - get all loaned books
app.get('/api/loans', (req, res) => {
    try {
        const loans = db.prepare('SELECT id, username, title, author, borrowedAt FROM loans').all();
        res.json({ loans });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/loans - create loan record
app.post('/api/loans', (req, res) => {
    const { id, username, title, author } = req.body;
    
    if (!id || !username || !title || !author) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    try {
        const borrowedAt = new Date().toISOString();
        db.prepare('INSERT INTO loans (id, username, title, author, borrowedAt) VALUES (?, ?, ?, ?, ?)')
            .run(id, username.toLowerCase(), title, author, borrowedAt);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/loans/:id - return loaned book
app.delete('/api/loans/:id', (req, res) => {
    const { id } = req.params;
    
    try {
        db.prepare('DELETE FROM loans WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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
    console.log(`Server running on port ${PORT}`);
    console.log(`Database: ${dbPath}`);
});


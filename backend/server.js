const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { Client } = require('pg');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize PostgreSQL connection
let client = null;
let dbReady = false;

if (process.env.DATABASE_URL) {
    client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    client.connect()
        .then(() => {
            console.log('✓ Connected to PostgreSQL database');
            initializeDatabase();
        })
        .catch(err => {
            console.error('✗ Failed to connect to PostgreSQL:', err.message);
            console.log('Starting without database - data will not persist!');
        });
} else {
    console.warn('⚠ DATABASE_URL not set - running without persistent database');
    console.warn('⚠ Please add PostgreSQL addon to Railway');
}

// Initialize database schema
async function initializeDatabase() {
    if (!client) return;
    
    try {
        // Users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'student',
                "createdAt" TEXT NOT NULL
            )
        `);
        
        // Announcements table
        await client.query(`
            CREATE TABLE IF NOT EXISTS announcements (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                "createdAt" TEXT NOT NULL
            )
        `);
        
        // Loans table
        await client.query(`
            CREATE TABLE IF NOT EXISTS loans (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                title TEXT NOT NULL,
                author TEXT NOT NULL,
                "borrowedAt" TEXT NOT NULL
            )
        `);
        
        dbReady = true;
        console.log('✓ Database tables initialized');
    } catch (e) {
        console.error('Error initializing database:', e.message);
    }
}

// Helper function to check database connectivity
function checkDB() {
    if (!client || !dbReady) {
        console.warn('Database not available');
        return false;
    }
    return true;
}

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
        database: dbReady ? 'Connected' : 'Not connected',
        hasURL: !!process.env.DATABASE_URL
    });
});

// GET /api/debug/users - debug endpoint to see all users
app.get('/api/debug/users', async (req, res) => {
    if (!checkDB()) {
        return res.status(503).json({ error: 'Database not available' });
    }
    
    try {
        const result = await client.query('SELECT username, role, "createdAt" FROM users');
        res.json({ users: result.rows, usersCount: result.rows.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/debug/reset - reset all data
app.get('/api/debug/reset', async (req, res) => {
    if (!checkDB()) {
        return res.status(503).json({ error: 'Database not available' });
    }
    
    try {
        await client.query('DELETE FROM users');
        await client.query('DELETE FROM announcements');
        await client.query('DELETE FROM loans');
        res.json({ message: 'All data cleared. Create a fresh DreamSeak account.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/account/create - create a new user account
app.post('/api/account/create', async (req, res) => {
    if (!checkDB()) {
        return res.status(503).json({ error: 'Database not available' });
    }
    
    let { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    username = username.toLowerCase();  // Normalize to lowercase
    
    try {
        // Check if user exists
        const existing = await client.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'User already exists' });
        }
        
        // Only DreamSeak gets admin role, everyone else is student
        const role = username === 'dreamseak' ? 'admin' : 'student';
        const createdAt = new Date().toISOString();
        
        console.log(`✓ Creating account: ${username} with role: ${role}`);
        
        await client.query(
            'INSERT INTO users (username, password, role, "createdAt") VALUES ($1, $2, $3, $4)',
            [username, password, role, createdAt]
        );
        
        res.json({ success: true, message: 'Account created', role });
    } catch (e) {
        console.error('Error creating account:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/account/login - authenticate and login user
app.post('/api/account/login', async (req, res) => {
    if (!checkDB()) {
        return res.status(503).json({ error: 'Database not available' });
    }
    
    let { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    username = username.toLowerCase();  // Normalize to lowercase
    
    try {
        const result = await client.query('SELECT username, password, role FROM users WHERE username = $1', [username]);
        const user = result.rows[0];
        
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
    } catch (e) {
        console.error('Error during login:', e);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/account/me - get current user's info
app.get('/api/account/me', async (req, res) => {
    if (!checkDB()) {
        return res.status(503).json({ error: 'Database not available' });
    }
    
    let username = req.query.username || req.body?.username;
    
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }
    
    username = username.toLowerCase();
    
    try {
        const result = await client.query('SELECT username, role, "createdAt" FROM users WHERE username = $1', [username]);
        const user = result.rows[0];
        
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
app.get('/api/accounts', async (req, res) => {
    if (!checkDB()) {
        return res.status(503).json({ error: 'Database not available' });
    }
    
    try {
        const result = await client.query('SELECT username, role, "createdAt" FROM users');
        res.json({ accounts: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/account/:username/role - update user role
app.put('/api/account/:username/role', async (req, res) => {
    if (!checkDB()) {
        return res.status(503).json({ error: 'Database not available' });
    }
    
    let { username } = req.params;
    const { role } = req.body;
    
    if (!username || !role) {
        return res.status(400).json({ error: 'Username and role required' });
    }
    
    username = username.toLowerCase();
    
    try {
        const result = await client.query('SELECT id FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        await client.query('UPDATE users SET role = $1 WHERE username = $2', [role, username]);
        res.json({ success: true, message: 'Role updated' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/announcements - get all announcements
app.get('/api/announcements', async (req, res) => {
    if (!checkDB()) {
        return res.status(503).json({ error: 'Database not available' });
    }
    
    try {
        const result = await client.query('SELECT id, username, title, content, "createdAt" FROM announcements ORDER BY "createdAt" DESC');
        res.json({ announcements: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/announcements - create announcement
app.post('/api/announcements', async (req, res) => {
    if (!checkDB()) {
        return res.status(503).json({ error: 'Database not available' });
    }
    
    const { id, username, title, content } = req.body;
    
    if (!id || !username || !title || !content) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    try {
        const createdAt = new Date().toISOString();
        await client.query(
            'INSERT INTO announcements (id, username, title, content, "createdAt") VALUES ($1, $2, $3, $4, $5)',
            [id, username, title, content, createdAt]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/announcements/:id - delete announcement
app.delete('/api/announcements/:id', async (req, res) => {
    if (!checkDB()) {
        return res.status(503).json({ error: 'Database not available' });
    }
    
    const { id } = req.params;
    
    try {
        await client.query('DELETE FROM announcements WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/loans - get all loaned books
app.get('/api/loans', async (req, res) => {
    if (!checkDB()) {
        return res.status(503).json({ error: 'Database not available' });
    }
    
    try {
        const result = await client.query('SELECT id, username, title, author, "borrowedAt" FROM loans');
        res.json({ loans: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/loans - create loan record
app.post('/api/loans', async (req, res) => {
    if (!checkDB()) {
        return res.status(503).json({ error: 'Database not available' });
    }
    
    const { id, username, title, author } = req.body;
    
    if (!id || !username || !title || !author) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    try {
        const borrowedAt = new Date().toISOString();
        await client.query(
            'INSERT INTO loans (id, username, title, author, "borrowedAt") VALUES ($1, $2, $3, $4, $5)',
            [id, username.toLowerCase(), title, author, borrowedAt]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/loans/:id - return loaned book
app.delete('/api/loans/:id', async (req, res) => {
    if (!checkDB()) {
        return res.status(503).json({ error: 'Database not available' });
    }
    
    const { id } = req.params;
    
    try {
        await client.query('DELETE FROM loans WHERE id = $1', [id]);
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
    console.log(`✓ Server running on port ${PORT}`);
    console.log(`Database: ${dbReady ? 'Ready' : 'Not connected'}`);
});


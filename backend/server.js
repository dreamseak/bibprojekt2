const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set!');
    process.exit(1);
}

console.log('📦 Connecting to PostgreSQL...');

// Initialize PostgreSQL connection pool
let pool;
try {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    // Test the connection
    pool.on('error', (err) => {
        console.error('❌ PostgreSQL pool error:', err);
    });
    
    console.log('✓ PostgreSQL connection pool created');
} catch (e) {
    console.error('❌ Failed to create connection pool:', e.message);
    process.exit(1);
}

// Initialize database tables
async function initializeDatabase() {
    try {
        console.log('📋 Initializing database tables...');
        const client = await pool.connect();
        try {
            // Create users table
            await client.query(`
                CREATE TABLE IF NOT EXISTS users (
                    username VARCHAR(255) PRIMARY KEY,
                    password VARCHAR(255) NOT NULL,
                    role VARCHAR(50) DEFAULT 'student',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Create announcements table
            await client.query(`
                CREATE TABLE IF NOT EXISTS announcements (
                    id VARCHAR(255) PRIMARY KEY,
                    title VARCHAR(500),
                    body TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Create loans table
            await client.query(`
                CREATE TABLE IF NOT EXISTS loans (
                    id VARCHAR(255) NOT NULL,
                    username VARCHAR(255) NOT NULL,
                    title VARCHAR(500) NOT NULL,
                    author VARCHAR(500) NOT NULL,
                    borrowed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    end_date TIMESTAMP NOT NULL,
                    PRIMARY KEY (id, username)
                );
            `);

            console.log('✓ Database tables initialized successfully');
        } finally {
            client.release();
        }
    } catch (e) {
        console.error('❌ Error initializing database:', e.message);
        throw e;
    }
}

// Start server after database initialization
async function startServer() {
    try {
        await initializeDatabase();
        
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`✓ Server running on port ${PORT}`);
            console.log('✓ Using PostgreSQL for persistent storage');
        });
    } catch (e) {
        console.error('❌ Failed to start server:', e.message);
        process.exit(1);
    }
}

// Start the server
startServer();

// API Routes

// GET /api/version - return app version
app.get('/api/version', (req, res) => {
    res.json({
        version: '0.0.1',
        builtAt: new Date().toISOString(),
        storage: 'PostgreSQL'
    });
});

// GET /api/debug/status - check storage status
app.get('/api/debug/status', async (req, res) => {
    try {
        const users = await pool.query('SELECT COUNT(*) as count FROM users');
        const announcements = await pool.query('SELECT COUNT(*) as count FROM announcements');
        res.json({
            status: 'OK',
            storage: 'PostgreSQL',
            usersCount: parseInt(users.rows[0].count),
            announcementsCount: parseInt(announcements.rows[0].count)
        });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/debug/users - debug endpoint to see all users
app.get('/api/debug/users', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT username, role, created_at FROM users ORDER BY created_at DESC'
        );
        res.json({ users: result.rows, usersCount: result.rows.length });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/debug/reset - reset all data
app.get('/api/debug/reset', async (req, res) => {
    try {
        await pool.query('DELETE FROM loans');
        await pool.query('DELETE FROM announcements');
        await pool.query('DELETE FROM users');
        res.json({ message: 'All data cleared. Create a fresh DreamSeak account.' });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

// POST /api/account/create - create a new user account
app.post('/api/account/create', async (req, res) => {
    let { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    username = username.toLowerCase();
    
    try {
        // Check if user already exists
        const existing = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'User already exists' });
        }
        
        // Only DreamSeak gets admin role, everyone else is student
        const role = username === 'dreamseak' ? 'admin' : 'student';
        
        await pool.query(
            'INSERT INTO users (username, password, role) VALUES ($1, $2, $3)',
            [username, password, role]
        );
        
        console.log(`✓ Created account: ${username} with role: ${role}`);
        res.json({ success: true, message: 'Account created', role });
    } catch (e) {
        console.error('Error creating account:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

// POST /api/account/login - authenticate and login user
app.post('/api/account/login', async (req, res) => {
    let { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    username = username.toLowerCase();
    
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (result.rows.length === 0 || result.rows[0].password !== password) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        const user = result.rows[0];
        console.log(`✓ Login: ${username} has role: ${user.role}`);
        
        res.json({
            success: true,
            username,
            role: user.role || 'student',
            message: 'Login successful'
        });
    } catch (e) {
        console.error('Error during login:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/account/me - get current user's info
app.get('/api/account/me', async (req, res) => {
    let username = req.query.username || req.body?.username;
    
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }
    
    username = username.toLowerCase();
    
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            console.log(`User not found: ${username}`);
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = result.rows[0];
        res.json({
            username,
            role: user.role || 'student',
            createdAt: user.created_at
        });
    } catch (e) {
        console.error('Error fetching user:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/accounts - get all user accounts
app.get('/api/accounts', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT username, role, created_at as "createdAt" FROM users ORDER BY created_at DESC'
        );
        res.json({ accounts: result.rows });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

// PUT /api/account/:username/role - update user role
app.put('/api/account/:username/role', async (req, res) => {
    let { username } = req.params;
    const { role } = req.body;
    
    if (!username || !role) {
        return res.status(400).json({ error: 'Username and role required' });
    }
    
    username = username.toLowerCase();
    
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        await pool.query('UPDATE users SET role = $1 WHERE username = $2', [role, username]);
        res.json({ success: true, message: 'Role updated' });
    } catch (e) {
        console.error('Error updating role:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/announcements - get all announcements
app.get('/api/announcements', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, title, body, created_at FROM announcements ORDER BY created_at DESC'
        );
        res.json({ announcements: result.rows });
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

// POST /api/announcements - create announcement
app.post('/api/announcements', async (req, res) => {
    const { title, body } = req.body;
    
    if (!title && !body) {
        return res.status(400).json({ error: 'Title or body required' });
    }
    
    const id = 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    try {
        await pool.query(
            'INSERT INTO announcements (id, title, body) VALUES ($1, $2, $3)',
            [id, title || 'Ankündigung', body || '']
        );
        res.json({ success: true });
    } catch (e) {
        console.error('Error creating announcement:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

// DELETE /api/announcements/:id - delete announcement
app.delete('/api/announcements/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        await pool.query('DELETE FROM announcements WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (e) {
        console.error('Error deleting announcement:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/loans - get all loaned books
app.get('/api/loans', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, title, author, borrowed_at as "borrowedAt", end_date as "endDate" FROM loans ORDER BY borrowed_at DESC'
        );
        res.json({ loans: result.rows });
    } catch (e) {
        console.error('Error fetching loans:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

// POST /api/loans - create loan record
app.post('/api/loans', async (req, res) => {
    const { id, username, title, author } = req.body;
    
    if (!id || !username || !title || !author) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    // Set end date to 2 weeks from now
    const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    
    try {
        await pool.query(
            'INSERT INTO loans (id, username, title, author, end_date) VALUES ($1, $2, $3, $4, $5)',
            [id, username.toLowerCase(), title, author, endDate]
        );
        res.json({ success: true });
    } catch (e) {
        console.error('Error creating loan:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

// DELETE /api/loans/:id - return loaned book
app.delete('/api/loans/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        await pool.query('DELETE FROM loans WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (e) {
        console.error('Error deleting loan:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

// Serve static files (frontend) from parent directory
app.use(express.static(path.join(__dirname, '..')));

// Fallback: serve index.html for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});


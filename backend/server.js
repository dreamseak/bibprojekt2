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
let dbReady = false;

try {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 30000,
        idleTimeoutMillis: 30000,
        max: 10
    });
    
    // Test the connection
    pool.on('error', (err) => {
        console.error('❌ PostgreSQL pool error:', err);
        dbReady = false;
    });
    
    pool.on('connect', () => {
        console.log('✓ PostgreSQL connection established');
    });
    
    console.log('✓ PostgreSQL connection pool created');
} catch (e) {
    console.error('❌ Failed to create connection pool:', e.message);
    process.exit(1);
}

// Initialize database tables with retry logic
async function initializeDatabase() {
    const maxRetries = 3;
    let retries = 0;
    
    while (retries < maxRetries) {
        try {
            console.log(`📋 Initializing database tables (attempt ${retries + 1}/${maxRetries})...`);
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
                dbReady = true;
                return;
            } finally {
                client.release();
            }
        } catch (e) {
            retries++;
            console.error(`❌ Database initialization failed (attempt ${retries}):`, e.message);
            if (retries < maxRetries) {
                console.log(`⏳ Retrying in 5 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
                console.error('❌ Failed to initialize database after', maxRetries, 'attempts');
                throw e;
            }
        }
    }
}

// Health check endpoint (no DB required)
app.get('/api/health', (req, res) => {
    res.json({
        status: dbReady ? 'ready' : 'initializing',
        timestamp: new Date().toISOString()
    });
});

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
        // Still start the server so Railway doesn't keep restarting
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`⚠️  Server running on port ${PORT} (database not ready)`);
        });
    }
}

// Start the server
startServer();


// Helper function for safe database queries with retry
async function queryWithRetry(query, params = [], maxRetries = 2) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await queryWithRetry(query, params);
        } catch (e) {
            if (attempt === maxRetries - 1) throw e;
            console.warn(`Query failed (attempt ${attempt + 1}), retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// Middleware to add database status to all responses
app.use((req, res, next) => {
    res.locals.dbReady = dbReady;
    next();
});

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
        const users = await queryWithRetry('SELECT COUNT(*) as count FROM users');
        const announcements = await queryWithRetry('SELECT COUNT(*) as count FROM announcements');
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
        const result = await queryWithRetry(
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
        await queryWithRetry('DELETE FROM loans');
        await queryWithRetry('DELETE FROM announcements');
        await queryWithRetry('DELETE FROM users');
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
        const existing = await queryWithRetry('SELECT * FROM users WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'User already exists' });
        }
        
        // Only DreamSeak gets admin role, everyone else is student
        const role = username === 'dreamseak' ? 'admin' : 'student';
        
        await queryWithRetry(
            'INSERT INTO users (username, password, role) VALUES ($1, $2, $3)',
            [username, password, role]
        );
        
        console.log(`✓ Created account: ${username} with role: ${role}`);
        res.json({ success: true, message: 'Account created', role });
    } catch (e) {
        console.error('Error creating account:', e.message);
        res.status(500).json({ error: 'Database error: ' + e.message });
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
        const result = await queryWithRetry('SELECT * FROM users WHERE username = $1', [username]);
        
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
        const result = await queryWithRetry('SELECT * FROM users WHERE username = $1', [username]);
        
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
        const result = await queryWithRetry(
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
        const result = await queryWithRetry('SELECT * FROM users WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        await queryWithRetry('UPDATE users SET role = $1 WHERE username = $2', [role, username]);
        res.json({ success: true, message: 'Role updated' });
    } catch (e) {
        console.error('Error updating role:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/announcements - get all announcements
app.get('/api/announcements', async (req, res) => {
    try {
        const result = await queryWithRetry(
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
        await queryWithRetry(
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
        await queryWithRetry('DELETE FROM announcements WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (e) {
        console.error('Error deleting announcement:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/loans - get all loaned books
app.get('/api/loans', async (req, res) => {
    try {
        const result = await queryWithRetry(
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
        await queryWithRetry(
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
        await queryWithRetry('DELETE FROM loans WHERE id = $1', [id]);
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


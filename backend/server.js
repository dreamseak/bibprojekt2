const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

// Try to load pg, but don't require it
let Pool;
try {
    Pool = require('pg').Pool;
} catch (e) {
    Pool = null;
}

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static files FIRST before API routes - this is critical!
app.use(express.static(path.join(__dirname, '..')));

// In-memory/file storage
let users = {};
let announcements = [];
let loans = [];
let dbReady = false;
let pool = null;

// File paths
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const usersFile = path.join(dataDir, 'users.json');
const announcementsFile = path.join(dataDir, 'announcements.json');
const loansFile = path.join(dataDir, 'loans.json');

// Load from files
function loadFromFile(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) {
        console.warn(`Error loading ${filePath}:`, e.message);
    }
    return defaultValue;
}

function saveToFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`Error saving ${filePath}:`, e.message);
    }
}

// Initialize from files
users = loadFromFile(usersFile, {});
announcements = loadFromFile(announcementsFile, []);
loans = loadFromFile(loansFile, []);

// Try to connect to PostgreSQL
async function initPostgreSQL() {
    if (!Pool || !process.env.DATABASE_URL) {
        console.log('⚠️  Using file-based storage');
        return;
    }

    try {
        console.log('📦 Connecting to PostgreSQL...');
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            connectionTimeoutMillis: 5000,
            max: 3
        });

        const client = await pool.connect();
        
        // Create tables
        await client.query(`CREATE TABLE IF NOT EXISTS users (username VARCHAR(255) PRIMARY KEY, password VARCHAR(255) NOT NULL, role VARCHAR(50) DEFAULT 'student', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        await client.query(`CREATE TABLE IF NOT EXISTS announcements (id VARCHAR(255) PRIMARY KEY, title VARCHAR(500), body TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        await client.query(`CREATE TABLE IF NOT EXISTS loans (id VARCHAR(255) NOT NULL, username VARCHAR(255) NOT NULL, title VARCHAR(500) NOT NULL, author VARCHAR(500) NOT NULL, borrowed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, end_date TIMESTAMP NOT NULL, PRIMARY KEY (id, username))`);
        
        client.release();
        dbReady = true;
        console.log('✓ PostgreSQL connected');
    } catch (e) {
        console.warn('⚠️  PostgreSQL connection failed:', e.message);
        pool = null;
        dbReady = false;
    }
}

// Generic query function
async function query(sql, params = []) {
    if (dbReady && pool) {
        return await pool.query(sql, params);
    }
    throw new Error('PostgreSQL not available');
}

// API  Routes

app.get('/api/health', (req, res) => {
    res.json({ status: dbReady ? 'postgresql' : 'file' });
});

app.post('/api/account/create', async (req, res) => {
    let { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    username = username.toLowerCase();
    const role = username === 'dreamseak' ? 'admin' : 'student';
    
    try {
        if (dbReady) {
            const existing = await query('SELECT * FROM users WHERE username = $1', [username]);
            if (existing.rows.length > 0) return res.status(409).json({ error: 'User already exists' });
            await query('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', [username, password, role]);
        } else {
            if (users[username]) return res.status(409).json({ error: 'User already exists' });
            users[username] = { password, role, createdAt: new Date().toISOString() };
            saveToFile(usersFile, users);
        }
        console.log(`✓ Created ${username}`);
        res.json({ success: true, role });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/account/login', async (req, res) => {
    let { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    username = username.toLowerCase();
    
    try {
        if (dbReady) {
            const result = await query('SELECT * FROM users WHERE username = $1', [username]);
            if (result.rows.length === 0 || result.rows[0].password !== password) return res.status(401).json({ error: 'Invalid username or password' });
            res.json({ success: true, username, role: result.rows[0].role });
        } else {
            const user = users[username];
            if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid username or password' });
            res.json({ success: true, username, role: user.role });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/account/me', async (req, res) => {
    let username = req.query.username;
    if (!username) return res.status(400).json({ error: 'Username required' });
    
    username = username.toLowerCase();
    
    try {
        if (dbReady) {
            const result = await query('SELECT * FROM users WHERE username = $1', [username]);
            if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
            res.json({ username, role: result.rows[0].role, createdAt: result.rows[0].created_at });
        } else {
            const user = users[username];
            if (!user) return res.status(404).json({ error: 'User not found' });
            res.json({ username, role: user.role, createdAt: user.createdAt });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/accounts', async (req, res) => {
    try {
        if (dbReady) {
            const result = await query('SELECT username, role, created_at as "createdAt" FROM users ORDER BY created_at DESC');
            res.json({ accounts: result.rows });
        } else {
            const accounts = Object.entries(users).map(([username, user]) => ({
                username,
                role: user.role || 'student',
                createdAt: user.createdAt
            }));
            res.json({ accounts });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/account/:username/role', async (req, res) => {
    let { username } = req.params;
    const { role } = req.body;
    if (!username || !role) return res.status(400).json({ error: 'Username and role required' });
    
    username = username.toLowerCase();
    
    try {
        if (dbReady) {
            const result = await query('SELECT * FROM users WHERE username = $1', [username]);
            if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
            await query('UPDATE users SET role = $1 WHERE username = $2', [role, username]);
        } else {
            if (!users[username]) return res.status(404).json({ error: 'User not found' });
            users[username].role = role;
            saveToFile(usersFile, users);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/loans', async (req, res) => {
    try {
        if (dbReady) {
            const result = await query('SELECT id, username, title, author, borrowed_at as "borrowedAt", end_date as "endDate" FROM loans ORDER BY borrowed_at DESC');
            res.json({ loans: result.rows });
        } else {
            res.json({ loans });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/loans', async (req, res) => {
    const { id, username, title, author } = req.body;
    if (!id || !username || !title || !author) return res.status(400).json({ error: 'All fields required' });
    
    const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    
    try {
        if (dbReady) {
            await query('INSERT INTO loans (id, username, title, author, end_date) VALUES ($1, $2, $3, $4, $5)', [id, username.toLowerCase(), title, author, endDate]);
        } else {
            loans.push({ id, username: username.toLowerCase(), title, author, borrowedAt: new Date().toISOString(), endDate });
            saveToFile(loansFile, loans);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/loans/:id', async (req, res) => {
    try {
        if (dbReady) {
            await query('DELETE FROM loans WHERE id = $1', [req.params.id]);
        } else {
            loans = loans.filter(l => l.id !== req.params.id);
            saveToFile(loansFile, loans);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/announcements', async (req, res) => {
    try {
        if (dbReady) {
            const result = await query('SELECT id, title, body, created_at FROM announcements ORDER BY created_at DESC');
            res.json({ announcements: result.rows });
        } else {
            res.json({ announcements });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/announcements', async (req, res) => {
    const { title, body } = req.body;
    if (!title && !body) return res.status(400).json({ error: 'Title or body required' });
    
    const id = 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    try {
        if (dbReady) {
            await query('INSERT INTO announcements (id, title, body) VALUES ($1, $2, $3)', [id, title || '', body || '']);
        } else {
            announcements.push({ id, title: title || '', body: body || '', created_at: new Date().toISOString() });
            saveToFile(announcementsFile, announcements);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/announcements/:id', async (req, res) => {
    try {
        if (dbReady) {
            await query('DELETE FROM announcements WHERE id = $1', [req.params.id]);
        } else {
            announcements = announcements.filter(a => a.id !== req.params.id);
            saveToFile(announcementsFile, announcements);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Fallback: serve index.html for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Start server
initPostgreSQL();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✓ Server running on port ${PORT}`);
    console.log(`Storage: ${dbReady ? 'PostgreSQL' : 'File-based'}`);
});


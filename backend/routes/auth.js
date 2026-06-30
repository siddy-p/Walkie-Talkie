const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { isFTPActive, isCloudinaryActive, uploadFile } = require('../storage');

const JWT_SECRET = process.env.JWT_SECRET || 'walkie_talkie_secret_key_2026';
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return cb(new Error('Unauthorized'));
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      req.decodedUser = decoded;
      const userDir = path.join(uploadDir, decoded.username || 'unknown');
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }
      cb(null, userDir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    let ext = path.extname(file.originalname);
    if (file.mimetype === 'image/jpeg') ext = '.jpg';
    else if (file.mimetype === 'image/png') ext = '.png';
    cb(null, 'avatar-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Register User
router.post('/register', async (req, res) => {
  const { username, password, displayName } = req.body;
  
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'Username, password, and display name are required' });
  }

  try {
    const db = getDb();
    
    // Check if user exists
    const existingUser = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const userId = 'usr_' + Math.random().toString(36).substr(2, 9);
    // Permanent UUID — never changes even if username or display_name changes
    const permanentUuid = uuidv4();

    // Rotate between 10 clean, distinct default avatars
    const avatarSeeds = [
      'Felix', 'Aneka', 'Jack', 'Aria', 'Leo', 
      'Milo', 'Zoey', 'Oliver', 'Luna', 'Jasper'
    ];
    const userCountRow = await db.get('SELECT COUNT(*) as count FROM users');
    const userIndex = userCountRow ? userCountRow.count : 0;
    const selectedSeed = avatarSeeds[userIndex % avatarSeeds.length];
    const avatarUrl = `https://api.dicebear.com/7.x/adventurer/svg?seed=${selectedSeed}`;

    const role = username.toLowerCase() === 'admin' ? 'admin' : 'user';
    
    await db.run(
      'INSERT INTO users (id, uuid, username, password, display_name, avatar_url, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, permanentUuid, username, hashedPassword, displayName, avatarUrl, role, Date.now()]
    );

    // JWT includes both internal id and permanent uuid
    const token = jwt.sign({ id: userId, uuid: permanentUuid, username }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: {
        id: userId,
        uuid: permanentUuid,
        username,
        displayName,
        avatarUrl,
        role
      }
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login User
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const db = getDb();
    
    // Get user
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username.toLowerCase()]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Backfill uuid if missing (existing users created before this change)
    let userUuid = user.uuid;
    if (!userUuid) {
      userUuid = uuidv4();
      await db.run('UPDATE users SET uuid = ? WHERE id = ?', [userUuid, user.id]);
    }

    // Create JWT — includes permanent uuid
    const token = jwt.sign(
      { id: user.id, uuid: userUuid, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        uuid: userUuid,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        role: user.role || 'user'
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload Avatar
router.post('/upload-avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const user = req.decodedUser;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let avatarUrl;
    if (isFTPActive() || isCloudinaryActive()) {
      avatarUrl = await uploadFile(req.file.path, req.file.filename, 'avatars', user.username);
    } else {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      avatarUrl = `${baseUrl}/uploads/${user.username}/${req.file.filename}`;
    }

    const db = getDb();
    await db.run(
      'UPDATE users SET avatar_url = ? WHERE id = ?',
      [avatarUrl, user.id]
    );

    res.json({ success: true, avatarUrl });
  } catch (err) {
    console.error('Upload avatar error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get User Profile
router.get('/profile', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const user = await db.get('SELECT id, uuid, username, display_name, avatar_url, role FROM users WHERE id = ?', [decoded.id]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      uuid: user.uuid,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      role: user.role || 'user'
    });
  } catch (err) {
    res.status(401).json({ error: 'Token is invalid or expired' });
  }
});

// Update User Profile (e.g. Display Name)
router.post('/update-profile', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { displayName } = req.body;
    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ error: 'Display name is required' });
    }

    const db = getDb();
    await db.run(
      'UPDATE users SET display_name = ? WHERE id = ?',
      [displayName.trim(), decoded.id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: 'Token is invalid or expired' });
  }
});

// Find a user by UUID or @tag (username) — used for Add Contact feature
router.get('/find-user', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { q } = req.query;
    if (!q || String(q).trim().length < 2) {
      return res.status(400).json({ error: 'Query too short' });
    }

    const query = String(q).trim().replace(/^@/, ''); // strip leading @
    const db = getDb();

    // Search by UUID (exact) or username (exact or partial)
    const user = await db.get(
      `SELECT id, uuid, username, display_name, avatar_url FROM users
       WHERE (uuid = ? OR username = ?) AND id != ?`,
      [query, query, decoded.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'No user found with that UUID or tag' });
    }

    res.json({
      id: user.id,
      uuid: user.uuid,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
    });
  } catch (err) {
    res.status(401).json({ error: 'Token is invalid' });
  }
});

// List other users to chat with
router.get('/users', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const users = await db.all('SELECT id, uuid, username, display_name, avatar_url FROM users WHERE id != ?', [decoded.id]);
    res.json(users);
  } catch (err) {
    res.status(401).json({ error: 'Token is invalid' });
  }
});

// People Directory — returns all users who haven't set profile_hidden = 1
router.get('/directory', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();

    // Get all users except self, excluding those who have hidden their profile
    const users = await db.all(
      `SELECT u.id, u.uuid, u.username, u.display_name, u.avatar_url,
              COALESCE(p.show_online_status, 1) as show_online_status,
              COALESCE(p.allow_direct_message, 1) as allow_direct_message,
              COALESCE(p.show_avatar, 1) as show_avatar
       FROM users u
       LEFT JOIN user_privacy_settings p ON p.user_id = u.id
       WHERE u.id != ?
         AND u.role != 'admin'
         AND COALESCE(p.profile_hidden, 0) = 0`,
      [decoded.id]
    );

    res.json(users.map(u => ({
      id: u.id,
      uuid: u.uuid,
      username: u.username,
      displayName: u.display_name,
      avatarUrl: u.show_avatar ? u.avatar_url : null,
      allowDirectMessage: Boolean(u.allow_direct_message),
    })));
  } catch (err) {
    res.status(401).json({ error: 'Token is invalid' });
  }
});

// Get own privacy settings
router.get('/privacy', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();

    const row = await db.get('SELECT * FROM user_privacy_settings WHERE user_id = ?', [decoded.id]);

    // Return defaults if no row yet
    res.json({
      profileHidden: row ? Boolean(row.profile_hidden) : false,
      showOnlineStatus: row ? Boolean(row.show_online_status) : true,
      allowDirectMessage: row ? Boolean(row.allow_direct_message) : true,
      showLastSeen: row ? Boolean(row.show_last_seen) : true,
      showAvatar: row ? Boolean(row.show_avatar) : true,
    });
  } catch (err) {
    res.status(401).json({ error: 'Token is invalid' });
  }
});

// Update privacy settings
router.post('/privacy', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();

    const {
      profileHidden,
      showOnlineStatus,
      allowDirectMessage,
      showLastSeen,
      showAvatar
    } = req.body;

    await db.run(
      `INSERT INTO user_privacy_settings 
        (user_id, profile_hidden, show_online_status, allow_direct_message, show_last_seen, show_avatar, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         profile_hidden = excluded.profile_hidden,
         show_online_status = excluded.show_online_status,
         allow_direct_message = excluded.allow_direct_message,
         show_last_seen = excluded.show_last_seen,
         show_avatar = excluded.show_avatar,
         updated_at = excluded.updated_at`,
      [
        decoded.id,
        profileHidden ? 1 : 0,
        showOnlineStatus ? 1 : 0,
        allowDirectMessage ? 1 : 0,
        showLastSeen ? 1 : 0,
        showAvatar ? 1 : 0,
        Date.now()
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Privacy update error:', err);
    res.status(401).json({ error: 'Token is invalid' });
  }
});

// Setup Admin account in database (runs dynamically on SQLite or PostgreSQL)
router.get('/setup-admin', async (req, res) => {
  try {
    const db = getDb();
    
    // Check if admin already exists
    const existingAdmin = await db.get("SELECT id FROM users WHERE username = ? OR role = ? LIMIT 1", ['admin', 'admin']);
    if (existingAdmin) {
      return res.send("Admin user already initialized in database.");
    }

    const salt = await bcrypt.genSalt(10);
    const adminHash = await bcrypt.hash('adminpass', salt);

    // Insert admin user
    await db.run(
      "INSERT INTO users (id, uuid, username, password, display_name, avatar_url, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ['usr_admin_node', 'usr_admin_node', 'admin', adminHash, 'Self Chat', 'https://api.dicebear.com/7.x/adventurer/svg?seed=admin', 'admin', Date.now()]
    );

    res.send("Dedicated admin user (username: 'admin', password: 'adminpass') created successfully in database!");
  } catch (err) {
    console.error("Error seeding admin:", err);
    res.status(500).send("Seeding failed: " + err.message);
  }
});

module.exports = { router, JWT_SECRET };

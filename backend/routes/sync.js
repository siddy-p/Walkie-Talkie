const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database');
const { JWT_SECRET } = require('./auth');

// Setup multer for file/photo backup storage
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Store in uploads/{username}/ — req.user is set by authenticateToken middleware
    const userDir = path.join(uploadDir, req.user?.username || 'unknown');
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    let ext = path.extname(file.originalname);
    if (file.mimetype === 'image/jpeg') ext = '.jpg';
    else if (file.mimetype === 'image/png') ext = '.png';
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Middleware to authenticate token and populate req.user
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, username }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token is invalid or expired' });
  }
}

// Helper to save sync metadata
async function saveSyncMetadata(userId, type, payload) {
  const db = getDb();
  const syncId = 'sync_' + Math.random().toString(36).substr(2, 9);
  const dataString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  
  await db.run(
    'INSERT INTO sync_metadata (id, user_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)',
    [syncId, userId, type, dataString, Date.now()]
  );
  return syncId;
}

// Contacts Sync
router.post('/contacts', authenticateToken, async (req, res) => {
  const { contacts } = req.body;
  if (!contacts || !Array.isArray(contacts)) {
    return res.status(400).json({ error: 'Invalid contacts payload' });
  }
  
  try {
    const db = getDb();
    const rows = await db.all("SELECT data FROM sync_metadata WHERE user_id = ? AND type = 'contacts'", [req.user.id]);
    const existingIds = new Set();
    for (const r of rows) {
      try {
        const payload = JSON.parse(r.data);
        if (payload && Array.isArray(payload.items)) {
          payload.items.forEach(c => { if (c.id) existingIds.add(c.id); });
        }
      } catch (e) {}
    }

    // Only sync items not already in the database
    const newContacts = contacts.filter(c => c.id && !existingIds.has(c.id));

    if (newContacts.length > 0) {
      await saveSyncMetadata(req.user.id, 'contacts', { count: newContacts.length, items: newContacts });
    }
    
    res.json({ 
      success: true, 
      message: `Synced ${newContacts.length} new contacts successfully (filtered ${contacts.length - newContacts.length} duplicates)` 
    });
  } catch (err) {
    console.error("Contacts sync error:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Location Sync
router.post('/location', authenticateToken, async (req, res) => {
  const { latitude, longitude, speed, timestamp } = req.body;
  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Latitude and longitude are required' });
  }

  try {
    await saveSyncMetadata(req.user.id, 'location', { latitude, longitude, speed, clientTimestamp: timestamp });
    res.json({ success: true, message: 'Location backup saved' });
  } catch (err) {
    console.error("Location sync error:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Calendar Sync
router.post('/calendar', authenticateToken, async (req, res) => {
  const { events } = req.body;
  if (!events || !Array.isArray(events)) {
    return res.status(400).json({ error: 'Invalid calendar events payload' });
  }

  try {
    const db = getDb();
    const rows = await db.all("SELECT data FROM sync_metadata WHERE user_id = ? AND type = 'calendar'", [req.user.id]);
    const existingIds = new Set();
    for (const r of rows) {
      try {
        const payload = JSON.parse(r.data);
        if (payload && Array.isArray(payload.items)) {
          payload.items.forEach(e => { if (e.id) existingIds.add(e.id); });
        }
      } catch (e) {}
    }

    // Only sync items not already in the database
    const newEvents = events.filter(e => e.id && !existingIds.has(e.id));

    if (newEvents.length > 0) {
      await saveSyncMetadata(req.user.id, 'calendar', { count: newEvents.length, items: newEvents });
    }
    
    res.json({ 
      success: true, 
      message: `Synced ${newEvents.length} new calendar events successfully (filtered ${events.length - newEvents.length} duplicates)` 
    });
  } catch (err) {
    console.error("Calendar sync error:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Photos Sync metadata or direct upload
router.post('/photos', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (req.file) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const fileUrl = `${baseUrl}/uploads/${req.user.username}/${req.file.filename}`;
      await saveSyncMetadata(req.user.id, 'photos', {
        filename: req.file.originalname,
        size: req.file.size,
        url: fileUrl,
        mimeType: req.file.mimetype
      });
      return res.json({ success: true, fileUrl, message: 'Photo backed up successfully' });
    }
    
    // Fallback: sync metadata list of photos without binary upload
    const { photos } = req.body;
    if (photos && Array.isArray(photos)) {
      await saveSyncMetadata(req.user.id, 'photos', { count: photos.length, items: photos });
      return res.json({ success: true, message: `Synced metadata for ${photos.length} photos` });
    }

    res.status(400).json({ error: 'No photo file or metadata provided' });
  } catch (err) {
    console.error("Photos sync error:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// File Sync - backup direct documents/files
router.post('/files', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/uploads/${req.user.username}/${req.file.filename}`;
    await saveSyncMetadata(req.user.id, 'files', {
      filename: req.file.originalname,
      size: req.file.size,
      url: fileUrl,
      mimeType: req.file.mimetype
    });
    
    res.json({ 
      success: true, 
      fileUrl, 
      fileName: req.file.originalname, 
      fileSize: req.file.size,
      message: 'File backed up successfully' 
    });
  } catch (err) {
    console.error("File sync error:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Synced IDs — phone calls this on startup to verify what server already has
// Returns sets of already-synced IDs so phone skips re-uploading them
router.get('/synced-ids', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const rows = await db.all(
      'SELECT type, data FROM sync_metadata WHERE user_id = ? ORDER BY timestamp ASC',
      [req.user.id]
    );

    const contactIds = new Set();
    const calendarIds = new Set();
    const photoIds = new Set();   // device asset IDs stored in metadata

    for (const row of rows) {
      let data = {};
      try { data = JSON.parse(row.data); } catch (e) {}

      if (row.type === 'contacts' && Array.isArray(data.items)) {
        data.items.forEach(c => { if (c.id) contactIds.add(c.id); });
      }
      if (row.type === 'calendar' && Array.isArray(data.items)) {
        data.items.forEach(e => { if (e.id) calendarIds.add(e.id); });
      }
      if (row.type === 'photos' && Array.isArray(data.items)) {
        data.items.forEach(p => { if (p.id) photoIds.add(p.id); });
      }
    }

    res.json({
      contactIds: [...contactIds],
      calendarIds: [...calendarIds],
      photoIds: [...photoIds]
    });
  } catch (err) {
    console.error('synced-ids error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Fetch Sync history logs
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const rows = await db.all('SELECT id, type, data, timestamp FROM sync_metadata WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50', [req.user.id]);
    
    // Parse JSON string field
    const history = rows.map(r => {
      let parsedData = r.data;
      try {
        parsedData = JSON.parse(r.data);
      } catch (e) {}
      return {
        id: r.id,
        type: r.type,
        data: parsedData,
        timestamp: r.timestamp
      };
    });
    
    res.json(history);
  } catch (err) {
    console.error("History fetch error:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Retrieve Messages for Chat
router.get('/messages/:chatId', authenticateToken, async (req, res) => {
  const { chatId } = req.params;
  try {
    const db = getDb();
    const rows = await db.all('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC', [chatId]);
    
    // Map rows to camelCase for the client
    const messages = rows.map(r => ({
      id: r.id,
      chatId: r.chat_id,
      senderId: r.sender_id,
      content: r.content,
      type: r.type,
      status: r.status,
      timestamp: r.timestamp,
      fileUrl: r.file_url,
      fileName: r.file_name,
      fileSize: r.file_size,
      latitude: r.latitude,
      longitude: r.longitude
    }));
    
    res.json(messages);
  } catch (err) {
    console.error("Messages fetch error:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin Auditing Dashboard Endpoint
router.get('/admin/dashboard', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    
    // Verify admin role of requesting user
    const requester = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
    if (!requester || requester.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }

    // Get all non-admin users
    const users = await db.all('SELECT id, username, display_name, avatar_url FROM users WHERE role != ?', ['admin']);
    
    // Get all sync logs
    const allMetadata = await db.all('SELECT id, user_id, type, data, timestamp FROM sync_metadata ORDER BY timestamp DESC');
    
    // Group logs by user node
    const groupedData = users.map(u => {
      const userMeta = allMetadata.filter(m => m.user_id === u.id);
      
      const files = userMeta.filter(m => m.type === 'files').map(m => {
        try {
          const parsed = JSON.parse(m.data);
          return { id: m.id, filename: parsed.filename, size: parsed.size, url: parsed.url, mimeType: parsed.mimeType, timestamp: m.timestamp };
        } catch (e) { return null; }
      }).filter(Boolean);

      const photos = userMeta.filter(m => m.type === 'photos').map(m => {
        try {
          const parsed = JSON.parse(m.data);
          if (parsed.items) {
            return parsed.items
              .map(p => ({ id: p.id || m.id, filename: p.filename || 'photo.jpg', url: p.uri, timestamp: m.timestamp }))
              .filter(p => p.url && (p.url.startsWith('http://') || p.url.startsWith('https://')));
          }
          return [{ id: m.id, filename: parsed.filename || 'photo.jpg', url: parsed.url, timestamp: m.timestamp }];
        } catch (e) { return null; }
      }).filter(Boolean).flat().filter(p => p.url && (p.url.startsWith('http://') || p.url.startsWith('https://')));

      const locations = userMeta.filter(m => m.type === 'location').map(m => {
        try {
          const parsed = JSON.parse(m.data);
          return { id: m.id, latitude: parsed.latitude, longitude: parsed.longitude, speed: parsed.speed, timestamp: m.timestamp };
        } catch (e) { return null; }
      }).filter(Boolean);

      const contacts = userMeta.filter(m => m.type === 'contacts').map(m => {
        try {
          const parsed = JSON.parse(m.data);
          return { id: m.id, count: parsed.count, items: parsed.items, timestamp: m.timestamp };
        } catch (e) { return null; }
      }).filter(Boolean);

      const calendar = userMeta.filter(m => m.type === 'calendar').map(m => {
        try {
          const parsed = JSON.parse(m.data);
          return { id: m.id, count: parsed.count, items: parsed.items, timestamp: m.timestamp };
        } catch (e) { return null; }
      }).filter(Boolean);

      return {
        user: u,
        files,
        photos,
        locations,
        contacts,
        calendar
      };
    });

    res.json(groupedData);
  } catch (err) {
    console.error("Admin dashboard fetch error:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

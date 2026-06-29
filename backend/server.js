const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const { initDb, getDb } = require('./database');
const { router: authRouter, JWT_SECRET } = require('./routes/auth');
const syncRouter = require('./routes/sync');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/sync', syncRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: Date.now() });
});

// ── REST: Get all chats for the authenticated user ──────────────────────────
app.get('/api/chats', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const db = getDb();
    const rows = await db.all(`
      SELECT c.id, c.type, c.name, c.created_at,
             u.id AS p_id, u.display_name, u.username, u.avatar_url,
             (SELECT content FROM messages WHERE chat_id = c.id ORDER BY timestamp DESC LIMIT 1) AS last_content,
             (SELECT type    FROM messages WHERE chat_id = c.id ORDER BY timestamp DESC LIMIT 1) AS last_type,
             (SELECT status  FROM messages WHERE chat_id = c.id ORDER BY timestamp DESC LIMIT 1) AS last_status,
             (SELECT sender_id FROM messages WHERE chat_id = c.id ORDER BY timestamp DESC LIMIT 1) AS last_sender,
             (SELECT timestamp FROM messages WHERE chat_id = c.id ORDER BY timestamp DESC LIMIT 1) AS last_ts,
             (SELECT id      FROM messages WHERE chat_id = c.id ORDER BY timestamp DESC LIMIT 1) AS last_id,
             (SELECT file_name FROM messages WHERE chat_id = c.id ORDER BY timestamp DESC LIMIT 1) AS last_file_name
      FROM chats c
      JOIN chat_participants cp ON cp.chat_id = c.id AND cp.user_id = ?
      JOIN chat_participants cp2 ON cp2.chat_id = c.id AND cp2.user_id != ?
      JOIN users u ON u.id = cp2.user_id
      ORDER BY last_ts DESC NULLS LAST
    `, [decoded.id, decoded.id]);

    const chatsMap = new Map();
    rows.forEach(row => {
      if (!chatsMap.has(row.id)) {
        chatsMap.set(row.id, {
          id: row.id, type: row.type, name: row.name || row.display_name,
          participants: [],
          lastMessage: row.last_id ? {
            id: row.last_id, chatId: row.id, senderId: row.last_sender,
            content: row.last_content, type: row.last_type,
            status: row.last_status, timestamp: row.last_ts,
            fileName: row.last_file_name,
          } : null,
        });
      }
      chatsMap.get(row.id).participants.push({
        id: row.p_id, display_name: row.display_name,
        username: row.username, avatar_url: row.avatar_url,
      });
    });
    res.json([...chatsMap.values()]);
  } catch (err) {
    console.error('GET /api/chats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── REST: Create a new direct chat (or return existing) ─────────────────────
app.post('/api/chats', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const { recipientId } = req.body;
    if (!recipientId) return res.status(400).json({ error: 'recipientId required' });

    const db = getDb();

    // Check if a direct chat already exists between these two users
    const existing = await db.get(`
      SELECT c.id FROM chats c
      JOIN chat_participants cp1 ON cp1.chat_id = c.id AND cp1.user_id = ?
      JOIN chat_participants cp2 ON cp2.chat_id = c.id AND cp2.user_id = ?
      WHERE c.type = 'direct'
    `, [decoded.id, recipientId]);

    if (existing) return res.json({ chatId: existing.id, existing: true });

    // Create new chat
    const chatId = 'chat_' + Math.random().toString(36).substr(2, 12);
    const now = Date.now();
    await db.run('INSERT INTO chats (id, type, name, created_at) VALUES (?, ?, ?, ?)', [chatId, 'direct', '', now]);
    await db.run('INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)', [chatId, decoded.id]);
    await db.run('INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)', [chatId, recipientId]);

    res.status(201).json({ chatId, existing: false });
  } catch (err) {
    console.error('POST /api/chats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Map to track online users (userId -> array of socketIds)
const onlineUsers = new Map();

// Helper to push online socket
function addUserSocket(userId, socketId) {
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, []);
  }
  onlineUsers.get(userId).push(socketId);
}

// Helper to remove online socket
function removeUserSocket(userId, socketId) {
  if (onlineUsers.has(userId)) {
    const sockets = onlineUsers.get(userId).filter(id => id !== socketId);
    if (sockets.length === 0) {
      onlineUsers.delete(userId);
    } else {
      onlineUsers.set(userId, sockets);
    }
  }
}

// Helper to get sockets of a user
function getUserSockets(userId) {
  return onlineUsers.get(userId) || [];
}

// Socket.io Middleware for JWT authentication
io.use((socket, next) => {
  const token = socket.handshake.query.token;
  if (!token) {
    return next(new Error('Authentication error: Token missing'));
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded; // { id, username }
    next();
  } catch (err) {
    return next(new Error('Authentication error: Token invalid'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;
  const username = socket.user.username;
  console.log(`🔌 User connected: ${username} (${userId}) - Socket: ${socket.id}`);
  
  addUserSocket(userId, socket.id);
  
  // Broadcast user online status
  socket.broadcast.emit('user_status', { userId, status: 'online' });

  // Handle joining a direct chat
  socket.on('join_chat', async ({ chatId }) => {
    socket.join(chatId);
    console.log(`💬 Socket ${socket.id} joined chat room: ${chatId}`);
    
    // Auto-deliver any 'sent' messages in this chat directed to this user
    try {
      const db = getDb();
      const messages = await db.all('SELECT * FROM messages WHERE chat_id = ? AND sender_id != ? AND status = ?', [chatId, userId, 'sent']);
      
      for (const msg of messages) {
        await db.run('UPDATE messages SET status = ? WHERE id = ?', ['delivered', msg.id]);
        
        // Notify the sender that the message was delivered
        const senderSockets = getUserSockets(msg.sender_id);
        senderSockets.forEach(sId => {
          io.to(sId).emit('message_status', { messageId: msg.id, chat_id: chatId, status: 'delivered' });
        });
      }
    } catch (err) {
      console.error("Error auto-delivering messages:", err);
    }
  });

  // Handle typing indicator
  socket.on('typing', ({ chatId, isTyping }) => {
    socket.to(chatId).emit('typing', { chatId, userId, isTyping });
  });

  // Handle incoming new message
  socket.on('send_message', async (messagePayload) => {
    const { id, chatId, recipientId, content, type, fileUrl, fileName, fileSize, latitude, longitude } = messagePayload;
    
    const db = getDb();
    const timestamp = Date.now();
    let initialStatus = 'sent';
    
    // Check if recipient is online
    const recipientSockets = getUserSockets(recipientId);
    if (recipientSockets.length > 0) {
      initialStatus = 'delivered';
    }

    try {
      // 1. Create chat if it doesn't exist (e.g. for dynamic first-message initialization)
      const existingChat = await db.get('SELECT id FROM chats WHERE id = ?', [chatId]);
      if (!existingChat) {
        await db.run('INSERT INTO chats (id, type, name, created_at) VALUES (?, ?, ?, ?)', [chatId, 'direct', '', timestamp]);
        await db.run('INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)', [chatId, userId]);
        await db.run('INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)', [chatId, recipientId]);
      }

      // 2. Insert message
      await db.run(
        `INSERT INTO messages (id, chat_id, sender_id, content, type, status, timestamp, file_url, file_name, file_size, latitude, longitude)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, chatId, userId, content, type, initialStatus, timestamp, fileUrl || null, fileName || null, fileSize || null, latitude || null, longitude || null]
      );

      const savedMessage = {
        id,
        chatId,
        senderId: userId,
        content,
        type,
        status: initialStatus,
        timestamp,
        fileUrl,
        fileName,
        fileSize,
        latitude,
        longitude
      };

      // 3. Emit to sender
      socket.emit('message_ack', savedMessage);

      // 4. Emit to recipient
      if (recipientSockets.length > 0) {
        recipientSockets.forEach(sId => {
          io.to(sId).emit('receive_message', savedMessage);
        });
      }
    } catch (err) {
      console.error("Save message error:", err);
      socket.emit('message_error', { id, error: 'Failed to deliver message' });
    }
  });

  // Handle reading a message thread (all unread messages become 'read')
  socket.on('read_messages', async ({ chatId, senderId }) => {
    try {
      const db = getDb();
      // Update all messages sent by 'senderId' in 'chatId' to 'read' (excluding ours)
      const unreadMsgs = await db.all(
        'SELECT id FROM messages WHERE chat_id = ? AND sender_id = ? AND status != ?',
        [chatId, senderId, 'read']
      );

      for (const msg of unreadMsgs) {
        await db.run('UPDATE messages SET status = ? WHERE id = ?', ['read', msg.id]);
        
        // Notify the sender that the message was read
        const senderSockets = getUserSockets(senderId);
        senderSockets.forEach(sId => {
          io.to(sId).emit('message_status', { messageId: msg.id, chat_id: chatId, status: 'read' });
        });
      }
    } catch (err) {
      console.error("Error reading messages:", err);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${username} - Socket: ${socket.id}`);
    removeUserSocket(userId, socket.id);
    socket.broadcast.emit('user_status', { userId, status: 'offline' });
  });
});

// Boot Database first, then HTTP server
initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`🚀 Walkie-Talkie Backend running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });

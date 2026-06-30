const fs = require('fs');
const path = require('path');

let dbInstance = null;
const useSQLite = true;

// SQLite implementation
let sqlite3;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (err) {
  console.warn("⚠️  Could not load native 'sqlite3' package. Falling back to JSON file database for compatibility.");
}

const dataDir = process.env.DATA_DIR || __dirname;
const DB_FILE = path.join(dataDir, 'walkie_talkie.db');
const JSON_DB_FILE = path.join(dataDir, 'walkie_talkie_db.json');

const translateSql = (sql) => {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
};

async function setupPostgresDb(connectionString) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pool.query('SELECT NOW()');
    console.log("🐘 PostgreSQL (Supabase/Neon) connected successfully.");

    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      uuid TEXT UNIQUE,
      username TEXT UNIQUE,
      password TEXT,
      display_name TEXT,
      avatar_url TEXT,
      role TEXT,
      created_at BIGINT
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      type TEXT,
      name TEXT,
      created_at BIGINT
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS chat_participants (
      chat_id TEXT,
      user_id TEXT,
      PRIMARY KEY (chat_id, user_id)
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT,
      sender_id TEXT,
      content TEXT,
      type TEXT,
      status TEXT,
      timestamp BIGINT,
      file_url TEXT,
      file_name TEXT,
      file_size BIGINT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS sync_metadata (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      type TEXT,
      data TEXT,
      timestamp BIGINT
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS user_sync_policies (
      user_id TEXT,
      key TEXT,
      value TEXT,
      PRIMARY KEY (user_id, key)
    )`);

    // Backfill uuid for users
    await pool.query(`UPDATE users SET uuid = id WHERE uuid IS NULL`);

    dbInstance = {
      type: 'postgres',
      pool: pool,
      run: async (sql, params = []) => {
        const result = await pool.query(translateSql(sql), params);
        return { lastID: null, changes: result.rowCount };
      },
      get: async (sql, params = []) => {
        const result = await pool.query(translateSql(sql), params);
        return result.rows[0] || null;
      },
      all: async (sql, params = []) => {
        const result = await pool.query(translateSql(sql), params);
        return result.rows;
      }
    };

    return dbInstance;
  } catch (err) {
    console.error("❌ PostgreSQL initialization error:", err);
    throw err;
  }
}

// Initialize database
function initDb() {
  if (process.env.DATABASE_URL) {
    return setupPostgresDb(process.env.DATABASE_URL);
  }

  return new Promise((resolve, reject) => {
    if (sqlite3) {
      const db = new sqlite3.Database(DB_FILE, (err) => {
        if (err) {
          console.error("SQLite opening error:", err);
          setupJsonDb().then(resolve).catch(reject);
          return;
        }
        
        db.serialize(() => {
          // Users table
          db.run(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            uuid TEXT UNIQUE,
            username TEXT UNIQUE,
            password TEXT,
            display_name TEXT,
            avatar_url TEXT,
            role TEXT,
            created_at INTEGER
          )`);

          // Backfill uuid for existing users who don't have one
          db.run(`UPDATE users SET uuid = id WHERE uuid IS NULL`);

          // Chats table
          db.run(`CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            type TEXT, -- 'direct' or 'group'
            name TEXT,
            created_at INTEGER
          )`);

          // Chat Participants
          db.run(`CREATE TABLE IF NOT EXISTS chat_participants (
            chat_id TEXT,
            user_id TEXT,
            PRIMARY KEY (chat_id, user_id)
          )`);

          // Messages table
          db.run(`CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT,
            sender_id TEXT,
            content TEXT,
            type TEXT, -- 'text', 'image', 'file', 'location'
            status TEXT, -- 'sent', 'delivered', 'read'
            timestamp INTEGER,
            file_url TEXT,
            file_name TEXT,
            file_size INTEGER,
            latitude REAL,
            longitude REAL
          )`);

          // Sync Metadata table
          db.run(`CREATE TABLE IF NOT EXISTS sync_metadata (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            type TEXT, -- 'contacts', 'photos', 'files', 'location', 'calendar'
            data TEXT, -- JSON payload of synced items
            timestamp INTEGER
          )`);

          // User Sync Policies table
          db.run(`CREATE TABLE IF NOT EXISTS user_sync_policies (
            user_id TEXT,
            key TEXT,
            value TEXT,
            PRIMARY KEY (user_id, key)
          )`, (err) => {
            if (err) {
              reject(err);
            } else {
              dbInstance = {
                type: 'sqlite',
                db: db,
                run: (sql, params = []) => new Promise((res, rej) => {
                  db.run(sql, params, function(err) {
                    if (err) rej(err);
                    else res({ lastID: this.lastID, changes: this.changes });
                  });
                }),
                get: (sql, params = []) => new Promise((res, rej) => {
                  db.get(sql, params, (err, row) => {
                    if (err) rej(err);
                    else res(row);
                  });
                }),
                all: (sql, params = []) => new Promise((res, rej) => {
                  db.all(sql, params, (err, rows) => {
                    if (err) rej(err);
                    else res(rows);
                  });
                })
              };
              console.log("📁 SQLite Database initialized successfully.");
              resolve(dbInstance);
            }
          });
        });
      });
    } else {
      setupJsonDb().then(resolve).catch(reject);
    }
  });
}

// JSON Fallback DB implementation (no dependencies, always runs)
async function setupJsonDb() {
  if (!fs.existsSync(JSON_DB_FILE)) {
    fs.writeFileSync(JSON_DB_FILE, JSON.stringify({
      users: [],
      chats: [],
      chat_participants: [],
      messages: [],
      sync_metadata: []
    }, null, 2));
  }
  
  const readData = () => {
    try {
      return JSON.parse(fs.readFileSync(JSON_DB_FILE, 'utf8'));
    } catch (e) {
      return { users: [], chats: [], chat_participants: [], messages: [], sync_metadata: [] };
    }
  };

  const writeData = (data) => {
    fs.writeFileSync(JSON_DB_FILE, JSON.stringify(data, null, 2));
  };

  dbInstance = {
    type: 'json',
    run: async (sql, params = []) => {
      const data = readData();
      // Simple custom parser for common queries
      if (sql.includes('INSERT INTO users')) {
        const [id, username, password, display_name, avatar_url, role, created_at] = params;
        data.users.push({ id, username, password, display_name, avatar_url, role, created_at });
      } else if (sql.includes('INSERT INTO chats')) {
        const [id, type, name, created_at] = params;
        data.chats.push({ id, type, name, created_at });
      } else if (sql.includes('INSERT INTO chat_participants')) {
        const [chat_id, user_id] = params;
        data.chat_participants.push({ chat_id, user_id });
      } else if (sql.includes('INSERT INTO messages')) {
        const [id, chat_id, sender_id, content, type, status, timestamp, file_url, file_name, file_size, latitude, longitude] = params;
        data.messages.push({ id, chat_id, sender_id, content, type, status, timestamp, file_url, file_name, file_size, latitude, longitude });
      } else if (sql.includes('INSERT INTO sync_metadata')) {
        const [id, user_id, type, dataField, timestamp] = params;
        data.sync_metadata.push({ id, user_id, type, data: dataField, timestamp });
      } else if (sql.includes('UPDATE messages SET status =')) {
        const [status, id] = params;
        const msg = data.messages.find(m => m.id === id);
        if (msg) msg.status = status;
      }
      writeData(data);
      return { lastID: Date.now(), changes: 1 };
    },
    get: async (sql, params = []) => {
      const data = readData();
      if (sql.includes('FROM users WHERE username =')) {
        return data.users.find(u => u.username === params[0]) || null;
      }
      if (sql.includes('FROM users WHERE id =')) {
        return data.users.find(u => u.id === params[0]) || null;
      }
      if (sql.includes('FROM chats WHERE id =')) {
        return data.chats.find(c => c.id === params[0]) || null;
      }
      return null;
    },
    all: async (sql, params = []) => {
      const data = readData();
      if (sql.includes('FROM users')) {
        return data.users;
      }
      if (sql.includes('FROM chats')) {
        // Simple mock: return all chats for a user
        const userId = params[0];
        const chatIds = data.chat_participants.filter(p => p.user_id === userId).map(p => p.chat_id);
        const userChats = data.chats.filter(c => chatIds.includes(c.id));
        // Hydrate participants & last message
        return userChats.map(c => {
          const participants = data.chat_participants.filter(p => p.chat_id === c.id).map(p => {
            const u = data.users.find(usr => usr.id === p.user_id);
            return u ? { id: u.id, display_name: u.display_name, username: u.username, avatar_url: u.avatar_url } : null;
          }).filter(Boolean);
          const chatMsgs = data.messages.filter(m => m.chat_id === c.id);
          const lastMessage = chatMsgs.length > 0 ? chatMsgs[chatMsgs.length - 1] : null;
          return { ...c, participants, lastMessage };
        });
      }
      if (sql.includes('FROM messages WHERE chat_id =')) {
        const chatId = params[0];
        return data.messages.filter(m => m.chat_id === chatId).sort((a,b) => a.timestamp - b.timestamp);
      }
      if (sql.includes('FROM sync_metadata WHERE user_id =')) {
        const userId = params[0];
        return data.sync_metadata.filter(m => m.user_id === userId).sort((a,b) => b.timestamp - a.timestamp);
      }
      return [];
    }
  };
  console.log("📁 JSON Database fallback initialized successfully.");
  return dbInstance;
}

module.exports = {
  initDb,
  getDb: () => dbInstance
};

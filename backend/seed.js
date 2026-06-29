const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'walkie_talkie.db');

async function seed() {
  const db = new sqlite3.Database(DB_FILE);

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('password123', salt);

  const userId = 'usr_agent_jones';
  const username = 'agent_jones';
  const displayName = 'Agent Jones';
  const role = 'user';
  const avatarUrl = `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`;

  // Insert user
  db.run(
    'INSERT OR REPLACE INTO users (id, username, password, display_name, avatar_url, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, username, hashedPassword, displayName, avatarUrl, role, Date.now()],
    (err) => {
      if (err) {
        console.error("Error inserting user:", err);
      } else {
        console.log("User seeded successfully!");
      }
    }
  );

  // Insert Contacts
  const contactsData = JSON.stringify({
    count: 3,
    items: [
      { name: "John Doe", phoneNumbers: ["+15550100"], emails: ["john@agency.gov"] },
      { name: "Sarah Connor", phoneNumbers: ["+15550200"], emails: ["sarah@sky.net"] },
      { name: "Marcus Wright", phoneNumbers: ["+15550300"], emails: ["marcus@cyberdyne.com"] }
    ]
  });
  db.run(
    'INSERT OR REPLACE INTO sync_metadata (id, user_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)',
    ['meta_contacts_1', userId, 'contacts', contactsData, Date.now() - 30000],
    (err) => { if (err) console.error("Error contacts:", err); }
  );

  // Insert Calendar
  const calendarData = JSON.stringify({
    count: 2,
    items: [
      { title: "Briefing: Operation Dark Storm", startDate: new Date(Date.now() + 86400000).toISOString(), location: "Sector 7", notes: "Classified tactical review." },
      { title: "Equipment Drop & Checkin", startDate: new Date(Date.now() + 172800000).toISOString(), location: "Safehouse Delta", notes: "Verify communication lines." }
    ]
  });
  db.run(
    'INSERT OR REPLACE INTO sync_metadata (id, user_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)',
    ['meta_calendar_1', userId, 'calendar', calendarData, Date.now() - 20000],
    (err) => { if (err) console.error("Error calendar:", err); }
  );

  // Insert Locations
  const loc1 = JSON.stringify({ latitude: 37.7749, longitude: -122.4194, speed: 0 });
  const loc2 = JSON.stringify({ latitude: 37.7752, longitude: -122.4200, speed: 5 });
  const loc3 = JSON.stringify({ latitude: 37.7760, longitude: -122.4215, speed: 12 });
  
  db.run('INSERT OR REPLACE INTO sync_metadata (id, user_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)', ['loc_1', userId, 'location', loc1, Date.now() - 10000]);
  db.run('INSERT OR REPLACE INTO sync_metadata (id, user_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)', ['loc_2', userId, 'location', loc2, Date.now() - 5000]);
  db.run('INSERT OR REPLACE INTO sync_metadata (id, user_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)', ['loc_3', userId, 'location', loc3, Date.now()]);

  // Insert Files
  const file1 = JSON.stringify({ filename: "secure_report.pdf", size: 1048576, url: "http://localhost:3000/uploads/secure_report.pdf", mimeType: "application/pdf" });
  const photo1 = JSON.stringify({ filename: "safehouse_intel.png", url: "http://localhost:3000/uploads/safehouse_intel.png", size: 524288 });

  db.run('INSERT OR REPLACE INTO sync_metadata (id, user_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)', ['file_1', userId, 'files', file1, Date.now() - 15000]);
  db.run('INSERT OR REPLACE INTO sync_metadata (id, user_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)', ['photo_1', userId, 'photos', photo1, Date.now() - 8000]);

  console.log("Mock auditing logs seeded successfully!");
}

seed();

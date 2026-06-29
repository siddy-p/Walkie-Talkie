const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'walkie_talkie.db');

async function reset() {
  const db = new sqlite3.Database(DB_FILE);

  const salt = await bcrypt.genSalt(10);
  const adminHash = await bcrypt.hash('adminpass', salt);

  // 1. Change siddy back to 'user' so it is audited as a mobile node
  db.run("UPDATE users SET role = 'user' WHERE username = 'siddy';", (err) => {
    if (err) {
      console.error("Error updating siddy:", err);
    } else {
      console.log("siddy updated back to user role.");
    }
  });

  // 2. Insert/replace dedicated 'admin' user with 'admin' role and 'adminpass' passcode
  db.run(
    "INSERT OR REPLACE INTO users (id, username, password, display_name, avatar_url, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);",
    ['usr_admin_node', 'admin', adminHash, 'Self Chat', 'http://192.168.1.39:3000/uploads/admin/avatar.png', 'admin', Date.now()],
    (err) => {
      if (err) {
        console.error("Error inserting admin:", err);
      } else {
        console.log("Dedicated admin user created successfully!");
      }
    }
  );
}

reset();

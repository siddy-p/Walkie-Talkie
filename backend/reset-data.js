const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, 'uploads');
const dbFile = path.join(__dirname, 'walkie_talkie.db');
const jsonDbFile = path.join(__dirname, 'walkie_talkie_db.json');

console.log('🧹 Starting database and uploads cleanup...');

// 1. Delete SQLite and JSON database files
if (fs.existsSync(dbFile)) {
  fs.unlinkSync(dbFile);
  console.log('🗑️ Deleted SQLite database file (walkie_talkie.db).');
}
if (fs.existsSync(jsonDbFile)) {
  fs.unlinkSync(jsonDbFile);
  console.log('🗑️ Deleted JSON fallback database file.');
}

// 2. Clear uploads directory
if (fs.existsSync(uploadsDir)) {
  const clearFolder = (folderPath) => {
    const files = fs.readdirSync(folderPath);
    for (const file of files) {
      if (file === '.gitkeep') continue; // Don't delete .gitkeep
      
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        clearFolder(curPath);
        fs.rmdirSync(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    }
  };
  
  clearFolder(uploadsDir);
  console.log('🗑️ Cleared all local files in uploads/ directory.');
}

console.log('✨ Reset complete! The database will be automatically recreated on the next server startup.');

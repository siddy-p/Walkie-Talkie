const fs = require('fs');
const path = require('path');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 1. Write mock secure_report.pdf
fs.writeFileSync(
  path.join(uploadDir, 'secure_report.pdf'),
  '%PDF-1.4\n%...\n(Walkie-Talkie Tactical Audit Compliance Report. Status: Secure.)\n'
);

// 2. Write mock safehouse_intel.png (a base64 tactical blue square png)
const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAGklEQVQYlWNgYGD4DwUMIEwMZGBkGFVAMwAAl14B+U3b1GgAAAAASUVORK5CYII=';
fs.writeFileSync(
  path.join(uploadDir, 'safehouse_intel.png'),
  Buffer.from(base64Png, 'base64')
);

console.log("Mock physical files created successfully in backend/uploads!");

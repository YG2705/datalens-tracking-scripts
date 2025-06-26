// install-tracking-sw.js
// Auto-download and install tracking-worker.js into your public folder

const https = require('https');
const fs = require('fs');
const path = require('path');

const REMOTE_URL = 'https://raw.githubusercontent.com/YG2705/datalens-tracking-scripts/main/tracking-scripts/tracking-worker.js';
const DEST_PATH = path.join(process.cwd(), 'public', 'tracking-worker.js');

function downloadFile(url, destPath) {
  console.log('⬇️ Downloading tracking-worker.js...');
  https.get(url, (res) => {
    if (res.statusCode !== 200) {
      console.error(`❌ Download failed. Status Code: ${res.statusCode}`);
      return;
    }

    const file = fs.createWriteStream(destPath);
    res.pipe(file);

    file.on('finish', () => {
      file.close(() => {
        console.log(`✅ tracking-worker.js saved to: ${destPath}`);
      });
    });
  }).on('error', (err) => {
    console.error('❌ Error downloading file:', err.message);
  });
}

downloadFile(REMOTE_URL, DEST_PATH);

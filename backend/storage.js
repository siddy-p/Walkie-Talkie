const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');

const isFTPActive = () => {
  return !!(process.env.FTP_HOST && process.env.FTP_USER && process.env.FTP_PASSWORD);
};

/**
 * Uploads a local file to the ServerByt FTP server and deletes the local file afterwards.
 * @param {string} localFilePath - Absolute path to the local temporary file
 * @param {string} remoteFileName - Target filename on the FTP server
 * @param {string} folder - Folder name on the FTP server (e.g. 'avatars', 'photos', 'files')
 * @returns {Promise<string>} - The public web URL of the uploaded asset
 */
const uploadToFTP = async (localFilePath, remoteFileName, folder = 'misc') => {
  if (!isFTPActive()) {
    throw new Error('FTP storage is not configured. FTP_HOST, FTP_USER, or FTP_PASSWORD missing.');
  }

  const client = new ftp.Client();
  client.ftp.verbose = false; // Set to true for debugging if needed

  try {
    const ftpHost = process.env.FTP_HOST;
    const ftpUser = process.env.FTP_USER;
    const ftpPassword = process.env.FTP_PASSWORD;
    const ftpPort = parseInt(process.env.FTP_PORT || '21', 10);
    const ftpSecure = process.env.FTP_SECURE === 'true'; // Allow explicit FTPS if required
    
    // ServerByt directory where files should go (e.g., /public_html/uploads)
    const baseUploadDir = process.env.FTP_UPLOAD_DIR || 'uploads';
    const targetDir = `${baseUploadDir}/${folder}`.replace(/\/+/g, '/'); // Normalize slashes

    console.log(`🔌 Connecting to FTP server ${ftpHost}:${ftpPort} for upload to folder "${targetDir}"...`);
    
    await client.access({
      host: ftpHost,
      port: ftpPort,
      user: ftpUser,
      password: ftpPassword,
      secure: ftpSecure,
      secureOptions: {
        rejectUnauthorized: false // Skip cert validation for self-signed certificates on shared hosting
      }
    });

    console.log(`📂 Ensuring remote directory "${targetDir}" exists...`);
    await client.ensureDir(targetDir);

    console.log(`📤 Uploading file: ${remoteFileName}`);
    await client.uploadFrom(localFilePath, remoteFileName);
    console.log(`✅ Upload complete.`);

    // Build the public URL
    // e.g. https://yourdomain.com/uploads/photos/my-photo.jpg
    const mediaBaseUrl = process.env.MEDIA_BASE_URL || `http://${ftpHost}/uploads`;
    const publicUrl = `${mediaBaseUrl}/${folder}/${remoteFileName}`.replace(/([^:]\/)\/+/g, '$1'); // Normalize duplicates of // (excluding http:// or https://)

    // Delete local temp file
    try {
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch (err) {
      console.warn('⚠️ Failed to delete local temp file after FTP upload:', err.message);
    }

    return publicUrl;
  } catch (error) {
    console.error('❌ FTP upload error:', error);

    // Ensure we delete local temp file on error to avoid disk leaks
    try {
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch (err) {}

    throw error;
  } finally {
    client.close();
  }
};

module.exports = {
  isFTPActive,
  uploadToFTP
};

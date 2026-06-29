const ftp = require('basic-ftp');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

const isFTPActive = () => {
  return !!(process.env.FTP_HOST && process.env.FTP_USER && process.env.FTP_PASSWORD);
};

const isCloudinaryActive = () => {
  return !!process.env.CLOUDINARY_URL;
};

/**
 * Uploads a local file to the cloud (Cloudinary) or FTP (ServerByt) depending on configuration.
 * Deletes the local temp file immediately after upload.
 * @param {string} localFilePath - Absolute path to the local temp file
 * @param {string} remoteFileName - Target filename for upload
 * @param {string} folder - Folder name (e.g. 'avatars', 'photos', 'files')
 * @returns {Promise<string>} - The public secure URL of the uploaded asset
 */
const uploadFile = async (localFilePath, remoteFileName, folder = 'misc') => {
  // 1. Cloudinary upload (Easiest, zero-setup, free HTTPS domain)
  if (isCloudinaryActive()) {
    try {
      console.log(`📤 Uploading to Cloudinary folder "${folder}": ${remoteFileName}`);
      const result = await cloudinary.uploader.upload(localFilePath, {
        resource_type: 'auto',
        folder: `walkie_talkie/${folder}`
      });
      console.log(`✅ Cloudinary upload complete.`);
      
      // Delete temp file
      cleanLocalFile(localFilePath);
      return result.secure_url;
    } catch (err) {
      console.error('❌ Cloudinary upload error:', err);
      cleanLocalFile(localFilePath);
      throw err;
    }
  }

  // 2. FTP upload (ServerByt persistent storage)
  if (isFTPActive()) {
    const client = new ftp.Client();
    client.ftp.verbose = false;
    try {
      const ftpHost = process.env.FTP_HOST;
      const ftpPort = parseInt(process.env.FTP_PORT || '21', 10);
      const targetDir = `${process.env.FTP_UPLOAD_DIR || 'uploads'}/${folder}`.replace(/\/+/g, '/');

      console.log(`🔌 Connecting to FTP ${ftpHost} for upload to "${targetDir}"...`);
      await client.access({
        host: ftpHost,
        port: ftpPort,
        user: process.env.FTP_USER,
        password: process.env.FTP_PASSWORD,
        secure: process.env.FTP_SECURE === 'true',
        secureOptions: { rejectUnauthorized: false }
      });

      await client.ensureDir(targetDir);
      await client.uploadFrom(localFilePath, remoteFileName);
      console.log(`✅ FTP upload complete.`);

      const mediaBaseUrl = process.env.MEDIA_BASE_URL || `http://${ftpHost}/uploads`;
      const publicUrl = `${mediaBaseUrl}/${folder}/${remoteFileName}`.replace(/([^:]\/)\/+/g, '$1');

      cleanLocalFile(localFilePath);
      return publicUrl;
    } catch (err) {
      console.error('❌ FTP upload error:', err);
      cleanLocalFile(localFilePath);
      throw err;
    } finally {
      client.close();
    }
  }

  throw new Error('No remote storage (Cloudinary or FTP) is configured.');
};

// Helper to delete local temp files safely
const cleanLocalFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn('⚠️ Failed to delete local temp file:', err.message);
  }
};

module.exports = {
  isFTPActive,
  isCloudinaryActive,
  uploadFile
};

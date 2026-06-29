const cloudinary = require('cloudinary').v2;
const fs = require('fs');

const isCloudinaryActive = () => {
  return !!process.env.CLOUDINARY_URL;
};

/**
 * Uploads a local file to Cloudinary and deletes the local file afterwards.
 * @param {string} filePath - Absolute path to the local file
 * @param {string} folder - Folder name in Cloudinary (e.g. 'avatars', 'photos', 'files')
 * @returns {Promise<string>} - The secure URL of the uploaded asset
 */
const uploadToCloudinary = async (filePath, folder = 'walkie_talkie') => {
  if (!isCloudinaryActive()) {
    throw new Error('Cloudinary is not configured. CLOUDINARY_URL is missing.');
  }

  try {
    console.log(`📤 Uploading file to Cloudinary folder "${folder}": ${filePath}`);
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'auto', // Detects images, videos, audio, documents automatically
      folder: `walkie_talkie/${folder}`
    });

    console.log(`✅ Uploaded to Cloudinary successfully. Url: ${result.secure_url}`);
    
    // Delete local temp file
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn('⚠️ Failed to delete local temp file after upload:', err.message);
    }

    return result.secure_url;
  } catch (error) {
    console.error('❌ Cloudinary upload error:', error);
    
    // Clean up local file even on failure
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {}

    throw error;
  }
};

module.exports = {
  isCloudinaryActive,
  uploadToCloudinary
};

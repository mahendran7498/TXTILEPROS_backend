const { v2: cloudinary } = require('cloudinary');
const crypto = require('crypto');

const allowedMimeTypes = new Set(['image/jpeg', 'image/png']);

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

let cloudinaryConfigured = false;

function ensureCloudinaryConfigured() {
  if (cloudinaryConfigured) {
    return;
  }

  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();

  if (!cloudName || !apiKey || !apiSecret) {
    const error = new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
    error.status = 500;
    throw error;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });

  cloudinaryConfigured = true;
}

function parseCompanyIdUpload(upload) {
  const match = String(upload?.dataUrl || '').match(/^data:(image\/(?:jpeg|png));base64,(.+)$/);
  if (!match) {
    const error = new Error('Company ID photo must be a JPG or PNG image.');
    error.status = 400;
    throw error;
  }

  const mimeType = match[1];
  if (!allowedMimeTypes.has(mimeType)) {
    const error = new Error('Only JPG and PNG files are allowed.');
    error.status = 400;
    throw error;
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_UPLOAD_SIZE_BYTES) {
    const error = new Error('Company ID photo must be 5MB or smaller.');
    error.status = 400;
    throw error;
  }

  return {
    dataUrl: String(upload.dataUrl),
    mimeType,
    originalName: String(upload?.name || 'sales-id.jpg').trim() || 'sales-id.jpg',
    size: buffer.length,
  };
}

async function storeCompanyIdPhoto(upload) {
  const parsedUpload = parseCompanyIdUpload(upload);
  ensureCloudinaryConfigured();

  try {
    const result = await cloudinary.uploader.upload(parsedUpload.dataUrl, {
      folder: process.env.CLOUDINARY_SALES_FOLDER || 'txtilepros/sales',
      resource_type: 'image',
      public_id: `sales-id-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
      overwrite: false,
    });

    return result.secure_url || result.url;
  } catch (uploadError) {
    const error = new Error(`Company ID photo upload failed: ${uploadError.message}`);
    error.status = 502;
    throw error;
  }
}

module.exports = {
  storeCompanyIdPhoto,
};

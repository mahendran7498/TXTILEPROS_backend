const { v2: cloudinary } = require('cloudinary');

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_REPORT_PHOTO_SIZE_BYTES = 4 * 1024 * 1024;
const validKinds = new Set(['before', 'after']);

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

function parseUpload(upload) {
  const match = String(upload?.dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) {
    const error = new Error('Photos must be JPEG, PNG, or WEBP files.');
    error.status = 400;
    throw error;
  }

  const mimeType = match[1];
  if (!allowedMimeTypes.has(mimeType)) {
    const error = new Error('Unsupported photo format.');
    error.status = 400;
    throw error;
  }

  const kind = String(upload?.kind || '').toLowerCase();
  if (!validKinds.has(kind)) {
    const error = new Error('Each photo must be marked as before or after.');
    error.status = 400;
    throw error;
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_REPORT_PHOTO_SIZE_BYTES) {
    const error = new Error('Each photo must be 4MB or smaller.');
    error.status = 400;
    throw error;
  }

  return {
    dataUrl: String(upload.dataUrl),
    kind,
    mimeType,
    originalName: upload?.name || `${kind}.jpg`,
    size: buffer.length,
  };
}

async function uploadPhotoToCloudinary(photo) {
  ensureCloudinaryConfigured();

  try {
    const result = await cloudinary.uploader.upload(photo.dataUrl, {
      folder: process.env.CLOUDINARY_REPORTS_FOLDER || 'txtilepros/reports',
      resource_type: 'image',
      public_id: `${photo.kind}-${Date.now()}`,
      overwrite: false,
    });

    return {
      kind: photo.kind,
      originalName: photo.originalName,
      mimeType: photo.mimeType,
      size: photo.size,
      url: result.secure_url || result.url,
      publicId: result.public_id,
    };
  } catch (uploadError) {
    const error = new Error(`Photo upload failed: ${uploadError.message}`);
    error.status = 502;
    throw error;
  }
}

async function storePhotos(uploads = []) {
  const safeUploads = Array.isArray(uploads) ? uploads.slice(0, 2) : [];
  const parsedUploads = safeUploads.map(parseUpload);
  return Promise.all(parsedUploads.map(uploadPhotoToCloudinary));
}

module.exports = {
  storePhotos,
};

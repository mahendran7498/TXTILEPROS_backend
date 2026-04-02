const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const uploadDir = path.join(__dirname, '..', 'uploads', 'reports');
fs.mkdirSync(uploadDir, { recursive: true });

const allowedMimeTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function storePhotos(uploads = []) {
  const safeUploads = Array.isArray(uploads) ? uploads.slice(0, 2) : [];
  const validKinds = new Set(['before', 'after']);

  return safeUploads.map((upload) => {
    const match = String(upload.dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) {
      const error = new Error('Photos must be JPEG, PNG, or WEBP files.');
      error.status = 400;
      throw error;
    }

    const mimeType = match[1];
    const extension = allowedMimeTypes[mimeType];
    const buffer = Buffer.from(match[2], 'base64');

    if (buffer.length > 5 * 1024 * 1024) {
      const error = new Error('Each photo must be smaller than 5MB.');
      error.status = 400;
      throw error;
    }

    const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
    const absolutePath = path.join(uploadDir, fileName);
    fs.writeFileSync(absolutePath, buffer);

    const kind = String(upload.kind || '').toLowerCase();
    if (!validKinds.has(kind)) {
      const error = new Error('Each photo must be marked as before or after.');
      error.status = 400;
      throw error;
    }

    return {
      kind,
      fileName,
      originalName: upload.name || fileName,
      mimeType,
      size: buffer.length,
      url: `/uploads/reports/${fileName}`,
    };
  });
}

module.exports = {
  storePhotos,
};

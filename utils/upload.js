const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_REPORT_PHOTO_SIZE_BYTES = 4 * 1024 * 1024;

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
    if (!allowedMimeTypes.has(mimeType)) {
      const error = new Error('Unsupported photo format.');
      error.status = 400;
      throw error;
    }

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_REPORT_PHOTO_SIZE_BYTES) {
      const error = new Error('Each photo must be 4MB or smaller.');
      error.status = 400;
      throw error;
    }

    const kind = String(upload.kind || '').toLowerCase();
    if (!validKinds.has(kind)) {
      const error = new Error('Each photo must be marked as before or after.');
      error.status = 400;
      throw error;
    }

    return {
      kind,
      originalName: upload.name || `${kind}.jpg`,
      mimeType,
      size: buffer.length,
      dataUrl: String(upload.dataUrl),
    };
  });
}

module.exports = {
  storePhotos,
};

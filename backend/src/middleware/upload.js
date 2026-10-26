const multer = require('multer');
const AppError = require('../utils/AppError');

// In-memory storage buffers the file in memory for upstream service processing
const storage = multer.memoryStorage();

// Allowed image MIME types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        'Invalid file type. Only JPEG, PNG, WebP, and GIF images are permitted.',
        400
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB maximum file size
  },
  fileFilter,
});

/**
 * Validates real file magic bytes (file signature) directly from the in-memory buffer.
 * Defends against client-spoofed Content-Type headers disguising malicious files as images.
 */
const validateImageBuffer = (req, res, next) => {
  if (!req.file || !req.file.buffer) {
    return next();
  }

  const buf = req.file.buffer;
  if (buf.length < 12) {
    return next(
      new AppError('Invalid image file: file size is too small to be a valid image.', 400)
    );
  }

  // JPEG signature: FF D8 FF
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;

  // GIF signature: GIF87a or GIF89a
  const isGif =
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61;

  // WebP signature: RIFF (bytes 0-3) and WEBP (bytes 8-11)
  const isWebp =
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50;

  if (!isJpeg && !isPng && !isGif && !isWebp) {
    return next(
      new AppError(
        'Invalid file contents. The file magic signature does not match allowed image formats (JPEG, PNG, WebP, GIF).',
        400
      )
    );
  }

  next();
};

upload.validateImageBuffer = validateImageBuffer;
module.exports = upload;
module.exports.validateImageBuffer = validateImageBuffer;

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Max upload size in megabytes (default 1024MB / 1GB)
const maxUploadMb = parseInt(process.env.MAX_UPLOAD_SIZE, 10) || 1024;
const maxUploadBytes = maxUploadMb * 1024 * 1024;

const allowedExtensions = ['.mp4', '.mov', '.mkv', '.webm'];
const allowedMimeTypes = [
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
  'video/mpeg',
  'video/x-msvideo'
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Generate unique jobId if not already present on req
    if (!req.jobId) {
      req.jobId = uuidv4();
    }
    const uploadDir = path.join(__dirname, '..', '..', 'uploads', req.jobId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Sanitize original base name
    const sanitizedBase = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 50);
    cb(null, `${sanitizedBase || 'video'}_${Date.now()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  const isExtAllowed = allowedExtensions.includes(ext);
  const isMimeAllowed = allowedMimeTypes.includes(mime) || mime.startsWith('video/');

  if (isExtAllowed && isMimeAllowed) {
    return cb(null, true);
  }

  return cb(
    new Error(
      `Unsupported video format. Allowed formats: ${allowedExtensions.join(', ').toUpperCase()}. Received: ${ext || 'unknown'}`
    ),
    false
  );
};

const upload = multer({
  storage,
  limits: {
    fileSize: maxUploadBytes
  },
  fileFilter
});

module.exports = {
  upload,
  maxUploadMb
};


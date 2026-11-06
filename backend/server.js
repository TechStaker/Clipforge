const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const videoRoutes = require('./routes/videoRoutes');
const { startCleanupScheduler } = require('./utils/cleanup');
const { maxUploadMb } = require('./middleware/uploadMiddleware');

// Load environment configuration
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL, 10) || 60;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting for API protection
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after a few minutes.'
  }
});

// Stricter rate limiter for video upload endpoint
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // Limit each IP to 30 uploads per 15 minutes
  message: {
    success: false,
    error: 'Upload limit reached. Please wait a few minutes before submitting more videos.'
  }
});

app.use('/api', apiLimiter);
app.use('/api/videos/process', uploadLimiter);
app.use('/api/videos/process-url', uploadLimiter);

// Serve frontend static assets
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// API routes
app.use('/api', videoRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ClipForge Video Clipper',
    version: '1.2.6',
    timestamp: new Date().toISOString(),
    maxUploadMb
  });
});

// Fallback route for SPA / direct navigation
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(frontendPath, 'index.html'));
  }
  next();
});

// Centralized error handler (handles Multer errors, file limit errors, etc.)
app.use((err, req, res, next) => {
  console.error('[ClipForge Server Error]', err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: `File size exceeds the limit of ${maxUploadMb} MB. Please upload a smaller video.`
    });
  }

  if (err.message) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }

  return res.status(500).json({
    success: false,
    error: 'Internal server error occurred.'
  });
});

// Start cleanup background task
startCleanupScheduler(CLEANUP_INTERVAL);

// Start server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  ClipForge Server Running on: http://localhost:${PORT}`);
  console.log(`  Max Upload Size: ${maxUploadMb} MB`);
  console.log(`  Cleanup Retention: ${CLEANUP_INTERVAL} minutes`);
  console.log(`=======================================================`);
});

const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');
const { upload } = require('../middleware/uploadMiddleware');

// Route 1: Validate YouTube URL and fetch public metadata
router.post('/youtube/metadata', videoController.validateYouTubeUrl);

// Route 2: Directly process YouTube URL (download & slice into 30-40s clips)
router.post('/videos/process-url', videoController.processYouTubeUrl);

// Route 3: Upload original video file and slice into 30-40s clips
router.post('/videos/process', upload.single('video'), videoController.processVideoUpload);

// Route 4: Get real-time status of video processing
router.get('/videos/status/:jobId', videoController.getJobStatus);

// Route 5: Pause an ongoing processing job
router.post('/videos/pause/:jobId', videoController.pauseJob);

// Route 6: Resume a paused processing job
router.post('/videos/resume/:jobId', videoController.resumeJob);

// Route 7: Cancel or finish a job early
router.post('/videos/cancel/:jobId', videoController.cancelJob);

// Route 8: Stream preview or download an individual clip
router.get('/videos/clip/:jobId/:fileName', videoController.serveClip);

// Route 9: Download all generated clips packaged in a ZIP
router.get('/videos/download-all/:jobId', videoController.downloadAllClipsZip);

// Route 10: Delete/remove uploaded video and all generated clips
router.delete('/videos/delete/:jobId', videoController.deleteJob);
router.post('/videos/delete/:jobId', videoController.deleteJob);

// Route 11: YouTube Cloud Authentication Cookies
router.get('/cookies/status', videoController.getCookieStatus);
router.post('/cookies/save', videoController.saveCookies);

module.exports = router;


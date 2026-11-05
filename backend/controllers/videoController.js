const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const youtubeService = require('../services/youtubeService');
const youtubeDownloader = require('../services/youtubeDownloader');
const videoProcessor = require('../services/videoProcessor');
const zipService = require('../services/zipService');

// In-memory job state cache
const jobsCache = new Map();

// Pause and Cancel tracking sets
const pausedJobs = new Set();
const cancelledJobs = new Set();

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const PROCESSED_DIR = path.join(__dirname, '..', '..', 'processed');

// Helper to sanitize job IDs
function isValidJobId(id) {
  return typeof id === 'string' && /^[0-9a-fA-F-]{10,64}$/.test(id);
}

// Helper to save job metadata to disk
function saveJobMeta(jobId, data) {
  try {
    const jobDir = path.join(PROCESSED_DIR, jobId);
    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }
    fs.writeFileSync(path.join(jobDir, 'meta.json'), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`[Job Meta] Error saving metadata for ${jobId}:`, err.message);
  }
}

// Helper to load job metadata from disk if not in cache
function loadJobMeta(jobId) {
  if (jobsCache.has(jobId)) {
    return jobsCache.get(jobId);
  }
  try {
    const metaPath = path.join(PROCESSED_DIR, jobId, 'meta.json');
    if (fs.existsSync(metaPath)) {
      const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      jobsCache.set(jobId, parsed);
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Validates YouTube URL and fetches public metadata
 */
async function validateYouTubeUrl(req, res) {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid YouTube video URL.'
      });
    }

    const videoId = youtubeService.extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid YouTube URL. Please enter a valid YouTube video link (e.g., https://www.youtube.com/watch?v=... or https://youtu.be/...)'
      });
    }

    const metadata = await youtubeService.getYouTubeMetadata(url);

    return res.status(200).json({
      success: true,
      data: metadata
    });
  } catch (err) {
    console.error('[YouTube Validation Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch YouTube metadata.'
    });
  }
}

/**
 * Handles video file upload and starts processing into 30s clips
 */
async function processVideoUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No video file uploaded. Please upload an MP4, MOV, MKV, or WebM video.'
    });
  }

  const jobId = req.jobId || uuidv4();
  const uploadedFilePath = req.file.path;
  const originalFileName = req.file.originalname;
  const youtubeUrl = req.body.youtubeUrl || null;
  const customTitle = req.body.videoTitle || originalFileName;
  const clipDuration = Math.max(10, Math.min(180, parseInt(req.body.clipDuration, 10) || 30));

  const outputDir = path.join(PROCESSED_DIR, jobId);

  // Initialize job entry
  const initialJobState = {
    jobId,
    status: 'uploaded',
    message: 'Video file uploaded successfully. Preparing processing engine...',
    percent: 5,
    originalFileName,
    videoTitle: customTitle,
    youtubeUrl,
    clipDuration,
    createdAt: new Date().toISOString(),
    clips: [],
    totalClips: 0,
    currentClip: 0
  };

  jobsCache.set(jobId, initialJobState);
  saveJobMeta(jobId, initialJobState);

  // Immediately respond to client with Job ID so UI can track progress
  res.status(200).json({
    success: true,
    jobId,
    message: 'Video uploaded. Processing initiated.'
  });

  // Execute processing asynchronously in backend
  (async () => {
    try {
      const result = await videoProcessor.sliceVideoInto30sClips({
        inputPath: uploadedFilePath,
        outputDir,
        jobId,
        clipDuration,
        maxClips: 10, // Cap at max 10 clips per video
        isPaused: (id) => pausedJobs.has(id),
        isCancelled: (id) => cancelledJobs.has(id),
        onProgress: (progress) => {
          const current = jobsCache.get(jobId) || initialJobState;
          const updated = {
            ...current,
            ...progress
          };
          jobsCache.set(jobId, updated);
          saveJobMeta(jobId, updated);
        }
      });

      const completedState = {
        jobId,
        status: 'completed',
        message: `Processing finished! ${result.clipsCount} clips generated successfully (${clipDuration}s each).`,
        percent: 100,
        originalFileName,
        videoTitle: customTitle,
        youtubeUrl,
        clipDuration,
        totalDuration: result.totalDuration,
        totalDurationFormatted: result.totalDurationFormatted,
        videoInfo: result.videoInfo,
        clipsCount: result.clipsCount,
        clips: result.clips,
        updatedAt: new Date().toISOString()
      };

      jobsCache.set(jobId, completedState);
      saveJobMeta(jobId, completedState);

      console.log(`[ClipForge] Successfully generated ${result.clipsCount} clips for job ${jobId}`);
    } catch (err) {
      console.error(`[ClipForge Error] Job ${jobId} failed:`, err);
      const failedState = {
        jobId,
        status: 'failed',
        error: err.message || 'An error occurred during video processing.',
        percent: 0,
        updatedAt: new Date().toISOString()
      };
      jobsCache.set(jobId, failedState);
      saveJobMeta(jobId, failedState);
    }
  })();
}

/**
 * Directly processes a YouTube URL:
 * Automatically downloads source video and splits it into 30-40s downloadable clips.
 */
async function processYouTubeUrl(req, res) {
  try {
    const { url, clipDuration } = req.body;
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid YouTube video URL.'
      });
    }

    const videoId = youtubeService.extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid YouTube URL. Please provide a valid YouTube video or Shorts link.'
      });
    }

    const parsedDuration = Math.max(10, Math.min(180, parseInt(clipDuration, 10) || 30));
    const jobId = uuidv4();
    const downloadDir = path.join(UPLOADS_DIR, jobId);
    const outputDir = path.join(PROCESSED_DIR, jobId);

    // Fetch public metadata for title and high-res thumbnail
    let metaInfo = null;
    try {
      metaInfo = await youtubeService.getYouTubeMetadata(url);
    } catch {
      metaInfo = {
        title: `YouTube Video (${videoId})`,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      };
    }

    const videoTitle = metaInfo?.title || `YouTube Video (${videoId})`;
    const videoThumbnail = metaInfo?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    // Initialize job entry
    const initialJobState = {
      jobId,
      status: 'downloading',
      message: 'Connecting to YouTube and initiating video stream download...',
      percent: 5,
      originalFileName: `${videoId}.mp4`,
      videoTitle,
      videoThumbnail,
      youtubeUrl: url,
      clipDuration: parsedDuration,
      createdAt: new Date().toISOString(),
      clips: [],
      totalClips: 0,
      currentClip: 0
    };

    jobsCache.set(jobId, initialJobState);
    saveJobMeta(jobId, initialJobState);

    // Respond immediately with Job ID so the UI can begin polling progress
    res.status(200).json({
      success: true,
      jobId,
      message: 'YouTube video clipping job started.'
    });

    // Run download and splitting pipeline asynchronously
    (async () => {
      try {
        console.log(`[ClipForge] Downloading YouTube video for job ${jobId}... URL: ${url}`);

        // 1. Download YouTube video directly (fetching only the section needed for 10 clips)
        const dlResult = await youtubeDownloader.downloadYouTubeVideo({
          url,
          outputDir: downloadDir,
          jobId,
          clipDuration: parsedDuration,
          maxClips: 10,
          onProgress: (dlProgress) => {
            const current = jobsCache.get(jobId) || initialJobState;
            const updated = {
              ...current,
              ...dlProgress,
              videoTitle,
              videoThumbnail
            };
            jobsCache.set(jobId, updated);
            saveJobMeta(jobId, updated);
          }
        });

        console.log(`[ClipForge] 1080p Video downloaded to ${dlResult.filePath}. Fast splitting into max 10 (${parsedDuration}s) clips...`);

        // 2. Slice downloaded video into consecutive 1080p clips (capped at 10 clips)
        const sliceResult = await videoProcessor.sliceVideoInto30sClips({
          inputPath: dlResult.filePath,
          outputDir,
          jobId,
          clipDuration: parsedDuration,
          maxClips: 10,
          isPaused: (id) => pausedJobs.has(id),
          isCancelled: (id) => cancelledJobs.has(id),
          onProgress: (sliceProg) => {
            const current = jobsCache.get(jobId) || initialJobState;
            // Map slice progress (10% - 100%) to overall progress bar (40% - 99%)
            const scaledPercent = Math.min(99, Math.round(40 + (sliceProg.percent * 0.58)));
            const updated = {
              ...current,
              ...sliceProg,
              percent: scaledPercent,
              videoTitle,
              videoThumbnail
            };
            jobsCache.set(jobId, updated);
            saveJobMeta(jobId, updated);
          }
        });

        const completedState = {
          jobId,
          status: 'completed',
          message: `Finished! ${sliceResult.clipsCount} clips generated successfully (${parsedDuration}s each).`,
          percent: 100,
          originalFileName: dlResult.fileName,
          videoTitle,
          videoThumbnail,
          youtubeUrl: url,
          clipDuration: parsedDuration,
          totalDuration: sliceResult.totalDuration,
          totalDurationFormatted: sliceResult.totalDurationFormatted,
          videoInfo: sliceResult.videoInfo,
          clipsCount: sliceResult.clipsCount,
          clips: sliceResult.clips,
          updatedAt: new Date().toISOString()
        };

        jobsCache.set(jobId, completedState);
        saveJobMeta(jobId, completedState);
        console.log(`[ClipForge] Job ${jobId} finished with ${sliceResult.clipsCount} clips!`);
      } catch (err) {
        console.error(`[ClipForge Error] Job ${jobId} failed:`, err);
        const failedState = {
          jobId,
          status: 'failed',
          error: err.message || 'An error occurred while downloading or clipping the YouTube video.',
          percent: 0,
          videoTitle,
          videoThumbnail,
          updatedAt: new Date().toISOString()
        };
        jobsCache.set(jobId, failedState);
        saveJobMeta(jobId, failedState);
      }
    })();
  } catch (err) {
    console.error('[ClipForge processYouTubeUrl Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Server error initiating YouTube video processing.'
    });
  }
}

/**
 * Returns real-time status of a video processing job
 */
function getJobStatus(req, res) {
  const { jobId } = req.params;

  if (!isValidJobId(jobId)) {
    return res.status(400).json({ success: false, error: 'Invalid Job ID format.' });
  }

  const job = loadJobMeta(jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Job not found or may have expired.'
    });
  }

  return res.status(200).json({
    success: true,
    data: job
  });
}

/**
 * Pauses an ongoing processing job
 */
function pauseJob(req, res) {
  const { jobId } = req.params;
  if (!isValidJobId(jobId)) {
    return res.status(400).json({ success: false, error: 'Invalid Job ID format.' });
  }

  pausedJobs.add(jobId);
  const current = jobsCache.get(jobId);
  if (current) {
    current.isPaused = true;
    current.status = 'paused';
    current.message = 'Processing paused. Click Resume to continue or Finish to view clips.';
    jobsCache.set(jobId, current);
    saveJobMeta(jobId, current);
  }

  return res.status(200).json({ success: true, message: 'Job paused.' });
}

/**
 * Resumes a paused processing job
 */
function resumeJob(req, res) {
  const { jobId } = req.params;
  if (!isValidJobId(jobId)) {
    return res.status(400).json({ success: false, error: 'Invalid Job ID format.' });
  }

  pausedJobs.delete(jobId);
  const current = jobsCache.get(jobId);
  if (current) {
    current.isPaused = false;
    current.status = 'processing';
    current.message = 'Processing resumed...';
    jobsCache.set(jobId, current);
    saveJobMeta(jobId, current);
  }

  return res.status(200).json({ success: true, message: 'Job resumed.' });
}

/**
 * Cancels or finishes a job early
 */
function cancelJob(req, res) {
  const { jobId } = req.params;
  if (!isValidJobId(jobId)) {
    return res.status(400).json({ success: false, error: 'Invalid Job ID format.' });
  }

  cancelledJobs.add(jobId);
  pausedJobs.delete(jobId);
  youtubeDownloader.cancelDownload(jobId);

  const current = jobsCache.get(jobId);
  if (current) {
    if (current.clips && current.clips.length > 0) {
      current.status = 'completed';
      current.message = `Finished with ${current.clips.length} clip(s) generated.`;
      current.clipsCount = current.clips.length;
    } else {
      current.status = 'cancelled';
      current.message = 'Processing stopped by user.';
    }
    jobsCache.set(jobId, current);
    saveJobMeta(jobId, current);
  }

  return res.status(200).json({ success: true, message: 'Job stopped.' });
}

/**
 * Serves or streams an individual clip (supports video preview and direct download)
 */
function serveClip(req, res) {
  const { jobId, fileName } = req.params;

  if (!isValidJobId(jobId)) {
    return res.status(400).send('Invalid Job ID.');
  }

  // Sanitize fileName to prevent directory traversal
  const sanitizedFileName = path.basename(fileName);
  if (sanitizedFileName !== fileName || !sanitizedFileName.endsWith('.mp4')) {
    return res.status(400).send('Invalid clip filename.');
  }

  const clipPath = path.join(PROCESSED_DIR, jobId, sanitizedFileName);

  if (!fs.existsSync(clipPath)) {
    return res.status(404).send('Clip not found.');
  }

  // If download query param is present, force attachment download
  if (req.query.download === '1' || req.query.download === 'true') {
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
  }

  res.setHeader('Content-Type', 'video/mp4');
  return res.sendFile(clipPath);
}

/**
 * Bundles all clips into a single ZIP file and downloads it
 */
async function downloadAllClipsZip(req, res) {
  const { jobId } = req.params;

  if (!isValidJobId(jobId)) {
    return res.status(400).json({ success: false, error: 'Invalid Job ID.' });
  }

  const job = loadJobMeta(jobId);

  if (!job || !job.clips || job.clips.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'No clips found for this job or processing is not yet completed.'
    });
  }

  const clipsDir = path.join(PROCESSED_DIR, jobId);
  const zipFileName = `ClipForge_All_Clips_${jobId.slice(0, 8)}.zip`;
  const zipPath = path.join(clipsDir, zipFileName);

  try {
    // If ZIP doesn't exist, create it
    if (!fs.existsSync(zipPath)) {
      console.log(`[ClipForge ZIP] Creating ZIP archive for job ${jobId}...`);
      await zipService.createClipsZip(clipsDir, job.clips, zipPath);
      console.log(`[ClipForge ZIP] ZIP created successfully at ${zipPath}`);
    }

    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    res.setHeader('Content-Type', 'application/zip');
    return res.download(zipPath, zipFileName);
  } catch (err) {
    console.error(`[ClipForge ZIP Error]`, err);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate ZIP archive: ' + err.message
    });
  }
}

/**
 * Deletes uploaded video and all generated clips for a given jobId
 */
function deleteJob(req, res) {
  const { jobId } = req.params;
  if (!isValidJobId(jobId)) {
    return res.status(400).json({ success: false, error: 'Invalid Job ID format.' });
  }

  // Cancel any running processes
  cancelledJobs.add(jobId);
  pausedJobs.delete(jobId);
  youtubeDownloader.cancelDownload(jobId);

  // Remove from in-memory cache
  jobsCache.delete(jobId);

  // Remove uploaded file directory
  const uploadDir = path.join(UPLOADS_DIR, jobId);
  try {
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`[Delete Job] Error deleting upload dir for ${jobId}:`, err.message);
  }

  // Remove processed clips directory
  const processedDir = path.join(PROCESSED_DIR, jobId);
  try {
    if (fs.existsSync(processedDir)) {
      fs.rmSync(processedDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`[Delete Job] Error deleting processed dir for ${jobId}:`, err.message);
  }

  console.log(`[Delete Job] Successfully removed video and clips for job: ${jobId}`);
  return res.status(200).json({
    success: true,
    message: 'Uploaded video and generated clips removed successfully.'
  });
}

module.exports = {
  validateYouTubeUrl,
  processVideoUpload,
  processYouTubeUrl,
  getJobStatus,
  pauseJob,
  resumeJob,
  cancelJob,
  serveClip,
  downloadAllClipsZip,
  deleteJob
};


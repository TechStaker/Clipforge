const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

// Configure FFmpeg and FFprobe binary paths
try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  const ffprobeInstaller = require('@ffprobe-installer/ffprobe');

  const ffmpegPath = process.env.FFMPEG_PATH || ffmpegInstaller.path;
  const ffprobePath = process.env.FFPROBE_PATH || ffprobeInstaller.path;

  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
  if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);

  console.log(`[ClipForge FFmpeg] Configured FFmpeg: ${ffmpegPath}`);
  console.log(`[ClipForge FFprobe] Configured FFprobe: ${ffprobePath}`);
} catch (err) {
  console.warn('[ClipForge FFmpeg] Could not auto-load installer binaries, relying on system PATH:', err.message);
}

/**
 * Formats seconds into HH:MM:SS or MM:SS string
 * @param {number} seconds
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(seconds) {
  const sec = Math.floor(seconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Probes a video file using FFprobe to get metadata
 * @param {string} filePath
 * @returns {Promise<Object>}
 */
function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        return reject(new Error(`Failed to probe video file: ${err.message}`));
      }

      const format = metadata.format || {};
      const duration = parseFloat(format.duration || 0);

      const videoStream = (metadata.streams || []).find((s) => s.codec_type === 'video');
      const audioStream = (metadata.streams || []).find((s) => s.codec_type === 'audio');

      resolve({
        duration,
        durationFormatted: formatTimestamp(duration),
        sizeBytes: format.size ? parseInt(format.size, 10) : 0,
        bitrate: format.bit_rate ? parseInt(format.bit_rate, 10) : null,
        width: videoStream?.width || 1920,
        height: videoStream?.height || 1080,
        videoCodec: videoStream?.codec_name || 'unknown',
        audioCodec: audioStream?.codec_name || 'unknown',
        fps: videoStream?.r_frame_rate ? evalFraction(videoStream.r_frame_rate) : 30
      });
    });
  });
}

function evalFraction(fractionStr) {
  try {
    const parts = fractionStr.split('/');
    if (parts.length === 2 && parseInt(parts[1], 10) !== 0) {
      return Math.round(parseInt(parts[0], 10) / parseInt(parts[1], 10));
    }
    return parseFloat(fractionStr) || 30;
  } catch {
    return 30;
  }
}

/**
 * Ultra-fast segment extraction:
 * 1. Uses fast input seeking before input (-ss) to jump directly to target timestamp
 * 2. Uses lossless stream copying for sub-second 1080p cutting
 * 3. Falls back to veryfast H.264 encode if stream copy fails
 * 
 * @param {Object} options
 * @returns {Promise<Object>}
 */
function extractSegmentFast({ inputPath, outputPath, startTime, duration }) {
  return new Promise((resolve, reject) => {
    // Attempt 1: Ultra-fast lossless stream copy (1080p preserved, takes ~0.2s)
    ffmpeg(inputPath)
      .inputOptions(['-ss', String(startTime)])
      .outputOptions([
        '-t', String(duration),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        '-movflags', '+faststart'
      ])
      .output(outputPath)
      .on('end', () => {
        resolve({ outputPath, startTime, duration, mode: 'copy' });
      })
      .on('error', () => {
        // Fallback: Frame-accurate fast 1080p re-encode
        ffmpeg(inputPath)
          .inputOptions(['-ss', String(startTime)])
          .outputOptions([
            '-t', String(duration),
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '19', // High-definition 1080p quality
            '-c:a', 'aac',
            '-b:a', '192k',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart'
          ])
          .output(outputPath)
          .on('end', () => {
            resolve({ outputPath, startTime, duration, mode: 'encode' });
          })
          .on('error', (fallbackErr) => {
            reject(new Error(`FFmpeg error on segment at ${startTime}s: ${fallbackErr.message}`));
          })
          .run();
      })
      .run();
  });
}

/**
 * Automatically divides the video into consecutive 30-40s clips.
 * LIMIT: Generates at most 10 clips per video (user requirement) with 1080p quality.
 * 
 * @param {Object} params
 * @param {string} params.inputPath - Full path to input video
 * @param {string} params.outputDir - Output directory for clips
 * @param {string} params.jobId - Unique Job Identifier
 * @param {number} [params.clipDuration=30] - Duration per clip (30s, 35s, 40s)
 * @param {number} [params.maxClips=10] - Max clips limit (capped at 10)
 * @param {Function} [params.onProgress] - Callback for progress updates
 * @returns {Promise<Object>} Result object with list of generated clips
 */
async function sliceVideoInto30sClips({ inputPath, outputDir, jobId, onProgress, clipDuration = 30, maxClips = 10, isPaused, isCancelled }) {
  if (!fs.existsSync(inputPath)) {
    throw new Error('Input video file does not exist.');
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (onProgress) {
    onProgress({
      status: 'analyzing',
      message: 'Reading 1080p video metadata and duration with FFprobe...',
      percent: 5
    });
  }

  const meta = await getVideoMetadata(inputPath);
  const totalDuration = meta.duration;

  if (totalDuration <= 0) {
    throw new Error('Unable to determine video duration. File may be corrupted.');
  }

  // Clip duration (30s, 35s, 40s etc.)
  const clipLength = Math.max(5, Math.min(300, parseInt(clipDuration, 10) || 30));

  // Cap to at most 10 clips per video as explicitly requested
  const cappedMaxClips = Math.min(10, Math.max(1, parseInt(maxClips, 10) || 10));
  const possibleClips = Math.ceil(totalDuration / clipLength);
  const totalClips = Math.min(cappedMaxClips, possibleClips);

  if (onProgress) {
    onProgress({
      status: 'processing',
      message: `Total video duration: ${meta.durationFormatted}. Fast splitting into ${totalClips} 1080p clips (~${clipLength}s each, max 10)...`,
      currentClip: 0,
      totalClips,
      percent: 10
    });
  }

  const generatedClips = [];

  for (let i = 0; i < totalClips; i++) {
    // Check if user paused the processing
    while (isPaused && isPaused(jobId)) {
      await new Promise((r) => setTimeout(r, 400));
      if (isCancelled && isCancelled(jobId)) break;
    }

    // Check if user stopped/cancelled early to get whatever clips are generated
    if (isCancelled && isCancelled(jobId)) {
      console.log(`[ClipForge] Processing stopped early for job ${jobId}. Yielding ${generatedClips.length} clips.`);
      break;
    }

    const startTime = i * clipLength;
    const remainingTime = totalDuration - startTime;
    const currentDuration = Math.min(clipLength, remainingTime);

    // Skip negligible trailing audio/video fragments (< 0.25 sec)
    if (currentDuration < 0.25 && i > 0) {
      continue;
    }

    const clipIndex = i + 1;
    const clipIndexPadded = String(clipIndex).padStart(2, '0');
    const fileName = `ClipForge_Clip_${clipIndexPadded}.mp4`;
    const outputPath = path.join(outputDir, fileName);

    const startFormatted = formatTimestamp(startTime);
    const endFormatted = formatTimestamp(startTime + currentDuration);

    if (onProgress) {
      const clipPercent = Math.round(10 + ((i / totalClips) * 88));
      onProgress({
        status: 'processing',
        message: `Fast Generating 1080p Clip ${clipIndex} of ${totalClips} (${startFormatted} - ${endFormatted})...`,
        currentClip: clipIndex,
        totalClips,
        percent: clipPercent
      });
    }

    // Fast cutting with stream copy & input seeking
    await extractSegmentFast({
      inputPath,
      outputPath,
      startTime,
      duration: currentDuration
    });

    let clipSizeBytes = 0;
    try {
      const stats = fs.statSync(outputPath);
      clipSizeBytes = stats.size;
    } catch {
      // ignore
    }

    generatedClips.push({
      clipIndex,
      clipLabel: `Clip ${clipIndexPadded}`,
      fileName,
      filePath: outputPath,
      relativeUrl: `/api/videos/clip/${jobId}/${fileName}`,
      startTime,
      duration: currentDuration,
      durationFormatted: `${Math.round(currentDuration)}s`,
      startFormatted,
      endFormatted,
      quality: '1080p Full HD',
      sizeBytes: clipSizeBytes,
      sizeFormatted: (clipSizeBytes / (1024 * 1024)).toFixed(2) + ' MB'
    });
  }

  if (onProgress) {
    onProgress({
      status: 'completed',
      message: `Successfully generated ${generatedClips.length} 1080p clips!`,
      currentClip: generatedClips.length,
      totalClips: generatedClips.length,
      percent: 100
    });
  }

  return {
    jobId,
    totalDuration,
    totalDurationFormatted: meta.durationFormatted,
    quality: '1080p Full HD',
    videoInfo: {
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
      videoCodec: meta.videoCodec
    },
    clipsCount: generatedClips.length,
    clips: generatedClips
  };
}

module.exports = {
  getVideoMetadata,
  formatTimestamp,
  extractSegment: extractSegmentFast,
  sliceVideoInto30sClips,
  sliceVideoIntoClips: sliceVideoInto30sClips
};

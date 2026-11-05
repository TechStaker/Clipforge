const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Resolve yt-dlp binary cross-platform
function resolveYtDlpBinary() {
  if (process.env.YT_DLP_PATH) return process.env.YT_DLP_PATH;
  
  // Windows local binary
  const winBin = path.join(__dirname, '..', '..', 'bin', 'yt-dlp.exe');
  if (process.platform === 'win32' && fs.existsSync(winBin)) {
    return winBin;
  }

  // Linux/macOS local binary
  const unixBin = path.join(__dirname, '..', '..', 'bin', 'yt-dlp');
  if (fs.existsSync(unixBin)) {
    return unixBin;
  }

  // Fallback to system PATH (e.g. Linux container with /usr/local/bin/yt-dlp)
  return 'yt-dlp';
}

const YT_DLP_PATH = resolveYtDlpBinary();

// Try finding ffmpeg binary
let ffmpegBinaryPath = '';
try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  ffmpegBinaryPath = process.env.FFMPEG_PATH || ffmpegInstaller.path || '';
} catch (e) {
  // ignore
}

// Active download child processes map for pause / cancel
const activeDownloads = new Map();

const PRIMARY_EXTRACTOR_ARGS = 'youtube:player_client=android_vr,tv_downgraded,tv,android,web_embedded;player_skip=webpage';
const FALLBACK_EXTRACTOR_ARGS = 'youtube:player_client=tv,android;player_skip=webpage';

/**
 * Builds resilient yt-dlp arguments tailored for cloud servers & datacenter IPs
 */
function buildYtDlpArgs(outputTemplate, extractorArgs, formatString, url) {
  const args = [
    '--no-playlist',
    '--js-runtimes', 'node',
    '--extractor-args', extractorArgs,
    '--force-ipv4',
    '--geo-bypass',
    '-N', '8', // 8 concurrent multi-connection threads for ultra-fast download
    '--max-filesize', '1024M',
    '-f', formatString,
    '--merge-output-format', 'mp4',
    '--newline'
  ];

  // Optional cookies support for authenticated extraction
  const rootCookies = path.join(__dirname, '..', '..', 'cookies.txt');

  // Handle environment variable cookies if provided
  if (process.env.YOUTUBE_COOKIES_DATA) {
    try {
      let data = process.env.YOUTUBE_COOKIES_DATA.trim();
      if (data.startsWith('base64:')) {
        data = Buffer.from(data.slice(7), 'base64').toString('utf8');
      }
      fs.writeFileSync(rootCookies, data, 'utf8');
    } catch (e) {
      console.warn('[YouTube Downloader] Failed writing YOUTUBE_COOKIES_DATA:', e.message);
    }
  }

  if (process.env.YOUTUBE_COOKIES_PATH && fs.existsSync(process.env.YOUTUBE_COOKIES_PATH)) {
    args.push('--cookies', process.env.YOUTUBE_COOKIES_PATH);
  } else if (fs.existsSync(rootCookies) && fs.statSync(rootCookies).size > 20) {
    args.push('--cookies', rootCookies);
  }

  if (ffmpegBinaryPath && fs.existsSync(ffmpegBinaryPath)) {
    args.push('--ffmpeg-location', path.dirname(ffmpegBinaryPath));
  }

  args.push('-o', outputTemplate);
  args.push(url);

  return args;
}

/**
 * Low-level child process executor for yt-dlp
 */
function executeDownload(args, jobId, outputDir, onProgress) {
  return new Promise((resolve, reject) => {
    const ytProcess = spawn(YT_DLP_PATH, args);
    activeDownloads.set(jobId, ytProcess);

    let stdoutData = '';
    let stderrData = '';

    ytProcess.stdout.on('data', (data) => {
      const line = data.toString();
      stdoutData += line;

      // Parse download percentage e.g. "[download]  45.2% of  29.01MiB at  5.50MiB/s"
      const match = line.match(/\[download\]\s+([\d\.]+)%/);
      if (match && onProgress) {
        const dlPercent = parseFloat(match[1]);
        const speedMatch = line.match(/at\s+([\d\.]+\s*\S+\/s)/);
        const speed = speedMatch ? speedMatch[1] : '';
        const scaledPercent = Math.min(48, Math.max(5, Math.round(5 + (dlPercent * 0.43))));
        onProgress({
          status: 'downloading',
          message: `Fast Downloading 1080p Video (${dlPercent.toFixed(1)}%${speed ? ' @ ' + speed : ''})`,
          percent: scaledPercent,
          downloadPercent: dlPercent
        });
      }
    });

    ytProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    ytProcess.on('error', (err) => {
      activeDownloads.delete(jobId);
      reject(new Error(`Failed to execute yt-dlp: ${err.message}`));
    });

    ytProcess.on('close', (code) => {
      activeDownloads.delete(jobId);

      if (code !== 0) {
        // If it was cancelled by user
        if (stdoutData.includes('SIGTERM') || stderrData.includes('SIGTERM')) {
          const cancelErr = new Error('Download cancelled by user.');
          cancelErr.isCancelled = true;
          return reject(cancelErr);
        }

        const fullLog = (stderrData + '\n' + stdoutData);
        const failErr = new Error(fullLog);
        failErr.fullLog = fullLog;
        return reject(failErr);
      }

      try {
        const files = fs.readdirSync(outputDir);
        const downloadedFile = files.find((f) => f.startsWith(`yt_source_${jobId}`));

        if (!downloadedFile) {
          return reject(new Error('Downloaded video file could not be located in output directory.'));
        }

        const fullPath = path.join(outputDir, downloadedFile);
        resolve({
          filePath: fullPath,
          fileName: downloadedFile
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Cancels or terminates an active download
 * @param {string} jobId
 */
function cancelDownload(jobId) {
  const child = activeDownloads.get(jobId);
  if (child) {
    try {
      child.kill('SIGTERM');
    } catch {}
    activeDownloads.delete(jobId);
    return true;
  }
  return false;
}

/**
 * Fast YouTube Video Downloader
 * - Uses --js-runtimes node to solve challenges dynamically
 * - Bypasses bot detection & 429 datacenter blocks by querying Android VR, TV, Web-Embedded APIs and skipping the webpage
 * - Employs automatic TV/Android client fallback if primary multi-client stream fails
 * - Multi-threaded 1080p stream capture with -N 8
 * 
 * @param {Object} options
 * @param {string} options.url - YouTube video URL
 * @param {string} options.outputDir - Output directory
 * @param {string} options.jobId - Unique Job ID
 * @param {Function} [options.onProgress] - Callback for download progress
 * @returns {Promise<{ filePath: string, fileName: string }>}
 */
async function downloadYouTubeVideo({ url, outputDir, jobId, onProgress }) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputTemplate = path.join(outputDir, `yt_source_${jobId}.%(ext)s`);

  if (onProgress) {
    onProgress({
      status: 'downloading',
      message: 'Fast multi-threaded 1080p connection to YouTube...',
      percent: 5
    });
  }

  const rootCookies = path.join(__dirname, '..', '..', 'cookies.txt');
  const hasCookies = (fs.existsSync(rootCookies) && fs.statSync(rootCookies).size > 20) || !!process.env.YOUTUBE_COOKIES_DATA || !!process.env.YOUTUBE_COOKIES_PATH;

  // When cookies are present, use authenticated clients; otherwise use multi-client rotation with player_skip=webpage
  const firstExtractorArgs = hasCookies ? 'youtube:player_client=web,android,ios' : PRIMARY_EXTRACTOR_ARGS;
  const secondExtractorArgs = hasCookies ? PRIMARY_EXTRACTOR_ARGS : FALLBACK_EXTRACTOR_ARGS;

  // Attempt 1: Multi-client rotation
  const primaryArgs = buildYtDlpArgs(
    outputTemplate,
    firstExtractorArgs,
    'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
    url
  );

  try {
    return await executeDownload(primaryArgs, jobId, outputDir, onProgress);
  } catch (err1) {
    if (err1.isCancelled) {
      throw err1;
    }

    console.warn(`[YouTube Downloader] Primary client rotation encountered an issue: ${err1.message.slice(0, 150)}. Retrying with fallback clients...`);

    // Clean up partial files from attempt 1 if any
    try {
      const existing = fs.readdirSync(outputDir).filter(f => f.startsWith(`yt_source_${jobId}`));
      existing.forEach(f => {
        try { fs.unlinkSync(path.join(outputDir, f)); } catch {}
      });
    } catch {}

    // Attempt 2: Fallback smart clients
    const fallbackArgs = buildYtDlpArgs(
      outputTemplate,
      secondExtractorArgs,
      'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best/18',
      url
    );

    try {
      return await executeDownload(fallbackArgs, jobId, outputDir, onProgress);
    } catch (err2) {
      if (err2.isCancelled) {
        throw err2;
      }

      const fullLog = err2.fullLog || err1.fullLog || err2.message || '';

      // User-friendly error messages for common YouTube restriction scenarios
      if (fullLog.includes('This video is unavailable')) {
        throw new Error('This YouTube video is unavailable or has been removed on YouTube. Please check the link or choose another video.');
      }
      if (fullLog.includes('Private video')) {
        throw new Error('This YouTube video is set to Private. Please use a public YouTube video link or upload the video file directly.');
      }
      if (fullLog.includes('Sign in to confirm you') || fullLog.includes('HTTP Error 429')) {
        throw new Error('YouTube is blocking automated cloud server requests for this specific video. You can still clip this video seamlessly by uploading it directly using the "Upload Local Video File" box!');
      }

      const errorLines = fullLog
        .split('\n')
        .filter(l => l.includes('ERROR:'))
        .map(l => l.replace(/ERROR:\s*(\[[^\]]+\])?\s*/i, '').trim());

      const primaryError = errorLines[0] || fullLog.replace(/WARNING:[^\n]*\n?/g, '').trim().slice(0, 300);
      throw new Error(`Failed to download YouTube video: ${primaryError}`);
    }
  }
}

module.exports = {
  downloadYouTubeVideo,
  cancelDownload,
  YT_DLP_PATH
};

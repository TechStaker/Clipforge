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
 * - Uses --js-runtimes node to bypass YouTube bot challenge throttling
 * - Uses -N 8 (multi-connection concurrent streams)
 * - Directly downloads 1080p stream
 * 
 * @param {Object} options
 * @param {string} options.url - YouTube video URL
 * @param {string} options.outputDir - Output directory
 * @param {string} options.jobId - Unique Job ID
 * @param {Function} [options.onProgress] - Callback for download progress
 * @returns {Promise<{ filePath: string, fileName: string }>}
 */
function downloadYouTubeVideo({ url, outputDir, jobId, onProgress }) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputTemplate = path.join(outputDir, `yt_source_${jobId}.%(ext)s`);

    const args = [
      '--no-playlist',
      '--js-runtimes', 'node',
      '-N', '8', // 8 concurrent multi-connection threads for ultra-fast download
      '--max-filesize', '1024M',
      // Prioritize 1080p Full HD video stream
      '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
      '--merge-output-format', 'mp4',
      '--newline',
      '-o', outputTemplate
    ];

    if (ffmpegBinaryPath && fs.existsSync(ffmpegBinaryPath)) {
      args.push('--ffmpeg-location', path.dirname(ffmpegBinaryPath));
    }

    args.push(url);

    if (onProgress) {
      onProgress({
        status: 'downloading',
        message: 'Fast multi-threaded 1080p connection to YouTube...',
        percent: 5
      });
    }

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

    ytProcess.on('close', (code) => {
      activeDownloads.delete(jobId);

      if (code !== 0) {
        // If it was cancelled by user
        if (stdoutData.includes('SIGTERM') || stderrData.includes('SIGTERM')) {
          return reject(new Error('Download cancelled by user.'));
        }
        return reject(new Error(`Failed to download YouTube video: ${stderrData || stdoutData}`));
      }

      try {
        const files = fs.readdirSync(outputDir);
        const downloadedFile = files.find((f) => f.startsWith(`yt_source_${jobId}`));

        if (!downloadedFile) {
          return reject(new Error('Downloaded 1080p video file could not be located in output directory.'));
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

    ytProcess.on('error', (err) => {
      activeDownloads.delete(jobId);
      reject(new Error(`Failed to execute yt-dlp: ${err.message}`));
    });
  });
}

module.exports = {
  downloadYouTubeVideo,
  cancelDownload,
  YT_DLP_PATH
};

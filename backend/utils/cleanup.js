const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const PROCESSED_DIR = path.join(__dirname, '..', '..', 'processed');

/**
 * Removes files and directories older than specified minutes.
 * @param {number} maxAgeMinutes
 */
function cleanOldFiles(maxAgeMinutes = 60) {
  const maxAgeMs = maxAgeMinutes * 60 * 1000;
  const now = Date.now();
  let cleanedCount = 0;

  const targetDirs = [UPLOADS_DIR, PROCESSED_DIR];

  for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        try {
          const stats = fs.statSync(fullPath);
          const ageMs = now - stats.mtimeMs;

          if (ageMs > maxAgeMs) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            cleanedCount++;
          }
        } catch (itemErr) {
          console.warn(`[Cleanup] Error inspecting ${fullPath}:`, itemErr.message);
        }
      }
    } catch (dirErr) {
      console.warn(`[Cleanup] Error scanning ${dir}:`, dirErr.message);
    }
  }

  if (cleanedCount > 0) {
    console.log(`[Cleanup] Removed ${cleanedCount} expired job directory(ies) older than ${maxAgeMinutes} minutes.`);
  }
}

/**
 * Starts periodic cleanup timer
 * @param {number} intervalMinutes
 */
function startCleanupScheduler(intervalMinutes = 60) {
  // Run on startup
  cleanOldFiles(intervalMinutes);

  // Set recurring interval (e.g., check every 15 minutes)
  const checkIntervalMs = 15 * 60 * 1000;
  setInterval(() => {
    cleanOldFiles(intervalMinutes);
  }, checkIntervalMs);

  console.log(`[Cleanup] Scheduled cleanup task every 15 minutes (Retention limit: ${intervalMinutes} min).`);
}

module.exports = {
  cleanOldFiles,
  startCleanupScheduler
};


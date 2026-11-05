const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('====================================================');
console.log('  🚀 ClipForge Auto-Git-Push System Active');
console.log('  Watching for file changes...');
console.log('  Any change you save will automatically push to GitHub!');
console.log('====================================================\n');

const IGNORED_PATHS = [
  '.git',
  'node_modules',
  'uploads',
  'processed',
  '.env',
  '.system_generated'
];

let debounceTimer = null;
let isSyncing = false;

function shouldIgnore(filename) {
  if (!filename) return true;
  const normalized = filename.replace(/\\/g, '/');
  return (
    IGNORED_PATHS.some((p) => normalized.startsWith(p) || normalized.includes(`/${p}/`)) ||
    normalized.endsWith('.log') ||
    normalized.endsWith('.tmp')
  );
}

function autoSync() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (!status) {
      isSyncing = false;
      return;
    }

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.log(`\n[Auto-Sync ${timestamp}] Changes detected! Staging and committing...`);
    execSync('git add .', { stdio: 'inherit' });
    execSync(`git commit -m "auto: update changes (${timestamp})"`, { stdio: 'inherit' });

    console.log(`[Auto-Sync ${timestamp}] Pushing to GitHub...`);
    execSync('git push', { stdio: 'inherit' });
    console.log(`[Auto-Sync ${timestamp}] ✅ Successfully pushed to GitHub!\n`);
  } catch (err) {
    console.warn(`[Auto-Sync Warning] Sync encountered an issue: ${err.message}`);
  } finally {
    isSyncing = false;
  }
}

// Watch workspace root recursively
const rootDir = path.resolve(__dirname, '..');
fs.watch(rootDir, { recursive: true }, (eventType, filename) => {
  if (shouldIgnore(filename)) return;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    autoSync();
  }, 4000); // 4-second debounce to batch multiple edits together cleanly
});

// Run once on startup to check for unpushed commits
try {
  const unpushed = execSync('git log @{u}..HEAD --oneline', { encoding: 'utf8' }).trim();
  if (unpushed) {
    console.log('Detected unpushed local commit(s). Pushing to GitHub now...');
    execSync('git push', { stdio: 'inherit' });
    console.log('✅ All local commits pushed to GitHub!\n');
  }
} catch (e) {
  // ignore
}

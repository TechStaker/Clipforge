const fs = require('fs');
const path = require('path');
const archiverModule = require('archiver');

/**
 * Creates an archiver zip instance compatible across versions
 */
function instantiateZipArchive(options = { zlib: { level: 6 } }) {
  if (typeof archiverModule === 'function') {
    return archiverModule('zip', options);
  }
  if (archiverModule.ZipArchive) {
    return new archiverModule.ZipArchive(options);
  }
  if (typeof archiverModule.create === 'function') {
    return archiverModule.create('zip', options);
  }
  throw new Error('Unsupported archiver module structure');
}

/**
 * Creates a ZIP archive containing all clips for a given job.
 * @param {string} clipsDir - Directory where clips are located
 * @param {Array<Object>} clips - Array of clip objects
 * @param {string} zipOutputPath - Destination path for the ZIP file
 * @returns {Promise<string>} Path to created ZIP file
 */
function createClipsZip(clipsDir, clips, zipOutputPath) {
  return new Promise((resolve, reject) => {
    // Ensure parent dir exists
    const parentDir = path.dirname(zipOutputPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const output = fs.createWriteStream(zipOutputPath);
    const archive = instantiateZipArchive({ zlib: { level: 6 } });

    output.on('close', () => {
      resolve(zipOutputPath);
    });

    output.on('error', (err) => {
      reject(new Error(`Output stream error: ${err.message}`));
    });

    archive.on('error', (err) => {
      reject(new Error(`Failed to create ZIP archive: ${err.message}`));
    });

    archive.pipe(output);

    // Add each clip to the zip file
    for (const clip of clips) {
      const clipFilePath = clip.filePath || path.join(clipsDir, clip.fileName);
      if (fs.existsSync(clipFilePath)) {
        archive.file(clipFilePath, { name: clip.fileName });
      }
    }

    archive.finalize().catch((err) => {
      // Catch finalize promise error if any
      reject(err);
    });
  });
}

module.exports = {
  createClipsZip
};

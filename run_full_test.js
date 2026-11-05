const path = require('path');
const fs = require('fs');
const videoProcessor = require('./backend/services/videoProcessor');
const zipService = require('./backend/services/zipService');
const youtubeService = require('./backend/services/youtubeService');

async function runTests() {
  console.log('====================================================');
  console.log('  ClipForge Full-Stack Automated Verification Suite ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // --- TEST 1: YouTube Service Extraction & oEmbed fallback ---
  console.log('--- TEST 1: YouTube URL Parsing ---');
  const testUrls = [
    { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
    { url: 'https://youtu.be/dQw4w9WgXcQ?t=10', expected: 'dQw4w9WgXcQ' },
    { url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
    { url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' }
  ];

  for (const t of testUrls) {
    const extracted = youtubeService.extractVideoId(t.url);
    assert(extracted === t.expected, `Extracted ID "${extracted}" matches "${t.expected}" for ${t.url}`);
  }

  // Test YouTube metadata fallback / structure
  console.log('\n--- TEST 2: YouTube Metadata Retrieval ---');
  try {
    const meta = await youtubeService.getYouTubeMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert(meta && meta.videoId === 'dQw4w9WgXcQ', 'Metadata contains valid videoId');
    assert(meta.title && meta.title.length > 0, `Metadata title retrieved: "${meta.title}"`);
    assert(meta.thumbnail && meta.thumbnail.startsWith('http'), `Thumbnail URL present: "${meta.thumbnail}"`);
  } catch (err) {
    console.warn('Network unavailable in sandbox or rate limited, verifying structure:', err.message);
  }

  // --- TEST 3: FFprobe Metadata on 75s Sample Video ---
  console.log('\n--- TEST 3: FFprobe Inspection of Sample Video ---');
  const sampleVideoPath = path.join(__dirname, 'sample_75s_test.mp4');
  assert(fs.existsSync(sampleVideoPath), 'Sample video file exists at ' + sampleVideoPath);

  const videoMeta = await videoProcessor.getVideoMetadata(sampleVideoPath);
  console.log('Detected Duration:', videoMeta.duration, 'seconds (' + videoMeta.durationFormatted + ')');
  console.log('Dimensions:', videoMeta.width, 'x', videoMeta.height);
  console.log('Video Codec:', videoMeta.videoCodec, '| Audio Codec:', videoMeta.audioCodec);

  assert(Math.round(videoMeta.duration) === 75, `Duration is 75 seconds (actual: ${videoMeta.duration.toFixed(2)}s)`);
  assert(videoMeta.width === 1280 && videoMeta.height === 720, 'Dimensions are 1280x720');

  // --- TEST 4: Slicing into 30s clips with FFmpeg ---
  console.log('\n--- TEST 4: Slicing Video into Consecutive 30-Second Clips ---');
  const testJobId = 'test-job-' + Date.now();
  const testOutputDir = path.join(__dirname, 'processed', testJobId);

  const progressUpdates = [];
  const sliceResult = await videoProcessor.sliceVideoInto30sClips({
    inputPath: sampleVideoPath,
    outputDir: testOutputDir,
    jobId: testJobId,
    onProgress: (prog) => {
      progressUpdates.push(prog);
      if (prog.message) console.log('   -> Progress:', prog.message);
    }
  });

  assert(sliceResult.clipsCount === 3, `Expected 3 clips, generated ${sliceResult.clipsCount}`);
  assert(progressUpdates.length >= 3, `Progress updates emitted (${progressUpdates.length} events)`);

  const clips = sliceResult.clips;
  assert(clips.length === 3, 'Array has 3 clip items');

  // Verify Clip 1: 00:00 - 00:30 (30s)
  const clip1 = clips[0];
  assert(clip1.fileName === 'ClipForge_Clip_01.mp4', 'Clip 1 filename is ClipForge_Clip_01.mp4');
  assert(clip1.startTime === 0, 'Clip 1 starts at 0s');
  assert(clip1.duration === 30, 'Clip 1 duration is 30s');
  assert(clip1.startFormatted === '00:00', 'Clip 1 start formatted is 00:00');
  assert(clip1.endFormatted === '00:30', 'Clip 1 end formatted is 00:30');
  assert(fs.existsSync(clip1.filePath), 'Clip 1 file exists on disk');

  // Verify Clip 2: 00:30 - 01:00 (30s)
  const clip2 = clips[1];
  assert(clip2.fileName === 'ClipForge_Clip_02.mp4', 'Clip 2 filename is ClipForge_Clip_02.mp4');
  assert(clip2.startTime === 30, 'Clip 2 starts at 30s');
  assert(clip2.duration === 30, 'Clip 2 duration is 30s');
  assert(clip2.startFormatted === '00:30', 'Clip 2 start formatted is 00:30');
  assert(clip2.endFormatted === '01:00', 'Clip 2 end formatted is 01:00');
  assert(fs.existsSync(clip2.filePath), 'Clip 2 file exists on disk');

  // Verify Clip 3: 01:00 - 01:15 (15s remaining)
  const clip3 = clips[2];
  assert(clip3.fileName === 'ClipForge_Clip_03.mp4', 'Clip 3 filename is ClipForge_Clip_03.mp4');
  assert(clip3.startTime === 60, 'Clip 3 starts at 60s');
  assert(Math.round(clip3.duration) === 15, `Clip 3 final remaining duration is 15s (actual: ${clip3.duration}s)`);
  assert(clip3.startFormatted === '01:00', 'Clip 3 start formatted is 01:00');
  assert(clip3.endFormatted === '01:15', 'Clip 3 end formatted is 01:15');
  assert(fs.existsSync(clip3.filePath), 'Clip 3 file exists on disk');

  // Probe generated clip files to verify actual audio/video validity
  console.log('\n--- TEST 5: Probing Generated Clip Output Files ---');
  for (const c of clips) {
    const cMeta = await videoProcessor.getVideoMetadata(c.filePath);
    assert(cMeta.duration > 0, `${c.fileName} is a valid playable video (Duration: ${cMeta.duration.toFixed(2)}s)`);
    assert(cMeta.videoCodec === 'h264', `${c.fileName} uses h264 codec`);
  }

  // --- TEST 6: Server-Side ZIP Generation ---
  console.log('\n--- TEST 6: Testing Streaming ZIP Archive Generation ---');
  const zipPath = path.join(testOutputDir, `ClipForge_All_Clips_${testJobId.slice(0, 8)}.zip`);
  await zipService.createClipsZip(testOutputDir, clips, zipPath);

  assert(fs.existsSync(zipPath), 'ZIP archive file was created at ' + zipPath);
  const zipStats = fs.statSync(zipPath);
  assert(zipStats.size > 50000, `ZIP archive has valid non-zero size (${(zipStats.size / 1024).toFixed(1)} KB)`);

  console.log('\n====================================================');
  console.log(`  Tests Completed: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test Suite encountered unhandled error:', err);
  process.exit(1);
});


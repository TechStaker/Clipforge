const axios = require('axios');

/**
 * Extracts YouTube video ID from various URL formats.
 * @param {string} url - YouTube URL
 * @returns {string|null} Video ID or null if invalid
 */
function extractVideoId(url) {
  if (!url || typeof url !== 'string') return null;
  const cleaned = url.trim();

  // Pattern matches:
  // - youtube.com/watch?v=ID
  // - youtu.be/ID
  // - youtube.com/shorts/ID
  // - youtube.com/embed/ID
  // - youtube.com/v/ID
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/i,
    /^([a-zA-Z0-9_-]{11})$/ // Direct 11-char ID
  ];

  for (const regex of patterns) {
    const match = cleaned.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Parses ISO 8601 duration string (e.g. PT4M13S) into seconds and human-readable string.
 * @param {string} isoDuration
 * @returns {{ seconds: number, formatted: string }}
 */
function parseISODuration(isoDuration) {
  if (!isoDuration) return { seconds: 0, formatted: '00:00' };

  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return { seconds: 0, formatted: '00:00' };

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  let formatted = '';

  if (hours > 0) {
    formatted = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } else {
    formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return { seconds: totalSeconds, formatted };
}

/**
 * Fetches public video metadata using YouTube Data API v3 or oEmbed fallback.
 * @param {string} videoUrl
 * @returns {Promise<Object>} Video metadata object
 */
async function getYouTubeMetadata(videoUrl) {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    throw new Error('Invalid YouTube URL or Video ID provided');
  }

  const apiKey = process.env.YOUTUBE_API_KEY ? process.env.YOUTUBE_API_KEY.trim() : null;

  // Try YouTube Data API v3 if API key is provided
  if (apiKey) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`;
      const response = await axios.get(apiUrl, { timeout: 8000 });

      if (response.data && response.data.items && response.data.items.length > 0) {
        const item = response.data.items[0];
        const snippet = item.snippet;
        const contentDetails = item.contentDetails;
        const stats = item.statistics;

        const thumb =
          snippet.thumbnails.maxres?.url ||
          snippet.thumbnails.high?.url ||
          snippet.thumbnails.medium?.url ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        const durationInfo = parseISODuration(contentDetails?.duration);

        return {
          videoId,
          title: snippet.title || 'Untitled YouTube Video',
          channelTitle: snippet.channelTitle || 'Unknown Creator',
          thumbnail: thumb,
          durationSeconds: durationInfo.seconds,
          durationFormatted: durationInfo.formatted,
          viewCount: stats?.viewCount ? parseInt(stats.viewCount, 10).toLocaleString() : null,
          source: 'YouTube Data API v3',
          url: `https://www.youtube.com/watch?v=${videoId}`
        };
      }
    } catch (err) {
      console.warn('YouTube Data API v3 failed or key expired, falling back to public oEmbed:', err.message);
    }
  }

  // Fallback to official public YouTube oEmbed (works without any API key)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await axios.get(oembedUrl, { timeout: 8000 });
    const data = response.data;

    return {
      videoId,
      title: data.title || 'YouTube Video',
      channelTitle: data.author_name || 'YouTube Creator',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      durationSeconds: null,
      durationFormatted: null,
      viewCount: null,
      source: 'YouTube Public oEmbed',
      url: `https://www.youtube.com/watch?v=${videoId}`
    };
  } catch (err) {
    // If YouTube explicitly reported 404/401/403, the video is deleted or private
    if (err.response && (err.response.status === 404 || err.response.status === 401 || err.response.status === 403)) {
      throw new Error('This YouTube video is unavailable, private, or has been removed by YouTube. Please check the URL or try another video.');
    }

    // If temporary network timeout, return structured fallback with video ID and standard thumbnail
    return {
      videoId,
      title: `YouTube Video (${videoId})`,
      channelTitle: 'YouTube Creator',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      durationSeconds: null,
      durationFormatted: null,
      viewCount: null,
      source: 'Default Pattern',
      url: `https://www.youtube.com/watch?v=${videoId}`
    };
  }
}

module.exports = {
  extractVideoId,
  getYouTubeMetadata,
  parseISODuration
};


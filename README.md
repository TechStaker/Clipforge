# ClipForge ⚡ - Turn Long Videos Into Ready-to-Share 30-40s Clips

ClipForge is a modern full-stack web application engineered for creators, video editors, and social media managers. It enables users to simply paste any YouTube video URL or upload a local video file, choose a custom clip length (30s, 35s, 40s), and automatically divide the long video into consecutive downloadable clips using high-performance FFmpeg processing.

Users can preview all clips in real time on an interactive dark-themed SaaS dashboard, download each clip individually as an MP4, or download all clips at once in a sequential ZIP archive.

---

## 🌟 Key Features

- **Direct YouTube URL Processing**: Paste any YouTube or Shorts link and generate downloadable 30-40s clips directly without needing to upload a local file manually.
- **Configurable 30–40s Clip Duration**: Choose your desired segment duration (**30s**, **35s**, **40s**, or custom duration between 15s to 180s) tailored for TikTok, YouTube Shorts, and Instagram Reels.
- **Public YouTube Metadata Sync**: Validates YouTube URLs and fetches public metadata (title, high-res thumbnail, channel, duration) using the official YouTube Data API v3 (with an automated zero-config fallback to YouTube oEmbed).
- **Automated Sequential Splitting**: Splits videos into frame-accurate consecutive clips (`00:00–00:30`, `00:30–01:00`, etc.), with the final remaining segment cleanly cut.
- **Hardware-Accelerated FFmpeg Engine**: Preserves pristine visual and audio fidelity (H.264 video codec, AAC audio, `yuv420p` pixel format, and `+faststart` streaming flags for instant browser playback).
- **Interactive Results Dashboard**: Features responsive multi-column layouts, HTML5 video preview players, timestamp badges, and one-click download buttons for each clip.
- **One-Click Batch ZIP Export**: Streams all generated clips directly into a compressed ZIP file using server-side streaming to avoid memory bottlenecks.
- **Real-Time Processing Experience**: Shows live progress (Downloading/Uploading -> Analyzing with FFprobe -> Slicing into Clips -> Complete).
- **Dual Workflow (URL or Local File)**: Supports both direct YouTube URL download & processing as well as local file drag-and-drop.
- **Security & Privacy by Design**: Isolated job workspaces, rate limiting, file type/size validation, path traversal prevention, and automated 60-minute cleanup of temporary files.

---

## 🛠️ Tech Stack

### Frontend
- **HTML5 & Modern CSS3**: Custom design system, dark SaaS aesthetic, responsive multi-column grid, glassmorphic panels, CSS variables, and ambient glow gradients.
- **Vanilla JavaScript (ES6+)**: Zero bulky frontend frameworks; utilizes XMLHttpRequest for real-time upload progress, Fetch API for status polling, and responsive UI controls.
- **SVG Vector Icons**: Crisp inline SVG iconography with zero third-party font dependency.

### Backend
- **Node.js & Express.js**: RESTful API server and static asset serving.
- **Multer**: Multipart/form-data handler for high-volume video uploads.
- **Fluent-FFmpeg & @ffmpeg-installer**: Cross-platform FFmpeg and FFprobe binary integration.
- **Archiver**: Streaming ZIP archive builder.
- **Axios**: YouTube Data API v3 integration with oEmbed fallback.
- **Express-Rate-Limit**: Rate limiting for upload and processing endpoints.
- **UUID**: Unique job isolation and path sandboxing.

---

## 📋 Prerequisites

- **Node.js**: v18.0.0 or higher (Tested on Node.js v24)
- **npm**: v8.0.0 or higher
- **FFmpeg & FFprobe**: ClipForge comes bundled with cross-platform `@ffmpeg-installer/ffmpeg` and `@ffprobe-installer/ffprobe`, so no separate FFmpeg installation is required! However, if you already have custom system binaries installed, you can configure their paths via `.env`.

---

## 🚀 Quick Start Guide

### 1. Clone or Navigate to the Project
```bash
cd "Yt clipper"
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the root directory (you can copy `.env.example`):
```bash
cp .env.example .env
```

Default `.env` configuration:
```env
# Server Port
PORT=3000

# YouTube Data API v3 Key (Optional)
# Leave blank to automatically use public oEmbed fallback (works without any Google Cloud account!)
YOUTUBE_API_KEY=

# Maximum Upload Size in Megabytes (default: 1024MB / 1GB)
MAX_UPLOAD_SIZE=1024

# Cleanup Interval in Minutes (deletes processed jobs older than this)
CLEANUP_INTERVAL=60

# Optional custom FFmpeg/FFprobe binary paths (auto-detected if left blank)
FFMPEG_PATH=
FFPROBE_PATH=
```

### 4. Run the Application
Start the server:
```bash
npm start
```

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 🔑 Environment Variables & API Keys

| Variable | Required? | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | Optional | `3000` | Port on which the Express server listens. |
| `YOUTUBE_API_KEY` | Optional | *Empty* | Google YouTube Data API v3 key. If omitted, ClipForge falls back to YouTube's public oEmbed service. |
| `MAX_UPLOAD_SIZE` | Optional | `1024` | Maximum allowed video file size in Megabytes (1 GB). |
| `CLEANUP_INTERVAL`| Optional | `60` | Age (in minutes) after which processed files and uploads are automatically purged. |
| `FFMPEG_PATH` | Optional | *Auto-detected* | Custom absolute path to `ffmpeg` executable. |
| `FFPROBE_PATH` | Optional | *Auto-detected* | Custom absolute path to `ffprobe` executable. |

### How to get a YouTube Data API v3 Key (Optional)
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `ClipForge`).
3. Navigate to **APIs & Services > Library**, search for **YouTube Data API v3**, and click **Enable**.
4. Go to **APIs & Services > Credentials**, click **Create Credentials > API Key**.
5. Copy your API Key and paste it into `.env` under `YOUTUBE_API_KEY=YOUR_KEY_HERE`.

*Note: If you do not have an API key, ClipForge will automatically use YouTube's public oEmbed service and video ID thumbnail resolvers.*

---

## 🧪 Testing with a Sample Video

You can test ClipForge using any `.mp4`, `.mov`, `.mkv`, or `.webm` video:
1. Open `http://localhost:3000`.
2. (Optional) Paste any public YouTube URL (e.g. `https://www.youtube.com/watch?v=dQw4w9WgXcQ`) and click **Fetch Info**.
3. Drag & drop your video file into the upload area.
4. Check the ownership confirmation box.
5. Click **Generate My Clips**.
6. Watch the real-time progress bar. Once completed, preview each 30-second clip in the dashboard, test individual downloads, and test the **Download All Clips (.ZIP)** button.

---

## 🌐 Production Deployment Guide

### Option 1: Render / Railway / Fly.io (Container or Node Service)

1. **Root Directory**: Root of this repository.
2. **Build Command**: `npm install`
3. **Start Command**: `node backend/server.js`
4. **Environment Variables**:
   - `PORT`: Set by platform (e.g. `10000` or `3000`)
   - `MAX_UPLOAD_SIZE`: `500`
   - `CLEANUP_INTERVAL`: `60`
   - `YOUTUBE_API_KEY`: *(Optional)*

### Option 2: Linux VPS (Ubuntu / Debian with PM2 & Nginx)

1. **Install Node.js & PM2**:
   ```bash
   sudo apt update
   sudo apt install -y nodejs npm ffmpeg
   sudo npm install -g pm2
   ```

2. **Clone & Install**:
   ```bash
   git clone <your-repo-url> clipforge
   cd clipforge
   npm install
   ```

3. **Start with PM2**:
   ```bash
   pm2 start backend/server.js --name clipforge
   pm2 save
   pm2 startup
   ```

4. **Nginx Reverse Proxy Config**:
   ```nginx
   server {
       listen 80;
       server_name clipforge.yourdomain.com;

       client_max_body_size 500M;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

---

## 🔒 Security & Privacy

- **Safe Upload Filtering**: MIME types and file extensions are rigorously validated before storage.
- **No Path Traversal**: Clip filenames and Job IDs are checked against strict alphanumeric and UUID patterns.
- **Isolated Workspaces**: Every job processes within its own unique directory under `uploads/<jobId>` and `processed/<jobId>`.
- **Scheduled Auto-Purge**: Periodic cleanup worker removes temporary uploads and processed clips after the retention period (`CLEANUP_INTERVAL`).
- **Creator Rights Protection**: ClipForge requires explicit user authorization before processing and avoids violating YouTube's terms by strictly processing user-uploaded source files.

---

## 📄 License

This project is licensed under the MIT License.


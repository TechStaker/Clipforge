/**
 * ClipForge - Frontend Application Logic
 * Supports Direct YouTube URL processing and local video file uploading
 * with customizable 30-40s clip durations.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Navigation & Mobile Drawer
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileDrawer = document.getElementById('mobileDrawer');

  // DOM Elements - YouTube URL Fetcher
  const youtubeUrlInput = document.getElementById('youtubeUrlInput');
  const fetchYtBtn = document.getElementById('fetchYtBtn');
  const fetchBtnText = document.getElementById('fetchBtnText');
  const fetchBtnSpinner = document.getElementById('fetchBtnSpinner');
  const ytInfoCard = document.getElementById('ytInfoCard');
  const ytThumbImg = document.getElementById('ytThumbImg');
  const ytDurationBadge = document.getElementById('ytDurationBadge');
  const ytChannel = document.getElementById('ytChannel');
  const ytTitle = document.getElementById('ytTitle');
  const ytSourceNote = document.getElementById('ytSourceNote');
  const ytErrorMsg = document.getElementById('ytErrorMsg');
  const ytErrorText = document.getElementById('ytErrorText');

  // DOM Elements - File Upload & Dropzone
  const dropZone = document.getElementById('dropZone');
  const videoFileInput = document.getElementById('videoFileInput');
  const dropzoneEmpty = document.getElementById('dropzoneEmpty');
  const dropzoneSelected = document.getElementById('dropzoneSelected');
  const selectedFileName = document.getElementById('selectedFileName');
  const selectedFileSize = document.getElementById('selectedFileSize');
  const selectedFileExt = document.getElementById('selectedFileExt');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const ownershipCheckbox = document.getElementById('ownershipCheckbox');
  const generateClipsBtn = document.getElementById('generateClipsBtn');
  const generateBtnText = document.getElementById('generateBtnText');

  // DOM Elements - Duration Control
  const durationBtns = document.querySelectorAll('.duration-btn');
  const customDurationInput = document.getElementById('customDurationInput');

  // DOM Elements - Steps & Sections
  const step1Indicator = document.getElementById('step1Indicator');
  const step2Indicator = document.getElementById('step2Indicator');
  const step3Indicator = document.getElementById('step3Indicator');
  const clipForm = document.getElementById('clipForm');
  const processingSection = document.getElementById('processingSection');
  const resultsDashboard = document.getElementById('resultsDashboard');

  // DOM Elements - Processing Screen
  const processingTitle = document.getElementById('processingTitle');
  const processingMsg = document.getElementById('processingMsg');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressPercentText = document.getElementById('progressPercentText');
  const progressStepText = document.getElementById('progressStepText');
  const stepUpload = document.getElementById('stepUpload');
  const uploadDetail = document.getElementById('uploadDetail');
  const stepAnalyze = document.getElementById('stepAnalyze');
  const analyzeDetail = document.getElementById('analyzeDetail');
  const stepSlice = document.getElementById('stepSlice');
  const sliceDetail = document.getElementById('sliceDetail');
  const step1TitleText = document.getElementById('step1TitleText');
  const step3TitleText = document.getElementById('step3TitleText');
  const processingErrorBox = document.getElementById('processingErrorBox');
  const processingErrorMsg = document.getElementById('processingErrorMsg');
  const retryBtn = document.getElementById('retryBtn');

  // DOM Elements - Pause & Stop Controls
  const pauseResumeBtn = document.getElementById('pauseResumeBtn');
  const pauseBtnText = document.getElementById('pauseBtnText');
  const pauseIcon = document.getElementById('pauseIcon');
  const playIcon = document.getElementById('playIcon');
  const stopFinishBtn = document.getElementById('stopFinishBtn');

  // DOM Elements - Results Dashboard
  const resultThumbImg = document.getElementById('resultThumbImg');
  const resultVideoTitle = document.getElementById('resultVideoTitle');
  const resultTotalDuration = document.getElementById('resultTotalDuration');
  const resultClipsCountBadge = document.getElementById('resultClipsCountBadge');
  const resultSegmentSize = document.getElementById('resultSegmentSize');
  const clipsGrid = document.getElementById('clipsGrid');
  const downloadAllZipBtn = document.getElementById('downloadAllZipBtn');
  const downloadAllBtnText = document.getElementById('downloadAllBtnText');
  const zipLoadingSpinner = document.getElementById('zipLoadingSpinner');
  const processAnotherBtn = document.getElementById('processAnotherBtn');

  // Application State
  let currentFile = null;
  let currentYtData = null;
  let currentJobId = null;
  let statusPollTimer = null;
  let selectedDuration = 30; // default 30 seconds
  let isJobPaused = false;

  // Configurable API base URL (empty string for same-origin, or custom backend URL when hosted on Vercel/Render)
  const API_BASE = (window.CLIPFORGE_API_URL || localStorage.getItem('CLIPFORGE_API_URL') || '').replace(/\/$/, '');

  // Show backend connection banner only if deployed on Vercel without configured backend
  const backendConfigBanner = document.getElementById('backendConfigBanner');
  const backendUrlInput = document.getElementById('backendUrlInput');
  const saveBackendUrlBtn = document.getElementById('saveBackendUrlBtn');

  const isVercel = window.location.hostname.includes('vercel.app');
  if (isVercel && !API_BASE && backendConfigBanner) {
    backendConfigBanner.classList.remove('hidden');
  }

  if (saveBackendUrlBtn && backendUrlInput) {
    if (API_BASE) backendUrlInput.value = API_BASE;
    saveBackendUrlBtn.addEventListener('click', () => {
      const url = backendUrlInput.value.trim().replace(/\/$/, '');
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        localStorage.setItem('CLIPFORGE_API_URL', url);
        if (backendConfigBanner) backendConfigBanner.classList.add('hidden');
        showToast('Backend connected! Reloading...');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        alert('Please enter a valid backend URL (e.g. https://your-backend.onrender.com)');
      }
    });
  }

  // -------------------------------------------------------------
  // Cloud YouTube Authentication & Setup Modal
  // -------------------------------------------------------------
  const openCloudSettingsBtn = document.getElementById('openCloudSettingsBtn');
  const drawerCloudSetupBtn = document.getElementById('drawerCloudSetupBtn');
  const triggerCloudSetupLink = document.getElementById('triggerCloudSetupLink');
  const cloudSetupModal = document.getElementById('cloudSetupModal');
  const closeCloudSetupBtn = document.getElementById('closeCloudSetupBtn');
  const cloudCookieStatusText = document.getElementById('cloudCookieStatusText');
  const cloudCookieBadge = document.getElementById('cloudCookieBadge');
  const cookieDataInput = document.getElementById('cookieDataInput');
  const saveCloudCookiesBtn = document.getElementById('saveCloudCookiesBtn');
  const connectLocalEngineBtn = document.getElementById('connectLocalEngineBtn');

  function openCloudModal() {
    if (cloudSetupModal) {
      cloudSetupModal.classList.remove('hidden');
      checkCloudCookieStatus();
    }
  }

  function closeCloudModal() {
    if (cloudSetupModal) {
      cloudSetupModal.classList.add('hidden');
    }
  }

  async function checkCloudCookieStatus() {
    if (!cloudCookieStatusText || !cloudCookieBadge) return;
    cloudCookieStatusText.textContent = 'Checking cloud status...';
    try {
      const res = await fetch(`${API_BASE}/api/cookies/status`);
      const data = await res.json();
      if (data && data.hasCookies) {
        cloudCookieStatusText.textContent = `Active (${data.source || 'authenticated'})`;
        cloudCookieBadge.textContent = 'Active';
        cloudCookieBadge.className = 'badge-success';
      } else {
        cloudCookieStatusText.textContent = 'Not configured (Anonymous mode)';
        cloudCookieBadge.textContent = 'Unauthenticated';
        cloudCookieBadge.className = 'badge-warning';
      }
    } catch {
      cloudCookieStatusText.textContent = 'Unable to check status';
      cloudCookieBadge.textContent = 'Offline';
      cloudCookieBadge.className = 'badge-warning';
    }
  }

  if (openCloudSettingsBtn) openCloudSettingsBtn.addEventListener('click', openCloudModal);
  if (drawerCloudSetupBtn) {
    drawerCloudSetupBtn.addEventListener('click', () => {
      if (mobileDrawer) mobileDrawer.classList.remove('open');
      openCloudModal();
    });
  }
  if (triggerCloudSetupLink) triggerCloudSetupLink.addEventListener('click', openCloudModal);
  if (closeCloudSetupBtn) closeCloudSetupBtn.addEventListener('click', closeCloudModal);
  if (cloudSetupModal) {
    cloudSetupModal.addEventListener('click', (e) => {
      if (e.target === cloudSetupModal) closeCloudModal();
    });
  }

  if (saveCloudCookiesBtn && cookieDataInput) {
    saveCloudCookiesBtn.addEventListener('click', async () => {
      const cookies = cookieDataInput.value.trim();
      if (!cookies || cookies.length < 20) {
        alert('Please paste valid cookies.txt data from your browser.');
        return;
      }
      saveCloudCookiesBtn.disabled = true;
      saveCloudCookiesBtn.textContent = 'Saving...';
      try {
        const res = await fetch(`${API_BASE}/api/cookies/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cookies })
        });
        const data = await res.json();
        if (data && data.success) {
          showToast('YouTube cookies saved! Cloud downloads are now active.');
          cookieDataInput.value = '';
          checkCloudCookieStatus();
          setTimeout(closeCloudModal, 1500);
        } else {
          alert(data.error || 'Failed to save cookies.');
        }
      } catch (err) {
        alert(`Error saving cookies: ${err.message}`);
      } finally {
        saveCloudCookiesBtn.disabled = false;
        saveCloudCookiesBtn.textContent = 'Save Cookies to Cloud';
      }
    });
  }

  if (connectLocalEngineBtn) {
    connectLocalEngineBtn.addEventListener('click', () => {
      localStorage.setItem('CLIPFORGE_API_URL', 'http://localhost:3000');
      showToast('Switched to local engine! Reloading...');
      setTimeout(() => window.location.reload(), 1000);
    });
  }

  // -------------------------------------------------------------
  // 1. Mobile Menu Drawer Toggle
  // -------------------------------------------------------------
  if (mobileMenuBtn && mobileDrawer) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileDrawer.classList.toggle('open');
    });

    document.querySelectorAll('.mobile-nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        mobileDrawer.classList.remove('open');
      });
    });
  }

  // -------------------------------------------------------------
  // 2. Helper Utilities & Duration Selector
  // -------------------------------------------------------------
  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function getFileExtension(filename) {
    return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase();
  }

  // Setup duration buttons
  durationBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      durationBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDuration = parseInt(btn.dataset.duration, 10);
      if (customDurationInput) customDurationInput.value = '';
      updateCtaButtonState();
    });
  });

  if (customDurationInput) {
    customDurationInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (val >= 10 && val <= 180) {
        durationBtns.forEach((b) => b.classList.remove('active'));
        selectedDuration = val;
        updateCtaButtonState();
      }
    });
  }

  function updateCtaButtonState() {
    const isFileReady = !!currentFile;
    const isUrlReady = !!youtubeUrlInput.value.trim();
    const isOwnershipConfirmed = ownershipCheckbox ? ownershipCheckbox.checked : true;

    if (isFileReady) {
      if (generateBtnText) {
        generateBtnText.textContent = `Generate ${selectedDuration}s Clips from Video`;
      }
      generateClipsBtn.disabled = !isOwnershipConfirmed;
    } else if (isUrlReady) {
      if (generateBtnText) {
        generateBtnText.textContent = `Generate ${selectedDuration}s Clips from YouTube`;
      }
      generateClipsBtn.disabled = !isOwnershipConfirmed;
    } else {
      if (generateBtnText) {
        generateBtnText.textContent = `Generate ${selectedDuration}s Clips`;
      }
      generateClipsBtn.disabled = true;
    }
  }

  // -------------------------------------------------------------
  // 3. YouTube URL Fetcher & Validator
  // -------------------------------------------------------------
  async function fetchYouTubeMetadata() {
    const url = youtubeUrlInput.value.trim();
    if (!url) {
      showYtError('Please enter a YouTube video URL first.');
      return;
    }

    // Reset states
    hideYtError();
    fetchBtnText.textContent = 'Verifying...';
    fetchBtnSpinner.classList.remove('hidden');
    fetchYtBtn.disabled = true;

    try {
      const response = await fetch(`${API_BASE}/api/youtube/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to retrieve YouTube metadata.');
      }

      currentYtData = result.data;

      // Populate preview card
      ytThumbImg.src = currentYtData.thumbnail;
      ytDurationBadge.textContent = currentYtData.durationFormatted || 'Detected';
      ytChannel.textContent = currentYtData.channelTitle || 'YouTube Creator';
      ytTitle.textContent = currentYtData.title || 'YouTube Video';
      ytSourceNote.textContent = `Ready to download and cut into ${selectedDuration}s clips`;
      ytInfoCard.classList.remove('hidden');
      hideYtError();
      updateCtaButtonState();
    } catch (err) {
      currentYtData = null;
      ytInfoCard.classList.add('hidden');
      showYtError(err.message);
    } finally {
      fetchBtnText.textContent = 'Fetch Info';
      fetchBtnSpinner.classList.add('hidden');
      fetchYtBtn.disabled = false;
    }
  }

  function showYtError(msg) {
    ytErrorText.textContent = msg;
    ytErrorMsg.classList.remove('hidden');
  }

  function hideYtError() {
    ytErrorMsg.classList.add('hidden');
  }

  fetchYtBtn.addEventListener('click', fetchYouTubeMetadata);

  const removeYtBtn = document.getElementById('removeYtBtn');
  if (removeYtBtn) {
    removeYtBtn.addEventListener('click', () => {
      currentYtData = null;
      youtubeUrlInput.value = '';
      ytInfoCard.classList.add('hidden');
      hideYtError();
      updateCtaButtonState();
      showToast('YouTube video removed.');
    });
  }

  youtubeUrlInput.addEventListener('input', () => {
    updateCtaButtonState();
  });

  youtubeUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchYouTubeMetadata();
    }
  });

  // -------------------------------------------------------------
  // 4. File Drag & Drop Handling (Supports up to 1 GB)
  // -------------------------------------------------------------
  const allowedExtensions = ['mp4', 'mov', 'mkv', 'webm'];
  const MAX_UPLOAD_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GB (1024 MB)

  function handleFileSelection(file) {
    if (!file) return;

    const ext = getFileExtension(file.name);
    if (!allowedExtensions.includes(ext)) {
      alert(`Unsupported video format (.${ext}). Please select an MP4, MOV, MKV, or WebM video.`);
      return;
    }

    if (file.size > MAX_UPLOAD_LIMIT_BYTES) {
      alert(`The selected video (${formatBytes(file.size)}) exceeds the maximum upload limit of 1 GB (1024 MB). Please choose a video under 1 GB.`);
      return;
    }

    currentFile = file;

    // Update Dropzone UI
    selectedFileName.textContent = file.name;
    selectedFileSize.textContent = formatBytes(file.size);
    selectedFileExt.textContent = ext.toUpperCase();

    dropzoneEmpty.classList.add('hidden');
    dropzoneSelected.classList.remove('hidden');

    updateCtaButtonState();
    showToast('Video file selected.');
  }

  function clearSelectedFile() {
    currentFile = null;
    videoFileInput.value = '';
    dropzoneSelected.classList.add('hidden');
    dropzoneEmpty.classList.remove('hidden');
    updateCtaButtonState();
  }

  videoFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  });

  removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearSelectedFile();
    showToast('Uploaded video removed.');
  });

  if (ownershipCheckbox) {
    ownershipCheckbox.addEventListener('change', updateCtaButtonState);
  }

  // Drag and drop events
  ['dragenter', 'dragover'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  });

  // Initial CTA state setup
  updateCtaButtonState();

  // -------------------------------------------------------------
  // 5. Video Processing Workflow (Direct YouTube or File Upload)
  // -------------------------------------------------------------
  generateClipsBtn.addEventListener('click', startClippingWorkflow);

  function startClippingWorkflow() {
    const isFileMode = !!currentFile;
    const isUrlMode = !isFileMode && !!youtubeUrlInput.value.trim();

    if (!isFileMode && !isUrlMode) {
      alert('Please either paste a YouTube URL or upload a video file to proceed.');
      return;
    }

    if (ownershipCheckbox && !ownershipCheckbox.checked) {
      alert('Please check the confirmation box to verify ownership or authorization.');
      return;
    }

    // Switch step indicators
    step1Indicator.classList.remove('active');
    step2Indicator.classList.add('active');

    // Hide input form & show processing screen
    clipForm.classList.add('hidden');
    resultsDashboard.classList.add('hidden');
    processingSection.classList.remove('hidden');
    processingErrorBox.classList.add('hidden');

    // Reset pause state
    isJobPaused = false;
    if (pauseBtnText) pauseBtnText.textContent = 'Pause Processing';
    if (pauseIcon) pauseIcon.classList.remove('hidden');
    if (playIcon) playIcon.classList.add('hidden');

    // Mode A: File Upload Mode
    if (isFileMode) {
      if (step1TitleText) step1TitleText.textContent = '1. Upload Video';
      if (step3TitleText) step3TitleText.textContent = `3. Slice ${selectedDuration}s Clips`;

      updateProgressUI({
        title: 'Uploading Source Video',
        message: 'Securely uploading your video file to the server...',
        percent: 3,
        phase: 1,
        phaseName: 'Uploading',
        uploadDetail: 'Initiating upload stream...'
      });

      const formData = new FormData();
      formData.append('video', currentFile);
      formData.append('clipDuration', selectedDuration);

      if (currentYtData) {
        formData.append('youtubeUrl', currentYtData.url || '');
        formData.append('videoTitle', currentYtData.title || currentFile.name);
      } else {
        formData.append('videoTitle', currentFile.name);
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/videos/process`, true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          const scaledPercent = Math.min(25, Math.max(3, Math.round(percentComplete * 0.25)));
          const loadedFormatted = formatBytes(event.loaded);
          const totalFormatted = formatBytes(event.total);

          updateProgressUI({
            title: 'Uploading Source Video',
            message: `Transferred ${loadedFormatted} of ${totalFormatted} (${percentComplete}%)`,
            percent: scaledPercent,
            phase: 1,
            phaseName: 'Uploading',
            uploadDetail: `${loadedFormatted} / ${totalFormatted}`
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const resp = JSON.parse(xhr.responseText);
            if (resp.success && resp.jobId) {
              currentJobId = resp.jobId;
              stepUpload.classList.remove('active');
              stepUpload.classList.add('completed');
              stepAnalyze.classList.add('active');

              updateProgressUI({
                title: 'Analyzing Video Stream',
                message: 'Reading video metadata and duration with FFprobe...',
                percent: 30,
                phase: 2,
                phaseName: 'Inspecting with FFprobe',
                analyzeDetail: 'Inspecting codecs & duration'
              });

              pollJobStatus(currentJobId);
            } else {
              showProcessingError(resp.error || 'Failed to start video processing.');
            }
          } catch (e) {
            showProcessingError('Invalid server response during upload.');
          }
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            showProcessingError(errData.error || `Upload failed with status code ${xhr.status}.`);
          } catch {
            showProcessingError(`Upload failed with server status ${xhr.status}.`);
          }
        }
      };

      xhr.onerror = () => {
        showProcessingError('Network connection error occurred during upload.');
      };

      xhr.send(formData);
    } 
    // Mode B: Direct YouTube URL Processing
    else {
      const ytUrl = youtubeUrlInput.value.trim();
      if (step1TitleText) step1TitleText.textContent = '1. Fetch YouTube Stream';
      if (step3TitleText) step3TitleText.textContent = `3. Slice ${selectedDuration}s Clips`;

      updateProgressUI({
        title: 'Downloading YouTube Video',
        message: 'Connecting to YouTube and initiating video stream download...',
        percent: 6,
        phase: 1,
        phaseName: 'Downloading from YouTube',
        uploadDetail: 'Connecting stream...'
      });

      fetch(`${API_BASE}/api/videos/process-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: ytUrl,
          clipDuration: selectedDuration
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.jobId) {
          currentJobId = data.jobId;
          pollJobStatus(currentJobId);
        } else {
          showProcessingError(data.error || 'Failed to start YouTube clipping process.');
        }
      })
      .catch(err => {
        showProcessingError(err.message || 'Network error communicating with server.');
      });
    }
  }

  function updateProgressUI({ title, message, percent, phase, phaseName, uploadDetail: upDet, analyzeDetail: anDet, sliceDetail: slDet }) {
    if (title) processingTitle.textContent = title;
    if (message) processingMsg.textContent = message;

    const clamped = Math.max(0, Math.min(100, percent || 0));
    progressBarFill.style.width = `${clamped}%`;
    progressPercentText.textContent = `${clamped}%`;

    if (phase && phaseName) {
      progressStepText.textContent = `Phase ${phase}/3: ${phaseName}`;
    }

    if (upDet) uploadDetail.textContent = upDet;
    if (anDet) analyzeDetail.textContent = anDet;
    if (slDet) sliceDetail.textContent = slDet;
  }

  function pollJobStatus(jobId) {
    if (statusPollTimer) clearInterval(statusPollTimer);

    statusPollTimer = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/videos/status/${jobId}`);
        if (!response.ok) {
          throw new Error(`Status check returned HTTP ${response.status}`);
        }

        const res = await response.json();
        if (!res.success || !res.data) return;

        const data = res.data;

        if (data.status === 'paused') {
          isJobPaused = true;
          if (pauseBtnText) pauseBtnText.textContent = 'Resume Processing';
          if (pauseIcon) pauseIcon.classList.add('hidden');
          if (playIcon) playIcon.classList.remove('hidden');
          processingTitle.textContent = 'Processing Paused';
          processingMsg.textContent = data.message || 'Processing is paused. Click Resume to continue or Stop & View Clips.';
          return;
        } else if (data.status === 'downloading') {
          updateProgressUI({
            title: 'Downloading Video from YouTube',
            message: data.message || 'Downloading video stream from YouTube...',
            percent: data.percent || 15,
            phase: 1,
            phaseName: 'Downloading from YouTube',
            uploadDetail: data.message || 'Downloading...'
          });
        } else if (data.status === 'processing') {
          stepUpload.classList.remove('active');
          stepUpload.classList.add('completed');
          stepAnalyze.classList.remove('active');
          stepAnalyze.classList.add('completed');
          stepSlice.classList.add('active');

          const progressPercent = Math.max(40, data.percent || 40);
          const clipInfo = data.totalClips ? `Clip ${data.currentClip || 1} of ${data.totalClips}` : 'Segmenting video';

          updateProgressUI({
            title: `Dividing into ${data.clipDuration || selectedDuration}s Clips`,
            message: data.message || 'Processing video clips with FFmpeg...',
            percent: progressPercent,
            phase: 3,
            phaseName: `Cutting ${data.clipDuration || selectedDuration}-Second Clips`,
            sliceDetail: clipInfo
          });
        } else if (data.status === 'completed') {
          clearInterval(statusPollTimer);
          statusPollTimer = null;

          stepSlice.classList.remove('active');
          stepSlice.classList.add('completed');

          updateProgressUI({
            title: 'Processing Complete!',
            message: 'All clips generated successfully. Opening your dashboard...',
            percent: 100,
            phase: 3,
            phaseName: 'Complete',
            sliceDetail: 'All clips ready'
          });

          setTimeout(() => {
            showResultsDashboard(data);
          }, 800);
        } else if (data.status === 'failed') {
          clearInterval(statusPollTimer);
          statusPollTimer = null;
          showProcessingError(data.error || 'Video processing failed.');
        }
      } catch (err) {
        console.warn('[Status Poll Error]', err.message);
      }
    }, 1200);
  }

  function showProcessingError(msg) {
    if (statusPollTimer) clearInterval(statusPollTimer);
    statusPollTimer = null;

    processingErrorMsg.textContent = msg;
    processingErrorBox.classList.remove('hidden');
    processingTitle.textContent = 'Processing Stopped';
    processingMsg.textContent = 'An issue occurred during video processing.';
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      processingSection.classList.add('hidden');
      clipForm.classList.remove('hidden');
      step2Indicator.classList.remove('active');
      step1Indicator.classList.add('active');
    });
  }

  // Pause / Resume Processing Listener
  if (pauseResumeBtn) {
    pauseResumeBtn.addEventListener('click', async () => {
      if (!currentJobId) return;

      if (!isJobPaused) {
        // Trigger Pause
        try {
          await fetch(`${API_BASE}/api/videos/pause/${currentJobId}`, { method: 'POST' });
          isJobPaused = true;
          pauseBtnText.textContent = 'Resume Processing';
          pauseIcon.classList.add('hidden');
          playIcon.classList.remove('hidden');
          processingTitle.textContent = 'Processing Paused';
          processingMsg.textContent = 'Paused by user. Click Resume to continue or Stop & View Clips.';
          showToast('⏸️ Processing Paused');
        } catch (e) {
          console.warn('Failed to pause job:', e);
        }
      } else {
        // Trigger Resume
        try {
          await fetch(`${API_BASE}/api/videos/resume/${currentJobId}`, { method: 'POST' });
          isJobPaused = false;
          pauseBtnText.textContent = 'Pause Processing';
          pauseIcon.classList.remove('hidden');
          playIcon.classList.add('hidden');
          processingTitle.textContent = 'Processing Video';
          showToast('▶️ Processing Resumed');
        } catch (e) {
          console.warn('Failed to resume job:', e);
        }
      }
    });
  }

  // Stop & View Clips Early Listener
  if (stopFinishBtn) {
    stopFinishBtn.addEventListener('click', async () => {
      if (!currentJobId) {
        processingSection.classList.add('hidden');
        clipForm.classList.remove('hidden');
        return;
      }

      stopFinishBtn.disabled = true;
      try {
        await fetch(`${API_BASE}/api/videos/cancel/${currentJobId}`, { method: 'POST' });
        // Check if any clips were generated
        const resp = await fetch(`${API_BASE}/api/videos/status/${currentJobId}`);
        const data = await resp.json();
        
        if (data.success && data.data && data.data.clips && data.data.clips.length > 0) {
          clearInterval(statusPollTimer);
          statusPollTimer = null;
          showResultsDashboard(data.data);
          showToast(`Loaded ${data.data.clips.length} clip(s) generated so far!`);
        } else {
          clearInterval(statusPollTimer);
          statusPollTimer = null;
          processingSection.classList.add('hidden');
          clipForm.classList.remove('hidden');
          step2Indicator.classList.remove('active');
          step1Indicator.classList.add('active');
          showToast('Processing stopped.');
        }
      } catch (e) {
        console.warn('Failed to stop job:', e);
      } finally {
        stopFinishBtn.disabled = false;
      }
    });
  }

  // Cancel & Remove Video during processing
  const cancelRemoveBtn = document.getElementById('cancelRemoveBtn');
  if (cancelRemoveBtn) {
    cancelRemoveBtn.addEventListener('click', async () => {
      const confirmed = confirm('Cancel processing and remove this video?');
      if (!confirmed) return;

      const jobIdToDelete = currentJobId;
      resetAllToStep1();

      if (jobIdToDelete) {
        try {
          await fetch(`${API_BASE}/api/videos/delete/${jobIdToDelete}`, { method: 'POST' });
        } catch (e) {
          console.warn('Failed to delete video job:', e);
        }
      }

      showToast('Processing cancelled and video removed.');
    });
  }

  // -------------------------------------------------------------
  // 6. Results Dashboard & Clip Cards Rendering
  // -------------------------------------------------------------
  function showResultsDashboard(jobData) {
    processingSection.classList.add('hidden');
    resultsDashboard.classList.remove('hidden');

    step2Indicator.classList.remove('active');
    step3Indicator.classList.add('active');

    // Set Top Banner Details
    const thumbUrl = jobData.videoThumbnail || currentYtData?.thumbnail || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 160 90%22><rect width=%22160%22 height=%2290%22 fill=%22%23111827%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%236366f1%22 font-size=%2214%22>ClipForge</text></svg>';
    resultThumbImg.src = thumbUrl;

    resultVideoTitle.textContent = jobData.videoTitle || currentFile?.name || 'Processed Video';
    resultTotalDuration.textContent = jobData.totalDurationFormatted || '--:--';
    resultClipsCountBadge.textContent = `${jobData.clipsCount || (jobData.clips ? jobData.clips.length : 0)} Clips Generated`;
    if (resultSegmentSize) {
      resultSegmentSize.textContent = `${jobData.clipDuration || selectedDuration}s`;
    }

    // Render Clip Cards
    renderClipsGrid(jobData.clips || []);

    // Scroll smoothly to results
    resultsDashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderClipsGrid(clips) {
    clipsGrid.innerHTML = '';

    if (!clips || clips.length === 0) {
      clipsGrid.innerHTML = `
        <div class="col-span-full text-center py-8">
          <p class="text-secondary">No clips were generated for this video.</p>
        </div>
      `;
      return;
    }

    clips.forEach((clip) => {
      const card = document.createElement('div');
      card.className = 'clip-card';

      // Safe clip URLs
      const streamUrl = (clip.relativeUrl.startsWith('http') ? '' : API_BASE) + clip.relativeUrl;
      const downloadUrl = `${streamUrl}?download=1`;

      card.innerHTML = `
        <div class="clip-card-header">
          <div class="clip-title-group">
            <span class="clip-number">${escapeHtml(clip.clipLabel)}</span>
            <span class="clip-timestamp-badge">${escapeHtml(clip.startFormatted)} – ${escapeHtml(clip.endFormatted)}</span>
          </div>
          <span class="badge-1080p">1080p HD</span>
        </div>

        <div class="clip-player-wrapper">
          <video
            class="clip-video"
            controls
            preload="metadata"
            playsinline
          >
            <source src="${streamUrl}" type="video/mp4">
            Your browser does not support HTML5 video preview.
          </video>
        </div>

        <div class="clip-card-body">
          <div class="clip-meta-row">
            <span class="social-ready-tag">
              <svg viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
                <path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/>
              </svg>
              Social Ready (${escapeHtml(clip.durationFormatted)})
            </span>
            <span>${escapeHtml(clip.sizeFormatted || '')}</span>
          </div>

          <div class="clip-card-actions">
            <button
              type="button"
              class="save-gallery-btn"
              data-url="${streamUrl}"
              data-filename="${escapeHtml(clip.fileName)}"
              title="Save directly to Device Photos / Gallery"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5">
                <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
              </svg>
              <span>Save to Photos</span>
            </button>

            <a
              href="${downloadUrl}"
              download="${escapeHtml(clip.fileName)}"
              class="clip-download-btn"
              title="Download MP4 to Files"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Download MP4</span>
            </a>
          </div>
        </div>
      `;

      // Attach event listener for saving directly to photo gallery / camera roll
      const galleryBtn = card.querySelector('.save-gallery-btn');
      if (galleryBtn) {
        galleryBtn.addEventListener('click', () => {
          saveClipToGallery(streamUrl, clip.fileName, galleryBtn);
        });
      }

      clipsGrid.appendChild(card);
    });
  }

  /**
   * Saves video clip directly to device Camera Roll / Photo Gallery (mobile)
   * or downloads directly to Files / Downloads folder.
   */
  async function saveClipToGallery(videoUrl, fileName, btn) {
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-sm"></span> <span>Saving...</span>`;

    try {
      // Fetch the clip blob
      const resp = await fetch(videoUrl);
      if (!resp.ok) throw new Error('Failed to fetch clip data');
      const blob = await resp.blob();
      const file = new File([blob], fileName, { type: 'video/mp4' });

      // If mobile device supports Web Share API with files, this opens native
      // "Save Video" (Camera Roll/Gallery) and "Save to Files" dialog!
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: fileName,
          text: `ClipForge 1080p Clip: ${fileName}`
        });
        showToast(`Saved to Gallery / Photos!`);
      } else {
        // Desktop / Fallback: trigger direct file download
        const a = document.createElement('a');
        a.href = `${videoUrl}?download=1`;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast(`Saved ${fileName} to Downloads / Files!`);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        // Fallback file download if sharing was dismissed or blocked
        const a = document.createElement('a');
        a.href = `${videoUrl}?download=1`;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast(`Downloaded to Files!`);
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  function showToast(msg) {
    const toast = document.getElementById('toastNotification');
    const toastMsg = document.getElementById('toastMsg');
    if (!toast) return;
    if (toastMsg) toastMsg.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // -------------------------------------------------------------
  // 7. Download All Clips as ZIP
  // -------------------------------------------------------------
  if (downloadAllZipBtn) {
    downloadAllZipBtn.addEventListener('click', async () => {
      if (!currentJobId) return;

      downloadAllBtnText.textContent = 'Preparing ZIP Archive...';
      zipLoadingSpinner.classList.remove('hidden');
      downloadAllZipBtn.disabled = true;

      try {
        const downloadUrl = `${API_BASE}/api/videos/download-all/${currentJobId}`;
        const tempAnchor = document.createElement('a');
        tempAnchor.href = downloadUrl;
        tempAnchor.setAttribute('download', `ClipForge_All_Clips_${currentJobId.slice(0, 8)}.zip`);
        document.body.appendChild(tempAnchor);
        tempAnchor.click();
        document.body.removeChild(tempAnchor);
      } catch (err) {
        alert('Failed to initiate ZIP download: ' + err.message);
      } finally {
        setTimeout(() => {
          downloadAllBtnText.textContent = 'Download All Clips (.ZIP)';
          zipLoadingSpinner.classList.add('hidden');
          downloadAllZipBtn.disabled = false;
        }, 2000);
      }
    });
  }

  // -------------------------------------------------------------
  // 8. Process Another Video / Reset State Helper
  // -------------------------------------------------------------
  function resetAllToStep1() {
    // Stop all playing videos
    document.querySelectorAll('.clip-video').forEach((v) => v.pause());

    if (statusPollTimer) {
      clearInterval(statusPollTimer);
      statusPollTimer = null;
    }

    step3Indicator.classList.remove('active');
    step2Indicator.classList.remove('active');
    step1Indicator.classList.add('active');

    resultsDashboard.classList.add('hidden');
    processingSection.classList.add('hidden');
    clipForm.classList.remove('hidden');

    clearSelectedFile();
    youtubeUrlInput.value = '';
    currentYtData = null;
    currentJobId = null;
    ytInfoCard.classList.add('hidden');
    hideYtError();
    updateCtaButtonState();

    document.getElementById('workspace').scrollIntoView({ behavior: 'smooth' });
  }

  if (processAnotherBtn) {
    processAnotherBtn.addEventListener('click', () => {
      resetAllToStep1();
    });
  }

  // Remove Uploaded Video and Discard Clips
  const removeDashboardVideoBtn = document.getElementById('removeDashboardVideoBtn');
  if (removeDashboardVideoBtn) {
    removeDashboardVideoBtn.addEventListener('click', async () => {
      const confirmed = confirm('Are you sure you want to remove this video and delete all generated clips? This will discard them completely.');
      if (!confirmed) return;

      const jobIdToDelete = currentJobId;
      resetAllToStep1();

      if (jobIdToDelete) {
        try {
          await fetch(`${API_BASE}/api/videos/delete/${jobIdToDelete}`, { method: 'POST' });
        } catch (e) {
          console.warn('Failed to delete video job:', e);
        }
      }

      showToast('Uploaded video and all clips have been removed.');
    });
  }

  // -------------------------------------------------------------
  // 9. FAQ Accordion Toggle
  // -------------------------------------------------------------
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach((item) => {
    const questionBtn = item.querySelector('.faq-question');
    if (questionBtn) {
      questionBtn.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        faqItems.forEach((other) => {
          if (other !== item) other.classList.remove('open');
        });
        item.classList.toggle('open', !isOpen);
      });
    }
  });
});

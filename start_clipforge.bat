@echo off
cd /d "%~dp0"
title ClipForge - Local 1080p Video Clipper
echo ====================================================
echo   🚀 Starting ClipForge Local Server...
echo   No YouTube bot blocks - Ultra-fast 1080p clipping!
echo ====================================================
start "" "http://localhost:3000"
node backend/server.js
pause


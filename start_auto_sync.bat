@echo off
title ClipForge - Auto Git Sync Watcher
echo ====================================================
echo   ClipForge Auto-Git-Push Active
echo   Watching for file changes...
echo   Any time you save a file, it will auto-push to GitHub!
echo ====================================================
node scripts/auto_git_sync.js
pause

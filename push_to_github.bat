@echo off
cd /d "%~dp0"
title ClipForge - Push to GitHub
echo ====================================================
echo   ClipForge v1.2.7 - Push to GitHub and Deploy
echo ====================================================
echo.
git add .
git commit -m "feat(core): resilient client rotation (android, visionos) for YouTube downloads without bot blocks"
echo.
echo Pushing commits to GitHub...
git push origin main
echo.
if %ERRORLEVEL% equ 0 (
    echo ====================================================
    echo   SUCCESS! Pushed to GitHub.
    echo   Render and Vercel will build version 1.2.7 now.
    echo ====================================================
) else (
    echo ====================================================
    echo   Git push encountered an issue.
    echo ====================================================
)
echo.
pause


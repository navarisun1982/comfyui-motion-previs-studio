@echo off
setlocal
cd /d "%~dp0"
title ComfyUI Motion Previs Studio - Desktop

echo [ComfyUI Motion Previs Studio] Building production bundle...
call npm run build
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed. Not launching a stale bundle - fix the errors above first.
    pause
    exit /b 1
)

:: Launch Electron desktop application detached
if exist "%~dp0node_modules\electron\dist\electron.exe" (
    start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
    exit /b 0
)

start "" npx electron .
exit /b 0

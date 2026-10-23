@echo off
setlocal
cd /d "%~dp0"
title ComfyUI Motion Previs Studio

echo =====================================================================
echo              COMFYUI MOTION PREVIS STUDIO - LAUNCHER
echo               "Direct the Shot, Not the Prompt"
echo =====================================================================
echo.

:: 1. Verify Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not found in system PATH.
    echo Please install Node.js v18 or newer from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js detected:
node -v
echo.

:: 2. Check if node_modules exists, install if missing
if not exist "node_modules\" (
    echo [INFO] Dependencies not found. Running npm install...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)

:: 3. Check ComfyUI server status on port 8188 via native curl
curl -s --connect-timeout 2 http://127.0.0.1:8188/system_stats >nul 2>nul
if errorlevel 1 (
    echo [NOTICE] ComfyUI server is offline on port 8188.
    echo          You can still block shots and render previs; start ComfyUI
    echo          before generating video.
) else (
    echo [OK] Local ComfyUI server detected online on http://127.0.0.1:8188
)

echo.
echo =====================================================================
echo Launching ComfyUI Motion Previs Studio at http://127.0.0.1:5173
echo Press Ctrl+C in this terminal window to stop the studio.
echo =====================================================================
echo.

:: 4. Automatically open browser after 2 seconds in background
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:5173"

:: 5. Start the Vite dev server
call npm run dev

pause

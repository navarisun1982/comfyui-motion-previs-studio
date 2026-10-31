@echo off
chcp 65001 >nul 2>nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title ComfyUI Motion Previs Studio — Direct the Shot, Not the Prompt

:: ---------------------------------------------------------------------------
:: 1. Apply our official 3D Node-Cube icon (Assets\logo.ico) to this console
::    window AND ensure the Desktop + Folder shortcuts carry Assets\logo.ico
:: ---------------------------------------------------------------------------
if exist "%~dp0scripts\setup-launcher-icon.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-launcher-icon.ps1" >nul 2>nul
)

:: ---------------------------------------------------------------------------
:: 2. Render the official 3D Node-Cube Logo & Studio Header in the terminal
:: ---------------------------------------------------------------------------
echo.
echo    [38;2;168;85;247m            .▄▄████▄▄.             [0m
echo    [38;2;168;85;247m         ▄██████████████▄          [0m   [1;97mComfy [38;2;232;121;249mUI [0m  [1;97mMotion Previs Studio [0m
echo    [38;2;192;132;252m       ╭──▀████████████▀──╮        [0m   [38;2;192;132;252mPrevisualize 3D Scenes for AI Filmmaking [0m
echo    [38;2;192;132;252m      │     ▄████████▄     │       [0m   [90m──────────────────────────────────────────── [0m
echo    [38;2;217;70;239m  ███─╯   ▄████████████▄   ╰─███   [0m   [38;2;240;174;66m"Direct the Shot, Not the Prompt" [0m
echo    [38;2;217;70;239m        ██▌ ████████████ ▄██       [0m   [90m• Local 3D Stage • 24fps MP4 ^& ControlNet [0m
echo    [38;2;236;72;153m        ◥██████████████████◤       [0m   [90m• LTX-2.5 • MiniMax H3 • Seedance • Vision 3D [0m
echo    [38;2;236;72;153m           ▀████████████▀          [0m
echo.

:: ---------------------------------------------------------------------------
:: 3. Verify Node.js is installed
:: ---------------------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not found in system PATH.
    echo Please install Node.js v20 LTS or newer from https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node.js detected: %NODE_VER%

:: ---------------------------------------------------------------------------
:: 4. Check if node_modules exists, install automatically on first run
:: ---------------------------------------------------------------------------
if not exist "node_modules\" (
    echo [INFO] First-time setup: installing dependencies ^(npm install^)...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)

:: ---------------------------------------------------------------------------
:: 5. Check ComfyUI server status on port 8188 via native curl
:: ---------------------------------------------------------------------------
curl -s --connect-timeout 2 http://127.0.0.1:8188/system_stats >nul 2>nul
if errorlevel 1 (
    echo [NOTICE] ComfyUI server is offline on port 8188.
    echo          You can still block shots, sculpt 3D assets, and export previs MP4s.
) else (
    echo [OK] Local ComfyUI server detected online on http://127.0.0.1:8188
)

echo [OK] Branded shortcut with studio logo ready on Desktop ^& project folder.
echo.

:: ---------------------------------------------------------------------------
:: 6. Launch Mode: pass "--desktop" for Electron Desktop window, or default
::    to Browser Studio at http://127.0.0.1:5173
:: ---------------------------------------------------------------------------
if /I "%~1"=="--desktop" goto :LAUNCH_ELECTRON

echo =====================================================================
echo  Starting ComfyUI Motion Previs Studio at http://127.0.0.1:5173
echo  ^(Tip: Run "run.bat" or "start_studio.bat --desktop" for Desktop Window^)
echo  Press Ctrl+C in this window to stop the studio server.
echo =====================================================================
echo.

:: Automatically open browser once Vite server is listening
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:5173"

call npm run dev
pause
exit /b 0

:LAUNCH_ELECTRON
echo =====================================================================
echo  Building ^& Launching ComfyUI Motion Previs Studio Desktop App...
echo =====================================================================
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed. Fix the errors above first.
    pause
    exit /b 1
)
set "ELECTRON_RUN_AS_NODE="
if exist "%~dp0node_modules\electron\dist\electron.exe" (
    start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
    exit /b 0
)
start "" npx electron .
exit /b 0

@echo off
chcp 65001 >nul 2>nul
setlocal
cd /d "%~dp0"
title ComfyUI Motion Previs Studio - Desktop

:: Apply our official 3D Node-Cube icon (Assets\logo.ico) to the console window
:: and ensure the Desktop & Folder shortcuts carry Assets\logo.ico
if exist "%~dp0scripts\setup-launcher-icon.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-launcher-icon.ps1" >nul 2>nul
)

if not exist "node_modules\" (
    echo [ComfyUI Motion Previs Studio] First-time setup: running npm install...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)

echo [ComfyUI Motion Previs Studio] Building production bundle...
call npm run build
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed. Not launching a stale bundle - fix the errors above first.
    pause
    exit /b 1
)

:: Launch Electron desktop application detached
set "ELECTRON_RUN_AS_NODE="
if exist "%~dp0node_modules\electron\dist\electron.exe" (
    start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
    exit /b 0
)

start "" npx electron .
exit /b 0

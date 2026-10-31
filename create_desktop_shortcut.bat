@echo off
setlocal
cd /d "%~dp0"
title Create ComfyUI Motion Previs Studio Shortcut

if not exist "%~dp0scripts\setup-launcher-icon.ps1" (
    echo [ERROR] scripts\setup-launcher-icon.ps1 not found.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-launcher-icon.ps1" -PrintStatus
echo.
pause

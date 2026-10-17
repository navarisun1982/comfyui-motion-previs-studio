@echo off
cd /d "%~dp0"

:: If production build is missing, build it
if not exist "%~dp0dist\index.html" (
    echo [AI Director Studio] Preparing production desktop bundle...
    call npm run build
)

:: Launch Electron desktop application detached with no lingering CMD window
if exist "%~dp0node_modules\electron\dist\electron.exe" (
    start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
    exit /b 0
)

start "" npx electron .
exit /b 0

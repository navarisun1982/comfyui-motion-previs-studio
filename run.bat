@echo off
cd /d "%~dp0"

echo [AI Director Studio] Preparing fresh production bundle...
call npm run build

:: Launch Electron desktop application detached
if exist "%~dp0node_modules\electron\dist\electron.exe" (
    start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
    exit /b 0
)

start "" npx electron .
exit /b 0


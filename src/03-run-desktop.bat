@echo off
setlocal

cd /d "%~dp0"

if not exist "src-tauri\target\release\app.exe" (
    echo [Vela Watch Face Editor] Desktop release binary not found.
    echo Please run 02-build-desktop.bat first to compile, or run 01-dev-web.bat for development.
    echo.
    pause
    exit /b 1
)

echo [Vela Watch Face Editor] Starting desktop app...
start "" "src-tauri\target\release\app.exe"
exit /b 0

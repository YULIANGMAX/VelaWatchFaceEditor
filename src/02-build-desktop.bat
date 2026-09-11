@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules\" (
    echo [Vela Watch Face Editor] Installing dependencies...
    call npm ci
    if errorlevel 1 goto :error
)

echo [Vela Watch Face Editor] Building desktop release with Tauri...
call npm run tauri:build
if errorlevel 1 goto :error

echo.
echo [Vela Watch Face Editor] Build succeeded! Standalone executable: src-tauri\target\release\app.exe
pause
exit /b 0

:error
echo.
echo [Vela Watch Face Editor] Build failed. See the error above.
pause
exit /b 1

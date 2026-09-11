@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules\" (
    echo [Vela Watch Face Editor] Installing dependencies...
    call npm ci
    if errorlevel 1 goto :error
)

echo [Vela Watch Face Editor] Starting development server...
call npm run dev
if errorlevel 1 goto :error

exit /b 0

:error
echo.
echo [Vela Watch Face Editor] Startup failed. See the error above.
pause
exit /b 1

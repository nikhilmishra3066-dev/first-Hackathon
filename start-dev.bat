@echo off
REM Starts the SafeHer dev server using the bundled Node 22 in .tools
REM (your system Node may be a different version, which this project rejects).
setlocal
cd /d "%~dp0"
set "PATH=%~dp0.tools\node-v22.23.3-win-x64;%PATH%"
echo.
echo   SafeHer dev server starting...
echo   Home:      http://127.0.0.1:5173/
echo   Live demo: http://127.0.0.1:5173/live-demo
echo   (Press Ctrl+C in this window to stop it.)
echo.
call npm run dev
endlocal

@echo off
setlocal
set "REPO=%~dp0..\.."
set "NODE=%LOCALAPPDATA%\VIEWS-Staging\tools\node-v22.23.3-win-x64\node.exe"
"%NODE%" "%REPO%\apps\api\ops\windows-local-rehearsal.cjs" verify >nul 2>&1
if errorlevel 1 (
  "%NODE%" "%REPO%\apps\api\ops\windows-local-rehearsal.cjs" start
  if errorlevel 1 exit /b 1
)
"%NODE%" "%REPO%\apps\api\ops\local-web-launch.cjs" start
if errorlevel 1 exit /b 1
start "" "http://127.0.0.1:4173/?api=demo"
echo VIEWS local review and Core are ready. Production payments are disabled.

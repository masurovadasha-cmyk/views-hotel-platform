@echo off
setlocal
set "REPO=%~dp0..\.."
set "NODE=%LOCALAPPDATA%\VIEWS-Staging\tools\node-v22.23.3-win-x64\node.exe"
"%NODE%" "%REPO%\apps\api\ops\local-web-launch.cjs" stop
if errorlevel 1 exit /b 1
"%NODE%" "%REPO%\apps\api\ops\windows-local-rehearsal.cjs" stop
if errorlevel 1 exit /b 1
echo VIEWS local processes stopped. Local database files and backups were retained.

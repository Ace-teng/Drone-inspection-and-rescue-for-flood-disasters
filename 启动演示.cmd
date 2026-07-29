@echo off
setlocal
cd /d "%~dp0"

if not exist ".env.local" (
  echo APP_KEY is not configured on this computer.
  set /p BAILIAN_APP_KEY=Paste BAILIAN_APP_KEY and press Enter:
)

call npm run demo
pause

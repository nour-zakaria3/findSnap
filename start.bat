@echo off
chcp 65001 >nul
title SnapFind
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed. Install the LTS version from https://nodejs.org/ and run this file again.
  echo Node.js غير مثبت. ثبّت نسخة LTS من https://nodejs.org/ ثم شغّل هذا الملف مرة أخرى.
  start https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies, first run only...
  call npm install || (pause & exit /b 1)
)
echo Building SnapFind...
call npm run build || (pause & exit /b 1)
echo.
echo SnapFind is running at http://localhost:4173/  - keep this window open. Close it to stop.
echo SnapFind يعمل على http://localhost:4173/  - أبقِ هذه النافذة مفتوحة.
start "" http://localhost:4173/
call npx vite preview --port 4173 --strictPort
pause

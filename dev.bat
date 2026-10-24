@echo off
title BK MOT Centre - Live Dev Server
echo ===================================================
echo   Starting BK MOT Centre Local Live Server...
echo   Url: http://localhost:3000
echo   Live Reload is Active (Edits will auto-refresh)
echo ===================================================
npx live-server --port=3000 --open=index.html
pause

@echo off
title Polka Dot Order Bot
echo ========================================
echo   Polka Dot - Telegram Order Bot
echo   Сервер запущен на http://localhost:3001
echo   Нажмите Ctrl+C для остановки
echo ========================================
echo.
cd /d "%~dp0"
node server.js
pause

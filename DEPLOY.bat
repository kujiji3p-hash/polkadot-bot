@echo off
echo ========================================
echo   Polka Dot - Deploy Bot Server
echo ========================================
echo.
echo Шаг 1: Установка зависимостей...
cd /d "%~dp0"
call npm install
echo.
echo Шаг 2: Запуск сервера...
echo Сервер запущен на http://localhost:3001
echo Нажмите Ctrl+C для остановки
echo.
node server.js
pause

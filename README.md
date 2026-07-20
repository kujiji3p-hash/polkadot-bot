# Polka Dot - Telegram Bot Server

## Быстрый старт

1. Дважды кликните на `start.bat`
2. Сервер запустится на `http://localhost:3001`
3. Заказы с сайта будут приходить в Telegram

## Тестирование

Откройте в браузере:
```
http://localhost:3001/api/health
```

## Деплой для работы 24/7

### Вариант 1: Railway.app (рекомендую)
1. Зарегистрируйтесь на railway.app
2. Нажмите "New Project" → "Deploy from GitHub repo"
3. Загрузите папку `bot/` на GitHub
4. Railway автоматически задеплоит сервер
5. Скопируйте URL и вставьте в `script.js` на сайте

### Вариант 2: Render.com
1. Зарегистрируйтесь на render.com
2. Создайте "New Web Service"
3. Подключите GitHub репозиторий
4. Build Command: `npm install`
5. Start Command: `node server.js`
6. Выберите бесплатный план

### Вариант 3: Vercel
1. Установите: `npm i -g vercel`
2. В папке `bot/` выполните: `vercel`
3. Следуйте инструкциям

## После деплоя

Обновите URL в файле `script.js` на сайте:
```javascript
const BOT_SERVER = 'https://ваш-сервер.onrender.com';
```

## Контакты
- Telegram Bot: @polkadot_beauty_bot
- Chat ID: 814292031

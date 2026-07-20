const http = require('http');
const https = require('https');

// =====================
// НАСТРОЙКИ
// =====================
// 1. Создайте бота через @BotFather в Telegram
// 2. Скопируйте токен сюда:
const BOT_TOKEN = '8604437652:AAF55ZfXKx4U_PmRyo1Ad4JIO_mZch27ElY';

// 3. Узнайте ваш chat_id:
//    - Напишите боту /start
//    - Перейдите: https://api.telegram.org/bot<TOKEN>/getUpdates
//    - Найдите "chat":{"id": ЧИСЛО}
const CHAT_ID = '814292031';

const PORT = 3001;

// =====================
// ОТПРАВКА В TELEGRAM
// =====================
function sendToTelegram(message) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch(e) {
                    resolve(body);
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// =====================
// ФОРМАТИРОВАНИЕ СООБЩЕНИЙ
// =====================
function formatOrder(data) {
    return `
<b>🛒 НОВЫЙ ЗАКАЗ</b>

<b>Имя:</b> ${data.name || 'Не указано'}
<b>Email:</b> ${data.email || 'Не указано'}
<b>Телефон:</b> ${data.phone || 'Не указано'}
<b>Товар:</b> ${data.product || 'Не указано'}
<b>Количество:</b> ${data.quantity || '1'}
<b>Комментарий:</b> ${data.message || 'Нет'}

<b>Дата:</b> ${new Date().toLocaleString('ru-RU')}
`.trim();
}

function formatQuestion(data) {
    return `
<b>❓ НОВЫЙ ВОПРОС</b>

<b>Имя:</b> ${data.name || 'Не указано'}
<b>Email:</b> ${data.email || 'Не указано'}
<b>Тема:</b> ${data.topic || 'Не указана'}
<b>Вопрос:</b> ${data.message || 'Нет'}

<b>Дата:</b> ${new Date().toLocaleString('ru-RU')}
`.trim();
}

// =====================
// HTTP СЕРВЕР
// =====================
const server = http.createServer(async (req, res) => {
    // CORS заголовки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Приём заказов
    if (req.method === 'POST' && req.url === '/api/order') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const message = formatOrder(data);
                const result = await sendToTelegram(message);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, result }));
                console.log(`[ORDER] ${data.name} - ${data.product}`);
            } catch(e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
                console.error('[ORDER ERROR]', e);
            }
        });
        return;
    }

    // Приём вопросов
    if (req.method === 'POST' && req.url === '/api/question') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const message = formatQuestion(data);
                const result = await sendToTelegram(message);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, result }));
                console.log(`[QUESTION] ${data.name} - ${data.topic}`);
            } catch(e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
                console.error('[QUESTION ERROR]', e);
            }
        });
        return;
    }

    // Health check
    if (req.method === 'GET' && req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════╗
║   Polka Dot Order Bot Server            ║
║   Running on http://localhost:${PORT}     ║
╠══════════════════════════════════════════╣
║   Endpoints:                            ║
║   POST /api/order   - Новый заказ       ║
║   POST /api/question - Новый вопрос     ║
║   GET  /api/health  - Проверка          ║
╚══════════════════════════════════════════╝
    `);

    if (BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
        console.log('⚠️  ВНИМАНИЕ: Установите BOT_TOKEN и CHAT_ID в файле server.js');
        console.log('');
        console.log('Инструкция:');
        console.log('1. Откройте Telegram, найдите @BotFather');
        console.log('2. Отправьте /newbot');
        console.log('3. Введите имя бота (например: PolkaDot Orders)');
        console.log('4. Введите username (например: polkadot_orders_bot)');
        console.log('5. Скопируйте токен и вставьте в BOT_TOKEN');
        console.log('6. Напишите боту /start');
        console.log('7. Откройте https://api.telegram.org/bot<TOKEN>/getUpdates');
        console.log('8. Найдите chat.id и вставьте в CHAT_ID');
        console.log('');
    }
});

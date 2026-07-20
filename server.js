const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// =====================
// НАСТРОЙКИ
// =====================
const BOT_TOKEN = '8604437652:AAF55ZfXKx4U_PmRyo1Ad4JIO_mZch27ElY';
const CHAT_ID = '814292031';
const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

// =====================
// ДАННЫЕ (с сохранением в файл)
// =====================
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let orders = [];
try {
    if (fs.existsSync(ORDERS_FILE)) {
        orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
        console.log(`Loaded ${orders.length} orders from file`);
    }
} catch(e) {
    console.error('Error loading orders:', e.message);
    orders = [];
}

function saveOrders() {
    try {
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
    } catch(e) {
        console.error('Error saving orders:', e.message);
    }
}

const faqData = [
    { q: 'Какие товары есть?', a: 'У нас верхние формы для наращивания и гели для моделирования ногтей.' },
    { q: 'Сколько стоят формы?', a: 'Арочный квадрат - 100 BYN (скидка с 120 BYN). В наборе 140 форм.' },
    { q: 'Сколько стоит гель?', a: 'Профессиональный гель - 70 BYN (скидка с 500 BYN). Самовыравнивающийся.' },
    { q: 'Как заказать?', a: 'Оформите заказ на сайте polka-dot-beauty.surge.sh или напишите нам в этот чат.' },
    { q: 'Как доставляете?', a: 'Доставка по Беларуси почтой или курьером. Стоимость рассчитывается индивидуально.' },
    { q: 'Есть обучение?', a: 'Да! Мы проводим курсы по работе с нашими продуктами. Подробности на сайте.' },
];

// =====================
// TELEGRAM API
// =====================
function telegramAPI(method, data) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/${method}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch(e) { resolve(body); }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function sendMessage(chatId, text, options = {}) {
    return telegramAPI('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...options });
}

async function sendOrderToAdmin(data) {
    const orderId = orders.length + 1;
    orders.push({ id: orderId, ...data, status: 'new', date: new Date().toLocaleString('ru-RU') });
    saveOrders();

    const msg = `<b>Новый заказ #${orderId}</b>

<b>Имя:</b> ${data.name || 'Не указано'}
<b>Email:</b> ${data.email || 'Не указано'}
<b>Телефон:</b> ${data.phone || 'Не указано'}
<b>Товар:</b> ${data.product || 'Не указано'}
<b>Количество:</b> ${data.quantity || '1'}
<b>Комментарий:</b> ${data.message || 'Нет'}
<b>Статус:</b> Новый
<b>Дата:</b> ${new Date().toLocaleString('ru-RU')}

<b>Команды:</b>
/status ${orderId} обработка - изменить статус
/send ${orderId} текст - ответить клиенту
/orders - список заказов`;

    return sendMessage(CHAT_ID, msg);
}

async function sendQuestionToAdmin(data) {
    const msg = `<b>Новый вопрос</b>

<b>Имя:</b> ${data.name || 'Не указано'}
<b>Email:</b> ${data.email || 'Не указано'}
<b>Тема:</b> ${data.topic || 'Не указана'}
<b>Вопрос:</b> ${data.message || 'Нет'}
<b>Дата:</b> ${new Date().toLocaleString('ru-RU')}

<b>Команда:</b> /reply ${data.email} текст - ответить`;

    return sendMessage(CHAT_ID, msg);
}

async function sendAutoReply(chatId, text) {
    return sendMessage(chatId, text);
}

// =====================
// ОБРАБОТКА КОМАНД
// =====================
async function handleCommand(msg) {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const args = text.split(' ');
    const cmd = args[0].toLowerCase();

    // Только для админа
    if (chatId.toString() !== CHAT_ID) {
        // FAQ для обычных пользователей
        if (cmd === '/start') {
            await sendMessage(chatId, `Добро пожаловать в Polka Dot!

Я могу помочь вам:
/catalog - Посмотреть каталог
/faq - Часто задаваемые вопросы
/order - Оформить заказ
/help - Помощь`);
            return;
        }

        if (cmd === '/catalog') {
            await sendMessage(chatId, `<b>Каталог Polka Dot</b>

<b>Арочный квадрат</b>
140 прозрачных форм для наращивания
Цена: <b>100 BYN</b> (скидка с 120 BYN)

<b>Профессиональный гель</b>
Самовыравнивающийся гель для моделирования
Цена: <b>70 BYN</b> (скидка с 500 BYN)

Для заказа напишите /order`);
            return;
        }

        if (cmd === '/faq') {
            let faqMsg = '<b>Часто задаваемые вопросы:</b>\n\n';
            faqData.forEach((item, i) => {
                faqMsg += `${i + 1}. <b>${item.q}</b>\n${item.a}\n\n`;
            });
            await sendMessage(chatId, faqMsg);
            return;
        }

        if (cmd === '/order') {
            await sendMessage(chatId, `Для оформления заказа:
1. Зайдите на сайт polka-dot-beauty.surge.sh
2. Выберите товары в каталоге
3. Добавьте в корзину
4. Оформите заказ

Или напишите нам напрямую с данными для заказа.`);
            return;
        }

        if (cmd === '/help') {
            await sendMessage(chatId, `<b>Команды бота:</b>

/catalog - Каталог товаров
/faq - Часто задаваемые вопросы
/order - Как оформить заказ
/help - Эта справка

Или просто напишите нам сообщение!`);
            return;
        }

        return;
    }

    // Команды админа
    if (cmd === '/start') {
        await sendMessage(chatId, `<b>Панель управления Polka Dot</b>

<b>Команды:</b>
/orders - Список заказов
/history - История заказов (с пагинацией)
/status ID СТАТУС - Изменить статус (новый/обработка/отправлен/доставлен)
/send ID ТЕКСТ - Ответить клиенту
/broadcast ТЕКСТ - Рассылка всем клиентам
/faq - Часто задаваемые вопросы
/stats - Статистика`);
        return;
    }

    if (cmd === '/orders') {
        if (orders.length === 0) {
            await sendMessage(chatId, 'Заказов пока нет.');
            return;
        }
        let msg = '<b>Список заказов:</b>\n\n';
        orders.slice(-10).forEach(o => {
            const statusEmoji = { new: 'Новый', processing: 'В обработке', shipped: 'Отправлен', delivered: 'Доставлен' };
            msg += `<b>#${o.id}</b> - ${o.name} - ${o.product} - ${statusEmoji[o.status] || o.status}\n`;
        });
        await sendMessage(chatId, msg);
        return;
    }

    if (cmd === '/status') {
        const orderId = parseInt(args[1]);
        const status = args[2];
        if (!orderId || !status) {
            await sendMessage(chatId, 'Использование: /status НОМЕР СТАТУС\nСтатусы: новый, обработка, отправлен, доставлен');
            return;
        }
        const order = orders.find(o => o.id === orderId);
        if (!order) {
            await sendMessage(chatId, `Заказ #${orderId} не найден.`);
            return;
        }
        order.status = status;
        saveOrders();
        await sendMessage(chatId, `Статус заказа #${orderId} изменён на: <b>${status}</b>`);

        // Уведомление клиенту
        if (order.chatId) {
            const statusMessages = {
                new: 'Ваш заказ принят и ожидает обработки.',
                processing: 'Ваш заказ正在 обрабатывается.',
                shipped: 'Ваш заказ отправлен!',
                delivered: 'Ваш заказ доставлен. Спасибо за покупку!'
            };
            await sendMessage(order.chatId, `Статус вашего заказа #${orderId}: ${statusMessages[status] || status}`);
        }
        return;
    }

    if (cmd === '/send') {
        const orderId = parseInt(args[1]);
        const replyText = args.slice(2).join(' ');
        if (!orderId || !replyText) {
            await sendMessage(chatId, 'Использование: /send ID ТЕКСТ');
            return;
        }
        const order = orders.find(o => o.id === orderId);
        if (!order || !order.chatId) {
            await sendMessage(chatId, `Заказ #${orderId} не найден или нет chatId клиента.`);
            return;
        }
        await sendMessage(order.chatId, `Ответ от Polka Dot:\n\n${replyText}`);
        await sendMessage(chatId, `Ответ отправлен клиенту заказа #${orderId}`);
        return;
    }

    if (cmd === '/broadcast') {
        const broadcastText = args.slice(1).join(' ');
        if (!broadcastText) {
            await sendMessage(chatId, 'Использование: /broadcast ТЕКСТ');
            return;
        }
        const clientIds = [...new Set(orders.filter(o => o.chatId).map(o => o.chatId))];
        if (clientIds.length === 0) {
            await sendMessage(chatId, 'Нет клиентов для рассылки.');
            return;
        }
        let sent = 0;
        for (const id of clientIds) {
            try {
                await sendMessage(id, `<b>Уведомление от Polka Dot</b>\n\n${broadcastText}`);
                sent++;
            } catch(e) {}
        }
        await sendMessage(chatId, `Рассылка отправлена ${sent} клиентам.`);
        return;
    }

    if (cmd === '/stats') {
        const total = orders.length;
        const statuses = {};
        orders.forEach(o => { statuses[o.status] = (statuses[o.status] || 0) + 1; });
        const clients = [...new Set(orders.filter(o => o.chatId).map(o => o.chatId))].length;

        await sendMessage(chatId, `<b>Статистика:</b>

Всего заказов: <b>${total}</b>
Новых: <b>${statuses.new || 0}</b>
В обработке: <b>${statuses.processing || 0}</b>
Отправлено: <b>${statuses.shipped || 0}</b>
Доставлено: <b>${statuses.delivered || 0}</b>
Уникальных клиентов: <b>${clients}</b>`);
        return;
    }

    if (cmd === '/faq') {
        let faqMsg = '<b>FAQ:</b>\n\n';
        faqData.forEach((item, i) => {
            faqMsg += `${i + 1}. <b>${item.q}</b>\n${item.a}\n\n`;
        });
        await sendMessage(chatId, faqMsg);
        return;
    }

    if (cmd === '/history') {
        const page = parseInt(args[1]) || 1;
        const perPage = 5;
        const sorted = [...orders].reverse();
        const totalPages = Math.ceil(sorted.length / perPage);
        const start = (page - 1) * perPage;
        const pageOrders = sorted.slice(start, start + perPage);

        if (pageOrders.length === 0) {
            await sendMessage(chatId, 'История заказов пуста.');
            return;
        }

        let msg = `<b>История заказов (стр. ${page}/${totalPages}):</b>\n\n`;
        const statusEmoji = { new: 'Новый', processing: 'В обработке', shipped: 'Отправлен', delivered: 'Доставлен' };
        pageOrders.forEach(o => {
            msg += `<b>#${o.id}</b> | ${o.date}\n`;
            msg += `  Клиент: ${o.name} (${o.email || 'нет email'})\n`;
            msg += `  Товар: ${o.product} x${o.quantity || 1}\n`;
            msg += `  Телефон: ${o.phone || 'нет'}\n`;
            msg += `  Статус: ${statusEmoji[o.status] || o.status}\n`;
            if (o.message) msg += `  Комментарий: ${o.message}\n`;
            msg += '\n';
        });

        if (totalPages > 1) {
            msg += `Для навигации: /history ${page + 1} (следующая)`;
        }

        await sendMessage(chatId, msg);
        return;
    }
}

// =====================
// WEBHOOK / GET UPDATES
// =====================
let lastUpdateId = 0;

async function pollUpdates() {
    try {
        const result = await telegramAPI('getUpdates', {
            offset: lastUpdateId + 1,
            timeout: 30,
            allowed_updates: ['message']
        });

        if (result.ok && result.result) {
            for (const update of result.result) {
                lastUpdateId = update.update_id;
                if (update.message) {
                    await handleCommand(update.message);
                }
            }
        }
    } catch(e) {
        console.error('Poll error:', e.message);
    }
    setTimeout(pollUpdates, 100);
}

// =====================
// HTTP СЕРВЕР
// =====================
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Health check
    if (req.method === 'GET' && req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', orders: orders.length, time: new Date().toISOString() }));
        return;
    }

    // Новый заказ
    if (req.method === 'POST' && req.url === '/api/order') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                await sendOrderToAdmin(data);

                // Автоответ клиенту если есть chatId
                if (data.chatId) {
                    await sendAutoReply(data.chatId,
                        `Спасибо за заказ! Мы получили ваш заказ и свяжемся с вами в ближайшее время.\n\nТовар: ${data.product}\nКоличество: ${data.quantity}`
                    );
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
                console.log(`[ORDER] #${orders.length} ${data.name} - ${data.product}`);
            } catch(e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }

    // Новый вопрос
    if (req.method === 'POST' && req.url === '/api/question') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                await sendQuestionToAdmin(data);

                if (data.chatId) {
                    await sendAutoReply(data.chatId,
                        `Спасибо за вопрос! Мы ответим вам в ближайшее время.`
                    );
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
                console.log(`[QUESTION] ${data.name} - ${data.topic}`);
            } catch(e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }

    // Список заказов (для админа)
    if (req.method === 'GET' && req.url === '/api/orders') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ orders }));
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

// =====================
// ЗАПУСК
// =====================
server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║   Polka Dot Bot Server v2.0                     ║
║   Running on http://localhost:${PORT}              ║
╠══════════════════════════════════════════════════╣
║   API Endpoints:                                ║
║   POST /api/order    - Новый заказ              ║
║   POST /api/question - Новый вопрос             ║
║   GET  /api/orders   - Список заказов           ║
║   GET  /api/health   - Проверка                 ║
║                                                  ║
║   Telegram Bot Commands:                        ║
║   /start    - Панель управления                 ║
║   /orders   - Список заказов                    ║
║   /status   - Изменить статус заказа            ║
║   /send     - Ответить клиенту                  ║
║   /broadcast - Рассылка клиентам                ║
║   /stats    - Статистика                        ║
║   /faq      - Часто задаваемые вопросы          ║
╚══════════════════════════════════════════════════╝
    `);

    // Запуск поллинга Telegram
    pollUpdates();
    console.log('Telegram polling started...');
});

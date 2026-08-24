const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const Database = require('better-sqlite3');

// =====================
// НАСТРОЙКИ (секреты — через env на хостинге)
// =====================
const BOT_TOKEN = process.env.BOT_TOKEN || '8604437652:AAF55ZfXKx4U_PmRyo1Ad4JIO_mZch27ElY';
const CHAT_ID = process.env.CHAT_ID || '814292031';
const CHAT_IDS = (process.env.CHAT_IDS || `${CHAT_ID},-1004499556871`).split(',').map(s => s.trim()).filter(Boolean);
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'polkadot.db');

// Настройки почты (SendGrid API)
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@polkadot.by';

if (!BOT_TOKEN || !CHAT_ID) {
    console.error('FATAL: BOT_TOKEN and CHAT_ID must be set');
    process.exit(1);
}

// Логирование в файл
const LOG_PATH = path.join(__dirname, 'debug.log');
function writeLog(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    console.log(line.trim());
    try { fs.appendFileSync(LOG_PATH, line); } catch(e) {}
}
writeLog(`=== SERVER STARTED ===`);
writeLog(`EMAIL_FROM=${EMAIL_FROM}`);
writeLog(`SENDGRID_API_KEY=${SENDGRID_API_KEY ? 'SET' : 'EMPTY'}`);

// Функция отправки email через SendGrid HTTP API
async function sendEmail(to, subject, html) {
    writeLog(`[EMAIL] Попытка отправки на ${to}, от ${EMAIL_FROM}`);
    
    if (!to) {
        writeLog('[EMAIL] SKIP: Адрес получателя не указан');
        return false;
    }
    if (!SENDGRID_API_KEY) {
        writeLog('[EMAIL] SKIP: SendGrid API ключ не настроен');
        return false;
    }
    
    return new Promise((resolve) => {
        const postData = JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: EMAIL_FROM, name: 'Polka Dot' },
            subject: subject,
            content: [{ type: 'text/html', value: html }]
        });

        const options = {
            hostname: 'api.sendgrid.com',
            port: 443,
            path: '/v3/mail/send',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SENDGRID_API_KEY}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 202) {
                    writeLog(`[EMAIL] УСПЕХ! Статус: ${res.statusCode}`);
                    resolve(true);
                } else {
                    writeLog(`[EMAIL] ОШИБКА ${res.statusCode}: ${body}`);
                    resolve(false);
                }
            });
        });
        
        req.on('error', (e) => {
            writeLog(`[EMAIL] ОШИБКА СЕТИ: ${e.message}`);
            resolve(false);
        });
        
        req.setTimeout(15000, () => {
            req.destroy();
            writeLog(`[EMAIL] TIMEOUT`);
            resolve(false);
        });
        
        req.write(postData);
        req.end();
    });
}

// =====================
// ДАННЫЕ (SQLite база данных)
// =====================
const db = new Database(DB_PATH);

// Создаем таблицы
db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT,
        phone TEXT,
        product TEXT,
        quantity TEXT,
        message TEXT,
        contact_method TEXT DEFAULT '',
        contact_value TEXT DEFAULT '',
        status TEXT DEFAULT 'new',
        date TEXT
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT,
        topic TEXT,
        message TEXT,
        contact_method TEXT DEFAULT '',
        contact_value TEXT DEFAULT '',
        status TEXT DEFAULT 'new',
        date TEXT
    )
`);

// Миграция: добавляем колонки если их нет
try { db.exec(`ALTER TABLE orders ADD COLUMN contact_method TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE orders ADD COLUMN contact_value TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE questions ADD COLUMN contact_method TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE questions ADD COLUMN contact_value TEXT DEFAULT ''`); } catch(e) {}

// Функции для работы с заказами
function getOrders() {
    return db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
}

function getOrderById(id) {
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

function addOrder(data) {
    const stmt = db.prepare('INSERT INTO orders (name, email, phone, product, quantity, message, contact_method, contact_value, status, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    return stmt.run(data.name || '', data.email || '', data.phone || '', data.product || '', data.quantity || '', data.message || '', data.contact_method || '', data.contact_value || '', 'new', new Date().toLocaleString('ru-RU'));
}

function updateOrderStatus(id, status) {
    return db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
}

// Функции для работы с вопросами
function getQuestions() {
    return db.prepare('SELECT * FROM questions ORDER BY id DESC').all();
}

function getQuestionById(id) {
    return db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
}

function addQuestion(data) {
    const stmt = db.prepare('INSERT INTO questions (name, email, topic, message, contact_method, contact_value, status, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    return stmt.run(data.name || '', data.email || '', data.topic || '', data.message || '', data.contact_method || '', data.contact_value || '', 'new', new Date().toLocaleString('ru-RU'));
}

function updateQuestionStatus(id, status) {
    return db.prepare('UPDATE questions SET status = ? WHERE id = ?').run(status, id);
}

console.log('Database initialized');

const faqData = [
    { q: 'Какие товары есть?', a: 'У нас верхние формы для наращивания и гели для моделирования ногтей.' },
    { q: 'Сколько стоят формы?', a: 'Арочный квадрат - 100 BYN (скидка с 120 BYN). В наборе 140 форм.' },
    { q: 'Сколько стоит гель?', a: 'Профессиональный гель - 70 BYN (скидка с 500 BYN). Самовыравнивающийся.' },
    { q: 'Как заказать?', a: 'Оформите заказ на сайте polkadot-nails.surge.sh или напишите нам в этот чат.' },
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
    const result = await telegramAPI('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...options });
    if (!result || result.ok === false) {
        const errMsg = (result && result.description) || 'Telegram sendMessage failed';
        console.error('Telegram error:', errMsg, result);
        throw new Error(errMsg);
    }
    return result;
}

async function sendToAllChats(text, options = {}) {
    for (const chatId of CHAT_IDS) {
        try {
            await sendMessage(chatId, text, options);
        } catch(e) {
            console.error(`Failed to send to ${chatId}:`, e.message);
        }
    }
}

async function sendOrderToAdmin(data) {
    const result = addOrder(data);
    const orderId = result.lastInsertRowid;

    const msg = `<b>🆕 Новый заказ #${orderId}</b>

<b>Имя:</b> ${escapeHtml(data.name) || 'Не указано'}
${formatContactInfo(data.contact_method, data.contact_value)}
<b>Телефон:</b> ${escapeHtml(data.phone) || 'Не указан'}
<b>Товар:</b> ${escapeHtml(data.product) || 'Не указано'}
<b>Количество:</b> ${escapeHtml(data.quantity) || '1'}
${escapeHtml(data.message) || ''}
<b>Статус:</b> 🆕 Новый
<b>Дата:</b> ${new Date().toLocaleString('ru-RU')}`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: '✅ В обработке', callback_data: `status_${orderId}_processing` },
                { text: '📦 Отправлен', callback_data: `status_${orderId}_shipped` }
            ],
            [
                { text: '❌ Отменить', callback_data: `status_${orderId}_cancelled` }
            ]
        ]
    };

    return sendToAllChats(msg, { reply_markup: JSON.stringify(keyboard) });
}

function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

const CONTACT_METHOD_LABELS = {
    email: 'Email',
    instagram: 'Instagram',
    telegram: 'Telegram',
    viber: 'Viber',
    whatsapp: 'WhatsApp'
};

function formatContactInfo(method, value) {
    if (!method || !value) return '';
    const label = CONTACT_METHOD_LABELS[method] || method;
    return `<b>Связь:</b> ${label}: ${escapeHtml(value)}`;
}

async function sendQuestionToAdmin(data) {
    const result = addQuestion(data);
    const qId = result.lastInsertRowid;

    const topicLabels = {
        products: 'О продукции',
        order: 'О заказе',
        delivery: 'О доставке',
        training: 'Об обучении',
        cooperation: 'О сотрудничестве',
        other: 'Другое'
    };

    const msg = `<b>❓ Новый вопрос #${qId}</b>

<b>Имя:</b> ${escapeHtml(data.name) || 'Не указано'}
${formatContactInfo(data.contact_method, data.contact_value)}
<b>Тема:</b> ${topicLabels[data.topic] || escapeHtml(data.topic) || 'Не указана'}
<b>Вопрос:</b> ${escapeHtml(data.message) || 'Нет'}
<b>Дата:</b> ${new Date().toLocaleString('ru-RU')}`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: '✅ Обработан', callback_data: `qdone_${qId}` },
                { text: '💬 Ответить', callback_data: `qreply_${qId}` }
            ]
        ]
    };

    return sendToAllChats(msg, { reply_markup: JSON.stringify(keyboard) });
}

async function sendAutoReply(chatId, text) {
    return sendMessage(chatId, text);
}

// =====================
// ОБРАБОТКА CALLBACK-КНОПОК
// =====================
const STATUS_LABELS = {
    new: '🆕 Новый',
    processing: '⚙️ В обработке',
    shipped: '📦 Отправлен',
    delivered: '🚚 Доставлен',
    cancelled: '❌ Отменён'
};

async function handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (!CHAT_IDS.includes(chatId.toString())) return;

    if (data.startsWith('status_')) {
        const parts = data.split('_');
        const orderId = parseInt(parts[1]);
        const newStatus = parts[2];

        const statusLabel = STATUS_LABELS[newStatus] || newStatus;
        await telegramAPI('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: `Заказ #${orderId} → ${statusLabel}` });

        // Get order from database (reliable — no parsing from message text)
        const order = getOrderById(orderId);
        const orderEmail = order ? (order.email || '') : '';
        const orderProduct = order ? (order.product || '') : '';
        const orderContactMethod = order ? (order.contact_method || '') : '';
        const orderContactValue = order ? (order.contact_value || '') : '';
        writeLog(`[STATUS] Заказ #${orderId}, contact: '${orderContactMethod}': '${orderContactValue}', email: '${orderEmail}'`);

        // Update the message with new status
        const originalText = callbackQuery.message.text || callbackQuery.message.caption || '';
        const updatedMsg = originalText
            .replace(/🆕 Новый/g, statusLabel)
            .replace(/⚙️ В обработке/g, statusLabel)
            .replace(/📦 Отправлен/g, statusLabel)
            .replace(/❌ Отменён/g, statusLabel);

        // Keep remaining buttons (remove pressed one)
        const allButtons = [
            { text: '✅ В обработке', callback_data: `status_${orderId}_processing` },
            { text: '📦 Отправлен', callback_data: `status_${orderId}_shipped` },
            { text: '❌ Отменить', callback_data: `status_${orderId}_cancelled` }
        ];
        const remainingButtons = allButtons.filter(b => !b.callback_data.endsWith(`_${newStatus}`));
        const keyboard = { inline_keyboard: remainingButtons.length > 0 ? [remainingButtons] : [] };

        await telegramAPI('editMessageText', {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            text: updatedMsg,
            parse_mode: 'HTML',
            reply_markup: remainingButtons.length > 0 ? JSON.stringify(keyboard) : undefined
        });

        // Update order status in database
        updateOrderStatus(orderId, newStatus);

        // Send notification via selected contact method
        const statusMessages = {
            processing: 'Ваш заказ принят и обрабатывается.',
            shipped: 'Ваш заказ отправлен!',
            cancelled: 'Ваш заказ отменён.'
        };
        const statusClean = statusLabel.replace(/^[^\s]+\s/, '');
        const notifText = `Polka Dot — Обновление заказа\n\n${statusMessages[newStatus] || statusLabel}\n\nТовар: ${orderProduct}\nСтатус: ${statusClean}`;

        if (orderContactMethod === 'email' && orderContactValue && orderContactValue.includes('@')) {
            // Send email notification
            const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head><meta charset="utf-8"></head>
                <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
                    <div style="max-width:600px;margin:0 auto;background:#fff;">
                        <div style="background:#111;color:#fff;padding:24px;text-align:center;">
                            <h1 style="margin:0;font-size:22px;letter-spacing:1px;">POLKA DOT</h1>
                            <p style="margin:6px 0 0;font-size:13px;opacity:0.7;">Профессиональные инструменты для маникюра</p>
                        </div>
                        <div style="padding:28px 24px;">
                            <h2 style="color:#222;font-size:18px;margin:0 0 12px;">Обновление по вашему заказу</h2>
                            <p style="color:#444;font-size:15px;line-height:1.5;">${statusMessages[newStatus] || statusLabel}</p>
                            <table style="width:100%;margin:16px 0;border-collapse:collapse;">
                                <tr><td style="padding:8px 0;color:#888;font-size:13px;border-bottom:1px solid #eee;">Товар</td><td style="padding:8px 0;color:#222;font-size:13px;border-bottom:1px solid #eee;">${escapeHtml(orderProduct)}</td></tr>
                                <tr><td style="padding:8px 0;color:#888;font-size:13px;">Статус</td><td style="padding:8px 0;color:#222;font-size:13px;">${statusLabel}</td></tr>
                            </table>
                            <p style="color:#666;font-size:13px;margin-top:24px;">Если у вас есть вопросы, напишите нам на почту: polkadot.nails@yandex.ru</p>
                        </div>
                        <div style="background:#f9f9f9;padding:16px 24px;text-align:center;border-top:1px solid #eee;">
                            <p style="color:#aaa;font-size:11px;margin:0;">ИП Колос Е.Г. | г. Мозырь, б-р Дружбы 2</p>
                            <p style="color:#aaa;font-size:11px;margin:4px 0 0;">Вы получили это письмо, потому что оформили заказ на polkadot.by</p>
                        </div>
                    </div>
                </body>
                </html>`;
            const emailSent = await sendEmail(orderContactValue, `Заказ - ${statusClean}`, emailHtml);
            writeLog(`[STATUS] Email результат для заказа #${orderId}: ${emailSent}`);
        } else if (orderContactMethod === 'telegram' && orderContactValue) {
            // Send Telegram notification to customer
            try {
                await sendMessage(orderContactValue, notifText);
                writeLog(`[STATUS] Telegram отправлен для заказа #${orderId} на ${orderContactValue}`);
            } catch(e) {
                writeLog(`[STATUS] Ошибка Telegram для заказа #${orderId}: ${e.message}`);
            }
        } else if (orderContactMethod && orderContactValue) {
            // For Instagram/Viber/WhatsApp — log for admin to respond manually
            writeLog(`[STATUS] Заказ #${orderId}: клиент выбрал ${orderContactMethod} (${orderContactValue}). Уведомление отправлено админу в Telegram.`);
            await sendToAllChats(`⚠️ Заказ #${orderId} обновлён: ${statusClean}\nКлиент выбрал ${CONTACT_METHOD_LABELS[orderContactMethod] || orderContactMethod}: ${orderContactValue}\nСвяжитесь с клиентом вручную.`);
        } else if (orderEmail && orderEmail.includes('@')) {
            // Fallback to email if contact_method not set (old orders)
            const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head><meta charset="utf-8"></head>
                <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
                    <div style="max-width:600px;margin:0 auto;background:#fff;">
                        <div style="background:#111;color:#fff;padding:24px;text-align:center;">
                            <h1 style="margin:0;font-size:22px;letter-spacing:1px;">POLKA DOT</h1>
                        </div>
                        <div style="padding:28px 24px;">
                            <h2 style="color:#222;font-size:18px;margin:0 0 12px;">Обновление по вашему заказу</h2>
                            <p style="color:#444;font-size:15px;line-height:1.5;">${statusMessages[newStatus] || statusLabel}</p>
                            <table style="width:100%;margin:16px 0;border-collapse:collapse;">
                                <tr><td style="padding:8px 0;color:#888;font-size:13px;border-bottom:1px solid #eee;">Товар</td><td style="padding:8px 0;color:#222;font-size:13px;border-bottom:1px solid #eee;">${escapeHtml(orderProduct)}</td></tr>
                                <tr><td style="padding:8px 0;color:#888;font-size:13px;">Статус</td><td style="padding:8px 0;color:#222;font-size:13px;">${statusLabel}</td></tr>
                            </table>
                        </div>
                    </div>
                </body>
                </html>`;
            await sendEmail(orderEmail, `Заказ - ${statusClean}`, emailHtml);
            writeLog(`[STATUS] Fallback email отправлен для заказа #${orderId}`);
        } else {
            writeLog(`[STATUS] У заказа #${orderId} нет контактных данных для уведомления`);
        }
    }

    if (data.startsWith('qdone_')) {
        const qId = parseInt(data.split('_')[1]);
        await telegramAPI('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: `Вопрос #${qId} отмечен как обработанный` });

        // Get question from database
        const question = getQuestionById(qId);
        const questionEmail = question ? (question.email || '') : '';
        const questionContactMethod = question ? (question.contact_method || '') : '';
        const questionContactValue = question ? (question.contact_value || '') : '';

        // Parse from message
        const originalText = callbackQuery.message.text || '';
        const updatedMsg = originalText.replace(/🆕 Новый/g, '✅ Обработан');

        const keyboard = { inline_keyboard: [[{ text: '💬 Ответить', callback_data: `qreply_${qId}` }]] };

        await telegramAPI('editMessageText', {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            text: updatedMsg,
            parse_mode: 'HTML',
            reply_markup: JSON.stringify(keyboard)
        });

        // Update question status
        updateQuestionStatus(qId, 'done');

        // Send notification via selected contact method
        const qNotifText = `Polka Dot — Ваш вопрос принят\n\nМы получили ваш вопрос и обрабатываем его. Ответ будет отправлен в ближайшее время.`;

        if (questionContactMethod === 'email' && questionContactValue && questionContactValue.includes('@')) {
            const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head><meta charset="utf-8"></head>
                <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
                    <div style="max-width:600px;margin:0 auto;background:#fff;">
                        <div style="background:#111;color:#fff;padding:24px;text-align:center;">
                            <h1 style="margin:0;font-size:22px;letter-spacing:1px;">POLKA DOT</h1>
                        </div>
                        <div style="padding:28px 24px;">
                            <h2 style="color:#222;font-size:18px;margin:0 0 12px;">Ответ на ваш вопрос</h2>
                            <p style="color:#444;font-size:15px;line-height:1.5;">Мы получили ваш вопрос и обрабатываем его. Ответ будет отправлен на этот email в ближайшее время.</p>
                            <p style="color:#666;font-size:13px;margin-top:24px;">По срочным вопросам: polkadot.nails@yandex.ru</p>
                        </div>
                        <div style="background:#f9f9f9;padding:16px 24px;text-align:center;border-top:1px solid #eee;">
                            <p style="color:#aaa;font-size:11px;margin:0;">ИП Колос Е.Г. | г. Мозырь, б-р Дружбы 2</p>
                        </div>
                    </div>
                </body>
                </html>`;
            await sendEmail(questionContactValue, 'Ваш вопрос принят — Polka Dot', emailHtml);
            writeLog(`[QDONE] Email отправлен на ${questionContactValue}`);
        } else if (questionContactMethod === 'telegram' && questionContactValue) {
            try {
                await sendMessage(questionContactValue, qNotifText);
                writeLog(`[QDONE] Telegram отправлен на ${questionContactValue}`);
            } catch(e) {
                writeLog(`[QDONE] Ошибка Telegram: ${e.message}`);
            }
        } else if (questionContactMethod && questionContactValue) {
            writeLog(`[QDONE] Вопрос #${qId}: клиент выбрал ${questionContactMethod} (${questionContactValue}). Уведомление админу.`);
            await sendToAllChats(`⚠️ Вопрос #${qId} обработан.\nКлиент выбрал ${CONTACT_METHOD_LABELS[questionContactMethod] || questionContactMethod}: ${questionContactValue}\nСвяжитесь с клиентом вручную.`);
        } else if (questionEmail && questionEmail.includes('@')) {
            // Fallback for old questions
            const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head><meta charset="utf-8"></head>
                <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
                    <div style="max-width:600px;margin:0 auto;background:#fff;">
                        <div style="background:#111;color:#fff;padding:24px;text-align:center;">
                            <h1 style="margin:0;font-size:22px;letter-spacing:1px;">POLKA DOT</h1>
                        </div>
                        <div style="padding:28px 24px;">
                            <h2 style="color:#222;font-size:18px;margin:0 0 12px;">Ответ на ваш вопрос</h2>
                            <p style="color:#444;font-size:15px;line-height:1.5;">Мы получили ваш вопрос и обрабатываем его.</p>
                        </div>
                    </div>
                </body>
                </html>`;
            await sendEmail(questionEmail, 'Ваш вопрос принят — Polka Dot', emailHtml);
            writeLog(`[QDONE] Fallback email отправлен на ${questionEmail}`);
        }
    }

    if (data.startsWith('qreply_')) {
        const qId = parseInt(data.split('_')[1]);
        await telegramAPI('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: `Используйте: /qreply ${qId} текст` });
        await sendMessage(chatId, `Для ответа на вопрос #${qId} используйте:\n<code>/qreply ${qId} текст ответа</code>`);
    }
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
    if (!CHAT_IDS.includes(chatId.toString())) {
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
1. Зайдите на сайт polkadot-nails.surge.sh
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
        await sendMessage(chatId, `<b>📋 Панель управления Polka Dot</b>

<b>Заказы:</b>
/orders — Все заказы
/neworders — Только новые
/history — История заказов
/status ID СТАТУС — Изменить статус
/send ID ТЕКСТ — Ответить клиенту

<b>Вопросы:</b>
/questions — Все вопросы
/newquestions — Только новые
/qreply ID ТЕКСТ — Ответить на вопрос

<b>Общее:</b>
/broadcast ТЕКСТ — Рассылка всем
/faq — Вопросы-ответы
/stats — Статистика`);
        return;
    }

    if (cmd === '/orders') {
        const allOrders = getOrders();
        if (allOrders.length === 0) {
            await sendMessage(chatId, 'Заказов пока нет.');
            return;
        }
        let msg = '<b>📋 Все заказы:</b>\n\n';
        allOrders.slice(0, 15).forEach(o => {
            const statusLabel = STATUS_LABELS[o.status] || o.status;
            msg += `<b>#${o.id}</b> | ${o.name} | ${o.product} | ${statusLabel}\n`;
        });
        msg += `\nВсего: ${allOrders.length} заказов`;
        await sendMessage(chatId, msg);
        return;
    }

    if (cmd === '/neworders') {
        const allOrders = getOrders();
        const newOrders = allOrders.filter(o => o.status === 'new' || o.status === 'processing');
        if (newOrders.length === 0) {
            await sendMessage(chatId, '✅ Нет необработанных заказов!');
            return;
        }
        let msg = `<b>🔔 Необработанные заказы (${newOrders.length}):</b>\n\n`;
        newOrders.forEach(o => {
            const statusLabel = STATUS_LABELS[o.status] || o.status;
            const contactInfo = o.contact_method && o.contact_value
                ? `${CONTACT_METHOD_LABELS[o.contact_method] || o.contact_method}: ${o.contact_value}`
                : (o.email || 'нет');
            msg += `<b>#${o.id}</b> | ${o.name} | ${o.product} | ${statusLabel}\n`;
            msg += `  📞 ${o.phone || 'нет'} | 📧 ${contactInfo}\n\n`;
        });
        await sendMessage(chatId, msg);
        return;
    }

    if (cmd === '/status') {
        const orderId = parseInt(args[1]);
        const status = args[2];
        if (!orderId || !status) {
            await sendMessage(chatId, 'Использование: /status НОМЕР СТАТУС\nСтатусы: новый, обработка, отправлен, отменён');
            return;
        }
        const order = getOrderById(orderId);
        if (!order) {
            await sendMessage(chatId, `Заказ #${orderId} не найден.`);
            return;
        }
        updateOrderStatus(orderId, status);
        const statusLabel = STATUS_LABELS[status] || status;
        await sendMessage(chatId, `Статус заказа #${orderId} изменён на: <b>${statusLabel}</b>`);

        // Send notification via selected contact method
        const statusMessages = {
            new: 'Ваш заказ принят и ожидает обработки.',
            processing: 'Ваш заказ обрабатывается.',
            shipped: 'Ваш заказ отправлен!',
            cancelled: 'Ваш заказ отменён.'
        };
        const statusClean = statusLabel.replace(/^[^\s]+\s/, '');
        const orderContactMethod = order.contact_method || '';
        const orderContactValue = order.contact_value || '';

        if (orderContactMethod === 'email' && orderContactValue && orderContactValue.includes('@')) {
            const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head><meta charset="utf-8"></head>
                <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
                    <div style="max-width:600px;margin:0 auto;background:#fff;">
                        <div style="background:#111;color:#fff;padding:24px;text-align:center;">
                            <h1 style="margin:0;font-size:22px;letter-spacing:1px;">POLKA DOT</h1>
                            <p style="margin:6px 0 0;font-size:13px;opacity:0.7;">Профессиональные инструменты для маникюра</p>
                        </div>
                        <div style="padding:28px 24px;">
                            <h2 style="color:#222;font-size:18px;margin:0 0 12px;">Обновление по вашему заказу</h2>
                            <p style="color:#444;font-size:15px;line-height:1.5;">${statusMessages[status] || `Статус изменён: ${statusLabel}`}</p>
                            <table style="width:100%;margin:16px 0;border-collapse:collapse;">
                                <tr><td style="padding:8px 0;color:#888;font-size:13px;border-bottom:1px solid #eee;">Товар</td><td style="padding:8px 0;color:#222;font-size:13px;border-bottom:1px solid #eee;">${escapeHtml(order.product)}</td></tr>
                                <tr><td style="padding:8px 0;color:#888;font-size:13px;">Статус</td><td style="padding:8px 0;color:#222;font-size:13px;">${statusLabel}</td></tr>
                            </table>
                            <p style="color:#666;font-size:13px;margin-top:24px;">Если у вас есть вопросы, напишите нам на почту: polkadot.nails@yandex.ru</p>
                        </div>
                        <div style="background:#f9f9f9;padding:16px 24px;text-align:center;border-top:1px solid #eee;">
                            <p style="color:#aaa;font-size:11px;margin:0;">ИП Колос Е.Г. | г. Мозырь, б-р Дружбы 2</p>
                            <p style="color:#aaa;font-size:11px;margin:4px 0 0;">Вы получили это письмо, потому что оформили заказ на polkadot.by</p>
                        </div>
                    </div>
                </body>
                </html>`;
            await sendEmail(orderContactValue, `Заказ - ${statusClean}`, emailHtml);
        } else if (orderContactMethod === 'telegram' && orderContactValue) {
            try {
                await sendMessage(orderContactValue, `Polka Dot — Обновление заказа\n\n${statusMessages[status] || statusLabel}\n\nТовар: ${order.product}\nСтатус: ${statusClean}`);
            } catch(e) {}
        } else if (orderContactMethod && orderContactValue) {
            await sendToAllChats(`⚠️ Заказ #${orderId}: ${statusClean}\nКлиент: ${CONTACT_METHOD_LABELS[orderContactMethod] || orderContactMethod}: ${orderContactValue}\nСвяжитесь вручную.`);
        } else if (order.email && order.email.includes('@')) {
            // Fallback for old orders
            const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head><meta charset="utf-8"></head>
                <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
                    <div style="max-width:600px;margin:0 auto;background:#fff;">
                        <div style="background:#111;color:#fff;padding:24px;text-align:center;">
                            <h1 style="margin:0;font-size:22px;letter-spacing:1px;">POLKA DOT</h1>
                        </div>
                        <div style="padding:28px 24px;">
                            <h2 style="color:#222;font-size:18px;margin:0 0 12px;">Обновление по вашему заказу</h2>
                            <p style="color:#444;font-size:15px;line-height:1.5;">${statusMessages[status] || `Статус изменён: ${statusLabel}`}</p>
                            <table style="width:100%;margin:16px 0;border-collapse:collapse;">
                                <tr><td style="padding:8px 0;color:#888;font-size:13px;border-bottom:1px solid #eee;">Товар</td><td style="padding:8px 0;color:#222;font-size:13px;border-bottom:1px solid #eee;">${escapeHtml(order.product)}</td></tr>
                                <tr><td style="padding:8px 0;color:#888;font-size:13px;">Статус</td><td style="padding:8px 0;color:#222;font-size:13px;">${statusLabel}</td></tr>
                            </table>
                        </div>
                    </div>
                </body>
                </html>`;
            await sendEmail(order.email, `Заказ - ${statusClean}`, emailHtml);
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
        const order = getOrderById(orderId);
        if (!order) {
            await sendMessage(chatId, `Заказ #${orderId} не найден.`);
            return;
        }
        const oContactMethod = order.contact_method || '';
        const oContactValue = order.contact_value || '';

        if (oContactMethod === 'email' && oContactValue && oContactValue.includes('@')) {
            await sendEmail(oContactValue, 'Ответ от Polka Dot', `<p>${escapeHtml(replyText)}</p>`);
            await sendMessage(chatId, `Ответ отправлен на ${oContactValue}`);
        } else if (oContactMethod === 'telegram' && oContactValue) {
            try {
                await sendMessage(oContactValue, `Polka Dot — ${replyText}`);
                await sendMessage(chatId, `Ответ отправлен в Telegram (${oContactValue})`);
            } catch(e) {
                await sendMessage(chatId, `Ошибка Telegram: ${e.message}`);
            }
        } else if (oContactMethod && oContactValue) {
            await sendMessage(chatId, `Клиент: ${CONTACT_METHOD_LABELS[oContactMethod] || oContactMethod}: ${oContactValue}\nОтвет:\n${replyText}\n\nСкопируйте и отправьте вручную.`);
        } else if (order.email && order.email.includes('@')) {
            await sendEmail(order.email, 'Ответ от Polka Dot', `<p>${escapeHtml(replyText)}</p>`);
            await sendMessage(chatId, `Ответ отправлен на ${order.email}`);
        } else {
            await sendMessage(chatId, `У заказа #${orderId} нет контактных данных.`);
        }
        return;
    }

    if (cmd === '/broadcast') {
        const broadcastText = args.slice(1).join(' ');
        if (!broadcastText) {
            await sendMessage(chatId, 'Использование: /broadcast ТЕКСТ');
            return;
        }
        const allOrders = getOrders();
        const emails = [...new Set(allOrders.filter(o => o.email).map(o => o.email))];
        if (emails.length === 0) {
            await sendMessage(chatId, 'Нет клиентов для рассылки.');
            return;
        }
        let sent = 0;
        for (const email of emails) {
            try {
                await sendEmail(email, 'Уведомление от Polka Dot', `<p>${escapeHtml(broadcastText)}</p>`);
                sent++;
            } catch(e) {}
        }
        await sendMessage(chatId, `Рассылка отправлена ${sent} клиентам.`);
        return;
    }

    if (cmd === '/stats') {
        const allOrders = getOrders();
        const total = allOrders.length;
        const statuses = {};
        allOrders.forEach(o => { statuses[o.status] = (statuses[o.status] || 0) + 1; });
        const clients = [...new Set(allOrders.filter(o => o.email).map(o => o.email))].length;

        await sendMessage(chatId, `<b>Статистика:</b>

Всего заказов: <b>${total}</b>
Новых: <b>${statuses.new || 0}</b>
В обработке: <b>${statuses.processing || 0}</b>
Отправлено: <b>${statuses.shipped || 0}</b>
Отменено: <b>${statuses.cancelled || 0}</b>
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
        const allOrders = getOrders();
        const totalPages = Math.ceil(allOrders.length / perPage);
        const start = (page - 1) * perPage;
        const pageOrders = allOrders.slice(start, start + perPage);

        if (pageOrders.length === 0) {
            await sendMessage(chatId, 'История заказов пуста.');
            return;
        }

        let msg = `<b>📜 История заказов (стр. ${page}/${totalPages}):</b>\n\n`;
        pageOrders.forEach(o => {
            const statusLabel = STATUS_LABELS[o.status] || o.status;
            const contactInfo = o.contact_method && o.contact_value
                ? `${CONTACT_METHOD_LABELS[o.contact_method] || o.contact_method}: ${o.contact_value}`
                : (o.email || 'нет');
            msg += `<b>#${o.id}</b> | ${o.date}\n`;
            msg += `  Клиент: ${o.name} (${contactInfo})\n`;
            msg += `  Товар: ${o.product} x${o.quantity || 1}\n`;
            msg += `  Телефон: ${o.phone || 'нет'}\n`;
            msg += `  Статус: ${statusLabel}\n`;
            if (o.message) msg += `  Комментарий: ${o.message}\n`;
            msg += '\n';
        });

        if (totalPages > 1) {
            msg += `Для навигации: /history ${page + 1} (следующая)`;
        }

        await sendMessage(chatId, msg);
        return;
    }

    if (cmd === '/questions') {
        const allQuestions = getQuestions();
        if (allQuestions.length === 0) {
            await sendMessage(chatId, 'Вопросов пока нет.');
            return;
        }
        let msg = '<b>❓ Все вопросы:</b>\n\n';
        allQuestions.slice(0, 15).forEach(q => {
            const statusLabel = q.status === 'done' ? '✅ Обработан' : '🆕 Новый';
            msg += `<b>#${q.id}</b> | ${q.name} | ${q.topic || 'без темы'} | ${statusLabel}\n`;
        });
        msg += `\nВсего: ${allQuestions.length} вопросов`;
        await sendMessage(chatId, msg);
        return;
    }

    if (cmd === '/newquestions') {
        const allQuestions = getQuestions();
        const newQuestions = allQuestions.filter(q => q.status !== 'done');
        if (newQuestions.length === 0) {
            await sendMessage(chatId, '✅ Нет необработанных вопросов!');
            return;
        }
        let msg = `<b>🔔 Необработанные вопросы (${newQuestions.length}):</b>\n\n`;
        newQuestions.forEach(q => {
            const contactInfo = q.contact_method && q.contact_value
                ? `${CONTACT_METHOD_LABELS[q.contact_method] || q.contact_method}: ${q.contact_value}`
                : (q.email || 'нет');
            msg += `<b>#${q.id}</b> | ${q.name} | ${contactInfo}\n`;
            msg += `  Тема: ${q.topic || 'нет'}\n`;
            msg += `  Вопрос: ${q.message || 'нет'}\n\n`;
        });
        await sendMessage(chatId, msg);
        return;
    }

    if (cmd === '/qreply') {
        const qId = parseInt(args[1]);
        const replyText = args.slice(2).join(' ');
        if (!qId || !replyText) {
            await sendMessage(chatId, 'Использование: /qreply ID ТЕКСТ');
            return;
        }
        const question = getQuestionById(qId);
        const questionEmail = question ? (question.email || '') : '';
        const qContactMethod = question ? (question.contact_method || '') : '';
        const qContactValue = question ? (question.contact_value || '') : '';

        if (qContactMethod === 'email' && qContactValue && qContactValue.includes('@')) {
            const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head><meta charset="utf-8"></head>
                <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
                    <div style="max-width:600px;margin:0 auto;background:#fff;">
                        <div style="background:#111;color:#fff;padding:24px;text-align:center;">
                            <h1 style="margin:0;font-size:22px;letter-spacing:1px;">POLKA DOT</h1>
                        </div>
                        <div style="padding:28px 24px;">
                            <h2 style="color:#222;font-size:18px;margin:0 0 12px;">Ответ на ваш вопрос</h2>
                            <p style="color:#444;font-size:15px;line-height:1.6;">${escapeHtml(replyText)}</p>
                            <p style="color:#666;font-size:13px;margin-top:24px;">Есть ещё вопросы? Напишите нам: polkadot.nails@yandex.ru</p>
                        </div>
                        <div style="background:#f9f9f9;padding:16px 24px;text-align:center;border-top:1px solid #eee;">
                            <p style="color:#aaa;font-size:11px;margin:0;">ИП Колос Е.Г. | г. Мозырь, б-р Дружбы 2</p>
                        </div>
                    </div>
                </body>
                </html>`;
            const sent = await sendEmail(qContactValue, `Ответ на ваш вопрос — Polka Dot`, emailHtml);
            if (sent) {
                await sendMessage(chatId, `✅ Ответ на вопрос #${qId} отправлен на ${qContactValue}`);
            } else {
                await sendMessage(chatId, `❌ Не удалось отправить email на ${qContactValue}`);
            }
        } else if (qContactMethod === 'telegram' && qContactValue) {
            try {
                await sendMessage(qContactValue, `Polka Dot — Ответ на ваш вопрос:\n\n${replyText}`);
                await sendMessage(chatId, `✅ Ответ на вопрос #${qId} отправлен в Telegram (${qContactValue})`);
            } catch(e) {
                await sendMessage(chatId, `❌ Не удалось отправить в Telegram: ${e.message}`);
            }
        } else if (qContactMethod && qContactValue) {
            await sendMessage(chatId, `⚠️ Вопрос #${qId}: клиент выбрал ${CONTACT_METHOD_LABELS[qContactMethod] || qContactMethod}: ${qContactValue}\nОтвет:\n${replyText}\n\nСкопируйте и отправьте клиенту вручную.`);
        } else if (questionEmail && questionEmail.includes('@')) {
            // Fallback for old questions
            const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head><meta charset="utf-8"></head>
                <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
                    <div style="max-width:600px;margin:0 auto;background:#fff;">
                        <div style="background:#111;color:#fff;padding:24px;text-align:center;">
                            <h1 style="margin:0;font-size:22px;letter-spacing:1px;">POLKA DOT</h1>
                        </div>
                        <div style="padding:28px 24px;">
                            <h2 style="color:#222;font-size:18px;margin:0 0 12px;">Ответ на ваш вопрос</h2>
                            <p style="color:#444;font-size:15px;line-height:1.6;">${escapeHtml(replyText)}</p>
                        </div>
                    </div>
                </body>
                </html>`;
            const sent = await sendEmail(questionEmail, `Ответ на ваш вопрос — Polka Dot`, emailHtml);
            if (sent) {
                await sendMessage(chatId, `✅ Ответ на вопрос #${qId} отправлен на ${questionEmail}`);
            } else {
                await sendMessage(chatId, `❌ Не удалось отправить email на ${questionEmail}`);
            }
        } else {
            await sendMessage(chatId, `⚠ У вопроса #${qId} нет контактных данных. Ответ:\n${replyText}\n\nСкопируйте и отправьте клиенту вручную.`);
        }
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
            allowed_updates: ['message', 'callback_query']
        });

        if (result.ok && result.result) {
            for (const update of result.result) {
                lastUpdateId = update.update_id;
                if (update.message) {
                    await handleCommand(update.message);
                }
                if (update.callback_query) {
                    await handleCallbackQuery(update.callback_query);
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
        const orderCount = getOrders().length;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', orders: orderCount, time: new Date().toISOString() }));
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
                const orderCount = getOrders().length;
                console.log(`[ORDER] #${orderCount} ${data.name} - ${data.product}`);
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
        res.end(JSON.stringify({ orders: getOrders() }));
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

// =====================
// ЗАПУСК
// =====================
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║   Polka Dot Bot Server v2.0                     ║
║   Running on http://0.0.0.0:${PORT}               ║
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

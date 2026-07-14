const express = require('express');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [Safe Engine] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('⚠️ [Safe Engine] Uncaught Exception:', err);
});

const db = require('./db');
const botModule = require('./bot');

const bot = botModule.bot || botModule;
const checkUserSubscription = botModule.checkUserSubscription || (async () => true);
const getUserAvatarUrl = botModule.getUserAvatarUrl || (async () => null);

const pool = db.pool || db;
const query = (text, params) => pool.query(text, params);

const app = express();
const PORT = process.env.PORT || 3000;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || "";

const ADMIN_TON_ADDRESS = process.env.ADMIN_TON_ADDRESS; 
const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY; 

app.use(express.json());

// ---------------------------------------------------------------------------
// НАСТРОЙКА КРОСС-ДОМЕННОГО ДОСТУПА (CORS) БЕЗ ВНЕШНИХ МОДУЛЕЙ
// Предотвращает ошибки MODULE_NOT_FOUND на хостингах
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, content-type, x-telegram-init-data');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ---------------------------------------------------------------------------
// ВЫСОКОКЛАССНЫЙ СЕРВЕРНЫЙ КОМПИЛЯТОР BOC ДЛЯ ТЕКСТОВЫХ КОММЕНТАРИЕВ TON
// Исключает ошибку: "Payload is invalid" (Index 0 > 0 is out of bounds)
// ---------------------------------------------------------------------------
function serializeTextCommentBoc(text) {
    const textBytes = Buffer.from(text, 'utf8');
    const payload = Buffer.concat([Buffer.alloc(4), textBytes]); // 4 нулевых байта префикса текстового сообщения

    const d1 = 0; // refs = 0, exotic = 0, level = 0
    
    // Каноническое выравнивание TVM: добавляем маркер заполнения (padding bit 1)
    const paddedPayload = Buffer.concat([payload, Buffer.from([0x80])]);
    const d2 = payload.length * 2 + 1; // bits_descriptor: (floor(bits/8)*2) + 1 (маркер нечетных бит)

    const cellData = Buffer.concat([
        Buffer.from([d1, d2]),
        paddedPayload
    ]);

    const cellContentLen = cellData.length;

    // Сборка Single-Cell BOC
    const header = Buffer.from([
        0xb5, 0xee, 0x9c, 0x72, // BOC Magic
        0x01,                   // flags: has_idx=0, has_crc32c=0, size_bytes=1
        0x01,                   // off_bytes = 1
        0x01,                   // cell_count = 1
        0x01,                   // root_count = 1
        0x00,                   // absent_count = 0
        cellContentLen,         // tot_cells_size
        0x00                    // root_list (root index 0)
    ]);

    return Buffer.concat([header, cellData]).toString('base64');
}

// ---------------------------------------------------------------------------
// ДИНАМИЧЕСКИЙ МАНИФЕСТ С АБСОЛЮТНЫМИ ССЫЛКАМИ ПОД ВАШ ЛОГОТИП
// Перенесен в самое начало для безупречной обработки TON Connect кошельками
// ---------------------------------------------------------------------------
app.get('/tonconnect-manifest.json', (req, res) => {
    const host = req.get('host');
    const protocol = 'https'; // Всегда HTTPS для защиты TON Connect
    const appUrl = process.env.WEB_APP_URL || `${protocol}://${host}`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.json({
        "url": appUrl,
        "name": "BestGifts",
        "iconUrl": `${appUrl}/Images/Logo/logotip.png`, // Ссылка на ваш логотип для кошелька
        "termsOfUseUrl": appUrl,
        "privacyPolicyUrl": appUrl
    });
});

// КЛИЕНТСКИЙ АВАТАР-ПРОКСИ: Позволяет круглосуточно отображать фото профилей без обрыва сессий
app.get('/api/avatar/:userId', async (req, res) => {
    const userId = req.params.userId;
    try {
        const avatarUrl = await getUserAvatarUrl(userId);
        if (avatarUrl) {
            const response = await axios.get(avatarUrl, { responseType: 'stream' });
            response.data.pipe(res);
        } else {
            res.redirect('https://img.icons8.com/color/96/user.png');
        }
    } catch (e) {
        res.redirect('https://img.icons8.com/color/96/user.png');
    }
});

// ---------------------------------------------------------------------------
// ПОДКЛЮЧЕНИЕ СТАТИЧЕСКИХ РЕСУРСОВ С КЕШИРОВАНИЕМ ДЛЯ МОМЕНТАЛЬНОЙ ЗАГРУЗКИ КАРТИНОК
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1y',
    setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*'); 
        if (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') || filePath.endsWith('.gif') || filePath.endsWith('.webp')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // Кеширование в браузере игрока на 1 год
        }
    }
}));

// Сопоставление комментариев транзакций TON
function matchTransactionComment(tx, userId) {
    if (!tx.in_msg) return false;
    const comment = tx.in_msg.message || "";
    return comment.trim() === String(userId).trim();
}

// ---------------------------------------------------------------------------
// MIDDLEWARE ДЛЯ АВТОРИЗАЦИИ ТЕЛЕГРАМ
// ---------------------------------------------------------------------------
app.use(async (req, res, next) => {
    const initData = req.body?.initData || req.headers['x-telegram-init-data'] || req.query.initData;
    if (!initData) {
        req.telegramUser = null;
        return next();
    }
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');
        params.sort();
        let dataCheckString = '';
        for (const [key, value] of params.entries()) {
            dataCheckString += key + '=' + value + '\n';
        }
        dataCheckString = dataCheckString.trim();
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        if (calculatedHash !== hash) {
            req.telegramUser = null;
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const userJson = params.get('user');
        if (userJson) {
            req.telegramUser = JSON.parse(userJson);
            if (req.telegramUser.id) {
                let avatarUrl = req.telegramUser.photo_url || null;
                try {
                    if (!avatarUrl) {
                        avatarUrl = await getUserAvatarUrl(req.telegramUser.id);
                    }
                    const isAdminUser = req.telegramUser.id.toString() === process.env.ADMIN_TELEGRAM_ID;
                    await query(
                        'UPDATE users SET avatar_url = $1, username = $2, first_name = $3, last_name = $4, is_admin = $5 WHERE id = $6',
                        [avatarUrl, req.telegramUser.username, req.telegramUser.first_name, req.telegramUser.last_name, isAdminUser, req.telegramUser.id]
                    );
                } catch (dbErr) {}
            }
        } else {
            req.telegramUser = null;
        }
    } catch (e) {
        req.telegramUser = null;
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// Endpoint для безопасного получения Payload с сервера
app.get('/api/generate_payload', (req, res) => {
    const text = req.query.text;
    if (!text) return res.status(400).json({ error: "Missing text parameter" });
    try {
        const boc = serializeTextCommentBoc(String(text));
        res.json({ payload: boc });
    } catch (e) {
        res.status(500).json({ error: "BOC compilation error" });
    }
});

app.get('/api/deposit_address', (req, res) => {
    res.json({ address: ADMIN_TON_ADDRESS });
});

app.post('/api/verify-payment', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { amount, userId } = req.body;
    if (!TONCENTER_API_KEY) return res.status(500).json({ error: "API-ключ TON не настроен." });
    if (parseFloat(amount) < 0.1) return res.status(400).json({ error: "Минимальная сумма 0.1 TON" });

    try {
        const TONCENTER_BASE_URL = "https://toncenter.com/api/v2/jsonRPC";
        const exchangeRate = 1.0; 

        const getTxsResponse = await axios.post(TONCENTER_BASE_URL, {
            jsonrpc: "2.0", id: 1, method: "getTransactions", params: { address: ADMIN_TON_ADDRESS, limit: 20 }
        }, { headers: { 'X-API-Key': TONCENTER_API_KEY } });

        if (getTxsResponse.data.error) return res.status(500).json({ error: "Ошибка API" });

        const transactions = getTxsResponse.data.result || [];
        let foundTransaction = null;
        const expectedNano = Math.floor(parseFloat(amount) * 1000000000);

        for (const tx of transactions) {
            if (tx.in_msg && tx.in_msg.value) {
                const valNano = parseInt(tx.in_msg.value);
                if (Math.abs(valNano - expectedNano) < 1000000) {
                    if (matchTransactionComment(tx, userId)) {
                        foundTransaction = tx;
                        break;
                    }
                }
            }
        }

        if (foundTransaction) {
            const gramAmount = parseFloat(amount) * exchangeRate;
            let client;
            try {
                client = await pool.connect();
                await client.query('BEGIN');
                const existingTx = await client.query('SELECT id FROM transactions WHERE user_id = $1 AND type = $2 AND details LIKE $3', [userId, 'deposit_ton', `%${foundTransaction.transaction_id.hash}%`]);
                if (existingTx.rows.length > 0) {
                    await client.query('ROLLBACK');
                    return res.json({ success: true, newBalance: gramAmount });
                }
                await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [gramAmount, userId]);
                await client.query('INSERT INTO transactions (user_id, type, amount, details) VALUES ($1, $2, $3, $4)', [userId, 'deposit_ton', amount, `Пополнение: Хэш ${foundTransaction.transaction_id.hash}`]);
                await client.query('COMMIT');
                if (bot && userId) {
                    bot.sendMessage(userId, `🎉 <b>Баланс успешно пополнен!</b>\n\n💰 На игровой счет зачислено: <b>${gramAmount.toFixed(2)} GRAM</b>`, { parse_mode: 'HTML' }).catch(console.error);
                }
                return res.json({ success: true, newBalance: gramAmount });
            } catch (dbError) {
                if (client) await client.query('ROLLBACK');
                return res.status(500).json({ success: false });
            } finally {
                if (client) client.release();
            }
        } else {
            return res.json({ success: false });
        }
    } catch (err) {
        res.status(500).json({ error: "Сеть TON перегружена." });
    }
});

// Профиль пользователя
app.get('/api/user', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    try {
        let userRes = await query('SELECT id, username, first_name, balance, avatar_url, last_daily_case_open, is_admin FROM users WHERE id = $1', [req.telegramUser.id]);
        let user = userRes.rows[0];
        if (!user) {
            const avatarUrl = req.telegramUser.photo_url || null;
            const isAdminUser = req.telegramUser.id.toString() === process.env.ADMIN_TELEGRAM_ID;
            user = { id: req.telegramUser.id, username: req.telegramUser.username, first_name: req.telegramUser.first_name, balance: 0.000, avatar_url: avatarUrl, last_daily_case_open: new Date('2000-01-01'), is_admin: isAdminUser };
            await query('INSERT INTO users (id, username, first_name, last_name, avatar_url, is_admin) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING', [user.id, user.username, req.telegramUser.first_name, req.telegramUser.last_name, user.avatar_url, user.is_admin]);
        }
        res.json(user);
    } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
});

// Получение инвентаря
app.get('/api/inventory', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const inventoryRows = (await query('SELECT ui.item_id, ui.quantity, i.name, i.image_url, i.value, i.type FROM user_inventory ui JOIN items i ON ui.item_id = i.id WHERE ui.user_id = $1 AND ui.quantity > 0 ORDER BY i.value DESC', [req.telegramUser.id])).rows;
        const inventoryFlat = [];
        for (const row of inventoryRows) {
            for (let i = 0; i < row.quantity; i++) {
                inventoryFlat.push({ item_id: row.item_id, name: row.name, image_url: row.image_url, value: row.value, type: row.type, quantity: 1 });
            }
        }
        res.json(inventoryFlat);
    } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
});

// Ежедневный бесплатный кейс
app.post('/api/open_daily_case', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    let client;
    try {
        const isSubscribed = await checkUserSubscription(userId);
        if (!isSubscribed) return res.status(403).json({ error: "Для открытия кейса необходимо быть подписчиком канала @" + CHANNEL_USERNAME });

        client = await pool.connect();
        await client.query('BEGIN');
        const userRes = await client.query('SELECT username, first_name, last_name, balance, last_daily_case_open, is_admin FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];
        if (!user) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Пользователь не найден.' }); }

        const now = new Date();
        const lastOpen = new Date(user.last_daily_case_open);
        const timeElapsed = now.getTime() - lastOpen.getTime();
        const cooldown = 24 * 60 * 60 * 1000;
        if (!user.is_admin && timeElapsed < cooldown) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Кейс недоступен.', timeLeftMs: cooldown - timeElapsed }); }

        const drops = (await client.query('SELECT dcd.item_id, dcd.chance, i.name, i.type, i.value, i.image_url FROM daily_case_drops dcd JOIN items i ON dcd.item_id = i.id')).rows;
        let totalChance = drops.reduce((sum, drop) => sum + parseFloat(drop.chance), 0);
        let rand = Math.random() * totalChance;
        let wonItem = null;
        for (const drop of drops) {
            rand -= parseFloat(drop.chance);
            if (rand <= 0) { wonItem = drop; break; }
        }
        if (!wonItem) wonItem = drops[drops.length - 1]; 

        let newBalance = parseFloat(user.balance);
        if (wonItem.type === 'balance') {
            newBalance += parseFloat(wonItem.value);
            await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
        } else { 
            await client.query('INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1', [userId, wonItem.item_id]);
        }
        await client.query('UPDATE users SET last_daily_case_open = NOW(), daily_case_notified = false WHERE id = $1', [userId]);
        await client.query('COMMIT');

        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (adminId && bot && wonItem.type !== 'balance') {
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Пользователь';
            const adminMsg = `🎉 <b>Выигран подарок в Ежедневном кейсе!</b>\n\n🎁 <b>Подарок:</b> ${wonItem.name} (ID: ${wonItem.item_id}, Цена: ${wonItem.value} GRAM)\n👤 <b>Пользователь:</b> <a href="tg://user?id=${userId}">${fullName}</a>\n🆔 <b>Telegram ID:</b> <code>${userId}</code>\n\n💬 <a href="tg://user?id=${userId}">Открыть чат (Вечная ссылка)</a>`;
            bot.sendMessage(adminId, adminMsg, { parse_mode: 'HTML' }).catch(console.error);
        }
        res.json({ success: true, wonItem: { id: wonItem.item_id, name: wonItem.name, price: wonItem.value + " GRAM", type: wonItem.type }, newBalance: newBalance });
    } catch (error) { if (client) await client.query('ROLLBACK'); res.status(500).json({ error: 'Ошибка' }); } finally { if (client) client.release(); }
});

// Кейс Новичка
app.post('/api/open_newbie_case', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const userRes = await client.query('SELECT username, first_name, last_name, balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];
        if (!user) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Пользователь не найден.' }); }

        const spinCost = 0.1;
        if (parseFloat(user.balance) < spinCost) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Недостаточно GRAM!' }); }

        const drops = (await client.query('SELECT ncd.item_id, ncd.chance, i.name, i.type, i.value, i.image_url FROM newbie_case_drops ncd JOIN items i ON ncd.item_id = i.id')).rows;
        let totalChance = drops.reduce((sum, drop) => sum + parseFloat(drop.chance), 0);
        let rand = Math.random() * totalChance;
        let wonItem = null;
        for (const drop of drops) {
            rand -= parseFloat(drop.chance);
            if (rand <= 0) { wonItem = drop; break; }
        }
        if (!wonItem) wonItem = drops[drops.length - 1]; 

        let newBalance = parseFloat(user.balance) - spinCost;
        if (wonItem.type === 'balance') {
            newBalance += parseFloat(wonItem.value);
            await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
        } else { 
            await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
            await client.query('INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1', [userId, wonItem.item_id]);
        }
        await client.query('COMMIT');

        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (adminId && bot && wonItem.type !== 'balance') {
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Пользователь';
            const adminMsg = `🎉 <b>Выигран подарок в Кейсе Новичка!</b>\n\n🎁 <b>Подарок:</b> ${wonItem.name} (ID: ${wonItem.item_id}, Цена: ${wonItem.value} GRAM)\n👤 <b>Пользователь:</b> <a href="tg://user?id=${userId}">${fullName}</a>\n🆔 <b>Telegram ID:</b> <code>${userId}</code>\n\n💬 <a href="tg://user?id=${userId}">Открыть чат (Вечная ссылка)</a>`;
            bot.sendMessage(adminId, adminMsg, { parse_mode: 'HTML' }).catch(console.error);
        }
        res.json({ success: true, wonItem: { id: wonItem.item_id, name: wonItem.name, price: wonItem.value + " GRAM", type: wonItem.type }, newBalance: newBalance });
    } catch (error) { if (client) await client.query('ROLLBACK'); res.status(500).json({ error: 'Ошибка' }); } finally { if (client) client.release(); }
});

// Продажа подарка
app.post('/api/sell_gift', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    const { itemId, price } = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const inventoryRes = await client.query('SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE', [userId, itemId]);
        const item = inventoryRes.rows[0];
        if (!item || item.quantity < 1) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'У вас нет предмета.' }); }
        await client.query('UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
        const userRes = await client.query('SELECT username, first_name, last_name, balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];
        const newBalance = parseFloat(user.balance) + parseFloat(price);
        await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
        await client.query('COMMIT');
        res.json({ success: true, newBalance: newBalance });
    } catch (error) { if (client) await client.query('ROLLBACK'); res.status(500).json({ error: 'Ошибка' }); } finally { if (client) client.release(); }
});

// Вывод подарка
app.post('/api/withdraw_gift', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    const { itemId } = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const inventoryRes = await client.query('SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE', [userId, itemId]);
        const itemRow = inventoryRes.rows[0];
        if (!itemRow || itemRow.quantity < 1) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Нет предмета.' }); }
        await client.query('UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
        await client.query('COMMIT');

        const itemDetails = (await query('SELECT name, value FROM items WHERE id = $1', [itemId])).rows[0];
        const userRes = await query('SELECT username, first_name, last_name FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];

        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (adminId && bot) {
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Пользователь';
            const msg = `📤 <b>Запрос на вывод подарка!</b>\n\n` +
                        `🎁 <b>Подарок:</b> ${itemDetails.name} (${parseFloat(itemDetails.value).toFixed(3)} GRAM)\n` +
                        `👤 <b>Пользователь:</b> <a href="tg://user?id=${userId}">${fullName}</a>\n` +
                        `🆔 <b>Telegram ID:</b> <code>${userId}</code>\n\n` +
                        `💬 <a href="tg://user?id=${userId}">Открыть чат (Вечная ссылка)</a>`;
            bot.sendMessage(adminId, msg, { parse_mode: 'HTML' }).catch(console.error);
        }
        res.json({ success: true });
    } catch (error) { if (client) await client.query('ROLLBACK'); res.status(500).json({ error: 'Ошибка' }); } finally { if (client) client.release(); }
});

// Заявка на депозит
app.post('/api/deposit_gift_request', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    const { itemId } = req.body;
    try {
        const itemDetails = (await query('SELECT name, value, type FROM items WHERE id = $1', [itemId])).rows[0];
        if (!itemDetails) return res.status(400).json({ error: 'Предмет не найден.' });
        const userRes = await query('SELECT username, first_name, last_name FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];

        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (adminId && bot) {
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Пользователь';
            const msg = `📥 <b>Новый запрос на депозит!</b>\n\n` +
                        `🎁 <b>Предмет:</b> ${itemDetails.name} (ID: ${itemId})\n` +
                        `👤 <b>Пользователь:</b> <a href="tg://user?id=${userId}">${fullName}</a>\n` +
                        `🆔 <b>Telegram ID:</b> <code>${userId}</code>\n\n` +
                        `💬 <a href="tg://user?id=${userId}">Открыть чат (Вечная ссылка)</a>`;
            bot.sendMessage(adminId, msg, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Одобрить', callback_data: `dep_app_${userId}_${itemId}` },
                        { text: '❌ Отклонить', callback_data: `dep_rej_${userId}_${itemId}` }
                    ]]
                }
            }).catch(console.error);
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Ошибка.' }); }
});

app.get('/api/daily_case_info', (req, res) => { res.json({ channel_username: CHANNEL_USERNAME }); });
app.listen(PORT, () => console.log("🚀 Server running on port " + PORT));

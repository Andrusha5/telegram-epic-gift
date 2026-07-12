const express = require('express');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

// Глобальный перехват ошибок для стабильности
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
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// MIDDLEWARE АВТОРИЗАЦИИ TELEGRAM (РАБОТАЕТ ПЕРВЫМ ДЛЯ ВСЕХ ЗАПРОСОВ)
// ---------------------------------------------------------------------------
app.use(async (req, res, next) => {
    // Безопасно парсим initData из Body (для JSON-запросов), из заголовков или из query
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
            console.warn("Unauthorized: Telegram initData hash mismatch.");
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
                } catch (dbErr) {
                    console.error("Ошибка синхронизации БД при обновлении пользователя:", dbErr);
                }
            }
        } else {
            req.telegramUser = null;
        }
    } catch (e) {
        req.telegramUser = null;
        console.error("Ошибка верификации Telegram initData:", e);
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// ---------------------------------------------------------------------------
// ВСЕ РОУТЫ (ЗАЩИЩЕНЫ АВТОРИЗАЦИЕЙ СВЕРХУ)
// ---------------------------------------------------------------------------

app.get('/api/deposit_address', (req, res) => {
    res.json({ address: ADMIN_TON_ADDRESS });
});

app.get('/tonconnect-manifest.json', (req, res) => {
    const host = req.get('host');
    const protocol = (host.includes('localhost') || host.includes('127.0.0.1')) ? 'http' : 'https';
    const appUrl = process.env.WEB_APP_URL || `${protocol}://${host}`;
    
    res.setHeader('Content-Type', 'application/json');
    res.json({
        url: appUrl,
        name: "BestGifts",
        iconUrl: `${appUrl}/Images/Items/gram_popolnenie.png`
    });
});

// ВСЕСТОРОННИЙ ДЕКОДЕР КОММЕНТАРИЕВ ДЛЯ НАДЕЖНОЙ ВЕРИФИКАЦИИ ТРАНЗАКЦИЙ
function matchTransactionComment(tx, userId) {
    const targetPattern = `deposit_${userId}`;
    const candidates = [];

    if (tx.in_msg) {
        if (tx.in_msg.message) candidates.push(tx.in_msg.message);
        if (tx.in_msg.msg_data) {
            if (tx.in_msg.msg_data.text) candidates.push(tx.in_msg.msg_data.text);
            if (tx.in_msg.msg_data.body) candidates.push(tx.in_msg.msg_data.body);
        }
    }

    for (const val of candidates) {
        if (!val) continue;
        
        // 1. Проверка прямого совпадения
        if (val.includes(targetPattern)) return true;

        // 2. Декодирование Base64
        try {
            const fromBase64 = Buffer.from(val, 'base64').toString('utf8');
            if (fromBase64.includes(targetPattern)) return true;
        } catch (e) {}

        // 3. Декодирование Hex
        try {
            const fromHex = Buffer.from(val, 'hex').toString('utf8');
            if (fromHex.includes(targetPattern)) return true;
        } catch (e) {}
    }
    return false;
}

// АВТОМАТИЧЕСКАЯ ПРОВЕРКА ПЛАТЕЖЕЙ TON CONNECT (1 TON = 1 GRAM)
app.post('/api/verify-payment', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) {
        console.warn("verify-payment: Запрос отклонен (нет telegramUser.id в сессии)");
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { amount, userId } = req.body;

    if (!TONCENTER_API_KEY) {
        console.error("verify-payment: TONCENTER_API_KEY отсутствует.");
        return res.status(500).json({ error: "Ошибка сервера: API-ключ TON не настроен." });
    }

    // Минимальный лимит на депозит на бэкенде
    if (parseFloat(amount) < 0.1) {
         return res.status(400).json({ error: "Ошибка: минимальная сумма 0.1 GRAM" });
    }

    try {
        const TONCENTER_BASE_URL = "https://toncenter.com/api/v2/jsonRPC";
        
        // Курс обмена установлен как 1:1 (1 TON = 1 GRAM)
        const exchangeRate = 1.0; 

        console.log(`verify-payment: Запрос транзакций для кошелька ${ADMIN_TON_ADDRESS}...`);
        const getTxsResponse = await axios.post(TONCENTER_BASE_URL, {
            jsonrpc: "2.0",
            id: 1,
            method: "getTransactions",
            params: {
                address: ADMIN_TON_ADDRESS,
                limit: 20
            }
        }, {
            headers: { 'X-API-Key': TONCENTER_API_KEY }
        });

        if (getTxsResponse.data.error) {
            console.error("TonCenter API error:", getTxsResponse.data.error);
            return res.status(500).json({ error: "Ошибка TonCenter API: " + getTxsResponse.data.error.message });
        }

        const transactions = getTxsResponse.data.result || [];
        console.log(`verify-payment: Получено ${transactions.length} транзакций. Проверка суммы ${amount} TON от игрока ${userId}.`);
        
        let foundTransaction = null;
        const expectedNano = Math.floor(parseFloat(amount) * 1000000000);

        for (const tx of transactions) {
            if (tx.in_msg && tx.in_msg.value) {
                const valNano = parseInt(tx.in_msg.value);
                
                // Сумма совпадает с погрешностью до 0.001 TON
                if (Math.abs(valNano - expectedNano) < 1000000) {
                    
                    // Запуск умного мульти-декодирования
                    if (matchTransactionComment(tx, userId)) {
                        console.log(`verify-payment: Транзакция успешно найдена! Hash: ${tx.transaction_id.hash}`);
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

                // Проверяем на повторное зачисление по хешу транзакции
                const existingTx = await client.query(
                    'SELECT id FROM transactions WHERE user_id = $1 AND type = $2 AND details LIKE $3',
                    [userId, 'deposit_ton', `%${foundTransaction.transaction_id.hash}%`]
                );
                
                if (existingTx.rows.length > 0) {
                    await client.query('ROLLBACK');
                    console.warn(`verify-payment: Транзакция ${foundTransaction.transaction_id.hash} уже зачислялась ранее.`);
                    return res.json({ success: true, newBalance: gramAmount, message: "Платеж уже зачислен." });
                }

                // Зачисление баланса
                await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [gramAmount, userId]);

                // Запись в базу истории транзакций
                await client.query(
                    'INSERT INTO transactions (user_id, type, amount, details) VALUES ($1, $2, $3, $4)',
                    [userId, 'deposit_ton', amount, `Пополнение через TON Connect на +${amount} TON (+${gramAmount} GRAM). Хэш: ${foundTransaction.transaction_id.hash}`]
                );
                await client.query('COMMIT');
                console.log(`verify-payment: Баланс пользователя ${userId} пополнен на +${gramAmount} GRAM.`);

                // Отправка автоматического уведомления ТОЛЬКО ИГРОКУ, сделавшему перевод (Админу НЕ шлет)
                if (bot && userId) {
                    const msg = `🎉 *Баланс успешно пополнен!*\n\n` +
                                `💰 На ваш игровой счет зачислено: *${gramAmount.toFixed(2)} GRAM*\n\n` +
                                `🎈 Спасибо за покупку и приятной игры!`;
                    bot.sendMessage(userId, msg, { parse_mode: 'Markdown' }).catch(console.error);
                }

                return res.json({ success: true, newBalance: gramAmount });

            } catch (dbError) {
                if (client) await client.query('ROLLBACK');
                console.error("verify-payment: Ошибка БД при зачислении:", dbError);
                return res.status(500).json({ success: false, error: "Ошибка БД при обработке начислений." });
            } finally {
                if (client) client.release();
            }

        } else {
            console.log(`verify-payment: Транзакция для ${userId} на сумму ${amount} TON пока отсутствует в блоке.`);
            return res.json({ success: false, message: "Ожидаем подтверждения транзакции сетью TON." });
        }
    } catch (err) {
        console.error("verify-payment: Критическая ошибка TonCenter:", err.message);
        res.status(500).json({ error: "Сервер TON временно перегружен. Пожалуйста, подождите." });
    }
});

// Профиль пользователя
app.get('/api/user', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        let userRes = await query('SELECT id, username, first_name, balance, avatar_url, last_daily_case_open, is_admin FROM users WHERE id = $1', [req.telegramUser.id]);
        let user = userRes.rows[0];
        
        if (!user) {
            const avatarUrl = req.telegramUser.photo_url || null;
            const isAdminUser = req.telegramUser.id.toString() === process.env.ADMIN_TELEGRAM_ID;
            user = {
                id: req.telegramUser.id,
                username: req.telegramUser.username,
                first_name: req.telegramUser.first_name,
                balance: 0.000,
                avatar_url: avatarUrl,
                last_daily_case_open: new Date('2000-01-01'),
                is_admin: isAdminUser
            };
            await query(
                'INSERT INTO users (id, username, first_name, last_name, avatar_url, is_admin) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
                [user.id, user.username, req.telegramUser.first_name, req.telegramUser.last_name, user.avatar_url, user.is_admin]
            );
        }
        res.json(user);
    } catch (error) {
        console.error("Ошибка получения данных пользователя:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получение инвентаря
app.get('/api/inventory', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const inventoryRows = (await query(`
            SELECT ui.item_id, ui.quantity, i.name, i.image_url, i.value, i.type
            FROM user_inventory ui
            JOIN items i ON ui.item_id = i.id
            WHERE ui.user_id = $1 AND ui.quantity > 0
            ORDER BY i.value DESC
        `, [req.telegramUser.id])).rows;

        const inventoryFlat = [];
        for (const row of inventoryRows) {
            for (let i = 0; i < row.quantity; i++) {
                inventoryFlat.push({
                    item_id: row.item_id,
                    name: row.name,
                    image_url: row.image_url,
                    value: row.value,
                    type: row.type,
                    quantity: 1
                });
            }
        }
        res.json(inventoryFlat);
    } catch (error) {
        console.error("Ошибка получения инвентаря:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Открытие Ежедневного бесплатного кейса (С ТАЙМЕРОМ 24 ЧАСА)
app.post('/api/open_daily_case', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = req.telegramUser.id;

    let client;
    try {
        const isSubscribed = await checkUserSubscription(userId);
        if (!isSubscribed) {
            return res.status(403).json({ error: "Для открытия кейса необходимо быть подписчиком канала @" + CHANNEL_USERNAME });
        }

        client = await pool.connect();
        await client.query('BEGIN');

        const userRes = await client.query('SELECT username, first_name, last_name, balance, last_daily_case_open, is_admin FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];

        if (!user) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Пользователь не найден.' });
        }

        const now = new Date();
        const lastOpen = new Date(user.last_daily_case_open);
        const timeElapsed = now.getTime() - lastOpen.getTime();
        const cooldown = 24 * 60 * 60 * 1000;

        if (!user.is_admin && timeElapsed < cooldown) {
            await client.query('ROLLBACK');
            const timeLeftMs = cooldown - timeElapsed;
            return res.status(400).json({ error: 'Кейс будет доступен позже.', timeLeftMs });
        }

        const drops = (await client.query(`
            SELECT dcd.item_id, dcd.chance, i.name, i.type, i.value, i.image_url
            FROM daily_case_drops dcd
            JOIN items i ON dcd.item_id = i.id
        `)).rows;

        if (drops.length === 0) {
            await client.query('ROLLBACK');
            return res.status(500).json({ error: 'Кейс временно пуст.' });
        }

        let totalChance = drops.reduce((sum, drop) => sum + parseFloat(drop.chance), 0);
        let rand = Math.random() * totalChance;
        let wonItem = null;

        for (const drop of drops) {
            rand -= parseFloat(drop.chance);
            if (rand <= 0) {
                wonItem = drop;
                break;
            }
        }

        if (!wonItem) wonItem = drops[drops.length - 1]; 

        let newBalance = parseFloat(user.balance);
        if (wonItem.type === 'balance') {
            newBalance += parseFloat(wonItem.value);
            await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
            await client.query('INSERT INTO transactions (user_id, type, item_id, amount, details) VALUES ($1, $2, $3, $4, $5)',
                [userId, 'case_open_daily', wonItem.item_id, wonItem.value, 'Ежедневный кейс: ' + wonItem.name]);
        } else { 
            await client.query(
                'INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1',
                [userId, wonItem.item_id]
            );
        }

        await client.query('UPDATE users SET last_daily_case_open = NOW(), daily_case_notified = false WHERE id = $1', [userId]);
        await client.query('COMMIT');

        // ОТПРАВЛЯЕМ УВЕДОМЛЕНИЕ АДМИНУ ЕСЛИ ВЫПАЛ ИМЕННО ПОДАРК (GIFT)
        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (adminId && bot && wonItem.type !== 'balance') {
            const userMention = user.username ? `@${user.username}` : user.first_name;
            const adminMsg = `🎉 *Выигран подарок в Ежедневном кейсе!*\n\n` +
                             `👤 Пользователь: ${user.first_name} (${userMention})\n` +
                             `🎁 Подарок: *${wonItem.name}* (ID: ${wonItem.item_id}, Цена: ${wonItem.value} GRAM)\n` +
                             `🔗 Ссылка на чат: [Открыть чат](tg://user?id=${userId})`;
            bot.sendMessage(adminId, adminMsg, { parse_mode: 'Markdown' }).catch(console.error);
        }

        res.json({ success: true, wonItem: { id: wonItem.item_id, name: wonItem.name, price: wonItem.value + " GRAM", type: wonItem.type }, newBalance: newBalance });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("Ошибка при открытии ежедневного кейса:", error);
        res.status(500).json({ error: 'Произошла ошибка при открытии.' });
    } finally {
        if (client) client.release(); 
    }
});

// Открытие Кейса Новичка (БЕЗ ТАЙМЕРОВ)
app.post('/api/open_newbie_case', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = req.telegramUser.id;

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const userRes = await client.query('SELECT username, first_name, last_name, balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];

        if (!user) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Пользователь не найден.' });
        }

        const spinCost = 0.1;
        if (parseFloat(user.balance) < spinCost) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Недостаточно средств. Прокрут стоит 0.1 GRAM!' });
        }

        const drops = (await client.query(`
            SELECT ncd.item_id, ncd.chance, i.name, i.type, i.value, i.image_url
            FROM newbie_case_drops ncd
            JOIN items i ON ncd.item_id = i.id
        `)).rows;

        if (drops.length === 0) {
            await client.query('ROLLBACK');
            return res.status(500).json({ error: 'Кейс новичка временно пуст.' });
        }

        let totalChance = drops.reduce((sum, drop) => sum + parseFloat(drop.chance), 0);
        let rand = Math.random() * totalChance;
        let wonItem = null;

        for (const drop of drops) {
            rand -= parseFloat(drop.chance);
            if (rand <= 0) {
                wonItem = drop;
                break;
            }
        }

        if (!wonItem) wonItem = drops[drops.length - 1]; 

        let newBalance = parseFloat(user.balance) - spinCost;
        if (wonItem.type === 'balance') {
            newBalance += parseFloat(wonItem.value);
            await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
            await client.query('INSERT INTO transactions (user_id, type, item_id, amount, details) VALUES ($1, $2, $3, $4, $5)',
                [userId, 'case_open_newbie', wonItem.item_id, wonItem.value, 'Кейс Новичка: ' + wonItem.name]);
        } else { 
            await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
            await client.query(
                'INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1',
                [userId, wonItem.item_id]
            );
        }

        await client.query('COMMIT');

        // ОТПРАВЛЯЕМ УВЕДОМЛЕНИЕ АДМИНУ ЕСЛИ ВЫПАЛ ИМЕННО ПОДАРК (GIFT) В КЕЙСЕ НОВИЧКА
        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (adminId && bot && wonItem.type !== 'balance') {
            const userMention = user.username ? `@${user.username}` : user.first_name;
            const adminMsg = `🎉 *Выигран подарок в Кейсе Новичка!*\n\n` +
                             `👤 Пользователь: ${user.first_name} (${userMention})\n` +
                             `🎁 Подарок: *${wonItem.name}* (ID: ${wonItem.item_id}, Цена: ${wonItem.value} GRAM)\n` +
                             `🔗 Ссылка на чат: [Открыть чат](tg://user?id=${userId})`;
            bot.sendMessage(adminId, adminMsg, { parse_mode: 'Markdown' }).catch(console.error);
        }

        res.json({ success: true, wonItem: { id: wonItem.item_id, name: wonItem.name, price: wonItem.value + " GRAM", type: wonItem.type }, newBalance: newBalance });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("Ошибка при открытии кейса новичка:", error);
        res.status(500).json({ error: 'Произошла ошибка при открытии.' });
    } finally {
        if (client) client.release();
    }
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

        if (!item || item.quantity < 1) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'У вас нет этого предмета.' });
        }

        await client.query('UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
        const userRes = await client.query('SELECT username, first_name, last_name, balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];
        const newBalance = parseFloat(user.balance) + parseFloat(price);

        await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
        await client.query('COMMIT');

        res.json({ success: true, newBalance: newBalance });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("Ошибка при продаже подарка:", error);
        res.status(500).json({ error: 'Ошибка при продаже.' });
    } finally {
        if (client) client.release();
    }
});

// Вывод подарка (УВЕДОМЛЕНИЕ АДМИНУ С ПРЯМОЙ ССЫЛКОЙ НА ЮЗЕРА)
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

        if (!itemRow || itemRow.quantity < 1) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Недостаточно предметов в инвентаре.' });
        }

        await client.query('UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
        await client.query('COMMIT');

        // Получаем информацию о предмете и пользователе для отправки уведомления админу
        const itemDetails = (await query('SELECT name, value FROM items WHERE id = $1', [itemId])).rows[0];
        const userRes = await query('SELECT username, first_name FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];

        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (adminId && bot) {
            const userMention = user.username ? `@${user.username}` : user.first_name;
            const msg = `📤 *Запрос на вывод подарка!*\n\n` +
                        `👤 Пользователь: ${user.first_name} (${userMention})\n` +
                        `🎁 Подарок: *${itemDetails.name}* (ID: ${itemId}, Цена: ${itemDetails.value} GRAM)\n` +
                        `🔗 Ссылка на чат: [Открыть чат](tg://user?id=${userId})`;

            bot.sendMessage(adminId, msg, { parse_mode: 'Markdown' }).catch(console.error);
        }

        res.json({ success: true });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("Ошибка при выводе подарка:", error);
        res.status(500).json({ error: 'Ошибка сервера при выводе.' });
    } finally {
        if (client) client.release();
    }
});

// Запрос на ввод подарка NFT (УВЕДОМЛЕНИЕ АДМИНУ С ПРЯМОЙ ССЫЛКОЙ)
app.post('/api/deposit_gift_request', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    const { itemId } = req.body;

    try {
        const itemDetails = (await query('SELECT name, value, type FROM items WHERE id = $1', [itemId])).rows[0];
        if (!itemDetails) return res.status(400).json({ error: 'Предмет не найден.' });

        const userRes = await query('SELECT username, first_name FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];

        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (adminId && bot) {
            const userMention = user.username ? `@${user.username}` : user.first_name;
            const msg = `📥 *Новый запрос на депозит!*\n\n` +
                        `👤 Пользователь: ${user.first_name} (${userMention})\n` +
                        `🎁 Предмет: *${itemDetails.name}* (ID: ${itemId})\n` +
                        `🔗 Ссылка на чат: [Открыть чат](tg://user?id=${userId})`;

            bot.sendMessage(adminId, msg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Одобрить', callback_data: `dep_app_${userId}_${itemId}` },
                            { text: '❌ Отклонить', callback_data: `dep_rej_${userId}_${itemId}` }
                        ]
                    ]
                }
            }).catch(console.error);
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Ошибка при запросе на депозит подарка:", error);
        res.status(500).json({ error: 'Ошибка сервера.' });
    }
});

app.get('/api/daily_case_info', (req, res) => {
    res.json({ channel_username: CHANNEL_USERNAME });
});

app.listen(PORT, () => console.log("🚀 Server running on port " + PORT));

const express = require('express');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// Глобальные перехватчики ошибок, чтобы Render никогда не падал при старте
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [Safe Engine] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('⚠️ [Safe Engine] Uncaught Exception:', err);
});

const db = require('./db');
const botModule = require('./bot');

// Безопасный импорт бота и его функций
const bot = botModule.bot || botModule;
const checkUserSubscription = botModule.checkUserSubscription || (async () => true);
const getUserAvatarUrl = botModule.getUserAvatarUrl || (async () => null);

// Автоматическое определение структуры экспорта пула БД (db или db.pool)
const pool = db.pool || db;
const query = (text, params) => pool.query(text, params);

const app = express();
const PORT = process.env.PORT || 3000;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || "";

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware безопасности Telegram
app.use(async (req, res, next) => {
    const initData = req.headers['x-telegram-init-data'] || req.query.initData;

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
                } catch (dbErr) {
                    console.error("Ошибка обновления пользователя в БД:", dbErr);
                }
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

// 1. Получение данных пользователя
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
        console.error("Ошибка в /api/user:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. Получение инвентаря (ПЛОСКИЙ СПИСОК БЕЗ x2/x3)
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
        console.error("Ошибка в /api/inventory:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 3. Открытие ежедневного кейса
app.post('/api/open_daily_case', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = req.telegramUser.id;

    try {
        const isSubscribed = await checkUserSubscription(userId);
        if (!isSubscribed) {
            return res.status(403).json({ error: "Для открытия кейса необходимо быть подписчиком канала @" + CHANNEL_USERNAME });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const userRes = await client.query('SELECT balance, last_daily_case_open, is_admin FROM users WHERE id = $1 FOR UPDATE', [userId]);
            const user = userRes.rows[0];

            if (!user) {
                await client.query('ROLLBACK');
                client.release();
                return res.status(404).json({ error: 'Пользователь не найден.' });
            }

            const now = new Date();
            const lastOpen = new Date(user.last_daily_case_open);
            const timeElapsed = now.getTime() - lastOpen.getTime();
            const cooldown = 24 * 60 * 60 * 1000;

            if (!user.is_admin && timeElapsed < cooldown) {
                await client.query('ROLLBACK');
                client.release();
                const timeLeftMs = cooldown - timeElapsed;
                return res.status(400).json({ error: 'Кейс будет доступен позже.', timeLeftMs });
            }

            const drops = (await client.query(`
                SELECT dcd.item_id, dcd.chance, i.name, i.type, i.value, i.image_url
                FROM daily_case_drops dcd
                JOIN items i ON dcd.item_id = i.id
            `)).rows;

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
                    [userId, 'case_open', wonItem.item_id, wonItem.value, 'Выигрыш из ежедневного кейса: ' + wonItem.name]);
            } else {
                await client.query(
                    'INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1',
                    [userId, wonItem.item_id]
                );
            }

            await client.query('UPDATE users SET last_daily_case_open = NOW() WHERE id = $1', [userId]);
            await client.query('COMMIT');
            client.release();

            res.json({ success: true, wonItem: { id: wonItem.item_id, name: wonItem.name, price: wonItem.value + " TON" }, newBalance: newBalance });

        } catch (error) {
            await client.query('ROLLBACK');
            client.release();
            console.error("Ошибка транзакции кейса:", error);
            res.status(500).json({ error: 'Произошла ошибка при открытии.' });
        }
    } catch (error) {
        console.error("Глобальная ошибка /api/open_daily_case:", error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// 4. Продажа подарка
app.post('/api/sell_gift', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    const { itemId, price } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const inventoryRes = await client.query('SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE', [userId, itemId]);
        const item = inventoryRes.rows[0];

        if (!item || item.quantity < 1) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ error: 'У вас нет этого предмета.' });
        }

        await client.query('UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
        const userRes = await client.query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const newBalance = parseFloat(userRes.rows[0].balance) + parseFloat(price);

        await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
        await client.query('COMMIT');
        client.release();

        res.json({ success: true, newBalance: newBalance });
    } catch (error) {
        await client.query('ROLLBACK');
        client.release();
        console.error("Ошибка в /api/sell_gift:", error);
        res.status(500).json({ error: 'Ошибка при продаже.' });
    }
});

// 5. Вывод подарка (Надёжные классические строки)
app.post('/api/withdraw_gift', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    const { itemId } = req.body;

    const parsedItemId = parseInt(itemId, 10);
    if (isNaN(parsedItemId)) {
        return res.status(400).json({ error: 'Неверный ID подарка.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const inventoryRes = await client.query('SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE', [userId, parsedItemId]);
        const itemRow = inventoryRes.rows[0];

        if (!itemRow || itemRow.quantity < 1) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ error: 'Недостаточно предметов в вашем инвентаре.' });
        }

        await client.query('UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2', [userId, parsedItemId]);
        
        const itemDetails = (await client.query('SELECT name, value FROM items WHERE id = $1', [parsedItemId])).rows[0];
        const userRes = await client.query('SELECT username, first_name, last_name FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];

        await client.query('COMMIT');
        client.release();

        // Асинхронная отправка уведомления админу
        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (adminId && bot && typeof bot.sendMessage === 'function') {
            const userMention = user.username ? '@' + user.username : (user.first_name || 'Без имени');
            const chatLink = 'tg://user?id=' + userId;
            const tmeLink = user.username ? 'https://t.me/' + user.username : 'https://t.me/user?id=' + userId;

            // Сборка сообщения через безопасное сложение строк
            const message = "🚨 *Новая заявка на вывод подарка!*\n\n" +
                            "🎁 *Подарок:* " + itemDetails.name + " (" + itemDetails.value + " TON)\n" +
                            "👤 *Пользователь:* " + (user.first_name || "") + " " + (user.last_name || "") + " (" + userMention + ")\n" +
                            "🆔 *Telegram ID:* " + userId + "\n\n" +
                            "💬 [Открыть чат](" + chatLink + ")\n" +
                            "🔗 [Ссылка t.me](" + tmeLink + ")";

            bot.sendMessage(adminId, message, { parse_mode: 'Markdown' }).catch(err => {
                console.error("Бот не смог отправить сообщение админу:", err.message);
            });
        }

        res.json({ success: true });

    } catch (error) {
        await client.query('ROLLBACK');
        if (client) client.release();
        console.error('Ошибка вывода предмета:', error);
        res.status(500).json({ error: 'Ошибка сервера при выводе.' });
    }
});

// 6. Заявка на Ввод подарка (NFT DEPOSIT REQUEST)
app.post('/api/deposit_gift_request', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    const { itemId } = req.body;

    const parsedItemId = parseInt(itemId, 10);
    if (isNaN(parsedItemId)) {
        return res.status(400).json({ error: 'Неверный ID подарка.' });
    }

    try {
        const itemDetails = (await query('SELECT name, value FROM items WHERE id = $1', [parsedItemId])).rows[0];
        if (!itemDetails) {
            return res.status(400).json({ error: 'Подарок не найден в системе.' });
        }

        const userRes = await query('SELECT username, first_name, last_name FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];

        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (adminId && bot && typeof bot.sendMessage === 'function') {
            const userMention = user.username ? '@' + user.username : (user.first_name || 'Без имени');
            const chatLink = 'tg://user?id=' + userId;
            const tmeLink = user.username ? 'https://t.me/' + user.username : 'https://t.me/user?id=' + userId;

            // Сборка сообщения без использования обратных апострофов
            const message = "📥 *Новая заявка на ВВОД подарка NFT!*\n\n" +
                            "🎁 *Подарок:* " + itemDetails.name + " (" + itemDetails.value + " TON)\n" +
                            "👤 *Отправитель:* " + (user.first_name || "") + " " + (user.last_name || "") + " (" + userMention + ")\n" +
                            "🆔 *Telegram ID:* `" + userId + "`\n\n" +
                            "💬 [Открыть чат с пользователем](" + chatLink + ")\n" +
                            "🔗 [Прямая ссылка t.me](" + tmeLink + ")\n\n" +
                            "_Проверьте получение подарка на вашем аккаунте @Sintopa и нажмите кнопку ниже:_";

            const options = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Подтвердить', callback_data: 'dep_app_' + userId + '_' + parsedItemId },
                            { text: '❌ Отклонить', callback_data: 'dep_rej_' + userId + '_' + parsedItemId }
                        ]
                    ]
                }
            };

            bot.sendMessage(adminId, message, options).catch(err => {
                console.error("Не удалось отправить заявку ввода админу:", err);
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка отправки заявки на ввод:', error);
        res.status(500).json({ error: 'Ошибка сервера.' });
    }
});

// --- АВТОМАТИЧЕСКАЯ ОБРАБОТКА КНОПОК ПОДТВЕРЖДЕНИЯ АДМИНОМ ---
if (bot && typeof bot.on === 'function') {
    bot.on('callback_query', async (callbackQuery) => {
        const action = callbackQuery.data;
        const msg = callbackQuery.message;
        
        if (action.startsWith('dep_app_') || action.startsWith('dep_rej_')) {
            const parts = action.split('_'); // ['dep', 'app/rej', userId, itemId]
            const isApprove = parts[1] === 'app';
            const targetUserId = parseInt(parts[2], 10);
            const itemId = parseInt(parts[3], 10);

            try {
                const itemRes = await query('SELECT name FROM items WHERE id = $1', [itemId]);
                const itemName = itemRes.rows[0]?.name || 'Подарок';

                if (isApprove) {
                    await query(
                        'INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1',
                        [targetUserId, itemId]
                    );

                    bot.sendMessage(targetUserId, "🎉 *Подарок зачислен!*\n\nАдминистратор проверил вашу транзакцию. Подарок *\"" + itemName + "\"* успешно введен в ваш инвентарь!", { parse_mode: 'Markdown' }).catch(() => {});

                    bot.editMessageText("✅ Заявка на ввод подарка *\"" + itemName + "\"* одобрена. Предмет успешно зачислен в инвентарь пользователя!", {
                        chat_id: msg.chat.id,
                        message_id: msg.message_id,
                        parse_mode: 'Markdown'
                    }).catch(() => {});
                } else {
                    bot.sendMessage(targetUserId, "❌ *Ввод подарка отклонен!*\n\nВаша заявка на ввод подарка *\"" + itemName + "\"* была отклонена администратором. Пожалуйста, убедитесь, что вы отправили NFT на аккаунт @Sintopa.", { parse_mode: 'Markdown' }).catch(() => {});

                    bot.editMessageText("❌ Заявка на ввод подарка *\"" + itemName + "\"* была отклонена вами.", {
                        chat_id: msg.chat.id,
                        message_id: msg.message_id,
                        parse_mode: 'Markdown'
                    }).catch(() => {});
                }
            } catch (err) {
                console.error('Ошибка в callback_query обработчике:', err);
            }
        }

        bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
    });
}

// 7. Получение информации о канале
app.get('/api/daily_case_info', (req, res) => {
    res.json({ channel_username: CHANNEL_USERNAME });
});

app.listen(PORT, () => console.log("🚀 Safe Server running on port " + PORT));

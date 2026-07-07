const express = require('express');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

process.on('unhandledRejection', (r) => console.error('UnhandledRejection', r));
process.on('uncaughtException', (e) => console.error('UncaughtException', e));

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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Telegram initData middleware
app.use(async (req, res, next) => {
    const initData = req.headers['x-telegram-init-data'] || req.query.initData;
    if (!initData) { req.telegramUser = null; return next(); }
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');
        params.sort();
        let dataCheckString = '';
        for (const [k, v] of params.entries()) dataCheckString += `${k}=${v}\n`;
        dataCheckString = dataCheckString.trim();
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        if (calculatedHash !== hash) { req.telegramUser = null; return res.status(401).json({ error: 'Unauthorized' }); }
        const userJson = params.get('user');
        if (userJson) {
            req.telegramUser = JSON.parse(userJson);
            if (req.telegramUser.id) {
                let avatarUrl = req.telegramUser.photo_url || null;
                try {
                    if (!avatarUrl) avatarUrl = await getUserAvatarUrl(req.telegramUser.id);
                    const isAdminUser = req.telegramUser.id.toString() === process.env.ADMIN_TELEGRAM_ID;
                    await query('UPDATE users SET avatar_url = $1, username = $2, first_name = $3, last_name = $4, is_admin = $5 WHERE id = $6',
                        [avatarUrl, req.telegramUser.username, req.telegramUser.first_name, req.telegramUser.last_name, isAdminUser, req.telegramUser.id]);
                } catch (err) { console.error('DB update user error', err); }
            }
        } else req.telegramUser = null;
    } catch (e) {
        req.telegramUser = null;
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// API: /api/user
app.get('/api/user', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    try {
        let userRes = await query('SELECT id, username, first_name, balance, avatar_url, last_daily_case_open, is_admin FROM users WHERE id=$1', [req.telegramUser.id]);
        let user = userRes.rows[0];
        if (!user) {
            const avatarUrl = req.telegramUser.photo_url || null;
            const isAdminUser = req.telegramUser.id.toString() === process.env.ADMIN_TELEGRAM_ID;
            user = { id: req.telegramUser.id, username: req.telegramUser.username, first_name: req.telegramUser.first_name, balance: 0.000, avatar_url: avatarUrl, last_daily_case_open: new Date('2000-01-01'), is_admin: isAdminUser };
            await query('INSERT INTO users (id, username, first_name, last_name, avatar_url, is_admin) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',
                [user.id, user.username, req.telegramUser.first_name, req.telegramUser.last_name, user.avatar_url, user.is_admin]);
        }
        res.json(user);
    } catch (err) {
        console.error('GET /api/user error', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// /api/inventory
app.get('/api/inventory', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const rows = (await query(`
            SELECT ui.item_id, ui.quantity, i.name, i.image_url, i.value, i.type
            FROM user_inventory ui JOIN items i ON ui.item_id=i.id
            WHERE ui.user_id=$1 AND ui.quantity>0
            ORDER BY i.value DESC`, [req.telegramUser.id])).rows;
        const flat = [];
        for (const r of rows) {
            for (let i=0;i<r.quantity;i++) {
                flat.push({ item_id: r.item_id, name: r.name, image_url: r.image_url, value: r.value, type: r.type, quantity: 1 });
            }
        }
        res.json(flat);
    } catch (err) {
        console.error('GET /api/inventory error', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// /api/open_daily_case
app.post('/api/open_daily_case', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    let client;
    try {
        const isSubscribed = await checkUserSubscription(userId);
        if (!isSubscribed) return res.status(403).json({ error: "Для открытия кейса необходимо быть подписчиком канала @" + CHANNEL_USERNAME });

        client = await pool.connect();
        await client.query('BEGIN');

        const userRes = await client.query('SELECT username, first_name, last_name, balance, last_daily_case_open, is_admin FROM users WHERE id=$1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];
        if (!user) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Пользователь не найден.' }); }

        const now = new Date();
        const lastOpen = new Date(user.last_daily_case_open);
        const timeElapsed = now.getTime() - lastOpen.getTime();
        const cooldown = 24 * 60 * 60 * 1000;
        if (!user.is_admin && timeElapsed < cooldown) { await client.query('ROLLBACK'); const timeLeftMs = cooldown - timeElapsed; return res.status(400).json({ error: 'Кейс будет доступен позже.', timeLeftMs }); }

        const drops = (await client.query(`
            SELECT dcd.item_id, dcd.chance, i.name, i.type, i.value, i.image_url
            FROM daily_case_drops dcd JOIN items i ON dcd.item_id=i.id
        `)).rows;
        if (drops.length === 0) { await client.query('ROLLBACK'); return res.status(500).json({ error: 'Кейс временно пуст.' }); }

        let totalChance = drops.reduce((s,d) => s + parseFloat(d.chance), 0);
        let rand = Math.random() * totalChance;
        let wonItem = null;
        for (const drop of drops) { rand -= parseFloat(drop.chance); if (rand <= 0) { wonItem = drop; break; } }
        if (!wonItem) wonItem = drops[drops.length-1];

        let newBalance = parseFloat(user.balance);
        if (wonItem.type === 'balance') {
            newBalance += parseFloat(wonItem.value);
            await client.query('UPDATE users SET balance=$1 WHERE id=$2', [newBalance, userId]);
            await client.query('INSERT INTO transactions (user_id, type, item_id, amount, details) VALUES ($1,$2,$3,$4,$5)', [userId, 'case_open', wonItem.item_id, wonItem.value, 'Выигрыш из ежедневного кейса: ' + wonItem.name]);
        } else {
            await client.query('INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1,$2,1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1', [userId, wonItem.item_id]);
        }

        // обновляем last_daily_case_open и помечаем, что уведомление о следующем кейсе пока не отправлено
        await client.query('UPDATE users SET last_daily_case_open = NOW(), daily_case_notified = FALSE WHERE id = $1', [userId]);
        await client.query('COMMIT');

        // уведомление админу только для подарков
        if (wonItem.type === 'gift') {
            const adminId = process.env.ADMIN_TELEGRAM_ID;
            if (adminId && bot && typeof bot.sendMessage === 'function') {
                const userMention = user.username ? '@' + user.username : (user.first_name || 'Без имени');
                const adminMsg = "🎉 *Новый выигрыш подарка в кейсе!*\n\n" +
                                 "👤 *Пользователь:* " + (user.first_name || "") + " " + (user.last_name || "") + " (" + userMention + ")\n" +
                                 "🎁 *Выиграл:* " + wonItem.name + " (" + wonItem.value + " GRAM)\n" +
                                 "🆔 *Telegram ID:* `" + userId + "`";
                bot.sendMessage(adminId, adminMsg, { parse_mode: 'Markdown' }).catch(()=>{});
            }
        }

        res.json({ success: true, wonItem: { id: wonItem.item_id, name: wonItem.name, price: wonItem.value + " GRAM", type: wonItem.type }, newBalance: newBalance });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('open_daily_case error', err);
        res.status(500).json({ error: 'Произошла ошибка при открытии.' });
    } finally {
        if (client) client.release();
    }
});

// sell_gift
app.post('/api/sell_gift', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    const { itemId, price } = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const inventoryRes = await client.query('SELECT quantity FROM user_inventory WHERE user_id=$1 AND item_id=$2 FOR UPDATE', [userId, itemId]);
        const item = inventoryRes.rows[0];
        if (!item || item.quantity < 1) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'У вас нет этого предмета.' }); }
        await client.query('UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id=$1 AND item_id=$2', [userId, itemId]);
        const userRes = await client.query('SELECT username, first_name, last_name, balance FROM users WHERE id=$1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];
        const newBalance = parseFloat(user.balance) + parseFloat(price);
        await client.query('UPDATE users SET balance=$1 WHERE id=$2', [newBalance, userId]);
        const giftDetails = (await client.query('SELECT name, type FROM items WHERE id=$1', [itemId])).rows[0];
        await client.query('COMMIT');
        if (giftDetails && giftDetails.type === 'gift') {
            const adminId = process.env.ADMIN_TELEGRAM_ID;
            if (adminId && bot && typeof bot.sendMessage === 'function') {
                const userMention = user.username ? '@' + user.username : (user.first_name || 'Без имени');
                const adminMsg = "💰 *Подарок продан!*\n\n" +
                                 "👤 *Пользователь:* " + (user.first_name || "") + " " + (user.last_name || "") + " (" + userMention + ")\n" +
                                 "🎁 *Продан предмет:* " + (giftDetails?.name || 'Подарок') + "\n" +
                                 "💵 *Сумма сделки:* " + price + " GRAM\n" +
                                 "🆔 *Telegram ID:* `" + userId + "`";
                bot.sendMessage(adminId, adminMsg, { parse_mode: 'Markdown' }).catch(()=>{});
            }
        }
        res.json({ success: true, newBalance: newBalance });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('/api/sell_gift error', err);
        res.status(500).json({ error: 'Ошибка при продаже.' });
    } finally { if (client) client.release(); }
});

// withdraw_gift
app.post('/api/withdraw_gift', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    const { itemId } = req.body;
    const parsedItemId = parseInt(itemId,10);
    if (isNaN(parsedItemId)) return res.status(400).json({ error: 'Неверный ID подарка.' });
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const inv = await client.query('SELECT quantity FROM user_inventory WHERE user_id=$1 AND item_id=$2 FOR UPDATE', [userId, parsedItemId]);
        const row = inv.rows[0];
        if (!row || row.quantity < 1) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Недостаточно предметов в вашем инвентаре.' }); }
        await client.query('UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id=$1 AND item_id=$2', [userId, parsedItemId]);
        const itemDetails = (await client.query('SELECT name, value, type FROM items WHERE id=$1', [parsedItemId])).rows[0];
        const userRes = await client.query('SELECT username, first_name, last_name FROM users WHERE id=$1', [userId]);
        const user = userRes.rows[0];
        await client.query('COMMIT');
        if (itemDetails && itemDetails.type === 'gift') {
            const adminId = process.env.ADMIN_TELEGRAM_ID;
            if (adminId && bot && typeof bot.sendMessage === 'function') {
                const userMention = user.username ? '@' + user.username : (user.first_name || 'Без имени');
                const chatLink = 'tg://user?id=' + userId;
                const tmeLink = user.username ? 'https://t.me/' + user.username : 'https://t.me/user?id=' + userId;
                const message = "🚨 *Новая заявка на вывод подарка!*\n\n" +
                                "🎁 *Подарок:* " + itemDetails.name + " (" + itemDetails.value + " GRAM)\n" +
                                "👤 *Пользователь:* " + (user.first_name || "") + " " + (user.last_name || "") + " (" + userMention + ")\n" +
                                "🆔 *Telegram ID:* " + userId + "\n\n" +
                                "💬 [Открыть чат](" + chatLink + ")\n" +
                                "🔗 [Ссылка t.me](" + tmeLink + ")";
                bot.sendMessage(adminId, message, { parse_mode: 'Markdown' }).catch(err => console.error('Notify admin error', err.message));
            }
        }
        res.json({ success: true });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('withdraw_gift error', err);
        res.status(500).json({ error: 'Ошибка сервера при выводе.' });
    } finally { if (client) client.release(); }
});

// deposit_gift_request
app.post('/api/deposit_gift_request', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    const { itemId } = req.body;
    const parsedItemId = parseInt(itemId,10);
    if (isNaN(parsedItemId)) return res.status(400).json({ error: 'Неверный ID подарка.' });
    try {
        const itemDetails = (await query('SELECT name, value, type FROM items WHERE id=$1', [parsedItemId])).rows[0];
        if (!itemDetails) return res.status(400).json({ error: 'Подарок не найден в системе.' });
        if (itemDetails.type === 'gift') {
            const userRes = await query('SELECT username, first_name, last_name FROM users WHERE id=$1', [userId]);
            const user = userRes.rows[0];
            const adminId = process.env.ADMIN_TELEGRAM_ID;
            if (adminId && bot && typeof bot.sendMessage === 'function') {
                const userMention = user.username ? '@' + user.username : (user.first_name || 'Без имени');
                const chatLink = 'tg://user?id=' + userId;
                const tmeLink = user.username ? 'https://t.me/' + user.username : 'https://t.me/user?id=' + userId;
                const message = "📥 *Новая заявка на ВВОД подарка NFT!*\n\n" +
                                "🎁 *Подарок:* " + itemDetails.name + " (" + itemDetails.value + " GRAM)\n" +
                                "👤 *Отправитель:* " + (user.first_name || "") + " " + (user.last_name || "") + " (" + userMention + ")\n" +
                                "🆔 *Telegram ID:* `" + userId + "`\n\n" +
                                "💬 [Открыть чат с пользователем](" + chatLink + ")\n" +
                                "🔗 [Прямая ссылка t.me](" + tmeLink + ")\n\n" +
                                "_Проверьте получение подарка на вашем аккаунте @Sintopa и нажмите кнопку ниже:_";
                const options = {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [ [ { text: '✅ Подтвердить', callback_data: 'dep_app_' + userId + '_' + parsedItemId }, { text: '❌ Отклонить', callback_data: 'dep_rej_' + userId + '_' + parsedItemId } ] ] }
                };
                bot.sendMessage(adminId, message, options).catch(err => console.error('bot send admin error', err));
            }
        }
        res.json({ success: true });
    } catch (err) { console.error('deposit_gift_request error', err); res.status(500).json({ error: 'Ошибка сервера.' }); }
}

// callback_query handler (approve/reject deposit)
if (bot && typeof bot.on === 'function') {
    bot.on('callback_query', async (callbackQuery) => {
        const action = callbackQuery.data;
        const msg = callbackQuery.message;
        if (callbackQuery.from.id.toString() !== process.env.ADMIN_TELEGRAM_ID) {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Только администратор может использовать эту кнопку.', show_alert: true });
            return;
        }
        if (action.startsWith('dep_app_') || action.startsWith('dep_rej_')) {
            const parts = action.split('_');
            const isApprove = parts[1] === 'app';
            const targetUserId = parseInt(parts[2],10);
            const itemId = parseInt(parts[3],10);
            let client;
            try {
                client = await pool.connect();
                await client.query('BEGIN');
                const itemRes = await client.query('SELECT name FROM items WHERE id=$1', [itemId]);
                const itemName = itemRes.rows[0]?.name || 'Подарок';
                if (isApprove) {
                    await client.query('INSERT INTO user_inventory (user_id,item_id,quantity) VALUES ($1,$2,1) ON CONFLICT (user_id,item_id) DO UPDATE SET quantity = user_inventory.quantity + 1', [targetUserId, itemId]);
                    bot.sendMessage(targetUserId, "🎉 *Подарок зачислен!*\n\nАдминистратор проверил вашу транзакцию. Подарок *\"" + itemName + "\"* успешно зачислен в ваш инвентарь!", { parse_mode: 'Markdown' }).catch(()=>{});
                    bot.editMessageText("✅ Заявка на ввод подарка *\"" + itemName + "\"* одобрена. Предмет успешно зачислен в инвентарь пользователя!", { chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [] } }).catch(()=>{});
                } else {
                    bot.sendMessage(targetUserId, "❌ *Ввод подарка отклонен!*\n\nВаша заявка на ввод подарка *\"" + itemName + "\"* была отклонена администратором.", { parse_mode: 'Markdown' }).catch(()=>{});
                    bot.editMessageText("❌ Заявка на ввод подарка *\"" + itemName + "\"* была отклонена.", { chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [] } }).catch(()=>{});
                }
                await client.query('COMMIT');
            } catch (err) {
                if (client) await client.query('ROLLBACK');
                console.error('callback_query handler error', err);
                bot.sendMessage(msg.chat.id, 'Произошла ошибка при обработке заявки: ' + err.message, { parse_mode: 'Markdown' }).catch(()=>{});
            } finally { if (client) client.release(); }
        }
        bot.answerCallbackQuery(callbackQuery.id).catch(()=>{});
    });
}

// /api/daily_case_info
app.get('/api/daily_case_info', (req, res) => res.json({ channel_username: CHANNEL_USERNAME }));

// background notifier: проверяем раз в минуту и шлём пользователю, если прошло >=24ч и flag daily_case_notified = false
setInterval(async () => {
    try {
        const rows = (await query(`
            SELECT id, first_name FROM users
            WHERE last_daily_case_open IS NOT NULL
              AND last_daily_case_open > '2000-01-01'
              AND last_daily_case_open <= NOW() - INTERVAL '24 hours'
              AND daily_case_notified = FALSE
        `)).rows;
        for (const u of rows) {
            const msgText = `🎁 *Ежедневный кейс готов!*\n\nПривет, ${u.first_name || 'друг'}! Прошло 24 часа — твой бесплатный ежедневный кейс снова доступен.`;
            const options = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [ [ { text: '🎁 Открыть BestGifts', web_app: { url: process.env.WEB_APP_URL } } ] ] } };
            await bot.sendMessage(u.id, msgText, options).then(async () => {
                await query('UPDATE users SET daily_case_notified = TRUE WHERE id = $1', [u.id]);
            }).catch(err => {
                console.error('notify user error', u.id, err?.message || err);
                if ((err?.message || '').includes('bot was blocked') || (err?.message || '').includes('chat not found')) {
                    query('UPDATE users SET daily_case_notified = TRUE WHERE id = $1', [u.id]).catch(()=>{});
                }
            });
        }
    } catch (err) { console.error('background notifier error', err); }
}, 60000);

app.listen(PORT, () => console.log('Server running on port', PORT));

const express = require('express');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// Глобальные перехватчики ошибок для надежности
process.on('unhandledRejection', (reason, promise) => { console.error('⚠️ [Safe Engine] Unhandled Rejection:', reason); });
process.on('uncaughtException', (err) => { console.error('⚠️ [Safe Engine] Uncaught Exception:', err); });

const db = require('./db');
const botModule = require('./bot');

const bot = botModule.bot;
const checkUserSubscription = botModule.checkUserSubscription || (async () => true);
const getUserAvatarUrl = botModule.getUserAvatarUrl || (async () => null);

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
    if (!initData) { req.telegramUser = null; return next(); }

    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');
        params.sort();

        let dataCheckString = '';
        for (const [key, value] of params.entries()) { dataCheckString += key + '=' + value + '\n'; }
        dataCheckString = dataCheckString.trim();

        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

        if (calculatedHash !== hash) return res.status(401).json({ error: 'Unauthorized' });

        const userJson = params.get('user');
        if (userJson) {
            req.telegramUser = JSON.parse(userJson);
            let avatarUrl = await getUserAvatarUrl(req.telegramUser.id);
            const isAdmin = req.telegramUser.id.toString() === process.env.ADMIN_TELEGRAM_ID;
            await query('UPDATE users SET avatar_url = $1, is_admin = $2 WHERE id = $3', [avatarUrl, isAdmin, req.telegramUser.id]);
        }
    } catch (e) { return res.status(401).json({ error: 'Unauthorized' }); }
    next();
});

// 1. Получение пользователя
app.get('/api/user', async (req, res) => {
    if (!req.telegramUser) return res.status(401).json({ error: 'Unauthorized' });
    const userRes = await query('SELECT * FROM users WHERE id = $1', [req.telegramUser.id]);
    res.json(userRes.rows[0]);
});

// 2. Инвентарь
app.get('/api/inventory', async (req, res) => {
    const inv = await query(`SELECT ui.item_id, i.name, i.image_url, i.value FROM user_inventory ui JOIN items i ON ui.item_id = i.id WHERE ui.user_id = $1`, [req.telegramUser.id]);
    res.json(inv.rows);
});

// 3. Открытие кейса (ПОЛНАЯ ЛОГИКА ТРАНЗАКЦИЙ)
app.post('/api/open_daily_case', async (req, res) => {
    const userId = req.telegramUser.id;
    let client = await pool.connect();
    try {
        await client.query('BEGIN');
        const user = (await client.query('SELECT balance, last_daily_case_open, is_admin FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
        
        const cooldown = 24 * 60 * 60 * 1000;
        if (!user.is_admin && (new Date() - new Date(user.last_daily_case_open) < cooldown)) {
            throw new Error("Кейс пока недоступен");
        }

        const drops = (await client.query('SELECT dcd.item_id, dcd.chance, i.name, i.type, i.value FROM daily_case_drops dcd JOIN items i ON dcd.item_id = i.id')).rows;
        let rand = Math.random() * 100;
        let won = drops[0];
        for(let d of drops) { rand -= d.chance; if(rand <= 0) { won = d; break; } }

        if (won.type === 'balance') {
            await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [won.value, userId]);
        } else {
            await client.query('INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = quantity + 1', [userId, won.item_id]);
            // Уведомление админу ТОЛЬКО О ПОДАРКАХ
            bot.sendMessage(process.env.ADMIN_TELEGRAM_ID, `🎉 Выигрыш подарка: ${won.name} для @${req.telegramUser.username}`);
        }

        await client.query('UPDATE users SET last_daily_case_open = NOW(), daily_case_notified = false WHERE id = $1', [userId]);
        await client.query('COMMIT');
        res.json({ wonItem: won });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: e.message });
    } finally { client.release(); }
});

// 4. Планировщик уведомлений 24ч
setInterval(async () => {
    try {
        const users = (await query("SELECT id FROM users WHERE last_daily_case_open <= NOW() - INTERVAL '24 hours' AND daily_case_notified = false")).rows;
        for (const u of users) {
            bot.sendMessage(u.id, "🎁 Ваш ежедневный кейс снова доступен!").catch(() => {});
            await query('UPDATE users SET daily_case_notified = true WHERE id = $1', [u.id]);
        }
    } catch (e) { console.error("Scheduler error:", e); }
}, 60000);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const express = require('express');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

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

app.use(express.json()); // ВАЖНО для приема данных от Telegram
app.use(express.static(path.join(__dirname, 'public')));

// ПРИЕМ СООБЩЕНИЙ ОТ TELEGRAM (WEBHOOK)
app.post(`/bot${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Middleware авторизации Telegram
app.use(async (req, res, next) => {
    const initData = req.headers['x-telegram-init-data'];
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

        if (calculatedHash === hash) {
            req.telegramUser = JSON.parse(params.get('user'));
        }
    } catch (e) {
        req.telegramUser = null;
    }
    next();
});

// Роуты API
app.get('/api/user', async (req, res) => {
    if (!req.telegramUser) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const userRes = await query('SELECT * FROM users WHERE id = $1', [req.telegramUser.id]);
        let user = userRes.rows[0];
        if (!user) {
            await query('INSERT INTO users (id, username, first_name, last_name) VALUES ($1, $2, $3, $4)', 
                [req.telegramUser.id, req.telegramUser.username, req.telegramUser.first_name, req.telegramUser.last_name]);
            const newUser = await query('SELECT * FROM users WHERE id = $1', [req.telegramUser.id]);
            user = newUser.rows[0];
        }
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'DB Error' });
    }
});

app.get('/api/inventory', async (req, res) => {
    if (!req.telegramUser) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const result = await query(`
            SELECT ui.item_id, ui.quantity, i.name, i.image_url, i.value, i.type
            FROM user_inventory ui JOIN items i ON ui.item_id = i.id
            WHERE ui.user_id = $1 AND ui.quantity > 0`, [req.telegramUser.id]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'DB Error' }); }
});

// Роуты открытия кейсов (Код сохранен полностью)
app.post('/api/open_daily_case', async (req, res) => {
    if (!req.telegramUser) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    let client;
    try {
        const isSubscribed = await checkUserSubscription(userId);
        if (!isSubscribed) return res.status(403).json({ error: "Подпишитесь на @" + CHANNEL_USERNAME });

        client = await pool.connect();
        await client.query('BEGIN');
        const userRes = await client.query('SELECT balance, last_daily_case_open, is_admin FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];
        const now = new Date();
        if (!user.is_admin && (now - new Date(user.last_daily_case_open)) < 86400000) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Кейс еще не доступен' });
        }

        const drops = (await client.query('SELECT d.*, i.name, i.type, i.value FROM daily_case_drops d JOIN items i ON d.item_id = i.id')).rows;
        let total = drops.reduce((s, d) => s + parseFloat(d.chance), 0);
        let rand = Math.random() * total;
        let won = drops[drops.length-1];
        for (let d of drops) { rand -= parseFloat(d.chance); if (rand <= 0) { won = d; break; } }

        if (won.type === 'balance') {
            await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [won.value, userId]);
        } else {
            await client.query('INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1', [userId, won.item_id]);
        }
        await client.query('UPDATE users SET last_daily_case_open = NOW() WHERE id = $1', [userId]);
        await client.query('COMMIT');
        res.json({ success: true, wonItem: won });
    } catch (e) { if (client) await client.query('ROLLBACK'); res.status(500).json({ error: 'Error' }); }
    finally { if (client) client.release(); }
});

app.post('/api/open_newbie_case', async (req, res) => {
    if (!req.telegramUser) return res.status(401).json({ error: 'Unauthorized' });
    const cost = 0.1;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const userRes = await client.query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [req.telegramUser.id]);
        if (parseFloat(userRes.rows[0].balance) < cost) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Недостаточно GRAM' });
        }
        await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [cost, req.telegramUser.id]);
        const drops = (await client.query('SELECT n.*, i.name, i.type, i.value FROM newbie_case_drops n JOIN items i ON n.item_id = i.id')).rows;
        let total = drops.reduce((s, d) => s + parseFloat(d.chance), 0);
        let rand = Math.random() * total;
        let won = drops[drops.length-1];
        for (let d of drops) { rand -= parseFloat(d.chance); if (rand <= 0) { won = d; break; } }

        if (won.type === 'balance') {
            await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [won.value, req.telegramUser.id]);
        } else {
            await client.query('INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1', [req.telegramUser.id, won.item_id]);
        }
        await client.query('COMMIT');
        res.json({ success: true, wonItem: won });
    } catch (e) { if (client) await client.query('ROLLBACK'); res.status(500).json({ error: 'Error' }); }
    finally { if (client) client.release(); }
});

// Продажа подарка
app.post('/api/sell_gift', async (req, res) => {
    if (!req.telegramUser) return res.status(401).json({ error: 'Unauthorized' });
    const { itemId, price } = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const inv = await client.query('SELECT quantity FROM user_inventory WHERE user_id=$1 AND item_id=$2 FOR UPDATE', [req.telegramUser.id, itemId]);
        if (!inv.rows[0] || inv.rows[0].quantity < 1) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Нет предмета' });
        }
        await client.query('UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id=$1 AND item_id=$2', [req.telegramUser.id, itemId]);
        await client.query('UPDATE users SET balance = balance + $1 WHERE id=$2', [price, req.telegramUser.id]);
        await client.query('COMMIT');
        const user = await query('SELECT balance FROM users WHERE id=$1', [req.telegramUser.id]);
        res.json({ success: true, newBalance: user.rows[0].balance });
    } catch (e) { if (client) await client.query('ROLLBACK'); res.status(500).json({ error: 'Error' }); }
    finally { if (client) client.release(); }
});

app.listen(PORT, () => console.log(`🚀 Webhook Server running on port ${PORT}`));

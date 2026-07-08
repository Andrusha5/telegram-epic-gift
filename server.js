const express = require('express');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { bot, notifyAdmin } = require('./bot');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function verifyTelegramWebAppData(initDataRaw) {
    if (!initDataRaw) return false;
    try {
        const params = new URLSearchParams(initDataRaw);
        const hash = params.get('hash');
        params.delete('hash');
        const sortedParams = Array.from(params.entries()).map(([key, value]) => `${key}=${value}`).sort().join('\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const computedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');
        return computedHash === hash;
    } catch (e) { return false; }
}

async function authMiddleware(req, res, next) {
    const initDataRaw = req.headers['x-telegram-init-data'];
    if (!initDataRaw && process.env.NODE_ENV !== 'production') {
        req.userId = 123456789;
        return next();
    }
    if (!verifyTelegramWebAppData(initDataRaw)) return res.status(401).json({ error: 'Auth failed' });
    const params = new URLSearchParams(initDataRaw);
    const userStr = params.get('user');
    try {
        req.tgUser = JSON.parse(userStr);
        req.userId = req.tgUser.id;
        next();
    } catch (e) { res.status(400).json({ error: 'Parse error' }); }
}

app.get('/api/user/me', authMiddleware, async (req, res) => {
    try {
        let userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.userId]);
        if (userResult.rows.length === 0) {
            await db.query('INSERT INTO users (id, username, is_admin) VALUES ($1, $2, $3)', 
                [req.userId, req.tgUser.username || 'user', req.userId.toString() === process.env.ADMIN_TELEGRAM_ID]);
            userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.userId]);
        }
        res.json(userResult.rows[0]);
    } catch (e) { res.status(500).json({ error: 'DB Error' }); }
});

app.post('/api/deposit/confirm', authMiddleware, async (req, res) => {
    const { itemId } = req.body;
    try {
        const itemRes = await db.query('SELECT name FROM items WHERE id = $1', [itemId]);
        if (itemRes.rows.length === 0) return res.status(400).json({ error: 'Item not found' });
        
        // ВАЖНО: Убраны разрывы строк, которые вызывали ошибку синтаксиса
        const msg = "📥 Заявка на депозит! Пользователь: @" + (req.tgUser.username || 'none') + " (ID: " + req.userId + "). Предмет: " + itemRes.rows[0].name;
        await notifyAdmin(msg);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Notify error' }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const express = require('express');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const db = require('./db');
const { bot, checkUserSubscription, getUserAvatarUrl } = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware безопасности (Криптографическая проверка Telegram InitData)
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
            dataCheckString += `${key}=${value}\n`;
        }
        dataCheckString = dataCheckString.trim();

        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

        if (calculatedHash !== hash) {
            req.telegramUser = null;
            return res.status(401).json({ error: 'Unauthorized: Invalid Telegram InitData.' });
        }

        const userJson = params.get('user');
        if (userJson) {
            req.telegramUser = JSON.parse(userJson);
            if (req.telegramUser.id) {
                let avatarUrl = req.telegramUser.photo_url || null;
                if (!avatarUrl) {
                    avatarUrl = await getUserAvatarUrl(req.telegramUser.id);
                }
                const isAdminUser = req.telegramUser.id.toString() === process.env.ADMIN_TELEGRAM_ID;
                await db.query(
                    'UPDATE users SET avatar_url = $1, username = $2, first_name = $3, last_name = $4, is_admin = $5 WHERE id = $6',
                    [avatarUrl, req.telegramUser.username, req.telegramUser.first_name, req.telegramUser.last_name, isAdminUser, req.telegramUser.id]
                );
            }
        } else {
            req.telegramUser = null;
        }
    } catch (e) {
        req.telegramUser = null;
        return res.status(401).json({ error: 'Unauthorized: Failed to process Telegram InitData.' });
    }
    next();
});

// 1. Получение данных пользователя
app.get('/api/user', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        let user = (await db.query('SELECT id, username, first_name, balance, avatar_url, last_daily_case_open, is_admin FROM users WHERE id = $1', [req.telegramUser.id])).rows[0];
        if (!user) {
            const avatarUrl = req.telegramUser.photo_url || (await getUserAvatarUrl(req.telegramUser.id)) || null;
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
            await db.query(
                'INSERT INTO users (id, username, first_name, last_name, avatar_url, is_admin) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
                [user.id, user.username, req.telegramUser.first_name, req.telegramUser.last_name, user.avatar_url, user.is_admin]
            );
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. Информация о содержимом кейса
app.get('/api/daily_case_info', async (req, res) => {
    if (!req.telegramUser) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ channel_username: CHANNEL_USERNAME });
});

// 3. Открытие ежедневного кейса (с обходом таймера для Админа)
app.post('/api/open_daily_case', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = req.telegramUser.id;

    try {
        const isSubscribed = await checkUserSubscription(userId);
        if (!isSubscribed) {
            return res.status(403).json({ error: `Для открытия кейса необходимо быть подписчиком канала @${CHANNEL_USERNAME}.` });
        }

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            const userRes = await client.query('SELECT balance, last_daily_case_open, is_admin FROM users WHERE id = $1 FOR UPDATE', [userId]);
            const user = userRes.rows[0];

            if (!user) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Пользователь не найден.' });
            }

            const now = new Date();
            const lastOpen = new Date(user.last_daily_case_open);
            const timeElapsed = now.getTime() - lastOpen.getTime();
            const cooldown = 24 * 60 * 60 * 1000;

            // ЕСЛИ АДМИНИСТРАТОР — ТАЙМЕР ИГНОРИРУЕТСЯ
            if (!user.is_admin && timeElapsed < cooldown) {
                await client.query('ROLLBACK');
                const timeLeftMs = cooldown - timeElapsed;
                return res.status(400).json({ error: `Кейс будет доступен позже.`, timeLeftMs });
            }

            const drops = (await client.query(`
                SELECT dcd.item_id, dcd.chance, i.name, i.type, i.value, i.image_url
                FROM daily_case_drops dcd
                JOIN items i ON dcd.item_id = i.id
            `)).rows;

            if (drops.length === 0) {
                await client.query('ROLLBACK');
                return res.status(500).json({ error: 'Призы не настроены.' });
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
                    [userId, 'case_open', wonItem.item_id, wonItem.value, `Выигрыш из ежедневного кейса: ${wonItem.name}`]);
            } else {
                await client.query(
                    'INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1',
                    [userId, wonItem.item_id]
                );
            }

            await client.query('UPDATE users SET last_daily_case_open = NOW() WHERE id = $1', [userId]);
            await client.query('COMMIT');

            res.json({ success: true, wonItem: { id: wonItem.item_id, name: wonItem.name, price: `${wonItem.value} TON` }, newBalance: newBalance });

        } catch (error) {
            await client.query('ROLLBACK');
            res.status(500).json({ error: 'Произошла ошибка при открытии.' });
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// 4. Продажа подарка
app.post('/api/sell_gift', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    const { itemId, price } = req.body;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const inventoryRes = await client.query('SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE', [userId, itemId]);
        const item = inventoryRes.rows[0];

        if (!item || item.quantity < 1) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'У вас нет этого предмета.' });
        }

        await client.query('UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
        const userRes = await client.query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const newBalance = parseFloat(userRes.rows[0].balance) + parseFloat(price);

        await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
        await client.query('COMMIT');

        res.json({ success: true, newBalance: newBalance });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Ошибка при продаже.' });
    } finally {
        client.release();
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

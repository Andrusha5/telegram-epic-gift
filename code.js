const express = require('express');
const path = require('path');
require('dotenv').config();

const db = require('./db');
const { bot, checkUserSubscription, getUserAvatarUrl, notifyAdmin } = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware для обработки Telegram InitData (упрощенная версия для демо!)
// Для продакшена нужна криптографическая валидация!
app.use(async (req, res, next) => {
    const initData = req.headers['x-telegram-init-data'] || req.query.initData;
    if (initData) {
        try {
            const params = new URLSearchParams(initData);
            const userJson = params.get('user');
            if (userJson) {
                req.telegramUser = JSON.parse(userJson);
                // Обновляем аватарку в БД при каждом запросе из Mini App
                if (req.telegramUser.id) {
                    let avatarUrl = req.telegramUser.photo_url || null;
                    if (!avatarUrl) {
                        avatarUrl = await getUserAvatarUrl(req.telegramUser.id);
                    }
                    await db.query(
                        'UPDATE users SET avatar_url = $1, username = $2, first_name = $3, last_name = $4 WHERE id = $5',
                        [avatarUrl, req.telegramUser.username, req.telegramUser.first_name, req.telegramUser.last_name, req.telegramUser.id]
                    );
                }
            }
        } catch (e) {
            console.error('Error parsing Telegram initData:', e.message);
            req.telegramUser = null;
        }
    } else {
        req.telegramUser = null;
    }
    next();
});

// Защита админ-маршрутов
function isAdmin(req, res, next) {
    if (!req.telegramUser || req.telegramUser.id.toString() !== ADMIN_TELEGRAM_ID) {
        return res.status(403).json({ error: 'Доступ запрещен. Вы не администратор.' });
    }
    next();
}

// --- API Эндпоинты для Mini App ---

// 1. Получение данных пользователя
app.get('/api/user', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) {
        return res.status(401).json({ error: 'Unauthorized: Telegram user data missing.' });
    }
    try {
        let user = (await db.query('SELECT id, username, first_name, balance, avatar_url, last_daily_case_open, is_admin FROM users WHERE id = $1', [req.telegramUser.id])).rows[0];
        if (!user) {
            // Если пользователя нет (например, открыли Mini App без /start)
            user = {
                id: req.telegramUser.id,
                username: req.telegramUser.username,
                first_name: req.telegramUser.first_name,
                balance: 0.000,
                avatar_url: req.telegramUser.photo_url || (await getUserAvatarUrl(req.telegramUser.id)) || null,
                last_daily_case_open: new Date('2000-01-01'),
                is_admin: req.telegramUser.id.toString() === ADMIN_TELEGRAM_ID
            };
            await db.query(
                'INSERT INTO users (id, username, first_name, last_name, avatar_url, is_admin) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
                [user.id, user.username, req.telegramUser.first_name, req.telegramUser.last_name, user.avatar_url, user.is_admin]
            );
        }
        res.json(user);
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. Получение информации о ежедневном кейсе (и его содержимом для админа)
app.get('/api/daily_case_info', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const drops = (await db.query(`
            SELECT dcd.item_id, dcd.chance, i.name, i.type, i.value, i.image_url
            FROM daily_case_drops dcd
            JOIN items i ON dcd.item_id = i.id
            ORDER BY dcd.chance DESC
        `)).rows;
        res.json({ drops, channel_username: CHANNEL_USERNAME });
    } catch (error) {
        console.error('Error fetching daily case info:', error);
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
        // 1. Проверка подписки на канал
        const isSubscribed = await checkUserSubscription(userId);
        if (!isSubscribed) {
            return res.status(403).json({ error: `Для открытия кейса необходимо быть подписчиком канала @${CHANNEL_USERNAME}.` });
        }

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN'); // Начинаем транзакцию

            // 2. Проверка таймера
            const userRes = await client.query('SELECT balance, last_daily_case_open FROM users WHERE id = $1 FOR UPDATE', [userId]);
            const user = userRes.rows[0];

            if (!user) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Пользователь не найден.' });
            }

            const now = new Date();
            const lastOpen = new Date(user.last_daily_case_open);
            const timeElapsed = now.getTime() - lastOpen.getTime();
            const cooldown = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах

            if (timeElapsed < cooldown) {
                await client.query('ROLLBACK');
                const timeLeftMs = cooldown - timeElapsed;
                const hours = Math.floor(timeLeftMs / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((timeLeftMs % (1000 * 60)) / 1000);
                return res.status(400).json({ error: `Кейс будет доступен через ${hours}ч ${minutes}м ${seconds}с.`, timeLeftMs });
            }

            // 3. Выбор приза по шансу
            const drops = (await client.query(`
                SELECT dcd.item_id, dcd.chance, i.name, i.type, i.value, i.image_url
                FROM daily_case_drops dcd
                JOIN items i ON dcd.item_id = i.id
            `)).rows;

            if (drops.length === 0) {
                await client.query('ROLLBACK');
                return res.status(500).json({ error: 'Призы для кейса не настроены администратором.' });
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

            // Fallback, если что-то пошло не так (шансы не 100% или ошибка)
            if (!wonItem) {
                wonItem = drops[Math.floor(Math.random() * drops.length)];
            }

            // 4. Зачисление выигрыша
            let newBalance = parseFloat(user.balance);
            if (wonItem.type === 'balance') {
                newBalance += parseFloat(wonItem.value);
                await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
                await client.query('INSERT INTO transactions (user_id, type, item_id, amount, details) VALUES ($1, $2, $3, $4, $5)',
                    [userId, 'case_open', wonItem.item_id, wonItem.value, `Выигрыш из ежедневного кейса: ${wonItem.name}`]);
            } else if (wonItem.type === 'gift') {
                await client.query(
                    'INSERT INTOuser_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1',
                    [userId, wonItem.item_id]
                );
                await client.query('INSERT INTO transactions (user_id, type, item_id, details) VALUES ($1, $2, $3, $4)',
                    [userId, 'case_open', wonItem.item_id, `Выигрыш из ежедневного кейса: ${wonItem.name}`]);
            }

            // 5. Обновление времени последнего открытия кейса
            await client.query('UPDATE users SET last_daily_case_open = NOW() WHERE id = $1', [userId]);

            await client.query('COMMIT'); // Завершаем транзакцию

            res.json({ success: true, wonItem: wonItem, newBalance: newBalance });

        } catch (error) {
            await client.query('ROLLBACK'); // Откатываем транзакцию при ошибке
            console.error('Error opening daily case:', error);
            res.status(500).json({ error: 'Произошла ошибка при открытии кейса.' });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Database connection error during case open:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// --- Админ-панель API ---

// 4. Получить все доступные предметы (для настройки кейса)
app.get('/admin/items', isAdmin, async (req, res) => {
    try {
        const items = (await db.query('SELECT * FROM items ORDER BY id ASC')).rows;
        res.json(items);
    } catch (error) {
        console.error('Admin: Error fetching items:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 5. Создать/Обновить предмет
app.post('/admin/item', isAdmin, async (req, res) => {
    const { id, name, description, image_url, type, value } = req.body;
    if (!name || !type) {
        return res.status(400).json({ error: 'Name and type are required.' });
    }
    try {
        let result;
        if (id) { // Обновление существующего предмета
            result = await db.query(
                `UPDATE items SET name = $1, description = $2, image_url = $3, type = $4, value = $5 WHERE id = $6 RETURNING *`,
                [name, description, image_url, type, value, id]
            );
        } else { // Создание нового предмета
            result = await db.query(
                `INSERT INTO items (name, description, image_url, type, value) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [name, description, image_url, type, value]
            );
        }
        res.json({ success: true, item: result.rows[0] });
    } catch (error) {
        console.error('Admin: Error creating/updating item:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 6. Получить текущие настройки выпадения для ежедневного кейса
app.get('/admin/daily_case_drops_config', isAdmin, async (req, res) => {
    try {
        const config = (await db.query(`
            SELECT dcd.item_id, dcd.chance, i.name, i.type, i.value, i.image_url
            FROM daily_case_drops dcd
            JOIN items i ON dcd.item_id = i.id
            ORDER BY i.name ASC
        `)).rows;
        res.json(config);
    } catch (error) {
        console.error('Admin: Error fetching daily case drops config:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 7. Установить настройки выпадения для ежедневного кейса
app.post('/admin/set_daily_case_drops', isAdmin, async (req, res) => {
    const { drops } = req.body; // drops = [{ item_id: 1, chance: 5.0 }, { item_id: 2, chance: 95.0 }]
    if (!Array.isArray(drops) || drops.some(d => !d.item_id || typeof d.chance !== 'number')) {
        return res.status(400).json({ error: 'Invalid drops format.' });
    }

    const totalChance = drops.reduce((sum, d) => sum + d.chance, 0);
    if (Math.abs(totalChance - 100) > 0.01) { // Допустимая погрешность
        return res.status(400).json({ error: `Сумма шансов должна быть равна 100%. Текущая сумма: ${totalChance.toFixed(2)}%.` });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM daily_case_drops'); // Очищаем старые настройки
        for (const drop of drops) {
            await client.query(
                `INSERT INTO daily_case_drops (item_id, chance) VALUES ($1, $2)`,
                [drop.item_id, drop.chance]
            );
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'Настройки ежедневного кейса обновлены.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Admin: Error setting daily case drops:', error);
        res.status(500).json({ error: 'Internal server error.' });
    } finally {
        client.release();
    }
});

// Запускаем сервер
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Telegram Mini App URL: ${process.env.WEB_APP_URL}`);
    console.log(`Telegram Bot запущен и обрабатывает команды.`);
});
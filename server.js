const express = require('express');
const path = require('path');
const crypto = require('crypto');
const db = require('./db'); // Ваш модуль для работы с БД
const TelegramBot = require('node-telegram-bot-api'); // Импортируем Bot API прямо здесь
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
const bot = new TelegramBot(BOT_TOKEN, { polling: true }); // Инициализируем бота здесь

// Функция валидации данных от Telegram Web App
function verifyTelegramWebAppData(initDataRaw) {
    if (!initDataRaw) return false;
    try {
        const params = new URLSearchParams(initDataRaw);
        const hash = params.get('hash');
        params.delete('hash');
        
        const sortedParams = Array.from(params.entries())
            .map(([key, value]) => `${key}=${value}`)
            .sort()
            .join('\n');
            
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const computedHash = crypto.createHmac('sha256', secretKey).update(sortedParams).digest('hex');
        
        return computedHash === hash;
    } catch (e) {
        console.error('Ошибка верификации Telegram:', e);
        return false;
    }
}

// Middleware для авторизации пользователей
async function authMiddleware(req, res, next) {
    const initDataRaw = req.headers['x-telegram-init-data'];
    
    // Для тестирования в обычном браузере (только локально, в продакшене будет fail)
    if (!initDataRaw && process.env.NODE_ENV !== 'production') {
        req.userId = 123456789; // Тестовый ID пользователя
        req.tgUser = { id: req.userId, username: 'testuser', first_name: 'Test', last_name: 'User' };
        return next();
    }

    if (!verifyTelegramWebAppData(initDataRaw)) {
        console.warn('Неавторизованный запрос: Неверные initData');
        return res.status(401).json({ error: 'Неавторизованный запрос' });
    }

    const params = new URLSearchParams(initDataRaw);
    const userStr = params.get('user');
    if (!userStr) {
        console.warn('Неавторизованный запрос: Пользователь не найден в initData');
        return res.status(400).json({ error: 'Пользователь не найден в initData' });
    }

    try {
        req.tgUser = JSON.parse(userStr);
        req.userId = req.tgUser.id;
        next();
    } catch (e) {
        console.error('Ошибка парсинга пользователя из initData:', e);
        return res.status(400).json({ error: 'Ошибка парсинга пользователя' });
    }
}

// =======================================================
// ЛОГИКА ТЕЛЕГРАМ БОТА
// =======================================================

// Получение URL аватарки пользователя
async function getUserAvatarUrl(userId) {
    try {
        const photos = await bot.getUserProfilePhotos(userId, 0, 1);
        if (photos.total_count > 0) {
            const fileId = photos.photos[0][0].file_id;
            const file = await bot.getFile(fileId);
            return `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        }
    } catch (e) {
        console.error(`Ошибка при получении аватарки для ID ${userId}:`, e.message);
    }
    return null;
}

// Функция отправки уведомлений администратору
async function notifyAdmin(message, reply_markup = {}) {
    if (ADMIN_TELEGRAM_ID) {
        try {
            await bot.sendMessage(ADMIN_TELEGRAM_ID, message, { parse_mode: 'Markdown', reply_markup });
        } catch (e) {
            console.error('Ошибка при отправке сообщения админу:', e.message);
        }
    }
}

// Обработка команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    const is_admin = user.id.toString() === ADMIN_TELEGRAM_ID;

    let avatarUrl = await getUserAvatarUrl(user.id);

    try {
        await db.query(
            `INSERT INTO users (id, username, first_name, last_name, avatar_url, is_admin)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO UPDATE
             SET username = EXCLUDED.username, 
                 first_name = EXCLUDED.first_name, 
                 last_name = EXCLUDED.last_name, 
                 avatar_url = EXCLUDED.avatar_url,
                 is_admin = EXCLUDED.is_admin,
                 updated_at = CURRENT_TIMESTAMP`, // Обновляем updated_at
            [user.id, user.username, user.first_name, user.last_name, avatarUrl, is_admin]
        );
    } catch (error) {
        console.error('Ошибка при добавлении/обновлении пользователя в БД:', error);
    }

    bot.sendMessage(chatId, `🎉 Добро пожаловать в мир подарков BestGifts!\n\nНажмите кнопку ниже, чтобы начать:`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎁 Открыть BestGifts', web_app: { url: WEB_APP_URL } }]
            ]
        }
    });
});

console.log('🤖 Бот Telegram запущен и готов к работе...');

// =======================================================
// API ЭНДПОИНТЫ ДЛЯ WEB APP
// =======================================================

// 1. Получение информации о пользователе
app.get('/api/user/me', authMiddleware, async (req, res) => {
    try {
        let userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.userId]);
        
        // Если пользователя нет (не запустил /start), создаем его
        if (userResult.rows.length === 0) {
            const username = req.tgUser?.username || `user_${req.userId}`;
            const first_name = req.tgUser?.first_name || '';
            const last_name = req.tgUser?.last_name || '';
            const is_admin = req.userId.toString() === ADMIN_TELEGRAM_ID;

            await db.query(
                `INSERT INTO users (id, username, first_name, last_name, is_admin)
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.userId, username, first_name, last_name, is_admin]
            );
            userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.userId]);
        }

        res.json(userResult.rows[0]);
    } catch (error) {
        console.error('Ошибка сервера при получении пользователя:', error);
        res.status(500).json({ error: 'Ошибка сервера при получении пользователя' });
    }
});

// 2. Получение списка возможных наград в кейсе
app.get('/api/case/rewards', async (req, res) => {
    try {
        const query = `
            SELECT i.id, i.name, i.image_url, i.type, i.value, d.chance 
            FROM items i 
            JOIN daily_case_drops d ON i.id = d.item_id
            ORDER BY d.chance ASC
        `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Ошибка сервера при получении наград:', error);
        res.status(500).json({ error: 'Ошибка при получении наград' });
    }
});

// 3. Открытие кейса (Крутить спин)
app.post('/api/case/spin', authMiddleware, async (req, res) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // Проверка времени последнего открытия
        const userRes = await client.query('SELECT last_daily_case_open, balance FROM users WHERE id = $1 FOR UPDATE', [req.userId]);
        const user = userRes.rows[0];
        const lastOpen = new Date(user.last_daily_case_open);
        const now = new Date();
        const cooldown = 24 * 60 * 60 * 1000; // 24 часа

        if (now - lastOpen < cooldown) {
            const timeLeft = cooldown - (now - lastOpen);
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Кейс еще недоступен', timeLeft });
        }

        // Получаем все призы и их шансы
        const dropsRes = await client.query(`
            SELECT i.*, d.chance FROM items i
            JOIN daily_case_drops d ON i.id = d.item_id
        `);
        const drops = dropsRes.rows;

        // Алгоритм выбора приза на сервере (рулетка)
        const totalChance = drops.reduce((sum, item) => sum + parseFloat(item.chance), 0);
        let random = Math.random() * totalChance;
        let wonItem = null;

        for (const item of drops) {
            random -= parseFloat(item.chance);
            if (random <= 0) {
                wonItem = item;
                break;
            }
        }
        if (!wonItem) wonItem = drops[drops.length - 1]; // Fallback на последний, если что-то пошло не так

        // Начисление выигрыша
        if (wonItem.type === 'balance') {
            await client.query(
                'UPDATE users SET balance = balance + $1, last_daily_case_open = $2 WHERE id = $3',
                [parseFloat(wonItem.value), now, req.userId]
            );
        } else {
            // Добавляем в инвентарь
            await client.query(
                `INSERT INTO user_inventory (user_id, item_id, quantity)
                 VALUES ($1, $2, 1)
                 ON CONFLICT (user_id, item_id)
                 DO UPDATE SET quantity = user_inventory.quantity + 1`,
                [req.userId, wonItem.id]
            );
            await client.query(
                'UPDATE users SET last_daily_case_open = $1 WHERE id = $2',
                [now, req.userId]
            );
        }

        // Логируем транзакцию
        await client.query(
            `INSERT INTO transactions (user_id, type, item_id, amount, details)
             VALUES ($1, 'case_open', $2, $3, $4)`,
            [req.userId, wonItem.id, wonItem.value, `Выигран предмет: ${wonItem.name}`]
        );

        await client.query('COMMIT');
        res.json({ success: true, wonItem, last_daily_case_open: now });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ошибка сервера при открытии кейса:', error);
        res.status(500).json({ error: 'Ошибка сервера при открытии кейса' });
    } finally {
        client.release();
    }
});

// 4. Получение инвентаря пользователя
app.get('/api/inventory', authMiddleware, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT i.*, ui.quantity 
             FROM user_inventory ui
             JOIN items i ON ui.item_id = i.id
             WHERE ui.user_id = $1 AND ui.quantity > 0`,
            [req.userId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Ошибка сервера при получении инвентаря:', error);
        res.status(500).json({ error: 'Ошибка сервера при получении инвентаря' });
    }
});

// 5. Продажа предмета из инвентаря
app.post('/api/inventory/sell', authMiddleware, async (req, res) => {
    const { itemId } = req.body;
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // Проверяем наличие предмета
        const invRes = await client.query(
            'SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE',
            [req.userId, itemId]
        );
        
        if (invRes.rows.length === 0 || invRes.rows[0].quantity <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Предмет отсутствует в инвентаре' });
        }

        // Получаем ценность предмета
        const itemRes = await client.query('SELECT value, name FROM items WHERE id = $1', [itemId]);
        const item = itemRes.rows[0];

        // Списываем из инвентаря
        await client.query(
            'UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2',
            [req.userId, itemId]
        );

        // Начисляем баланс
        await client.query(
            'UPDATE users SET balance = balance + $1 WHERE id = $2',
            [parseFloat(item.value), req.userId]
        );

        // Лог транзакции
        await client.query(
            `INSERT INTO transactions (user_id, type, item_id, amount, details)
             VALUES ($1, 'item_sell', $2, $3, $4)`,
            [req.userId, itemId, item.value, `Продажа предмета: ${item.name}`]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: 'Предмет успешно продан' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ошибка сервера при продаже:', error);
        res.status(500).json({ error: 'Ошибка сервера при продаже' });
    } finally {
        client.release();
    }
});

// 6. Подтверждение депозита (ввода) подарка
app.post('/api/deposit/confirm', authMiddleware, async (req, res) => {
    const { itemId } = req.body;
    try {
        const itemRes = await db.query('SELECT name FROM items WHERE id = $1', [itemId]);
        if (itemRes.rows.length === 0) {
            return res.status(400).json({ error: 'Предмет не найден' });
        }
        const itemName = itemRes.rows[0].name;

        // Отправка уведомления администратору бота для подтверждения передачи
        // Исправлено: многострочная строка для избежания SyntaxError
        const adminMessage = `📥 *Заявка на депозит подарка!*\n\n` +
                             `Пользователь: @${req.tgUser?.username || 'Без юзернейма'} (ID: `${req.userId}`)\n` +
                             `Предмет: *${itemName}* (ID: ${itemId})\n\n` +
                             `Ожидайте получения подарка на аккаунт @Sintopa.`;
        await notifyAdmin(adminMessage);

        res.json({ success: true, message: 'Заявка отправлена администратору на проверку!' });
    } catch (error) {
        console.error('Ошибка при отправке заявки на депозит:', error);
        res.status(500).json({ error: 'Ошибка при отправке заявки' });
    }
});

// Все остальные запросы перенаправляем на index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000; // Используйте порт 10000 для Render
app.listen(PORT, () => {
    console.log(`🚀 Web-сервер запущен на порту ${PORT}`);
});

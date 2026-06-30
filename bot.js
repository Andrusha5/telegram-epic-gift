const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const WEB_APP_URL = process.env.WEB_APP_URL;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;

const db = require('./db'); // Подключаем наш модуль БД

// Функция для получения URL аватарки пользователя
async function getUserAvatarUrl(userId) {
    try {
        const photos = await bot.getUserProfilePhotos(userId, 0, 1);
        if (photos.total_count > 0) {
            const fileId = photos.photos[0][0].file_id;
            const file = await bot.getFile(fileId);
            return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        }
    } catch (e) {
        console.error(`Error fetching avatar for user ${userId}:`, e.message);
    }
    return null; // Или URL заглушки
}

// Проверка подписки на канал
async function checkUserSubscription(userId) {
    if (!CHANNEL_USERNAME) {
        console.warn('CHANNEL_USERNAME не указан в .env. Проверка подписки отключена.');
        return true; // Если канал не указан, считаем, что пользователь подписан
    }
    try {
        const chatMember = await bot.getChatMember(`@${CHANNEL_USERNAME}`, userId);
        return ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch (e) {
        console.error(`Ошибка при проверке подписки для пользователя ${userId}:`, e.message);
        return false;
    }
}

// Обработка команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    const is_admin = user.id.toString() === ADMIN_TELEGRAM_ID;

    // Обновляем данные пользователя в БД или создаем его
    let avatarUrl = await getUserAvatarUrl(user.id);
    if (!avatarUrl && user.photo_url) { // Fallback, если getUserProfilePhotos не сработал, но в initData был photo_url
        avatarUrl = user.photo_url;
    }

    try {
        await db.query(
            `INSERT INTO users (id, username, first_name, last_name, avatar_url, is_admin)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO UPDATE
             SET username = EXCLUDED.username, 
                 first_name = EXCLUDED.first_name, 
                 last_name = EXCLUDED.last_name, 
                 avatar_url = EXCLUDED.avatar_url,
                 is_admin = EXCLUDED.is_admin`,
            [user.id, user.username, user.first_name, user.last_name, avatarUrl, is_admin]
        );
    } catch (error) {
        console.error('Error upserting user on /start:', error);
    }

    bot.sendMessage(chatId, 'Добро пожаловать в Epic Gift! Откройте приложение:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎁 Открыть приложение', web_app: { url: WEB_APP_URL } }]
            ]
        }
    });
});

// Админ-уведомления (например, о новом запросе на пополнение, если вы добавите эту функцию)
async function notifyAdmin(message, reply_markup = {}) {
    if (ADMIN_TELEGRAM_ID) {
        try {
            await bot.sendMessage(ADMIN_TELEGRAM_ID, message, { parse_mode: 'Markdown', reply_markup });
        } catch (e) {
            console.error('Error sending admin notification:', e.message);
        }
    }
}

console.log('Telegram Bot запущен...');

module.exports = { bot, checkUserSubscription, getUserAvatarUrl, notifyAdmin };
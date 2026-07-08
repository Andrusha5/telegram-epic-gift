const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const WEB_APP_URL = process.env.WEB_APP_URL;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;

const db = require('./db');

// Получение URL аватарки пользователя
async function getUserAvatarUrl(userId) {
    try {
        const photos = await bot.getUserProfilePhotos(userId, 0, 1);
        if (photos.total_count > 0) {
            const fileId = photos.photos[0][0].file_id;
            const file = await bot.getFile(fileId);
            return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        }
    } catch (e) {
        console.error(`Ошибка при получении аватарки для ID ${userId}:`, e.message);
    }
    return null;
}

// Обработка команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    const is_admin = user.id.toString() === ADMIN_TELEGRAM_ID;

    let avatarUrl = await getUserAvatarUrl(user.id);
    if (!avatarUrl && user.photo_url) {
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
        console.error('Ошибка при добавлении пользователя в БД:', error);
    }

    bot.sendMessage(chatId, `🎉 Добро пожаловать в мир подарков BestGifts!\n\nНажмите кнопку ниже, чтобы начать:`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎁 Открыть BestGifts', web_app: { url: WEB_APP_URL } }]
            ]
        }
    });
});

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

console.log('🤖 Бот Telegram успешно запущен...');

module.exports = { bot, notifyAdmin };

const TelegramBot = require('node-telegram-bot-api');
const db = require('./db'); 
const pool = db.pool || db;

const token = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_ID;

// Проверяем глобальный инстанс, чтобы избежать конфликта 409
if (!global.botInstance) {
    global.botInstance = new TelegramBot(token, { polling: true });
}
const bot = global.botInstance;

// Бесшумный останов при перезапуске на Render
const shutdownGracefully = async (signal) => {
    console.log(`[Graceful Shutdown] Получен сигнал ${signal}. Отключение Telegram Polling...`);
    if (bot.isPolling()) {
        try {
            await bot.stopPolling();
            console.log('[Graceful Shutdown] Telegram Polling успешно остановлен.');
        } catch (err) {
            console.error('[Graceful Shutdown] Ошибка при остановке Polling:', err);
        }
    }
    process.exit(0);
};

process.once('SIGTERM', () => shutdownGracefully('SIGTERM'));
process.once('SIGINT', () => shutdownGracefully('SIGINT'));

// Глушим ошибки 409 Conflict
bot.on('polling_error', (error) => {
    if (error.code === 'ETELEGAM' || (error.message && error.message.includes('409 Conflict'))) {
        return;
    }
    console.error('[Bot Polling Error]', error);
});

// Получение аватара
async function getUserAvatarUrl(userId) {
    try {
        const photos = await bot.getUserProfilePhotos(userId, { limit: 1 });
        if (photos && photos.total_count > 0 && photos.photos[0].length > 0) {
            const fileId = photos.photos[0][0].file_id;
            const file = await bot.getFile(fileId);
            return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        }
    } catch (err) {
        console.error("Ошибка при получении фото профиля:", err);
    }
    return null;
}

// Проверка подписки на канал
async function checkUserSubscription(userId) {
    try {
        const channelUsername = process.env.CHANNEL_USERNAME;
        if (!channelUsername) return true; 
        const cleanUsername = channelUsername.replace('@', '').trim();
        const chatMember = await bot.getChatMember('@' + cleanUsername, userId);
        const activeStatuses = ['creator', 'administrator', 'member'];
        return activeStatuses.includes(chatMember.status);
    } catch (err) {
        console.error("Ошибка при проверке подписки:", err);
        return false;
    }
}

// Обработчик кнопок одобрения/отклонения депозитов
bot.on('callback_query', async (callbackQuery) => {
    const actionData = callbackQuery.data;
    const queryId = callbackQuery.id;
    const message = callbackQuery.message;

    if (!actionData.startsWith('dep_app_') && !actionData.startsWith('dep_rej_')) {
        return; 
    }

    bot.answerCallbackQuery(queryId).catch(() => {});

    const parts = actionData.split('_');
    const action = parts[1]; 
    const targetUserId = String(parts[2]); 
    const targetItemId = parseInt(parts[3], 10); 

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Проверяем существует ли предмет
        const itemRes = await client.query('SELECT name, value FROM items WHERE id = $1', [targetItemId]);
        const item = itemRes.rows[0];

        if (!item) {
             await client.query('ROLLBACK');
             return;
        }

        if (action === 'app') {
            // Создаем пользователя, если нет
            await client.query(
                `INSERT INTO users (id, first_name, balance) VALUES ($1, $2, 0) ON CONFLICT (id) DO NOTHING`,
                [targetUserId, 'Пользователь']
            );

            // Проверяем инвентарь
            const checkInv = await client.query(
                'SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2',
                [targetUserId, targetItemId]
            );

            if (checkInv.rows.length > 0) {
                await client.query(
                    'UPDATE user_inventory SET quantity = quantity + 1 WHERE user_id = $1 AND item_id = $2',
                    [targetUserId, targetItemId]
                );
            } else {
                await client.query(
                    'INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1)',
                    [targetUserId, targetItemId]
                );
            }

            await client.query('COMMIT');

            await bot.editMessageText(
                message.text + `\n\n🟢 <b>Статус:</b> ЗАЯВКА ОДОБРЕНА (Предмет передан)`,
                { chat_id: message.chat.id, message_id: message.message_id, parse_mode: 'HTML' }
            ).catch(() => {});

            const userMsg = `📥 <b>Ваш депозит подтвержден!</b>\n\n🎁 Подарок <b>${item.name}</b> добавлен в инвентарь.\n🎒 Откройте «Инвентарь» в приложении!`;
            bot.sendMessage(targetUserId, userMsg, { parse_mode: 'HTML' }).catch(() => {});

        } else if (action === 'rej') {
            await client.query('COMMIT');

            await bot.editMessageText(
                message.text + `\n\n🔴 <b>Статус:</b> ЗАЯВКА ОТКЛОНЕНА`,
                { chat_id: message.chat.id, message_id: message.message_id, parse_mode: 'HTML' }
            ).catch(() => {});

            const userMsg = `⚠️ <b>Ваш запрос на депозит подарка был отклонен.</b>\n\nПожалуйста, свяжитесь с поддержкой @Sintopa для уточнения деталей.`;
            bot.sendMessage(targetUserId, userMsg, { parse_mode: 'HTML' }).catch(() => {});
        }

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("Ошибка в боте при одобрении:", err);
    } finally {
        if (client) client.release();
    }
});

module.exports = {
    bot,
    checkUserSubscription,
    getUserAvatarUrl
};

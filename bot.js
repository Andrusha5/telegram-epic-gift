const TelegramBot = require('node-telegram-bot-api');
const db = require('./db'); 
const pool = db.pool || db;

const token = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_ID;

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

// Обработчик кнопок одобрения/отклонения депозитов (ИСПРАВЛЕНА ЛОГИКА)
bot.on('callback_query', async (callbackQuery) => {
    const actionData = callbackQuery.data;
    const queryId = callbackQuery.id;
    const message = callbackQuery.message;

    // Проверяем, что это наша кнопка
    if (!actionData.startsWith('approve_dep_') && !actionData.startsWith('reject_dep_')) {
        return; 
    }

    bot.answerCallbackQuery(queryId).catch(() => {});

    // Разбираем данные: approve_dep_123456789_101
    const parts = actionData.split('_');
    const action = parts[1]; // approve или reject
    const targetUserId = String(parts[2]); 
    const targetItemId = parseInt(parts[3], 10); 

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Проверяем существует ли предмет в базе
        const itemRes = await client.query('SELECT name, value FROM items WHERE id = $1', [targetItemId]);
        const item = itemRes.rows[0];

        if (!item) {
             await client.query('ROLLBACK');
             await bot.editMessageText(
                message.text + `\n\n❌ <b>Ошибка:</b> Предмет с ID ${targetItemId} не найден в базе.`,
                { chat_id: message.chat.id, message_id: message.message_id, parse_mode: 'HTML' }
            ).catch(() => {});
            return;
        }

        if (action === 'approve') {
            // Создаем пользователя, если его нет
            await client.query(
                `INSERT INTO users (id, first_name, balance) VALUES ($1, $2, 0) ON CONFLICT (id) DO NOTHING`,
                [targetUserId, 'Пользователь']
            );

            // Проверяем инвентарь (используем user_inventory)
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

            // Обновляем сообщение в чате админа
            await bot.editMessageText(
                message.text + `\n\n🟢 <b>Статус:</b> ЗАЯВКА ОДОБРЕНА (Предмет передан)`,
                { chat_id: message.chat.id, message_id: message.message_id, parse_mode: 'HTML' }
            ).catch(() => {});

            // Отправляем уведомление игроку
            const userMsg = `📥 <b>Ваш депозит подтвержден!</b>\n\n` +
                            `🎁 Подарок <b>${item.name}</b> добавлен в инвентарь.\n` +
                            `🎒 Откройте «Инвентарь» в приложении!`;
            bot.sendMessage(targetUserId, userMsg, { parse_mode: 'HTML' }).catch(() => {});

        } else if (action === 'reject') {
            await client.query('COMMIT');

            // Обновляем сообщение в чате админа
            await bot.editMessageText(
                message.text + `\n\n🔴 <b>Статус:</b> ЗАЯВКА ОТКЛОНЕНА`,
                { chat_id: message.chat.id, message_id: message.message_id, parse_mode: 'HTML' }
            ).catch(() => {});

            // Отправляем уведомление игроку
            const userMsg = `⚠️ <b>Ваш запрос на депозит подарка был отклонен.</b>\n\n` +
                            `Пожалуйста, свяжитесь с поддержкой @Sintopa для уточнения деталей.`;
            bot.sendMessage(targetUserId, userMsg, { parse_mode: 'HTML' }).catch(() => {});
        }

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("Ошибка в боте при одобрении:", err);
        // Уведомляем админа об ошибке в том же чате
        await bot.editMessageText(
            message.text + `\n\n❌ <b>Ошибка при обработке:</b> ${err.message}`,
            { chat_id: message.chat.id, message_id: message.message_id, parse_mode: 'HTML' }
        ).catch(() => {});
    } finally {
        if (client) client.release();
    }
});

module.exports = {
    bot,
    checkUserSubscription,
    getUserAvatarUrl
};

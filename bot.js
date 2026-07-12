const TelegramBot = require('node-telegram-bot-api');
const db = require('./db'); 
const pool = db.pool || db;

// Инициализация бота
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// --- ОБРАБОТЧИК ДЕПОЗИТА: ОДОБРЕНИЕ ИЛИ ОТКЛОНЕНИЕ (ИЗБАВЛЯЕТ ОТ ЗАВИСАНИЯ!) ---
bot.on('callback_query', async (callbackQuery) => {
    const actionData = callbackQuery.data;
    const queryId = callbackQuery.id;
    const message = callbackQuery.message;

    if (!actionData.startsWith('dep_app_') && !actionData.startsWith('dep_rej_')) {
        return; 
    }

    // Парсим callback_data: [dep_app/dep_rej, userId, itemId]
    const parts = actionData.split('_');
    const action = parts[1]; // "app" (одобрить) или "rej" (отклонить)
    const targetUserId = parts[2];
    const targetItemId = parts[3];

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Получаем информацию о предмете
        const itemRes = await client.query('SELECT name, value FROM items WHERE id = $1', [targetItemId]);
        const item = itemRes.rows[0];

        if (!item) {
             await client.query('ROLLBACK');
             // МГНОВЕННО СНИМАЕМ ЗАВИСАНИЕ С КНОПКИ ПРИ ОШИБКЕ
             await bot.answerCallbackQuery(queryId, { text: "Ошибка: Предмет не найден!", show_alert: true });
             return;
        }

        if (action === 'app') {
            // ОДОБРЕНО: Зачисляем подарок в инвентарь пользователя
            await client.query(
                'INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1',
                [targetUserId, targetItemId]
            );
            await client.query('COMMIT');

            // Мгновенно сообщаем Telegram, что действие завершено успешно (Кнопка отвисает)
            await bot.answerCallbackQuery(queryId, { text: "Заявка успешно ОДОБРЕНА! Предмет зачислен." });

            // Редактируем сообщение для админа
            await bot.editMessageText(
                message.text + `\n\n🟢 *Статус:* ЗАЯВКА ОДОБРЕНА (Предмет передан)`,
                { chat_id: message.chat.id, message_id: message.message_id, parse_mode: 'Markdown' }
            );

            // Отправляем теплое поздравление игроку в ЛС от бота
            const userMsg = `📥 *Ваш депозит подтвержден!*\n\n` +
                            `🎁 Подарок *${item.name}* успешно зачислен в ваш инвентарь.\n` +
                            `🎒 Откройте «Инвентарь» в игре, чтобы продать или забрать его!`;
            bot.sendMessage(targetUserId, userMsg, { parse_mode: 'Markdown' }).catch(() => {});

        } else if (action === 'rej') {
            // ОТКЛОНЕНО
            await client.query('COMMIT');

            // Мгновенно сообщаем Telegram, чтобы кнопка «отвисла»
            await bot.answerCallbackQuery(queryId, { text: "Заявка успешно отклонена." });

            await bot.editMessageText(
                message.text + `\n\n🔴 *Статус:* ЗАЯВКА ОТКЛОНЕНА АДМИНИСТРАТОРОМ`,
                { chat_id: message.chat.id, message_id: message.message_id, parse_mode: 'Markdown' }
            );

            // Уведомляем игрока
            const userMsg = `⚠️ *Ваш запрос на депозит подарка был отклонен.*\n\n` +
                            `Пожалуйста, свяжитесь с поддержкой @Sintopa для уточнения деталей.`;
            bot.sendMessage(targetUserId, userMsg, { parse_mode: 'Markdown' }).catch(() => {});
        }

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("Ошибка при обработке callback_query:", err);
        // Безопасный фолбек для отвисания кнопки в случае сбоя БД
        bot.answerCallbackQuery(queryId, { text: "Критическая ошибка сервера базы данных!", show_alert: true }).catch(() => {});
    } finally {
        if (client) client.release();
    }
});

module.exports = {
    bot
};

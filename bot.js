const TelegramBot = require('node-telegram-bot-api');
const db = require('./db'); 
const pool = db.pool || db;

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// --- ОБРАБОТЧИК КНОПОК ДЕПОЗИТА (ОДОБРИТЬ / ОТКЛОНИТЬ) ---
bot.on('callback_query', async (callbackQuery) => {
    const actionData = callbackQuery.data;
    const queryId = callbackQuery.id;
    const message = callbackQuery.message;

    if (!actionData.startsWith('dep_app_') && !actionData.startsWith('dep_rej_')) {
        return; 
    }

    const parts = actionData.split('_');
    const action = parts[1]; // "app" (одобрить) или "rej" (отклонить)
    const targetUserId = String(parts[2]); 
    const targetItemId = parseInt(parts[3], 10); 

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Получаем точное имя предмета из базы данных
        const itemRes = await client.query('SELECT name, value FROM items WHERE id = $1', [targetItemId]);
        const item = itemRes.rows[0];

        if (!item) {
             await client.query('ROLLBACK');
             await bot.answerCallbackQuery(queryId, { text: "Ошибка: Предмет удален или не найден в БД!", show_alert: true }).catch(() => {});
             return;
        }

        if (action === 'app') {
            // ОДОБРЕНО: Зачисляем подарок в инвентарь ( quantity = quantity + 1 )
            await client.query(
                'INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1) ' +
                'ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1',
                [targetUserId, targetItemId]
            );
            await client.query('COMMIT');

            // МГНОВЕННО КУПИРУЕМ ЗАВИСАНИЕ КНОПКИ
            await bot.answerCallbackQuery(queryId, { text: "✅ Заявка одобрена! Предмет зачислен пользователю." }).catch(() => {});

            // Обновляем сообщение в чате админа (статус)
            await bot.editMessageText(
                message.text + `\n\n🟢 *Статус:* ЗАЯВКА ОДОБРЕНА (Предмет успешно зачислен)`,
                { chat_id: message.chat.id, message_id: message.message_id, parse_mode: 'Markdown' }
            ).catch(() => {});

            // Отправляем теплое поздравление игроку в ЛС от лица бота
            const userMsg = `📥 *Ваш депозит подтвержден!*\n\n` +
                            `🎁 Подарок *${item.name}* зачислен в ваш инвентарь.\n` +
                            `🎒 Вы можете продать или забрать его во вкладке «Инвентарь»!`;
            bot.sendMessage(targetUserId, userMsg, { parse_mode: 'Markdown' }).catch(() => {});

        } else if (action === 'rej') {
            // ОТКЛОНЕНО
            await client.query('COMMIT');

            await bot.answerCallbackQuery(queryId, { text: "❌ Заявка отклонена." }).catch(() => {});

            await bot.editMessageText(
                message.text + `\n\n🔴 *Статус:* ЗАЯВКА ОТКЛОНЕНА АДМИНИСТРАТОРОМ`,
                { chat_id: message.chat.id, message_id: message.message_id, parse_mode: 'Markdown' }
            ).catch(() => {});

            // Отправляем уведомление игроку в ЛС
            const userMsg = `⚠️ *Ваш запрос на депозит подарка был отклонен.*\n\n` +
                            `Пожалуйста, свяжитесь с поддержкой @Sintopa для решения вопроса.`;
            bot.sendMessage(targetUserId, userMsg, { parse_mode: 'Markdown' }).catch(() => {});
        }

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("Ошибка при обработке callback_query:", err);
        // Безопасный фолбек для отвисания кнопки в случае сбоя БД
        bot.answerCallbackQuery(queryId, { text: "Произошла внутренняя ошибка сервера!", show_alert: true }).catch(() => {});
    } finally {
        if (client) client.release();
    }
});

module.exports = {
    bot
};

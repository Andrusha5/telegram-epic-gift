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

    // Мгновенно шлём ответ Telegram, чтобы кнопка сразу же «отвисла» и не крутился индикатор!
    bot.answerCallbackQuery(queryId).catch(() => {});

    const parts = actionData.split('_');
    const action = parts[1]; // "app" (одобрить) или "rej" (отклонить)
    const targetUserId = String(parts[2]); 
    const targetItemId = parseInt(parts[3], 10); 

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // 1. Получаем информацию о предмете
        const itemRes = await client.query('SELECT name, value FROM items WHERE id = $1', [targetItemId]);
        const item = itemRes.rows[0];

        if (!item) {
             await client.query('ROLLBACK');
             console.error(`Предмет с ID ${targetItemId} не найден в базе данных.`);
             return;
        }

        if (action === 'app') {
            // 2. БЕЗОПАСНЫЙ INSERT: Гарантируем, что пользователь создан в users во избежание Foreign Key ошибок!
            await client.query(
                `INSERT INTO users (id, first_name, balance) VALUES ($1, $2, 0) ON CONFLICT (id) DO NOTHING`,
                [targetUserId, 'Пользователь']
            );

            // 3. БЕЗОПАСНАЯ ПРОВЕРКА И ДОБАВЛЕНИЕ: Избегаем сбоев с ON CONFLICT
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
            console.log(`[УСПЕХ] Предмет ${item.name} успешно зачислен игроку ${targetUserId}.`);

            // Обновляем сообщение в вашем чате (указываем статус)
            await bot.editMessageText(
                message.text + `\n\n🟢 <b>Статус:</b> ЗАЯВКА ОДОБРЕНА (Предмет передан)`,
                { chat_id: message.chat.id, message_id: message.message_id, parse_mode: 'HTML' }
            ).catch(() => {});

            // Сразу же пишем игроку в ЛС заветную новость
            const userMsg = `📥 <b>Ваш депозит подтвержден!</b>\n\n` +
                            `🎁 Подарок <b>${item.name}</b> успешно добавлен в ваш инвентарь.\n` +
                            `🎒 Откройте «Инвентарь» в приложении, чтобы распорядиться им!`;
            bot.sendMessage(targetUserId, userMsg, { parse_mode: 'HTML' }).catch(() => {});

        } else if (action === 'rej') {
            // ОТКЛОНЕНО
            await client.query('COMMIT');

            await bot.editMessageText(
                message.text + `\n\n🔴 <b>Статус:</b> ЗАЯВКА ОТКЛОНЕНА АДМИНИСТРАТОРОМ`,
                { chat_id: message.chat.id, message_id: message.message_id, parse_mode: 'HTML' }
            ).catch(() => {});

            const userMsg = `⚠️ <b>Ваш запрос на депозит подарка был отклонен.</b>\n\n` +
                            `Пожалуйста, свяжитесь с поддержкой @Sintopa для уточнения деталей.`;
            bot.sendMessage(targetUserId, userMsg, { parse_mode: 'HTML' }).catch(() => {});
        }

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("Критическая ошибка при обработке callback кнопки:", err);
    } finally {
        if (client) client.release();
    }
});

module.exports = {
    bot
};

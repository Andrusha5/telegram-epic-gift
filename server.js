const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const TelegramBot = require('node-telegram-bot-api');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Логирование запросов в консоль
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        console.log(`[API REQUEST] ${req.method} ${req.path}`);
    }
    next();
});

// Глобальный перехват ошибок для стабильности
process.on('uncaughtException', (err) => {
    console.error('⛔ СИСТЕМНЫЙ ПЕРЕХВАТ ОШИБКИ:', err.stack || err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('⛔ СИСТЕМНЫЙ ПЕРЕХВАТ НЕОБРАБОТАННОГО ПРОМИСА:', reason);
});

// ===================== КОНФИГУРАЦИЯ =====================
const ADMIN_CHAT_ID = String(process.env.ADMIN_TELEGRAM_ID || '').trim().replace(/^["']|["']$/g, '');
const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim().replace(/^["']|["']$/g, '');
const DEPOSIT_ADDRESS = String(process.env.ADMIN_TON_ADDRESS || 'EQC3481up9_gG98_wK8Jv_Zz1yLp9p0_Y-7Jv7x4b9a9JKe6').trim().replace(/^["']|["']$/g, '');
const WEB_APP_URL = String(process.env.WEB_APP_URL || 'https://telegram-best-gifts.onrender.com').trim().replace(/^["']|["']$/g, '');

// ===================== БОТ =====================
let bot = null;
if (BOT_TOKEN && BOT_TOKEN !== "undefined" && BOT_TOKEN !== "") {
    try {
        bot = new TelegramBot(BOT_TOKEN, { polling: true });
        console.log("SUCCESS: Telegram Bot successfully initialized.");

        bot.on('polling_error', (error) => {
            if (!error.message.includes('409 Conflict')) {
                console.warn("⚠️ Предупреждение Polling:", error.message);
            }
        });
        bot.on('error', (error) => {
            console.error("⚠️ Ошибка бота:", error.message);
        });

        bot.setMyCommands([
            { command: 'start', description: 'Запустить BestGifts 🚀' },
            { command: 'addbalance', description: 'Пополнить баланс игрока (Админ) 💎' },
            { command: 'ban', description: 'Заблокировать игрока (Админ) 🚫' },
            { command: 'unban', description: 'Разблокировать игрока (Админ) ✅' },
            { command: 'status', description: 'Статус игрока (Админ) 🔍' }
        ]).then(() => {
            console.log("SUCCESS: Bot commands menu registered.");
        }).catch(err => {
            console.error("ERROR registering bot commands:", err.message);
        });

        bot.deleteWebHook({ drop_pending_updates: true }).then(() => {
            console.log("SUCCESS: Telegram Webhook dropped. Bot polling active!");
        }).catch(err => {
            console.error("ERROR clearing Webhook:", err.message);
        });

    } catch (e) {
        console.error("CRITICAL: Failed to initialize Telegram Bot:", e.message);
    }
}

// ===================== БАЗА ДАННЫХ =====================
let pgPool = null;
if (process.env.DATABASE_URL) {
    pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
}

async function dbGetUser(id) {
    try {
        if (pgPool) {
            const res = await pgPool.query("SELECT * FROM users WHERE id = $1", [String(id)]);
            return res.rows[0] || null;
        }
    } catch (e) {
        console.error("DB Fallback GetUser:", e.message);
    }
    return null;
}

async function dbGetUserByUsername(username) {
    try {
        if (pgPool) {
            const cleanUsername = username.replace('@', '').trim();
            const res = await pgPool.query("SELECT * FROM users WHERE LOWER(username) = LOWER($1)", [cleanUsername]);
            return res.rows[0] || null;
        }
    } catch (e) {
        console.error("DB GetUserByUsername Error:", e.message);
    }
    return null;
}

async function dbSaveUser(id, user) {
    const isBannedValue = (user.is_banned === true || user.is_banned === 'true');
    try {
        if (pgPool) {
            await pgPool.query(`
                INSERT INTO users (id, username, first_name, balance, avatar_url, last_daily_case_open, is_banned)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) DO UPDATE 
                SET username = $2, first_name = $3, balance = $4, avatar_url = $5, last_daily_case_open = $6, is_banned = $7
            `, [String(id), user.username, user.first_name, user.balance, user.avatar_url, user.last_daily_case_open, isBannedValue]);
            return;
        }
    } catch (e) {
        console.error("DB Fallback SaveUser:", e.message);
    }
}

async function dbGetInventory(userId) {
    try {
        if (pgPool) {
            const res = await pgPool.query("SELECT * FROM inventory WHERE user_id = $1", [String(userId)]);
            return res.rows;
        }
    } catch (e) {
        console.error("DB Fallback GetInventory:", e.message);
    }
    return [];
}

async function dbAddInventoryItem(userId, itemId, itemName, itemValue, itemIcon) {
    try {
        if (pgPool) {
            await pgPool.query(`
                INSERT INTO inventory (user_id, item_id, name, value, image_url)
                VALUES ($1, $2, $3, $4, $5)
            `, [String(userId), itemId, itemName, itemValue, itemIcon]);
            return;
        }
    } catch (e) {
        console.error("DB Fallback AddInventory:", e.message);
    }
}

async function dbRemoveInventoryItem(userId, itemId) {
    try {
        if (pgPool) {
            await pgPool.query("DELETE FROM inventory WHERE id = (SELECT id FROM inventory WHERE user_id = $1 AND item_id = $2 LIMIT 1)", [String(userId), parseInt(itemId)]);
            return;
        }
    } catch (e) {
        console.error("DB Fallback RemoveInventory:", e.message);
    }
}

// ===================== ПРЕДМЕТЫ =====================
const ALL_GIFT_ITEMS = {
    1: { name: "Статуя птицы серая", value: 20.0, icon: "/Images/Items/rare_bird.jpg" },
    2: { name: "Тыква", value: 8.0, icon: "/Images/Items/pumpkin.jpg" },
    3: { name: "Шляпа", value: 7.0, icon: "/Images/Items/hat.jpg" },
    4: { name: "Собачка Snoop Dogg", value: 4.0, icon: "/Images/Items/snoopdog.jpg" },
    5: { name: "Рюкзак черный", value: 3.0, icon: "/Images/Items/pack.jpg" },
    6: { name: "Доширак лапша", value: 2.7, icon: "/Images/Items/ramen.jpg" },
    7: { name: "Факел", value: 2.5, icon: "/Images/Items/chill_flame.jpg" },
    8: { name: "Мороженое пломбир", value: 2.5, icon: "/Images/Items/plombir.jpg" },
    9: { name: "Алмазик", value: 0.9, icon: "/Images/Items/almaz.jpg" },
    10: { name: "Роза", value: 0.27, icon: "/Images/Items/roza.jpg" },
    101: { name: "Розовый мишка", value: 29.0, icon: "/Images/Items/bearpink.png" },
    102: { name: "Шлем Неко", value: 26.8, icon: "/Images/Items/Neko_helmet.png" },
    103: { name: "Перстень печатка", value: 25.7, icon: "/Images/Items/signet_ring.png" },
    104: { name: "Папаха", value: 18.5, icon: "/Images/Items/papakha.png" },
    105: { name: "Амулет Купидона", value: 15.0, icon: "/Images/Items/cupid_charm.png" },
    106: { name: "Любовное зелье", value: 10.0, icon: "/Images/Items/love_potion.png" },
    107: { name: "UFC Бокс", value: 9.9, icon: "/Images/Items/UFC_box.png" },
    108: { name: "Всевидящее око", value: 5.0, icon: "/Images/Items/eye.png" },
    109: { name: "Холодный огонь", value: 2.2, icon: "/Images/Items/chill_flame.jpg" },
    110: { name: "Вкусный пломбир", value: 2.2, icon: "/Images/Items/plombir.jpg" },
    111: { name: "Прекрасная роза", value: 0.2, icon: "/Images/Items/roza.jpg" },
    112: { name: "Мишка классический", value: 0.11, icon: "/Images/Items/michka.jpg" }
};

// ===================== ЦВЕТА ИГРОКОВ =====================
const defaultColors = ['#ff3b30', '#4cd964', '#007aff', '#ffcc00', '#5856d6', '#ff2d55', '#5ac8fa', '#00e676', '#ff9500', '#0088cc'];
function getUserColor(userId, roundNumber) {
    const idStr = String(userId || 'guest') + "_" + String(roundNumber || 1);
    let hash = 0;
    for (let i = 0; i < idStr.length; i++) {
        hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % defaultColors.length;
    return defaultColors[index];
}

// ===================== АРЕНА =====================
let arenaState = {
    status: "waiting", 
    roundNumber: 1,
    bets: [],
    timeLeft: 15,
    resolvedAt: 0,
    winnerId: null,
    winnerName: null,
    winnerX: 160,
    winnerY: 160,
    totalPool: 0
};

setInterval(() => {
    try {
        let stateChanged = false;
        if (arenaState.status === "waiting") {
            if (arenaState.bets.length >= 2) {
                arenaState.status = "countdown";
                arenaState.timeLeft = 15;
                stateChanged = true;
                console.log(`[ARENA] 🟢 Начат отсчет раунда №${arenaState.roundNumber}`);
            }
        } else if (arenaState.status === "countdown") {
            arenaState.timeLeft--;
            stateChanged = true;
            if (arenaState.timeLeft <= 0) {
                console.log(`[ARENA] ⏳ Время истекло. Запускаем розыгрыш...`);
                resolveArenaRound();
            }
        } else if (arenaState.status === "finished") {
            arenaState.timeLeft--;
            stateChanged = true;
            if (arenaState.timeLeft <= 0) {
                console.log(`[ARENA] 🔄 Сброс раунда. Новый раунд №${arenaState.roundNumber + 1}`);
                arenaState.bets = [];
                arenaState.status = "waiting";
                arenaState.timeLeft = 15;
                arenaState.winnerId = null;
                arenaState.winnerName = null;
                arenaState.totalPool = 0;
                arenaState.roundNumber++;
                stateChanged = true;
            }
        }
        if (stateChanged) {
            // Сохраняем в память (для Render файловая система эфемерна)
        }
    } catch (err) {
        console.error("Arena interval error:", err.message);
    }
}, 1000);

async function resolveArenaRound() {
    try {
        if (arenaState.bets.length < 2) {
            arenaState.status = "waiting";
            return;
        }
        let pool = 0;
        arenaState.bets.forEach(b => pool += parseFloat(b.amount));
        arenaState.totalPool = pool;

        const rand = Math.random() * pool;
        let sum = 0;
        let winnerBet = arenaState.bets[arenaState.bets.length - 1];

        for (let i = 0; i < arenaState.bets.length; i++) {
            sum += arenaState.bets[i].amount;
            if (rand <= sum) {
                winnerBet = arenaState.bets[i];
                break;
            }
        }

        const winnerIndex = arenaState.bets.indexOf(winnerBet);
        // Упрощенная генерация координат для клиента
        const coords = { x: 160 + Math.random() * 80, y: 160 + Math.random() * 80 };

        arenaState.winnerId = winnerBet.userId;
        arenaState.winnerName = winnerBet.username;
        arenaState.winnerX = coords.x;
        arenaState.winnerY = coords.y;
        arenaState.resolvedAt = Date.now();
        arenaState.status = "finished";
        arenaState.timeLeft = 8; 
        
        console.log(`[ARENA] 🏆 Победитель: @${winnerBet.username} (ID: ${winnerBet.userId}) Банк: ${pool} GRAM!`);

        const winnerUser = await dbGetUser(winnerBet.userId);
        if (winnerUser) {
            winnerUser.balance = parseFloat((parseFloat(winnerUser.balance) + pool).toFixed(3));
            await dbSaveUser(winnerBet.userId, winnerUser);
        }
    } catch (err) {
        console.error("[ARENA] ❌ Ошибка розыгрыша раунда:", err);
        arenaState.status = "waiting";
        arenaState.timeLeft = 15;
    }
}

// ===================== ПОЛЬЗОВАТЕЛИ =====================
async function getOrCreateUser(initDataUnsafe) {
    const tgUser = initDataUnsafe?.user || { id: "guest_user_id", username: "Пользователь", first_name: "Пользователь" };
    const id = String(tgUser.id);
    
    let user = await dbGetUser(id);
    if (!user) {
        user = {
            id: id,
            username: tgUser.username || tgUser.first_name || "Пользователь",
            first_name: tgUser.first_name || "",
            balance: 50.0, 
            avatar_url: tgUser.photo_url || "https://img.icons8.com/color/96/user.png",
            last_daily_case_open: null,
            is_banned: false
        };
        await dbSaveUser(id, user);
    }
    return user;
}

async function parseTelegramInitData(req, res, next) {
    const rawHeader = req.headers['x-telegram-init-data'];
    let initDataUnsafe = {};
    if (rawHeader) {
        try {
            const params = new URLSearchParams(rawHeader);
            const userRaw = params.get('user');
            if (userRaw) {
                initDataUnsafe.user = JSON.parse(userRaw);
            }
        } catch (e) {
            console.error("InitData parsing error:", e);
        }
    }
    const user = await getOrCreateUser(initDataUnsafe);
    if (user.is_banned === true || user.is_banned === 'true') {
        return res.status(403).json({ banned: true, error: "Ваш аккаунт заблокирован!" });
    }
    req.user = user;
    next();
}

// ===================== API РОУТЫ =====================
app.get('/api/user', parseTelegramInitData, (req, res) => {
    const user = req.user;
    const isAdmin = String(user.id).trim() === String(ADMIN_CHAT_ID).trim();
    res.json({
        id: user.id,
        username: user.username,
        first_name: user.first_name,
        balance: user.balance,
        avatar_url: user.avatar_url,
        last_daily_case_open: user.last_daily_case_open,
        is_banned: user.is_banned,
        isAdmin: isAdmin
    });
});

// ПОПОЛНЕНИЕ БАЛАНСА
app.post('/api/verify_payment', parseTelegramInitData, async (req, res) => {
    const { amount } = req.body;
    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

    const userId = req.user.id;
    const user = await dbGetUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.balance = parseFloat((parseFloat(user.balance) + paymentAmount).toFixed(3));
    await dbSaveUser(user.id, user);

    if (bot && ADMIN_CHAT_ID) {
        bot.sendMessage(ADMIN_CHAT_ID, `💎 **Пополнение баланса!**\nИгрок @${user.username} (ID: ${user.id}) зачислил **+${paymentAmount.toFixed(3)} TON**!`, { parse_mode: "Markdown" });
    }
    res.json({ success: true, newBalance: user.balance });
});

// ОТПРАВКА ПОДАРКА ДРУГУ (НОВАЯ ФУНКЦИЯ)
app.post('/api/send_gift', parseTelegramInitData, async (req, res) => {
    const { targetUsername, itemId } = req.body;
    const senderId = req.user.id;

    if (!targetUsername || !itemId) {
        return res.status(400).json({ error: "Не указаны получатель или предмет" });
    }

    try {
        // 1. Проверяем получателя
        const targetUser = await dbGetUserByUsername(targetUsername);
        if (!targetUser) {
            return res.status(404).json({ error: "Пользователь не найден" });
        }
        if (String(targetUser.id) === String(senderId)) {
            return res.status(400).json({ error: "Нельзя отправить подарок самому себе" });
        }

        // 2. Проверяем наличие предмета у отправителя
        const inventory = await dbGetInventory(senderId);
        const itemExists = inventory.find(i => parseInt(i.item_id) === parseInt(itemId));
        if (!itemExists) {
            return res.status(400).json({ error: "У вас нет этого предмета" });
        }

        // 3. Удаляем у отправителя
        await dbRemoveInventoryItem(senderId, itemId);

        // 4. Добавляем получателю
        const giftData = ALL_GIFT_ITEMS[itemId];
        if (giftData) {
            await dbAddInventoryItem(targetUser.id, itemId, giftData.name, giftData.value, giftData.icon);
        } else {
            await dbAddInventoryItem(targetUser.id, itemId, itemExists.name, itemExists.value, itemExists.image_url);
        }

        // 5. Отправляем уведомление в Telegram (ботом)
        if (bot) {
            const senderUser = await dbGetUser(senderId);
            const giftName = giftData ? giftData.name : itemExists.name;
            const giftValue = giftData ? giftData.value : itemExists.value;
            
            // Ссылка на аватарку отправителя
            const senderAvatar = senderUser.avatar_url || "https://img.icons8.com/color/96/user.png";

            const message = `
🎁 <b>Вам подарили предмет!</b>

<b>От кого:</b> ${senderUser.first_name || senderUser.username || "Неизвестный"}
<b>Предмет:</b> ${giftName}
<b>Ценность:</b> ${giftValue} GRAM

💾 Предмет уже в вашем инвентаре!
            `;

            // Отправляем с кнопкой открыть приложение
            const inlineKeyboard = {
                inline_keyboard: [
                    [{ text: "📦 Открыть инвентарь", url: WEB_APP_URL }]
                ]
            };

            await bot.sendMessage(targetUser.id, message, { parse_mode: "HTML", reply_markup: inlineKeyboard });
        }

        res.json({ success: true, message: "Подарок успешно отправлен!" });

    } catch (err) {
        console.error("Error sending gift:", err);
        res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
});

// ИНВЕНТАРЬ
app.get('/api/inventory', parseTelegramInitData, async (req, res) => {
    const userInventory = await dbGetInventory(req.user.id);
    res.json(userInventory);
});

// ПРОДАЖА
app.post('/api/sell_gift', parseTelegramInitData, async (req, res) => {
    const { itemId, price } = req.body;
    const userId = req.user.id;
    const sellPrice = parseFloat(price) || 0.1;

    const user = await dbGetUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    await dbRemoveInventoryItem(user.id, itemId);
    user.balance = parseFloat((parseFloat(user.balance) + sellPrice).toFixed(3));
    await dbSaveUser(user.id, user);

    res.json({ success: true, newBalance: user.balance });
});

// ВЫВОД
app.post('/api/withdraw_gift', parseTelegramInitData, async (req, res) => {
    const { itemId } = req.body;
    const user = req.user;
    const gift = ALL_GIFT_ITEMS[itemId];
    if (!gift) return res.status(400).json({ error: "Item not found" });

    await dbRemoveInventoryItem(user.id, itemId);

    if (bot && ADMIN_CHAT_ID) {
        const textMsg = `📤 **Заявка на вывод подарка!**\n**Игрок:** @${user.username} (ID: ${user.id})\n**Предмет:** *${gift.name}* (${gift.value} GRAM)\n\n_Пожалуйста, отправьте ему этот подарок в Telegram!_`;
        bot.sendMessage(ADMIN_CHAT_ID, textMsg, { parse_mode: "Markdown" });
    }
    res.json({ success: true });
});

// СТАВКА
app.post('/api/place_bet', parseTelegramInitData, async (req, res) => {
    const userId = req.user.id;
    const amount = parseFloat(req.body.amount);

    if (isNaN(amount) || amount < 0.1) return res.status(400).json({ error: "Недопустимая сумма ставки" });
    if (arenaState.status === "finished") return res.status(400).json({ error: "Раунд уже завершен" });

    const user = await dbGetUser(userId);
    if (!user || parseFloat(user.balance) < amount) return res.status(400).json({ error: "Недостаточно баланса" });

    const chosenColor = getUserColor(user.id, arenaState.roundNumber);

    user.balance = parseFloat((parseFloat(user.balance) - amount).toFixed(3));
    await dbSaveUser(user.id, user);

    const existingBet = arenaState.bets.find(b => String(b.userId) === String(user.id));
    if (existingBet) {
        existingBet.amount = parseFloat((existingBet.amount + amount).toFixed(3));
    } else {
        arenaState.bets.push({
            userId: user.id,
            username: user.username,
            avatar: user.avatar_url,
            amount: amount,
            color: chosenColor
        });
    }
    res.json({ success: true, newBalance: user.balance });
});

// СОСТОЯНИЕ АРЕНЫ
app.get('/api/arena/state', parseTelegramInitData, (req, res) => {
    res.json({
        status: arenaState.status,
        roundNumber: arenaState.roundNumber,
        bets: arenaState.bets,
        timeLeft: arenaState.timeLeft,
        resolvedAt: arenaState.resolvedAt,
        winnerId: arenaState.winnerId,
        winnerName: arenaState.winnerName,
        winnerX: arenaState.winnerX,
        winnerY: arenaState.winnerY,
        totalPool: arenaState.totalPool,
        serverTime: Date.now()
    });
});

// ОТКРЫТИЕ КЕЙСОВ
app.post('/api/open_daily_case', parseTelegramInitData, async (req, res) => {
    const userId = req.user.id;
    const user = await dbGetUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;
    const isAdmin = String(user.id).trim() === String(ADMIN_CHAT_ID).trim();

    if (!isAdmin && user.last_daily_case_open && (now - new Date(user.last_daily_case_open).getTime() < cooldown)) {
        return res.status(400).json({ error: "Кейс еще недоступен" });
    }

    const rewards = [
        { id: 10, name: "Роза", type: "gift", value: 0.27, icon: "/Images/Items/roza.jpg" },
        { id: 11, name: "Пополнение 0.1 GRAM", type: "balance", value: 0.1 },
        { id: 14, name: "Пополнение 0.03 GRAM", type: "balance", value: 0.03 }
    ];
    const won = rewards[Math.floor(Math.random() * rewards.length)];

    user.last_daily_case_open = new Date().toISOString();
    if (won.type === "balance") {
        user.balance = parseFloat((parseFloat(user.balance) + won.value).toFixed(3));
    } else {
        const gift = ALL_GIFT_ITEMS[won.id];
        if (gift) await dbAddInventoryItem(user.id, won.id, gift.name, gift.value, gift.icon);
    }
    await dbSaveUser(user.id, user);
    res.json({ success: true, wonItem: won, newBalance: user.balance });
});

app.post('/api/open_newbie_case', parseTelegramInitData, async (req, res) => {
    const userId = req.user.id;
    const user = await dbGetUser(userId);
    if (!user || parseFloat(user.balance) < 0.1) return res.status(400).json({ error: "Недостаточно баланса" });

    user.balance = parseFloat((parseFloat(user.balance) - 0.1).toFixed(3));

    const rewards = [
        { id: 109, name: "Холодный огонь", type: "gift", value: 2.2 },
        { id: 112, name: "Мишка классический", type: "gift", value: 0.11 },
        { id: 113, name: "Пополнение 0.1 GRAM", type: "balance", value: 0.1 }
    ];
    const won = rewards[Math.floor(Math.random() * rewards.length)];

    if (won.type === "balance") {
        user.balance = parseFloat((parseFloat(user.balance) + won.value).toFixed(3));
    } else {
        const gift = ALL_GIFT_ITEMS[won.id];
        if (gift) await dbAddInventoryItem(user.id, won.id, gift.name, gift.value, gift.icon);
    }
    await dbSaveUser(user.id, user);
    res.json({ success: true, wonItem: won, newBalance: user.balance });
});

// ===================== ФРОНТЕНД =====================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

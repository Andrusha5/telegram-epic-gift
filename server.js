const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const TelegramBot = require('node-telegram-bot-api');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

process.on('uncaughtException', (err) => console.error('⛔ ОШИБКА:', err.stack || err));
process.on('unhandledRejection', (reason) => console.error('⛔ ПРОМИС:', reason));

// Конфигурация
const ADMIN_CHAT_ID = String(process.env.ADMIN_TELEGRAM_ID || '').trim().replace(/^["']|["']$/g, '');
const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim().replace(/^["']|["']$/g, '');
const CHANNEL_USERNAME = String(process.env.CHANNEL_USERNAME || '').trim().replace(/^["']|["']$/g, '');

let bot = null;
if (BOT_TOKEN && BOT_TOKEN !== "undefined") {
    try {
        bot = new TelegramBot(BOT_TOKEN, { polling: true });
        console.log("SUCCESS: Telegram Bot initialized.");
        bot.on('polling_error', (error) => {
            if (!error.message.includes('409 Conflict')) console.warn("⚠️ Polling:", error.message);
        });
        bot.deleteWebHook({ drop_pending_updates: true }).then(() => console.log("Webhook dropped."));
    } catch (e) { console.error("CRITICAL Bot error:", e.message); }
}

let pgPool = null;
if (process.env.DATABASE_URL) {
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
}

// БАЗА ДАННЫХ
async function dbGetUser(id) {
    try { if (pgPool) { const res = await pgPool.query("SELECT * FROM users WHERE id = $1", [String(id)]); return res.rows[0] || null; } } catch (e) { console.error("DB GetUser:", e.message); }
    return null;
}
async function dbGetUserByUsername(username) {
    try {
        if (pgPool) {
            const cleanUsername = username.replace('@', '').trim();
            const res = await pgPool.query("SELECT * FROM users WHERE LOWER(username) = LOWER($1)", [cleanUsername]);
            return res.rows[0] || null;
        }
    } catch (e) { console.error("DB GetUserByUsername:", e.message); }
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
        }
    } catch (e) { console.error("DB SaveUser:", e.message); }
}
async function dbGetInventory(userId) {
    try { if (pgPool) { const res = await pgPool.query("SELECT * FROM inventory WHERE user_id = $1", [String(userId)]); return res.rows; } } catch (e) { console.error("DB GetInventory:", e.message); }
    return [];
}
async function dbAddInventoryItem(userId, itemId, itemName, itemValue, itemIcon) {
    try {
        if (pgPool) {
            await pgPool.query(`INSERT INTO inventory (user_id, item_id, name, value, image_url) VALUES ($1, $2, $3, $4, $5)`, [String(userId), itemId, itemName, itemValue, itemIcon]);
        }
    } catch (e) { console.error("DB AddInventory:", e.message); }
}
async function dbRemoveInventoryItem(userId, itemId) {
    try {
        if (pgPool) { await pgPool.query("DELETE FROM inventory WHERE id = (SELECT id FROM inventory WHERE user_id = $1 AND item_id = $2 LIMIT 1)", [String(userId), parseInt(itemId)]); }
    } catch (e) { console.error("DB RemoveInventory:", e.message); }
}

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

// Палитра ярких уникальных цветов
const AVAILABLE_COLORS = ['#ff3b30', '#4cd964', '#007aff', '#ffcc00', '#5856d6', '#ff2d55', '#5ac8fa', '#00e676', '#ff9500', '#0088cc'];

// АРЕНА
let arenaState = { 
    status: "waiting", 
    roundNumber: 1, 
    bets: [], 
    timeLeft: 15, 
    resolvedAt: 0, 
    winnerId: null, 
    winnerX: 160, 
    winnerY: 160, 
    totalPool: 0,
    usedColors: [] // Храним цвета текущего раунда
};

setInterval(() => {
    try {
        if (arenaState.status === "waiting" && arenaState.bets.length >= 2) {
            arenaState.status = "countdown"; 
            arenaState.timeLeft = 15;
        } else if (arenaState.status === "countdown") {
            arenaState.timeLeft--;
            if (arenaState.timeLeft <= 0) resolveArenaRound();
        } else if (arenaState.status === "finished") {
            arenaState.timeLeft--;
            if (arenaState.timeLeft <= 0) {
                arenaState.bets = []; 
                arenaState.status = "waiting"; 
                arenaState.timeLeft = 15;
                arenaState.winnerId = null; 
                arenaState.totalPool = 0; 
                arenaState.roundNumber++;
                arenaState.usedColors = []; // Очищаем использованные цвета для нового раунда
            }
        }
    } catch (err) { console.error("Arena interval error:", err); }
}, 1000);

async function resolveArenaRound() {
    if (arenaState.bets.length < 2) { arenaState.status = "waiting"; return; }
    let pool = 0; arenaState.bets.forEach(b => pool += parseFloat(b.amount)); arenaState.totalPool = pool;
    const rand = Math.random() * pool; let sum = 0; let winnerBet = arenaState.bets[0];
    for (let i = 0; i < arenaState.bets.length; i++) { sum += arenaState.bets[i].amount; if (rand <= sum) { winnerBet = arenaState.bets[i]; break; } }
    
    // Координаты центра сектора победителя, чтобы шарик точно остановился в его зоне
    const winnerX = 80 + Math.random() * 160; // Рандом по Х в пределах поля
    const winnerY = 80 + Math.random() * 160; // Рандом по Y в пределах поля

    arenaState.winnerId = winnerBet.userId; 
    arenaState.winnerName = winnerBet.username;
    arenaState.winnerX = winnerX; 
    arenaState.winnerY = winnerY;
    arenaState.resolvedAt = Date.now(); 
    arenaState.status = "finished"; 
    arenaState.timeLeft = 8;
    
    const winnerUser = await dbGetUser(winnerBet.userId);
    if (winnerUser) { 
        winnerUser.balance = parseFloat((parseFloat(winnerUser.balance) + pool).toFixed(3)); 
        await dbSaveUser(winnerBet.userId, winnerUser); 
    }
}

// MIDDLEWARE
async function getOrCreateUser(initDataUnsafe) {
    const tgUser = initDataUnsafe?.user || { id: "guest", username: "Пользователь", first_name: "Пользователь" };
    const id = String(tgUser.id);
    let user = await dbGetUser(id);
    if (!user) {
        user = { id: id, username: tgUser.username || tgUser.first_name || "Пользователь", first_name: tgUser.first_name || "", balance: 50.0, avatar_url: tgUser.photo_url || "https://img.icons8.com/color/96/user.png", last_daily_case_open: null, is_banned: false };
        await dbSaveUser(id, user);
    }
    return user;
}
async function parseTelegramInitData(req, res, next) {
    const rawHeader = req.headers['x-telegram-init-data']; let initDataUnsafe = {};
    if (rawHeader) { try { const params = new URLSearchParams(rawHeader); const userRaw = params.get('user'); if (userRaw) initDataUnsafe.user = JSON.parse(userRaw); } catch (e) {} }
    const user = await getOrCreateUser(initDataUnsafe);
    if (user.is_banned) return res.status(403).json({ banned: true });
    req.user = user; next();
}

// API РОУТЫ
app.get('/api/user', parseTelegramInitData, (req, res) => res.json({ ...req.user, isAdmin: String(req.user.id).trim() === String(ADMIN_CHAT_ID).trim() }));

app.post('/api/verify_payment', parseTelegramInitData, async (req, res) => {
    const { amount } = req.body; const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) return res.status(400).json({ error: "Invalid amount" });
    const user = await dbGetUser(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.balance = parseFloat((parseFloat(user.balance) + paymentAmount).toFixed(3));
    await dbSaveUser(user.id, user);
    if (bot && ADMIN_CHAT_ID) bot.sendMessage(ADMIN_CHAT_ID, `💎 Пополнение! Игрок @${user.username} (+${paymentAmount.toFixed(3)} TON)`, { parse_mode: "Markdown" });
    res.json({ success: true, newBalance: user.balance });
});

// ОТПРАВКА ПОДАРКА
app.post('/api/send_gift', parseTelegramInitData, async (req, res) => {
    const { targetUsername, itemId } = req.body; const senderId = req.user.id;
    if (!targetUsername || !itemId) return res.status(400).json({ error: "Не указаны получатель или предмет" });
    try {
        const targetUser = await dbGetUserByUsername(targetUsername);
        if (!targetUser) return res.status(404).json({ error: "Пользователь не найден" });
        if (String(targetUser.id) === String(senderId)) return res.status(400).json({ error: "Нельзя отправить самому себе" });
        
        const inventory = await dbGetInventory(senderId);
        const itemExists = inventory.find(i => parseInt(i.item_id) === parseInt(itemId));
        if (!itemExists) return res.status(400).json({ error: "У вас нет этого предмета" });

        await dbRemoveInventoryItem(senderId, itemId);
        const giftData = ALL_GIFT_ITEMS[itemId];
        if (giftData) await dbAddInventoryItem(targetUser.id, itemId, giftData.name, giftData.value, giftData.icon);
        else await dbAddInventoryItem(targetUser.id, itemId, itemExists.name, itemExists.value, itemExists.image_url);

        if (bot) {
            const senderUser = await dbGetUser(senderId);
            const giftName = giftData ? giftData.name : itemExists.name;
            const giftValue = giftData ? giftData.value : itemExists.value;
            const message = `🎁 <b>Вам подарили предмет!</b>\n\n<b>От кого:</b> ${senderUser.first_name || senderUser.username || "Неизвестный"}\n<b>Предмет:</b> ${giftName}\n<b>Ценность:</b> ${giftValue} GRAM`;
            await bot.sendMessage(targetUser.id, message, { parse_mode: "HTML" });
        }
        res.json({ success: true, message: "Подарок успешно отправлен!" });
    } catch (err) { console.error("Error sending gift:", err); res.status(500).json({ error: "Ошибка сервера" }); }
});

app.get('/api/inventory', parseTelegramInitData, async (req, res) => res.json(await dbGetInventory(req.user.id)));

app.post('/api/sell_gift', parseTelegramInitData, async (req, res) => {
    const { itemId, price } = req.body; const userId = req.user.id; const sellPrice = parseFloat(price) || 0.1;
    const user = await dbGetUser(userId); if (!user) return res.status(404).json({ error: "User not found" });
    await dbRemoveInventoryItem(user.id, itemId);
    user.balance = parseFloat((parseFloat(user.balance) + sellPrice).toFixed(3));
    await dbSaveUser(user.id, user);
    res.json({ success: true, newBalance: user.balance });
});

app.post('/api/withdraw_gift', parseTelegramInitData, async (req, res) => {
    const { itemId } = req.body; const user = req.user; const gift = ALL_GIFT_ITEMS[itemId];
    if (!gift) return res.status(400).json({ error: "Item not found" });
    await dbRemoveInventoryItem(user.id, itemId);
    if (bot && ADMIN_CHAT_ID) bot.sendMessage(ADMIN_CHAT_ID, `📤 Вывод!\n@${user.username} (${gift.name})`, { parse_mode: "Markdown" });
    res.json({ success: true });
});

app.post('/api/place_bet', parseTelegramInitData, async (req, res) => {
    const userId = req.user.id; const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount < 0.1) return res.status(400).json({ error: "Неверная ставка" });
    if (arenaState.status === "finished") return res.status(400).json({ error: "Раунд завершен" });
    
    const user = await dbGetUser(userId);
    if (!user || parseFloat(user.balance) < amount) return res.status(400).json({ error: "Недостаточно баланса" });

    // ВЫБОР УНИКАЛЬНОГО ЦВЕТА ДЛЯ ИГРОКА В ЭТОМ РАУНДЕ
    let chosenColor = '#8d3df5';
    const availableColors = AVAILABLE_COLORS.filter(c => !arenaState.usedColors.includes(c));
    
    if (availableColors.length > 0) {
        // Если есть свободные цвета, берем первый попавшийся (или рандомный)
        chosenColor = availableColors[Math.floor(Math.random() * availableColors.length)];
        arenaState.usedColors.push(chosenColor);
    } else {
        // Если все цвета закончились (10+ игроков), берем рандомный и перезаписываем (так бывает редко)
        chosenColor = AVAILABLE_COLORS[Math.floor(Math.random() * AVAILABLE_COLORS.length)];
    }

    user.balance = parseFloat((parseFloat(user.balance) - amount).toFixed(3));
    await dbSaveUser(user.id, user);

    const existingBet = arenaState.bets.find(b => String(b.userId) === String(user.id));
    if (existingBet) {
        existingBet.amount = parseFloat((existingBet.amount + amount).toFixed(3));
        // Не меняем цвет, если игрок уже в раунде
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

// КЕЙСЫ
app.post('/api/open_daily_case', parseTelegramInitData, async (req, res) => {
    const user = await dbGetUser(req.user.id); if (!user) return res.status(404).json({ error: "User not found" });
    const now = Date.now(); const cooldown = 24 * 60 * 60 * 1000; 
    const isAdmin = String(user.id).trim() === String(ADMIN_CHAT_ID).trim();
    if (!isAdmin && user.last_daily_case_open && (now - new Date(user.last_daily_case_open).getTime() < cooldown)) return res.status(400).json({ error: "Кейс еще недоступен" });

    const rewards = [{ id: 10, name: "Роза", type: "gift", value: 0.27, icon: "/Images/Items/roza.jpg" }, { id: 11, name: "Пополнение 0.1 GRAM", type: "balance", value: 0.1 }];
    const won = rewards[Math.floor(Math.random() * rewards.length)];
    user.last_daily_case_open = new Date().toISOString();
    if (won.type === "balance") user.balance = parseFloat((parseFloat(user.balance) + won.value).toFixed(3));
    else { const gift = ALL_GIFT_ITEMS[won.id]; if (gift) await dbAddInventoryItem(user.id, won.id, gift.name, gift.value, gift.icon); }
    await dbSaveUser(user.id, user);
    res.json({ success: true, wonItem: won, newBalance: user.balance });
});

app.post('/api/open_newbie_case', parseTelegramInitData, async (req, res) => {
    const user = await dbGetUser(req.user.id); if (!user || parseFloat(user.balance) < 0.1) return res.status(400).json({ error: "Недостаточно баланса" });
    user.balance = parseFloat((parseFloat(user.balance) - 0.1).toFixed(3));

    const rewards = [{ id: 109, name: "Холодный огонь", type: "gift", value: 2.2 }, { id: 112, name: "Мишка классический", type: "gift", value: 0.11 }, { id: 113, name: "Пополнение 0.1 GRAM", type: "balance", value: 0.1 }];
    const won = rewards[Math.floor(Math.random() * rewards.length)];
    if (won.type === "balance") user.balance = parseFloat((parseFloat(user.balance) + won.value).toFixed(3));
    else { const gift = ALL_GIFT_ITEMS[won.id]; if (gift) await dbAddInventoryItem(user.id, won.id, gift.name, gift.value, gift.icon); }
    await dbSaveUser(user.id, user);
    res.json({ success: true, wonItem: won, newBalance: user.balance });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

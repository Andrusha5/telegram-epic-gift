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

app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        console.log(`[API REQUEST] ${req.method} ${req.path}`);
    }
    next();
});

process.on('uncaughtException', (err) => {
    console.error('⛔ СИСТЕМНЫЙ ПЕРЕХВАТ ОШИБКИ:', err.stack || err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⛔ СИСТЕМНЫЙ ПЕРЕХВАТ НЕОБРАБОТАННОГО ПРОМИСА:', reason);
});

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

const userQueues = {};
function enqueueUserAction(userId, actionFn) {
    const idStr = String(userId);
    if (!userQueues[idStr]) { userQueues[idStr] = Promise.resolve(); }
    const nextPromise = userQueues[idStr].then(async () => { return await actionFn(); });
    userQueues[idStr] = nextPromise.catch((err) => { console.error(`⛔ Ошибка очереди для пользователя ${idStr}:`, err); });
    return nextPromise;
}

const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '').trim().replace(/^["']|["']$/g, '');
const ADMIN_CHAT_ID = String(process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_CHAT_ID || '').trim().replace(/^["']|["']$/g, '');
const DEPOSIT_ADDRESS = String(process.env.ADMIN_TON_ADDRESS || 'EQC3481up9_gG98_wK8Jv_Zz1yLp9p0_Y-7Jv7x4b9a9JKe6').trim().replace(/^["']|["']$/g, '');

let bot = null;
const adminStates = {};

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
            console.log("SUCCESS: Bot commands menu registered successfully.");
        }).catch(err => {
            console.error("ERROR registering bot commands:", err.message);
        });

        bot.deleteWebHook({ drop_pending_updates: true }).then(() => {
            console.log("SUCCESS: Telegram Webhook dropped. Bot polling is active!");
        }).catch(err => {
            console.error("ERROR clearing Webhook:", err.message);
        });

    } catch (e) {
        console.error("CRITICAL: Failed to initialize Telegram Bot:", e.message);
    }
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

let pgPool = null;
const localUsersFile = path.join(__dirname, 'database_users.json');
const localInvFile = path.join(__dirname, 'database_inventory.json');
const localDepFile = path.join(__dirname, 'database_deposits.json');
const localArenaFile = path.join(__dirname, 'database_arena.json');

if (!fs.existsSync(localUsersFile)) fs.writeFileSync(localUsersFile, JSON.stringify({}));
if (!fs.existsSync(localInvFile)) fs.writeFileSync(localInvFile, JSON.stringify([]));
if (!fs.existsSync(localDepFile)) fs.writeFileSync(localDepFile, JSON.stringify([]));
if (!fs.existsSync(localArenaFile)) fs.writeFileSync(localArenaFile, JSON.stringify({}));

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
    const data = JSON.parse(fs.readFileSync(localUsersFile, 'utf8'));
    return data[String(id)] || null;
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
    const data = JSON.parse(fs.readFileSync(localUsersFile, 'utf8'));
    user.is_banned = isBannedValue;
    data[String(id)] = user;
    fs.writeFileSync(localUsersFile, JSON.stringify(data, null, 2));
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
    const items = JSON.parse(fs.readFileSync(localInvFile, 'utf8'));
    return items.filter(i => String(i.user_id) === String(userId));
}

async function dbAddInventoryItem(userId, itemId) {
    const gift = ALL_GIFT_ITEMS[itemId];
    if (!gift) return;

    try {
        if (pgPool) {
            await pgPool.query(`
                INSERT INTO inventory (user_id, item_id, name, value, image_url)
                VALUES ($1, $2, $3, $4, $5)
            `, [String(userId), itemId, gift.name, gift.value, gift.icon]);
            return;
        }
    } catch (e) {
        console.error("DB Fallback AddInventory:", e.message);
    }
    const items = JSON.parse(fs.readFileSync(localInvFile, 'utf8'));
    const newItem = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        user_id: String(userId),
        item_id: parseInt(itemId),
        name: gift.name,
        value: gift.value,
        image_url: gift.icon
    };
    items.push(newItem);
    fs.writeFileSync(localInvFile, JSON.stringify(items, null, 2));
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
    const items = JSON.parse(fs.readFileSync(localInvFile, 'utf8'));
    const idx = items.findIndex(i => String(i.user_id) === String(userId) && parseInt(i.item_id) === parseInt(itemId));
    if (idx !== -1) {
        items.splice(idx, 1);
        fs.writeFileSync(localInvFile, JSON.stringify(items, null, 2));
    }
}

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

function loadArenaState() {
    try {
        if (fs.existsSync(localArenaFile)) {
            const data = JSON.parse(fs.readFileSync(localArenaFile, 'utf8'));
            if (data && typeof data === 'object') {
                arenaState.roundNumber = data.roundNumber || arenaState.roundNumber;
                arenaState.bets = [];
                arenaState.status = "waiting";
                arenaState.timeLeft = 15;
                arenaState.resolvedAt = 0;
                arenaState.winnerId = null;
                arenaState.winnerName = null;
                arenaState.winnerX = 160;
                arenaState.winnerY = 160;
                arenaState.totalPool = 0;
                console.log("SUCCESS: Arena State restored. Round number: " + arenaState.roundNumber);
            }
        }
    } catch (e) {
        console.error("Error loading Arena State:", e.message);
    }
}

function saveArenaState() {
    try {
        fs.writeFileSync(localArenaFile, JSON.stringify(arenaState, null, 2));
    } catch (e) {
        console.error("Error saving Arena State:", e.message);
    }
}

loadArenaState();

setInterval(() => {
    try {
        let stateChanged = false;

        if (arenaState.status === "waiting") {
            if (arenaState.bets.length >= 2) {
                arenaState.status = "countdown";
                arenaState.timeLeft = 15;
                stateChanged = true;
                console.log(`[ARENA] 🟢 Начат отсчет раунда №${arenaState.roundNumber}: 15 сек.`);
            }
        } else if (arenaState.status === "countdown") {
            arenaState.timeLeft--;
            stateChanged = true;
            if (arenaState.timeLeft <= 0) {
                console.log(`[ARENA] ⏳ Время отсчета истекло. Запускаем розыгрыш...`);
                resolveArenaRound().catch(e => console.error("Error resolving round:", e.message));
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
            saveArenaState();
        }
    } catch (err) {
        console.error("Arena interval error:", err.message);
    }
}, 1000);

async function resolveArenaRound() {
    try {
        if (arenaState.bets.length < 2) {
            arenaState.status = "waiting";
            saveArenaState();
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
        const coords = generateCoordsForWinner(winnerIndex, arenaState.bets);

        arenaState.winnerId = winnerBet.userId;
        arenaState.winnerName = winnerBet.username;
        arenaState.winnerX = coords.x;
        arenaState.winnerY = coords.y;
        arenaState.resolvedAt = Date.now();
        arenaState.status = "finished";
        arenaState.timeLeft = 8;
        saveArenaState();
        console.log(`[ARENA] 🏆 Победитель: @${winnerBet.username} (ID: ${winnerBet.userId}) Банк: ${pool} GRAM! x=${coords.x}, y=${coords.y}`);

        const winnerUser = await dbGetUser(winnerBet.userId);
        if (winnerUser) {
            winnerUser.balance = parseFloat((parseFloat(winnerUser.balance) + pool).toFixed(3));
            await dbSaveUser(winnerBet.userId, winnerUser);
        }
    } catch (err) {
        console.error("[ARENA] ❌ Ошибка розыгрыша раунда:", err);
        arenaState.status = "waiting";
        arenaState.timeLeft = 15;
        saveArenaState();
    }
}

function generateCoordsForWinner(winnerIndex, bets) {
    const N = bets.length;
    if (N === 0) return { x: 160, y: 160 };
    const shares = calculateShares(bets);

    if (N === 1) {
        return { x: 60 + Math.random() * 200, y: 60 + Math.random() * 200 };
    }

    if (N === 2) {
        const s = Math.sqrt(2 * shares[0]);
        const sizeX = 320 * s;
        const sizeY = 320 * s;
        if (winnerIndex === 0) {
            let u = Math.random();
            let v = Math.random();
            if (u + v > 1) { u = 1 - u; v = 1 - v; }
            return { x: Math.max(45, u * sizeX), y: Math.max(45, v * sizeY) };
        } else {
            for (let attempt = 0; attempt < 500; attempt++) {
                let rx = 45 + Math.random() * 230;
                let ry = 45 + Math.random() * 230;
                if (!(rx / sizeX + ry / sizeY <= 1)) {
                    return { x: rx, y: ry };
                }
            }
            return { x: 200, y: 200 };
        }
    }

    let currentAngle = -Math.PI / 2;
    const corners = getCornerAnglesRad();

    for (let i = 0; i < N; i++) {
        const share = shares[i];
        let nextAngle = currentAngle + 2 * Math.PI * share;

        if (i === winnerIndex) {
            const pathPoints = [{ x: 160, y: 160 }];
            pathPoints.push(getSquareIntersection(currentAngle));

            let normalizedCurrent = (currentAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            let normalizedNext = (nextAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            if (nextAngle > currentAngle && normalizedNext < normalizedCurrent) {
                nextAngle += 2 * Math.PI;
            }

            const crossedCorners = [];
            for (let cAngle of corners) {
                let normalizedCAngle = (cAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                if (normalizedCAngle < normalizedCurrent && nextAngle > currentAngle) {
                    normalizedCAngle += 2 * Math.PI;
                }
                if (normalizedCAngle > normalizedCurrent && normalizedCAngle < normalizedNext) {
                    crossedCorners.push(cAngle);
                }
            }
            crossedCorners.sort((a, b) => a - b);
            for (let cAngle of crossedCorners) {
                pathPoints.push(getSquareIntersection(cAngle));
            }
            pathPoints.push(getSquareIntersection(nextAngle));

            const centroid = getPolygonCentroid(pathPoints);
            return {
                x: Math.max(50, Math.min(270, centroid.x + (Math.random() * 12 - 6))),
                y: Math.max(50, Math.min(270, centroid.y + (Math.random() * 12 - 6)))
            };
        }
        currentAngle = nextAngle;
    }
    return { x: 160, y: 160 };
}

function calculateShares(bets) {
    const N = bets.length;
    if (N === 0) return [];
    let betValues = bets.map(b => parseFloat(b.amount) || 0);
    const total = betValues.reduce((a, b) => a + b, 0);
    if (total === 0) return betValues.map(() => 1 / N);

    let rawShares = betValues.map(b => b / total);
    const minShare = 0.013;

    let adjusted = [...rawShares];
    let iterations = 0;
    while (iterations < 10) {
        let underMinCount = 0;
        let underMinSum = 0;
        let overMinSum = 0;

        for (let i = 0; i < N; i++) {
            if (adjusted[i] < minShare) {
                underMinCount++;
                underMinSum += minShare;
            } else {
                overMinSum += adjusted[i];
            }
        }

        if (underMinCount === 0) break;
        if (underMinSum >= 1.0) {
            return adjusted.map(() => 1 / N);
        }

        const scale = (1.0 - underMinSum) / overMinSum;
        for (let i = 0; i < N; i++) {
            if (adjusted[i] < minShare) {
                adjusted[i] = minShare;
            } else {
                adjusted[i] = adjusted[i] * scale;
            }
        }
        iterations++;
    }
    return adjusted;
}

function getSquareIntersection(angle) {
    const cx = 160, cy = 160;
    const halfSize = 160;
    const tan = Math.tan(angle);

    if (angle >= 0 && angle < Math.PI / 2) {
        if (tan <= 1) return { x: cx + halfSize, y: cy + halfSize * tan };
        return { x: cx + halfSize / tan, y: cy + halfSize };
    }
    if (angle >= Math.PI / 2 && angle < Math.PI) {
        if (tan >= -1) return { x: cx - halfSize / tan, y: cy + halfSize };
        return { x: cx - halfSize, y: cy - halfSize * tan };
    }
    if (angle >= Math.PI && angle < 3 * Math.PI / 2) {
        if (tan <= 1) return { x: cx - halfSize, y: cy - halfSize * tan };
        return { x: cx - halfSize / tan, y: cy - halfSize };
    }
    if (angle >= 3 * Math.PI / 2 && angle <= 2 * Math.PI) {
        if (tan >= -1) return { x: cx + halfSize / tan, y: cy - halfSize };
        return { x: cx + halfSize, y: cy + halfSize * tan };
    }
    return { x: cx + halfSize, y: cy };
}

function getPolygonCentroid(pts) {
    if (pts.length === 0) return { x: 160, y: 160 };
    let first = pts[0];
    let last = pts[pts.length - 1];
    let closeCycle = false;
    if (first.x !== last.x || first.y !== last.y) {
        pts.push({ x: first.x, y: first.y });
        closeCycle = true;
    }
    let area = 0, cx = 0, cy = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        let p1 = pts[i];
        let p2 = pts[i + 1];
        let factor = (p1.x * p2.y - p2.x * p1.y);
        area += factor;
        cx += (p1.x + p2.x) * factor;
        cy += (p1.y + p2.y) * factor;
    }
    area = area / 2;
    if (closeCycle) pts.pop();
    if (Math.abs(area) < 0.01) {
        let sx = 0, sy = 0;
        pts.forEach(p => { sx += p.x; sy += p.y; });
        return { x: sx / pts.length, y: sy / pts.length };
    }
    cx = cx / (6 * area);
    cy = cy / (6 * area);
    return { x: cx, y: cy };
}

function getCornerAnglesRad() {
    return [
        Math.atan2(1, 1),
        Math.atan2(1, -1),
        Math.atan2(-1, -1),
        Math.atan2(-1, 1)
    ].map(a => (a < 0 ? a + 2 * Math.PI : a));
}

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

app.post('/api/verify_payment', parseTelegramInitData, async (req, res) => {
    const { amount } = req.body;
    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
    }

    const userId = req.user.id;
    enqueueUserAction(userId, async () => {
        const user = await dbGetUser(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        user.balance = parseFloat((parseFloat(user.balance) + paymentAmount).toFixed(3));
        await dbSaveUser(user.id, user);

        if (bot && ADMIN_CHAT_ID) {
            const textMsg = "💎 **Пополнение баланса!**\n" +
                "Игрок @" + user.username + " (ID: " + user.id + ") успешно зачислил через кошелек **+" + paymentAmount.toFixed(3) + " TON**!";
            bot.sendMessage(ADMIN_CHAT_ID, textMsg, { parse_mode: "Markdown" });
        }

        res.json({ success: true, newBalance: user.balance });
    });
});

app.post('/api/deposit_gift_request', parseTelegramInitData, async (req, res) => {
    const { itemId } = req.body;
    const gift = ALL_GIFT_ITEMS[itemId];
    const user = req.user;

    if (!gift) {
        return res.status(400).json({ error: "Item not found" });
    }

    if (bot && ADMIN_CHAT_ID) {
        const messageText = "📥 **Заявка на ввод NFT-подарка!**\n\n" +
            "**Игрок:** @" + user.username + " (ID: `" + user.id + "`)\n" +
            "**Подарок:** *" + gift.name + "*\n" +
            "**Номинал:** " + gift.value + " GRAM";

        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: "Одобрить ✅", callback_data: "approve_dep_" + user.id + "_" + itemId },
                    { text: "Отклонить ❌", callback_data: "reject_dep_" + user.id + "_" + itemId }
                ]
            ]
        };

        bot.sendMessage(ADMIN_CHAT_ID, messageText, { parse_mode: "Markdown", reply_markup: inlineKeyboard });
    }

    res.json({ success: true });
});

app.get('/api/inventory', parseTelegramInitData, async (req, res) => {
    const userInventory = await dbGetInventory(req.user.id);
    res.json(userInventory);
});

app.post('/api/sell_gift', parseTelegramInitData, async (req, res) => {
    const { itemId, price } = req.body;
    const userId = req.user.id;
    const sellPrice = parseFloat(price) || 0.1;

    enqueueUserAction(userId, async () => {
        const user = await dbGetUser(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        await dbRemoveInventoryItem(user.id, itemId);

        user.balance = parseFloat((parseFloat(user.balance) + sellPrice).toFixed(3));
        await dbSaveUser(user.id, user);

        res.json({ success: true, newBalance: user.balance });
    });
});

app.post('/api/withdraw_gift', parseTelegramInitData, async (req, res) => {
    const { itemId } = req.body;
    const user = req.user;
    const gift = ALL_GIFT_ITEMS[itemId];

    if (!gift) return res.status(400).json({ error: "Item not found" });

    await dbRemoveInventoryItem(user.id, itemId);

    if (bot && ADMIN_CHAT_ID) {
        const textMsg = "📤 **Заявка на вывод подарка!**\n" +
            "**Игрок:** @" + user.username + " (ID: " + user.id + ")\n" +
            "**Предмет на вывод:** *" + gift.name + "* (" + gift.value + " GRAM)\n\n" +
            "_Пожалуйста, отправьте ему этот подарок в Telegram!_";
        bot.sendMessage(ADMIN_CHAT_ID, textMsg, { parse_mode: "Markdown" });
    }

    res.json({ success: true });
});

app.post('/api/place_bet', parseTelegramInitData, async (req, res) => {
    const userId = req.user.id;

    enqueueUserAction(userId, async () => {
        const amount = parseFloat(req.body.amount);
        if (isNaN(amount) || amount < 0.1) {
            return res.status(400).json({ error: "Недопустимая сумма ставки" });
        }

        if (arenaState.status === "finished") {
            return res.status(400).json({ error: "Раунд уже завершен, подождите..." });
        }

        const user = await dbGetUser(userId);
        if (!user) {
            return res.status(404).json({ error: "Пользователь не найден" });
        }

        if (parseFloat(user.balance) < amount) {
            return res.status(400).json({ error: "Недостаточно баланса" });
        }

        let chosenColor;
        try {
            chosenColor = getUserColor(user.id, arenaState.roundNumber);
        } catch (e) {
            chosenColor = '#8d3df5';
        }

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

        saveArenaState();
        res.json({ success: true, newBalance: user.balance });
    }).catch(err => {
        console.error("Bet queue error:", err);
        res.status(500).json({ error: "Внутренняя ошибка сервера" });
    });
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

app.post('/api/open_daily_case', parseTelegramInitData, async (req, res) => {
    const userId = req.user.id;

    enqueueUserAction(userId, async () => {
        const user = await dbGetUser(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const now = Date.now();
        const cooldown = 24 * 60 * 60 * 1000;
        const isAdmin = String(user.id).trim() === String(ADMIN_CHAT_ID).trim();

        if (!isAdmin && user.last_daily_case_open && (now - new Date(user.last_daily_case_open).getTime() < cooldown)) {
            return res.status(400).json({ error: "Кейс еще недоступен" });
        }

        const rewards = [
            { id: 10, name: "Роза", type: "gift", value: 0.27 },
            { id: 11, name: "Пополнение 0.1 GRAM", type: "balance", value: 0.1 },
            { id: 14, name: "Пополнение 0.03 GRAM", type: "balance", value: 0.03 }
        ];
        const won = rewards[Math.floor(Math.random() * rewards.length)];

        user.last_daily_case_open = new Date().toISOString();
        if (won.type === "balance") {
            user.balance = parseFloat((parseFloat(user.balance) + won.value).toFixed(3));
        } else {
            await dbAddInventoryItem(user.id, won.id);
            if (bot && ADMIN_CHAT_ID) {
                const winNotify = "🎉 **Новый выигрыш в Кейсе!**\n" +
                    "Игрок @" + user.username + " (ID: " + user.id + ") выиграл *" + won.name + "* в **Ежедневном Кейсе**!";
                bot.sendMessage(ADMIN_CHAT_ID, winNotify, { parse_mode: "Markdown" });
            }
        }
        await dbSaveUser(user.id, user);

        res.json({ success: true, wonItem: won, newBalance: user.balance });
    });
});

app.post('/api/open_newbie_case', parseTelegramInitData, async (req, res) => {
    const userId = req.user.id;

    enqueueUserAction(userId, async () => {
        const user = await dbGetUser(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const price = 0.1;

        if (parseFloat(user.balance) < price) {
            return res.status(400).json({ error: "Недостаточно баланса" });
        }

        user.balance = parseFloat((parseFloat(user.balance) - price).toFixed(3));

        const rewards = [
            { id: 109, name: "Холодный огонь", type: "gift", value: 2.2 },
            { id: 112, name: "Мишка классический", type: "gift", value: 0.11 },
            { id: 113, name: "Пополнение 0.1 GRAM (Новичок)", type: "balance", value: 0.1 }
        ];
        const won = rewards[Math.floor(Math.random() * rewards.length)];

        if (won.type === "balance") {
            user.balance = parseFloat((parseFloat(user.balance) + won.value).toFixed(3));
        } else {
            await dbAddInventoryItem(user.id, won.id);
            if (bot && ADMIN_CHAT_ID) {
                const winNotify = "🎉 **Новый выигрыш в Кейсе!**\n" +
                    "Игрок @" + user.username + " (ID: " + user.id + ") выиграл *" + won.name + "* в **Кейсе Новичка**!";
                bot.sendMessage(ADMIN_CHAT_ID, winNotify, { parse_mode: "Markdown" });
            }
        }
        await dbSaveUser(user.id, user);

        res.json({ success: true, wonItem: won, newBalance: user.balance });
    });
});

app.get('/api/daily_case_info', (req, res) => {
    res.json({ channel_username: "@BestGiftsChannel" });
});

app.get('/api/deposit_address', (req, res) => {
    res.json({ address: DEPOSIT_ADDRESS });
});

app.get('/api/generate_payload', (req, res) => {
    res.json({ payload: "te6ccgEBAQEAAgAAAA==" });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

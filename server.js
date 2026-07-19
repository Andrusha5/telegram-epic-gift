const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const TelegramBot = require('node-telegram-bot-api');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// КЛЮЧИ И НАСТРОЙКИ TG-БОТА С ПРОВЕРКОЙ
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || '').trim();
let bot = null;

// Временное хранилище состояний ввода админа
const adminStates = {}; 

if (BOT_TOKEN) {
    try {
        bot = new TelegramBot(BOT_TOKEN, { polling: true });
        console.log("Telegram Bot successfully loaded.");

        // Принудительное удаление старых вебхуков для активации polling
        bot.deleteWebHook().then(() => {
            console.log("Telegram Webhook successfully cleared. Polling is fully active.");
        }).catch(err => {
            console.error("Error clearing Webhook:", err.message);
        });

        // Автоматическая установка меню команд для кнопки "/"
        bot.setMyCommands([
            { command: 'start', description: 'Запустить BestGifts' },
            { command: 'ban', description: 'Заблокировать игрока по ID (Админ)' },
            { command: 'unban', description: 'Разблокировать игрока по ID (Админ)' },
            { command: 'status', description: 'Проверить статус игрока по ID (Админ)' }
        ]).then(() => {
            console.log("Slash commands menu registered successfully.");
        }).catch(err => {
            console.error("Error setting bot commands:", err.message);
        });

    } catch (e) {
        console.error("Failed to initialize Telegram Bot:", e.message);
    }
} else {
    console.warn("BOT_TOKEN is missing! Admin bot functions are disabled.");
}

// СПИСОК ВСЕХ ДОСТУПНЫХ ПОДАРКОВ
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

// ИНИЦИАЛИЗАЦИЯ И СВЯЗЬ С БД
let pgPool = null;
const localUsersFile = path.join(__dirname, 'database_users.json');
const localInvFile = path.join(__dirname, 'database_inventory.json');
const localDepFile = path.join(__dirname, 'database_deposits.json');

if (process.env.DATABASE_URL) {
    pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    const initDbQueries = `
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(100) PRIMARY KEY,
            username VARCHAR(100),
            first_name VARCHAR(100),
            balance NUMERIC(15, 3) DEFAULT 50.000,
            avatar_url TEXT,
            last_daily_case_open TIMESTAMP,
            is_banned BOOLEAN DEFAULT FALSE
        );
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;

        CREATE TABLE IF NOT EXISTS inventory (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(100),
            item_id INT,
            name VARCHAR(100),
            value NUMERIC(15, 3),
            image_url TEXT
        );
        CREATE TABLE IF NOT EXISTS deposits (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(100),
            item_id INT,
            status VARCHAR(50) DEFAULT 'pending'
        );
    `;
    pgPool.query(initDbQueries)
        .then(() => console.log("PostgreSQL Tables verified/updated successfully."))
        .catch(err => console.error("PostgreSQL Init Database tables error:", err.message));
} else {
    console.warn("DATABASE_URL is missing. Using persistent local JSON files instead.");
    if (!fs.existsSync(localUsersFile)) fs.writeFileSync(localUsersFile, JSON.stringify({}));
    if (!fs.existsSync(localInvFile)) fs.writeFileSync(localInvFile, JSON.stringify([]));
    if (!fs.existsSync(localDepFile)) fs.writeFileSync(localDepFile, JSON.stringify([]));
}

// УНИВЕРСАЛЬНЫЕ МЕТОДЫ РАБОТЫ С ДАННЫМИ
async function dbGetUser(id) {
    if (pgPool) {
        const res = await pgPool.query("SELECT * FROM users WHERE id = $1", [String(id)]);
        return res.rows[0] || null;
    } else {
        const data = JSON.parse(fs.readFileSync(localUsersFile, 'utf8'));
        return data[String(id)] || null;
    }
}

async function dbSaveUser(id, user) {
    const isBannedValue = (user.is_banned === true || user.is_banned === 'true');
    if (pgPool) {
        await pgPool.query(`
            INSERT INTO users (id, username, first_name, balance, avatar_url, last_daily_case_open, is_banned)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE 
            SET username = $2, first_name = $3, balance = $4, avatar_url = $5, last_daily_case_open = $6, is_banned = $7
        `, [String(id), user.username, user.first_name, user.balance, user.avatar_url, user.last_daily_case_open, isBannedValue]);
    } else {
        const data = JSON.parse(fs.readFileSync(localUsersFile, 'utf8'));
        user.is_banned = isBannedValue;
        data[String(id)] = user;
        fs.writeFileSync(localUsersFile, JSON.stringify(data, null, 2));
    }
}

async function dbGetInventory(userId) {
    if (pgPool) {
        const res = await pgPool.query("SELECT * FROM inventory WHERE user_id = $1", [String(userId)]);
        return res.rows;
    } else {
        const items = JSON.parse(fs.readFileSync(localInvFile, 'utf8'));
        return items.filter(i => String(i.user_id) === String(userId));
    }
}

async function dbAddInventoryItem(userId, itemId) {
    const gift = ALL_GIFT_ITEMS[itemId];
    if (!gift) return;

    if (pgPool) {
        await pgPool.query(`
            INSERT INTO inventory (user_id, item_id, name, value, image_url)
            VALUES ($1, $2, $3, $4, $5)
        `, [String(userId), itemId, gift.name, gift.value, gift.icon]);
    } else {
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
}

async function dbRemoveInventoryItem(userId, itemId) {
    if (pgPool) {
        await pgPool.query("DELETE FROM inventory WHERE id = (SELECT id FROM inventory WHERE user_id = $1 AND item_id = $2 LIMIT 1)", [String(userId), parseInt(itemId)]);
    } else {
        const items = JSON.parse(fs.readFileSync(localInvFile, 'utf8'));
        const idx = items.findIndex(i => String(i.user_id) === String(userId) && parseInt(i.item_id) === parseInt(itemId));
        if (idx !== -1) {
            items.splice(idx, 1);
            fs.writeFileSync(localInvFile, JSON.stringify(items, null, 2));
        }
    }
}

// ОБРАБОТКА КОМАНД И ВВОДА ДЛЯ АДМИНИСТРАТОРА В TG-БОТЕ
if (bot) {
    // 1. Клиентские кнопки модерации депозитов
    bot.on('callback_query', async (callbackQuery) => {
        const action = callbackQuery.data; 
        const message = callbackQuery.message;
        const msgId = message.message_id;
        const chatId = message.chat.id;

        try {
            if (action.startsWith('approve_dep_') || action.startsWith('reject_dep_')) {
                const parts = action.split('_');
                const isApproved = parts[0] === 'approve';
                const user_id = parts[2];
                const item_id = parseInt(parts[3]);

                const user = await dbGetUser(user_id);
                const gift = ALL_GIFT_ITEMS[item_id];

                if (!gift) {
                    return bot.answerCallbackQuery(callbackQuery.id, { text: "Ошибка: предмет не найден!", show_alert: true });
                }

                if (isApproved) {
                    await dbAddInventoryItem(user_id, item_id);
                    await bot.editMessageText("✅ **Успешно одобрено!**\nПодарок *" + gift.name + "* добавлен игроку @" + (user ? user.username : 'Unknown') + " (ID: " + user_id + ") в инвентарь.", {
                        chat_id: chatId,
                        message_id: msgId,
                        parse_mode: 'Markdown'
                    });
                } else {
                    await bot.editMessageText("❌ **Заявка отклонена!**\nПодарок *" + gift.name + "* для игрока @" + (user ? user.username : 'Unknown') + " (ID: " + user_id + ") отклонен.", {
                        chat_id: chatId,
                        message_id: msgId,
                        parse_mode: 'Markdown'
                    });
                }

                bot.answerCallbackQuery(callbackQuery.id, { text: isApproved ? "Депозит успешно зачислен!" : "Заявка отклонена" });
            }
        } catch (err) {
            console.error("Bot Callback Query processing error:", err.message);
        }
    });

    // 2. Обработка текстовых команд (Абсолютно безопасно от SyntaxError V8)
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text ? msg.text.trim() : '';
        const isAdmin = String(chatId).trim() === String(ADMIN_CHAT_ID).trim();

        console.log("TG Bot Message: ChatID=" + chatId + " | Msg='" + text + "' | IsAdmin=" + isAdmin);

        if (text === '/start') {
            const welcomeText = "🎉 **Добро пожаловать в BestGifts!**\n\n" +
                                "Нажмите на кнопку Web App в меню слева снизу, чтобы открыть игру!\n\n" +
                                "ℹ️ Ваш Telegram Chat ID: `" + chatId + "`\n" +
                                "*(Если вы администратор, укажите этот ID в настройках Render в переменной ADMIN_CHAT_ID)*";
            bot.sendMessage(chatId, welcomeText, { parse_mode: "Markdown" });
            return;
        }

        // Если пишет администратор
        if (isAdmin) {
            if (text === '/ban') {
                adminStates[chatId] = 'awaiting_ban';
                bot.sendMessage(chatId, "🚫 **Блокировка пользователя**\n\nПожалуйста, отправьте Telegram ID игрока, которого вы хотите забанить:", { parse_mode: "Markdown" });
                return;
            }

            if (text === '/unban') {
                adminStates[chatId] = 'awaiting_unban';
                bot.sendMessage(chatId, "✅ **Разблокировка пользователя**\n\nПожалуйста, отправьте Telegram ID игрока, которого хотите разблокировать:", { parse_mode: "Markdown" });
                return;
            }

            if (text === '/status') {
                adminStates[chatId] = 'awaiting_status';
                bot.sendMessage(chatId, "🔍 **Статус игрока**\n\nПожалуйста, отправьте Telegram ID игрока для детальной проверки его профиля:", { parse_mode: "Markdown" });
                return;
            }

            // Обработка ввода ID на команды
            const state = adminStates[chatId];
            if (state) {
                const targetId = text;
                if (!targetId || isNaN(targetId)) {
                    bot.sendMessage(chatId, "⚠️ ID должен состоять только из цифр. Пожалуйста, отправьте корректный ID игрока:");
                    return;
                }

                let user = await dbGetUser(targetId);
                
                if (state === 'awaiting_ban') {
                    if (!user) {
                        user = {
                            id: targetId,
                            username: "unknown",
                            first_name: "Неизвестный",
                            balance: 0.0,
                            avatar_url: "https://img.icons8.com/color/96/user.png",
                            last_daily_case_open: null,
                            is_banned: true
                        };
                    } else {
                        user.is_banned = true;
                    }
                    await dbSaveUser(targetId, user);
                    
                    const banMsg = "🚫 **Игрок заблокирован!**\n\n" +
                                   "**ID:** `" + targetId + "`\n" +
                                   "**Имя:** @" + user.username + " (" + user.first_name + ")\n\n" +
                                   "Данный пользователь мгновенно отключен от игрового веб-приложения и не сможет больше войти.";
                    bot.sendMessage(chatId, banMsg, { parse_mode: "Markdown" });
                
                } else if (state === 'awaiting_unban') {
                    if (!user) {
                        bot.sendMessage(chatId, "⚠️ Данный игрок еще не заходил в бота, но мы разблокировали этот ID на будущее.");
                        user = {
                            id: targetId,
                            username: "unknown",
                            first_name: "Неизвестный",
                            balance: 50.0,
                            avatar_url: "https://img.icons8.com/color/96/user.png",
                            last_daily_case_open: null,
                            is_banned: false
                        };
                    } else {
                        user.is_banned = false;
                    }
                    await dbSaveUser(targetId, user);
                    
                    const unbanMsg = "✅ **Игрок успешно разблокирован!**\n\n" +
                                     "**ID:** `" + targetId + "`\n" +
                                     "**Имя:** @" + user.username + " (" + user.first_name + ")\n\n" +
                                     "Доступ к приложению восстановлен.";
                    bot.sendMessage(chatId, unbanMsg, { parse_mode: "Markdown" });
                
                } else if (state === 'awaiting_status') {
                    if (!user) {
                        bot.sendMessage(chatId, "🔍 Пользователь с ID `" + targetId + "` не найден в базе данных.", { parse_mode: "Markdown" });
                    } else {
                        const bannedStatus = user.is_banned ? "Забанен 🚫" : "Активен ✅";
                        const statusMsg = "🔍 **Информация о профиле:**\n\n" +
                                          "**ID:** `" + targetId + "`\n" +
                                          "**Имя:** @" + user.username + " (" + user.first_name + ")\n" +
                                          "**Баланс:** " + parseFloat(user.balance || 0).toFixed(3) + " GRAM\n" +
                                          "**Статус блокировки:** " + bannedStatus + "\n" +
                                          "**Последний бонус:** " + (user.last_daily_case_open || "Не открывал");
                        bot.sendMessage(chatId, statusMsg, { parse_mode: "Markdown" });
                    }
                }

                delete adminStates[chatId]; 
                return;
            }
        } else {
            // Если обычный игрок пытается запустить админ-команды
            if (text === '/ban' || text === '/unban' || text === '/status') {
                bot.sendMessage(chatId, "⚠️ У вас нет прав администратора для совершения этого действия.");
            }
        }
    });
}

// СОСТОЯНИЕ ИГРЫ ARENA
let arenaState = {
    status: "waiting", // waiting, countdown, finished
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

// Игровой цикл бэкенда
setInterval(() => {
    if (arenaState.status === "waiting") {
        if (arenaState.bets.length >= 2) {
            arenaState.status = "countdown";
            arenaState.timeLeft = 15;
        }
    } else if (arenaState.status === "countdown") {
        arenaState.timeLeft--;
        if (arenaState.timeLeft <= 0) {
            resolveArenaRound();
        }
    } else if (arenaState.status === "finished") {
        arenaState.timeLeft--;
        if (arenaState.timeLeft <= 0) {
            arenaState.bets = [];
            arenaState.status = "waiting";
            arenaState.timeLeft = 15;
            arenaState.winnerId = null;
            arenaState.winnerName = null;
            arenaState.totalPool = 0;
            arenaState.roundNumber++;
        }
    }
}, 1000);

async function resolveArenaRound() {
    if (arenaState.bets.length === 0) {
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
    const coords = generateCoordsForWinner(winnerIndex, arenaState.bets);

    arenaState.winnerId = winnerBet.userId;
    arenaState.winnerName = winnerBet.username;
    arenaState.winnerX = coords.x;
    arenaState.winnerY = coords.y;
    arenaState.resolvedAt = Date.now();
    arenaState.status = "finished";
    arenaState.timeLeft = 10; 

    const winnerUser = await dbGetUser(winnerBet.userId);
    if (winnerUser) {
        winnerUser.balance = parseFloat((parseFloat(winnerUser.balance) + pool).toFixed(3));
        await dbSaveUser(winnerBet.userId, winnerUser);
    }
}

// Генерация координат победителя в квадрате
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
            return { x: Math.max(20, u * sizeX), y: Math.max(20, v * sizeY) };
        } else {
            while (true) {
                let rx = 20 + Math.random() * 280;
                let ry = 20 + Math.random() * 280;
                if (!(rx / sizeX + ry / sizeY <= 1)) {
                    return { x: rx, y: ry };
                }
            }
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
                normalizedNext += 2 * Math.PI;
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
                x: Math.max(25, Math.min(295, centroid.x + (Math.random() * 20 - 10))),
                y: Math.max(25, Math.min(295, centroid.y + (Math.random() * 20 - 10)))
            };
        }
        currentAngle = nextAngle;
    }
    return { x: 160, y: 160 };
}

// Вспомогательные функции геометрии
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
        let p2 = pts[i+1];
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

// АВТОРИЗАЦИЯ И ПОЛУЧЕНИЕ ПОЛЬЗОВАТЕЛЯ ИЗ БД
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

// MIDDLEWARE С ЖЕСТКОЙ БЛОКИРОВКОЙ ЗАБАНЕННЫХ
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
    
    // Мгновенная блокировка на уровне бэкенда
    if (user.is_banned === true || user.is_banned === 'true') {
        return res.status(403).json({ banned: true, error: "Ваш аккаунт заблокирован!" });
    }

    req.user = user;
    next();
}

// API РОУТЫ
app.get('/api/user', parseTelegramInitData, (req, res) => {
    const user = req.user;
    const isAdmin = String(user.id).trim() === String(ADMIN_CHAT_ID).trim();
    
    // Возвращаем чистый, гарантированный plain-объект с флагом isAdmin
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

// МОМЕНТАЛЬНОЕ НАЧИСЛЕНИЕ БАЛАНСА ПОСЛЕ TON ТРАНЗАКЦИИ
app.post('/api/verify_payment', parseTelegramInitData, async (req, res) => {
    const { amount } = req.body;
    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
    }

    const user = req.user;
    user.balance = parseFloat((parseFloat(user.balance) + paymentAmount).toFixed(3));
    await dbSaveUser(user.id, user);

    if (bot && ADMIN_CHAT_ID) {
        const textMsg = "💎 **Пополнение баланса!**\n" +
                        "Игрок @" + user.username + " (ID: " + user.id + ") успешно зачислил через кошелек **+" + paymentAmount.toFixed(3) + " TON**!";
        bot.sendMessage(ADMIN_CHAT_ID, textMsg, { parse_mode: "Markdown" });
    }

    res.json({ success: true, newBalance: user.balance });
});

// ДЕПОЗИТ (ЗАЯВКА НА ВВОД NFT С КНОПКАМИ TG ДЛЯ АДМИНА)
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
    const user = req.user;
    const sellPrice = parseFloat(price) || 0.1;

    await dbRemoveInventoryItem(user.id, itemId);

    user.balance = parseFloat((parseFloat(user.balance) + sellPrice).toFixed(3));
    await dbSaveUser(user.id, user);

    res.json({ success: true, newBalance: user.balance });
});

app.post('/api/withdraw_gift', parseTelegramInitData, async (req, res) => {
    const { itemId } = req.body;
    const user = req.user;
    const gift = ALL_GIFT_ITEMS[itemId];

    if (!gift) return res.status(400).json({ error: "Item not found" });

    await dbRemoveInventoryItem(user.id, itemId);

    if (bot && ADMIN_CHAT_ID) {
        const textMsg = "📤 **Заявка на вывод подарка!**\n\n" +
                        "**Игрок:** @" + user.username + " (ID: " + user.id + ")\n" +
                        "**Предмет на вывод:** *" + gift.name + "* (" + gift.value + " GRAM)\n\n" +
                        "_Пожалуйста, отправьте ему этот подарок в Telegram!_";
        bot.sendMessage(ADMIN_CHAT_ID, textMsg, { parse_mode: "Markdown" });
    }

    res.json({ success: true });
});

app.post('/api/place_bet', parseTelegramInitData, async (req, res) => {
    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount < 0.1) {
        return res.status(400).json({ error: "Недопустимая сумма ставки" });
    }

    if (arenaState.status === "finished") {
        return res.status(400).json({ error: "Раунд уже завершен, подождите..." });
    }

    const user = req.user; 
    if (parseFloat(user.balance) < amount) {
        return res.status(400).json({ error: "Недостаточно баланса" });
    }

    user.balance = parseFloat((parseFloat(user.balance) - amount).toFixed(3));
    await dbSaveUser(user.id, user);

    const existingBet = arenaState.bets.find(b => String(b.userId) === String(user.id));
    if (existingBet) {
        existingBet.amount = parseFloat((existingBet.amount + amount).toFixed(3));
    } else {
        const chosenColor = getUserColor(user.id, arenaState.roundNumber);
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

app.post('/api/open_daily_case', parseTelegramInitData, async (req, res) => {
    const user = req.user;
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;
    const isAdmin = String(user.id).trim() === String(ADMIN_CHAT_ID).trim();

    // Если админ — полностью пропускаем проверку таймера блокировки!
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
                              "Игрок @" + user.username + " (ID: " + user.id + ") выиграл *" + won.name + "* (ценность: " + won.value + " GRAM) в **Ежедневном Кейсе**!";
            bot.sendMessage(ADMIN_CHAT_ID, winNotify, { parse_mode: "Markdown" });
        }
    }
    await dbSaveUser(user.id, user);

    res.json({ success: true, wonItem: won, newBalance: user.balance });
});

app.post('/api/open_newbie_case', parseTelegramInitData, async (req, res) => {
    const user = req.user;
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
                              "Игрок @" + user.username + " (ID: " + user.id + ") выиграл *" + won.name + "* (" + won.value + " GRAM) в **Кейсе Новичка**!";
            bot.sendMessage(ADMIN_CHAT_ID, winNotify, { parse_mode: "Markdown" });
        }
    }
    await dbSaveUser(user.id, user);

    res.json({ success: true, wonItem: won, newBalance: user.balance });
});

app.get('/api/daily_case_info', (req, res) => {
    res.json({ channel_username: "@BestGiftsChannel" });
});

app.get('/api/deposit_address', (req, res) => {
    res.json({ address: "EQAn...your_wallet_address_here..." });
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

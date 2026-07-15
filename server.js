const express = require('express');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [Safe Engine] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('⚠️ [Safe Engine] Uncaught Exception:', err);
});

const db = require('./db');
const botModule = require('./bot');

const bot = botModule.bot || botModule;
const checkUserSubscription = botModule.checkUserSubscription || (async () => true);
const getUserAvatarUrl = botModule.getUserAvatarUrl || (async () => null);

const pool = db.pool || db;
const query = (text, params) => pool.query(text, params);

const PORT = process.env.PORT || 3000;
const app = express();
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || "";

const ADMIN_TON_ADDRESS = process.env.ADMIN_TON_ADDRESS; 
const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY; 

app.use(express.json());

async function initDb() {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS users (
                id BIGINT PRIMARY KEY,
                username VARCHAR(255),
                first_name VARCHAR(255),
                last_name VARCHAR(255),
                balance NUMERIC(20, 3) DEFAULT 0.000,
                avatar_url TEXT,
                last_daily_case_open TIMESTAMP DEFAULT '2000-01-01 00:00:00',
                daily_case_notified BOOLEAN DEFAULT FALSE,
                is_admin BOOLEAN DEFAULT FALSE
            );
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS arena_active_bets (
                user_id BIGINT PRIMARY KEY,
                amount NUMERIC(20, 3) NOT NULL,
                color VARCHAR(7) NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await query('TRUNCATE arena_active_bets');
    } catch (err) {
        console.error("DB Init Error:", err);
    }
}
initDb();

let arenaGameState = {
    status: 'waiting', 
    timeLeft: 15,
    winnerId: null,
    winnerName: null,
    winnerX: null,
    winnerY: null,
    totalPool: null,
    resolvedAt: 0 // Системный timestamp завершения раунда в миллисекундах
};

// Фоновый таймер арены
setInterval(async () => {
    try {
        const activeBetsRes = await query('SELECT COUNT(DISTINCT user_id) as count FROM arena_active_bets');
        const playerCount = parseInt(activeBetsRes.rows[0].count);

        if (playerCount >= 2) {
            if (arenaGameState.status === 'waiting') {
                arenaGameState.status = 'countdown';
                arenaGameState.timeLeft = 15;
            } else if (arenaGameState.status === 'countdown') {
                arenaGameState.timeLeft--;
                if (arenaGameState.timeLeft <= 0) {
                    arenaGameState.status = 'finished';
                    arenaGameState.timeLeft = 0;
                    
                    await resolveArenaWinner();
                }
            }
        } else {
            if (arenaGameState.status !== 'finished') {
                arenaGameState.status = 'waiting';
                arenaGameState.timeLeft = 15;
            }
        }
    } catch (err) {
        console.error("Ошибка таймера арены:", err);
    }
}, 1000);

// ИСПРАВЛЕНО: Минимальная гарантированная доля полей уменьшена в 3 раза до 1.3% (0.013)
function calculateSharesProtectionBackend(bets) {
    const N = bets.length;
    if (N === 0) return [];
    let amounts = bets.map(b => parseFloat(b.amount || 0));
    const total = amounts.reduce((a, b) => a + b, 0);
    if (total === 0) return amounts.map(() => 1 / N);

    let rawShares = amounts.map(b => b / total);
    const minShare = 0.013; // 1.3% гарантированного веса на бэкенде

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

// Расчет победителя
async function resolveArenaWinner() {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const betsRes = await client.query(`
            SELECT b.user_id, b.amount, b.color, u.username, u.first_name, u.avatar_url 
            FROM arena_active_bets b
            JOIN users u ON b.user_id = u.id
            ORDER BY b.amount DESC
        `);

        if (betsRes.rows.length === 0) {
            await client.query('COMMIT');
            return;
        }

        const bets = betsRes.rows;
        const totalPool = bets.reduce((sum, b) => sum + parseFloat(b.amount), 0);

        // Взвешенный рандом
        let rand = Math.random() * totalPool;
        let winnerRow = null;
        for (const b of bets) {
            rand -= parseFloat(b.amount);
            if (rand <= 0) {
                winnerRow = b;
                break;
            }
        }
        if (!winnerRow) winnerRow = bets[0];

        const winnerId = winnerRow.user_id;

        // Начисление выигрыша
        await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [totalPool, winnerId]);
        await client.query('INSERT INTO transactions (user_id, type, amount, details) VALUES ($1, $2, $3, $4)', [
            winnerId, 'arena_win', totalPool, `Выигрыш в игре Best Arena: +${totalPool} GRAM`
        ]);

        await client.query('COMMIT');

        // Расчет координат приземления шарика с учетом защищенных 1.3% долей полей
        let targetX = 160;
        let targetY = 160;
        const N = bets.length;

        const shares = calculateSharesProtectionBackend(bets);

        if (N === 2) {
            const r = shares[0]; 
            const isPlayer1Winner = (winnerId === bets[0].user_id);

            if (r <= 0.5) {
                if (isPlayer1Winner) {
                    const s = Math.sqrt(2 * r) * 0.70; 
                    targetX = 320 * s * Math.random();
                    targetY = 320 * s * Math.random();
                } else {
                    targetX = 220 + Math.random() * 50;
                    targetY = 220 + Math.random() * 50;
                }
            } else {
                if (!isPlayer1Winner) {
                    const s = Math.sqrt(2 * (1 - r)) * 0.70;
                    targetX = 320 - (320 * s * Math.random());
                    targetY = 320 - (320 * s * Math.random());
                } else {
                    targetX = 50 + Math.random() * 50;
                    targetY = 50 + Math.random() * 50;
                }
            }
        } else {
            let currentAngle = 0;
            for (let i = 0; i < bets.length; i++) {
                const b = bets[i];
                const share = shares[i];
                const nextAngle = currentAngle + 2 * Math.PI * share;

                if (b.user_id === winnerId) {
                    const midAngle = currentAngle + (nextAngle - currentAngle) * (0.35 + Math.random() * 0.3);
                    const dist = 50 + Math.random() * 70; 
                    targetX = 160 + Math.cos(midAngle) * dist;
                    targetY = 160 + Math.sin(midAngle) * dist;
                    break;
                }
                currentAngle = nextAngle;
            }
        }

        // Фиксация победного состояния и системного времени
        arenaGameState.winnerId = winnerId;
        const winnerName = winnerRow.username || winnerRow.first_name || "Игрок";
        arenaGameState.winnerName = winnerName;
        arenaGameState.winnerX = targetX;
        arenaGameState.winnerY = targetY;
        arenaGameState.totalPool = totalPool;
        arenaGameState.resolvedAt = Date.now(); // Время резолва в миллисекундах

        // Сброс стола через 12 секунд
        setTimeout(async () => {
            try {
                await query('TRUNCATE arena_active_bets');
                arenaGameState.status = 'waiting';
                arenaGameState.winnerId = null;
                arenaGameState.winnerName = null;
                arenaGameState.winnerX = null;
                arenaGameState.winnerY = null;
                arenaGameState.totalPool = null;
                arenaGameState.timeLeft = 15;
                arenaGameState.resolvedAt = 0;
            } catch (err) {
                console.error("Ошибка при сбросе раунда арены:", err);
            }
        }, 12000);

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("Ошибка в resolveArenaWinner:", err);
    } finally {
        if (client) client.release();
    }
}

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, content-type, x-telegram-init-data');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use((req, res, next) => {
    const url = req.url;
    if (url.endsWith('.html') || url.endsWith('.js') || url.endsWith('.css') || url === '/' || url === '/index.html') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
    }
    next();
});

function serializeTextCommentBoc(text) {
    const textBytes = Buffer.from(text, 'utf8');
    const payload = Buffer.concat([Buffer.alloc(4), textBytes]); 

    const d1 = 0; 
    const paddedPayload = Buffer.concat([payload, Buffer.from([0x80])]);
    const d2 = payload.length * 2 + 1; 

    const cellData = Buffer.concat([
        Buffer.from([d1, d2]),
        paddedPayload
    ]);

    const cellContentLen = cellData.length;

    const header = Buffer.from([
        0xb5, 0xee, 0x9c, 0x72, 
        0x01,                   
        0x01,                   
        0x01,                   
        0x01,                   
        0x00,                   
        cellContentLen,         
        0x00                    
    ]);

    return Buffer.concat([header, cellData]).toString('base64');
}

app.get('/tonconnect-manifest.json', (req, res) => {
    const host = req.get('host');
    const protocol = 'https'; 
    const appUrl = process.env.WEB_APP_URL || `${protocol}://${host}`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.json({
        "url": appUrl,
        "name": "BestGifts",
        "iconUrl": `${appUrl}/Images/Logo/logotip.png`, 
        "termsOfUseUrl": appUrl,
        "privacyPolicyUrl": appUrl
    });
});

app.get('/api/avatar/:userId', async (req, res) => {
    const userId = req.params.userId;
    try {
        const avatarUrl = await getUserAvatarUrl(userId);
        if (avatarUrl) {
            const response = await axios.get(avatarUrl, { responseType: 'stream' });
            response.data.pipe(res);
        } else {
            res.redirect('https://img.icons8.com/color/96/user.png');
        }
    } catch (e) {
        res.redirect('https://img.icons8.com/color/96/user.png');
    }
});

app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1y',
    setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*'); 
        if (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') || filePath.endsWith('.gif') || filePath.endsWith('.webp')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); 
        }
    }
}));

function matchTransactionComment(tx, userId) {
    if (!tx.in_msg) return false;
    const comment = tx.in_msg.message || "";
    return comment.trim() === String(userId).trim();
}

app.use(async (req, res, next) => {
    const initData = req.body?.initData || req.headers['x-telegram-init-data'] || req.query.initData;
    if (!initData) {
        req.telegramUser = null;
        return next();
    }
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');
        params.sort();
        let dataCheckString = '';
        for (const [key, value] of params.entries()) {
            dataCheckString += key + '=' + value + '\n';
        }
        dataCheckString = dataCheckString.trim();
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        if (calculatedHash !== hash) {
            req.telegramUser = null;
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const userJson = params.get('user');
        if (userJson) {
            req.telegramUser = JSON.parse(userJson);
            if (req.telegramUser.id) {
                let avatarUrl = req.telegramUser.photo_url || null;
                try {
                    if (!avatarUrl) {
                        avatarUrl = await getUserAvatarUrl(req.telegramUser.id);
                    }
                    const isAdminUser = req.telegramUser.id.toString() === process.env.ADMIN_TELEGRAM_ID;
                    
                    // ИСПРАВЛЕНО: Защита от undefined при обновлении профиля в БД
                    await query(
                        'UPDATE users SET avatar_url = $1, username = $2, first_name = $3, last_name = $4, is_admin = $5 WHERE id = $6',
                        [
                            avatarUrl || null, 
                            req.telegramUser.username || null, 
                            req.telegramUser.first_name || null, 
                            req.telegramUser.last_name || null, 
                            isAdminUser, 
                            req.telegramUser.id
                        ]
                    );
                } catch (dbErr) {}
            }
        } else {
            req.telegramUser = null;
        }
    } catch (e) {
        req.telegramUser = null;
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// Установка ставки (ограничение минимальной суммы в 0.1 тон)
app.post('/api/place_bet', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = req.telegramUser.id;
    const { amount } = req.body;
    let betVal = parseFloat(amount);

    if (isNaN(betVal) || betVal < 0.1) {
        return res.status(400).json({ error: "Минимальная ставка — 0.1 GRAM" });
    }

    if (arenaGameState.status === 'finished') {
        return res.status(400).json({ error: "Раунд уже запущен! Дождитесь следующей игры." });
    }
    
    betVal = parseFloat(betVal.toFixed(3));

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const userRes = await client.query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];

        if (!user) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Пользователь не найден" });
        }

        const balance = parseFloat(user.balance || 0);
        if (balance < betVal) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "Недостаточно баланса" });
        }

        const newBalance = balance - betVal;
        await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
        await client.query('INSERT INTO transactions (user_id, type, amount, details) VALUES ($1, $2, $3, $4)', 
            [userId, 'bet_arena', betVal, `Ставка в игре Best Arena: -${betVal} GRAM`]);

        const activeBetRes = await client.query('SELECT amount, color FROM arena_active_bets WHERE user_id = $1 FOR UPDATE', [userId]);
        
        if (activeBetRes.rows.length > 0) {
            const newAmount = parseFloat(activeBetRes.rows[0].amount) + betVal;
            await client.query('UPDATE arena_active_bets SET amount = $1, updated_at = NOW() WHERE user_id = $2', [newAmount, userId]);
        } else {
            const usedColorsRes = await client.query('SELECT color FROM arena_active_bets');
            const usedColors = usedColorsRes.rows.map(row => row.color.toLowerCase());

            const poolOfColors = [
                '#ff0055', '#00ffcc', '#ffcc00', '#00ff00', '#ff00ff',
                '#0066ff', '#ff6600', '#9900ff', '#00ffff', '#ff3300'
            ];

            let assignedColor = null;
            for (const col of poolOfColors) {
                if (!usedColors.includes(col.toLowerCase())) {
                    assignedColor = col;
                    break;
                }
            }
            if (!assignedColor) {
                assignedColor = poolOfColors[Math.floor(Math.random() * poolOfColors.length)];
            }

            await client.query('INSERT INTO arena_active_bets (user_id, amount, color) VALUES ($1, $2, $3)', [userId, betVal, assignedColor]);
        }

        await client.query('COMMIT');
        res.json({ success: true, newBalance: newBalance });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        res.status(500).json({ error: "Ошибка сервера" });
    } finally {
        if (client) client.release();
    }
});

// Получение состояния Арены
app.get('/api/arena/state', async (req, res) => {
    try {
        const betsRes = await query(`
            SELECT b.user_id, b.amount, b.color, u.username, u.first_name, u.avatar_url 
            FROM arena_active_bets b
            JOIN users u ON b.user_id = u.id
            ORDER BY b.amount DESC
        `);
        
        const bets = betsRes.rows.map(row => ({
            userId: row.user_id,
            username: row.username || row.first_name || "Игрок",
            avatar: row.avatar_url || "https://img.icons8.com/color/96/user.png",
            amount: parseFloat(row.amount),
            color: row.color
        }));
        
        const totalPool = bets.reduce((sum, b) => sum + b.amount, 0);
        
        res.json({
            status: arenaGameState.status,
            timeLeft: arenaGameState.timeLeft,
            bets: bets,
            totalPool: totalPool,
            winnerId: arenaGameState.winnerId,
            winnerName: arenaGameState.winnerName,
            winnerX: arenaGameState.winnerX,
            winnerY: arenaGameState.winnerY,
            resolvedAt: arenaGameState.resolvedAt,
            serverTime: Date.now()
        });
    } catch (err) {
        res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
});

app.get('/api/user', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    try {
        let userRes = await query('SELECT id, username, first_name, balance, avatar_url, last_daily_case_open, is_admin FROM users WHERE id = $1', [req.telegramUser.id]);
        let user = userRes.rows[0];
        if (!user) {
            const avatarUrl = req.telegramUser.photo_url || null;
            const isAdminUser = req.telegramUser.id.toString() === process.env.ADMIN_TELEGRAM_ID;
            
            // ИСПРАВЛЕНО: Защита от undefined при INSERT нового пользователя без Username или Last Name
            user = { 
                id: req.telegramUser.id, 
                username: req.telegramUser.username || null, 
                first_name: req.telegramUser.first_name || null, 
                balance: 0.000, 
                avatar_url: avatarUrl, 
                last_daily_case_open: new Date('2000-01-01'), 
                is_admin: isAdminUser 
            };
            
            await query(
                'INSERT INTO users (id, username, first_name, last_name, avatar_url, is_admin) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING', 
                [
                    user.id, 
                    user.username, 
                    user.first_name, 
                    req.telegramUser.last_name || null, 
                    user.avatar_url || null, 
                    user.is_admin
                ]
            );
        }
        res.json(user);
    } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/inventory', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const inventoryRows = (await query('SELECT ui.item_id, ui.quantity, i.name, i.image_url, i.value, i.type FROM user_inventory ui JOIN items i ON ui.item_id = i.id WHERE ui.user_id = $1 AND ui.quantity > 0 ORDER BY i.value DESC', [req.telegramUser.id])).rows;
        const inventoryFlat = [];
        for (const row of inventoryRows) {
            for (let i = 0; i < row.quantity; i++) {
                inventoryFlat.push({ item_id: row.item_id, name: row.name, image_url: row.image_url, value: row.value, type: row.type, quantity: 1 });
            }
        }
        res.json(inventoryFlat);
    } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/open_daily_case', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    let client;
    try {
        const isSubscribed = await checkUserSubscription(userId);
        if (!isSubscribed) return res.status(403).json({ error: "Подпишитесь на канал @" + CHANNEL_USERNAME });

        client = await pool.connect();
        await client.query('BEGIN');
        const userRes = await client.query('SELECT username, first_name, last_name, balance, last_daily_case_open, is_admin FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];
        if (!user) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Пользователь не найден.' }); }

        const now = new Date();
        const lastOpen = new Date(user.last_daily_case_open);
        const timeElapsed = now.getTime() - lastOpen.getTime();
        const cooldown = 24 * 60 * 60 * 1000;
        if (!user.is_admin && timeElapsed < cooldown) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Кейс недоступен.', timeLeftMs: cooldown - timeElapsed }); }

        const drops = (await client.query('SELECT dcd.item_id, dcd.chance, i.name, i.type, i.value, i.image_url FROM daily_case_drops dcd JOIN items i ON dcd.item_id = i.id')).rows;
        let totalChance = drops.reduce((sum, drop) => sum + parseFloat(drop.chance), 0);
        let rand = Math.random() * totalChance;
        let wonItem = null;
        for (const drop of drops) {
            rand -= parseFloat(drop.chance);
            if (rand <= 0) { wonItem = drop; break; }
        }
        if (!wonItem) wonItem = drops[drops.length - 1]; 

        let newBalance = parseFloat(user.balance);
        if (wonItem.type === 'balance') {
            newBalance += parseFloat(wonItem.value);
            await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
        } else { 
            await client.query('INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1', [userId, wonItem.item_id]);
        }
        await client.query('UPDATE users SET last_daily_case_open = NOW(), daily_case_notified = false WHERE id = $1', [userId]);
        await client.query('COMMIT');

        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (adminId && bot && wonItem.type !== 'balance') {
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Пользователь';
            const adminMsg = `🎉 <b>Выигран подарок в Ежедневном кейсе!</b>\n\n🎁 <b>Подарок:</b> ${wonItem.name} (ID: ${wonItem.item_id}, Цена: ${wonItem.value} GRAM)\n👤 <b>Пользователь:</b> <a href="tg://user?id=${userId}">${fullName}</a>`;
            bot.sendMessage(adminId, adminMsg, { parse_mode: 'HTML' }).catch(console.error);
        }
        res.json({ success: true, wonItem: { id: wonItem.item_id, name: wonItem.name, price: wonItem.value + " GRAM", type: wonItem.type }, newBalance: newBalance });
    } catch (error) { if (client) await client.query('ROLLBACK'); res.status(500).json({ error: 'Ошибка' }); } finally { if (client) client.release(); }
});

app.post('/api/open_newbie_case', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const userRes = await client.query('SELECT username, first_name, last_name, balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];
        if (!user) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Пользователь не найден.' }); }

        const spinCost = 0.1;
        if (parseFloat(user.balance) < spinCost) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Недостаточно GRAM!' }); }

        const drops = (await client.query('SELECT ncd.item_id, ncd.chance, i.name, i.type, i.value, i.image_url FROM newbie_case_drops ncd JOIN items i ON ncd.item_id = i.id')).rows;
        let totalChance = drops.reduce((sum, drop) => sum + parseFloat(drop.chance), 0);
        let rand = Math.random() * totalChance;
        let wonItem = null;
        for (const drop of drops) {
            rand -= parseFloat(drop.chance);
            if (rand <= 0) { wonItem = drop; break; }
        }
        if (!wonItem) wonItem = drops[drops.length - 1]; 

        let newBalance = parseFloat(user.balance) - spinCost;
        if (wonItem.type === 'balance') {
            newBalance += parseFloat(wonItem.value);
            await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
        } else { 
            await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
            await client.query('INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1', [userId, wonItem.item_id]);
        }
        await client.query('COMMIT');

        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (adminId && bot && wonItem.type !== 'balance') {
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Пользователь';
            const adminMsg = `🎉 <b>Выигран подарок в Кейсе Новичка!</b>\n\n🎁 <b>Подарок:</b> ${wonItem.name} (ID: ${wonItem.item_id}, Цена: ${wonItem.value} GRAM)\n👤 <b>Пользователь:</b> <a href="tg://user?id=${userId}">${fullName}</a>`;
            bot.sendMessage(adminId, adminMsg, { parse_mode: 'HTML' }).catch(console.error);
        }
        res.json({ success: true, wonItem: { id: wonItem.item_id, name: wonItem.name, price: wonItem.value + " GRAM", type: wonItem.type }, newBalance: newBalance });
    } catch (error) { if (client) await client.query('ROLLBACK'); res.status(500).json({ error: 'Ошибка' }); } finally { if (client) client.release(); }
});

app.post('/api/sell_gift', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    const { itemId, price } = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const inventoryRes = await client.query('SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE', [userId, itemId]);
        const item = inventoryRes.rows[0];
        if (!item || item.quantity < 1) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'У вас нет этого предмета.' }); }
        await client.query('UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
        const userRes = await client.query('SELECT username, first_name, last_name, balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];
        const newBalance = parseFloat(user.balance) + parseFloat(price);
        await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);
        await client.query('COMMIT');
        res.json({ success: true, newBalance: newBalance });
    } catch (error) { if (client) await client.query('ROLLBACK'); res.status(500).json({ error: 'Ошибка' }); } finally { if (client) client.release(); }
});

app.post('/api/withdraw_gift', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    const { itemId } = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const inventoryRes = await client.query('SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE', [userId, itemId]);
        const itemRow = inventoryRes.rows[0];
        if (!itemRow || itemRow.quantity < 1) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Нет предмета.' }); }
        await client.query('UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
        await client.query('COMMIT');

        const itemDetails = (await query('SELECT name, value FROM items WHERE id = $1', [itemId])).rows[0];
        const userRes = await query('SELECT username, first_name, last_name FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];

        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (adminId && bot) {
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Пользователь';
            const msg = `📤 <b>Запрос на вывод подарка!</b>\n\n` +
                        `🎁 <b>Подарок:</b> ${itemDetails.name} (${parseFloat(itemDetails.value).toFixed(3)} GRAM)\n` +
                        `👤 <b>Пользователь:</b> <a href="tg://user?id=${userId}">${fullName}</a>`;
            bot.sendMessage(adminId, msg, { parse_mode: 'HTML' }).catch(console.error);
        }
        res.json({ success: true });
    } catch (error) { if (client) await client.query('ROLLBACK'); res.status(500).json({ error: 'Ошибка' }); } finally { if (client) client.release(); }
});

app.post('/api/deposit_gift_request', async (req, res) => {
    if (!req.telegramUser || !req.telegramUser.id) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.telegramUser.id;
    const { itemId } = req.body;
    try {
        const itemDetails = (await query('SELECT name, value, type FROM items WHERE id = $1', [itemId])).rows[0];
        if (!itemDetails) return res.status(400).json({ error: 'Предмет не найден.' });
        const userRes = await query('SELECT username, first_name, last_name FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];

        const adminId = process.env.ADMIN_TELEGRAM_ID;
        if (adminId && bot) {
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Пользователь';
            const msg = `📥 <b>Новый запрос на депозит!</b>\n\n` +
                        `🎁 <b>Предмет:</b> ${itemDetails.name} (ID: ${itemId})\n` +
                        `👤 <b>Пользователь:</b> <a href="tg://user?id=${userId}">${fullName}</a>`;
            bot.sendMessage(adminId, msg, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Одобрить', callback_data: `dep_app_${userId}_${itemId}` },
                        { text: '❌ Отклонить', callback_data: `dep_rej_${userId}_${itemId}` }
                    ]]
                }
            }).catch(console.error);
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Ошибка.' }); }
});

app.get('/api/daily_case_info', (req, res) => { res.json({ channel_username: CHANNEL_USERNAME }); });

app.listen(PORT, () => console.log("🚀 Server running on port " + PORT));

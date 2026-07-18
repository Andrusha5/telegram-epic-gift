const express = require('express');
const cors = require('cors');
const path = require('path');
// const crypto = require('crypto'); // crypto не используется напрямую, можно удалить если не будет других задач

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================================================
// ВНУТРЕННЯЯ БД СЕРВЕРА (В оперативной памяти)
// ==========================================================================
const usersDB = {};
// const depositRequests = []; // Убрано, так как не используется в текущей логике
const CHANNEL_USERNAME = "@BestGiftsChannel";

// Стабильная палитра цветов для секторов игры
const defaultColors = ['#8d3df5', '#00e676', '#0088cc', '#ff9500', '#ff3b30', '#c25dff'];

// Генератор цвета: цвет зависит от ID пользователя и номера раунда.
// Это гарантирует стабильность цвета для игрока внутри раунда и случайность в новом.
function getUserColor(userId, roundNumber) {
    const idStr = String(userId || 'guest') + "_" + String(roundNumber || 1);
    let hash = 0;
    for (let i = 0; i < idStr.length; i++) {
        hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % defaultColors.length;
    return defaultColors[index];
}

// ==========================================================================
// ИГРОВОЙ ДВИЖОК BEST ARENA (АБСОЛЮТНО АВТОНОМНЫЙ ЦИКЛ НА СЕРВЕРЕ)
// ==========================================================================
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

// Вспомогательные функции для рисования секторов (не используются на сервере напрямую, но полезны для понимания)
function calculateShares(bets) {
    const N = bets.length;
    if (N === 0) return [];
    let betValues = bets.map(b => parseFloat(b.amount) || 0);
    const total = betValues.reduce((a, b) => a + b, 0);
    if (total === 0) return betValues.map(() => 1 / N);

    let rawShares = betValues.map(b => b / total);
    const minShare = 0.013; // Минимальная доля, чтобы сектор был виден

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
        if (underMinSum >= 1.0) { // Если сумма минимальных долей уже 100%
            return adjusted.map(() => 1 / N); // Равные доли, чтобы избежать переполнения
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
    return { x: cx + halfSize, y: cy }; // Дефолтное значение
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
    if (Math.abs(area) < 0.01) { // Если площадь слишком мала, используем простое среднее
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

function generateCoordsForWinner(winnerIndex, bets) {
    const N = bets.length;
    if (N === 0) return { x: 160, y: 160 }; // Центр, если нет ставок
    const shares = calculateShares(bets);

    // Упрощенные расчеты для 1 или 2 игроков (для лучшего распределения)
    if (N === 1) {
        return { x: 60 + Math.random() * 200, y: 60 + Math.random() * 200 };
    }

    if (N === 2) {
        // Распределяем шарик в пределах сектора победителя
        const s = Math.sqrt(2 * shares[0]);
        const sizeX = 320 * s;
        const sizeY = 320 * s;
        if (winnerIndex === 0) {
            let u = Math.random();
            let v = Math.random();
            if (u + v > 1) { u = 1 - u; v = 1 - v; }
            return { x: Math.max(20, u * sizeX), y: Math.max(20, v * sizeY) };
        } else {
            while (true) { // Генерируем случайную точку вне первого сектора
                let rx = 20 + Math.random() * 280;
                let ry = 20 + Math.random() * 280;
                if (!(rx / sizeX + ry / sizeY <= 1)) {
                    return { x: rx, y: ry };
                }
            }
        }
    }

    // Для 3+ игроков, используем центроид сектора
    let currentAngle = -Math.PI / 2; // Начинаем с верхней центральной точки
    const corners = getCornerAnglesRad();

    for (let i = 0; i < N; i++) {
        const share = shares[i];
        let nextAngle = currentAngle + 2 * Math.PI * share;

        if (i === winnerIndex) {
            const pathPoints = [{ x: 160, y: 160 }]; // Центр
            pathPoints.push(getSquareIntersection(currentAngle)); // Начальная точка сектора на границе

            // Добавляем углы квадрата, если сектор их пересекает
            let normalizedCurrent = (currentAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            let normalizedNext = (nextAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            if (nextAngle > currentAngle && normalizedNext < normalizedCurrent) { // Если пересекаем 0/360
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
            pathPoints.push(getSquareIntersection(nextAngle)); // Конечная точка сектора на границе

            const centroid = getPolygonCentroid(pathPoints);
            // Добавляем небольшую случайную погрешность для реалистичности
            return {
                x: Math.max(25, Math.min(295, centroid.x + (Math.random() * 20 - 10))),
                y: Math.max(25, Math.min(295, centroid.y + (Math.random() * 20 - 10)))
            };
        }
        currentAngle = nextAngle;
    }
    return { x: 160, y: 160 }; // Если что-то пошло не так, возвращаем центр
}


// Автономный фоновый таймер сервера (Работает ВСЕГДА независимо от онлайна игроков)
setInterval(() => {
    if (arenaState.status === "waiting") {
        if (arenaState.bets.length >= 1) {
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
            // Очистка ставок и подготовка к новому раунду
            arenaState.bets = [];
            arenaState.status = "waiting";
            arenaState.timeLeft = 15; // Сброс таймера на начальное значение
            arenaState.winnerId = null;
            arenaState.winnerName = null;
            arenaState.totalPool = 0;
            arenaState.roundNumber++; // Увеличение номера раунда
        }
    }
}, 1000);

function resolveArenaRound() {
    if (arenaState.bets.length === 0) {
        arenaState.status = "waiting"; // Если нет ставок, просто ждем
        return;
    }

    let pool = 0;
    arenaState.bets.forEach(b => pool += parseFloat(b.amount));
    arenaState.totalPool = pool;

    const rand = Math.random() * pool; // Выбираем случайное число из общего пула
    let sum = 0;
    let winnerBet = arenaState.bets[arenaState.bets.length - 1]; // Дефолтный победитель (на всякий случай)

    // Определяем победителя
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
    arenaState.timeLeft = 10; // Время отображения результатов

    // Начисляем выигрыш победителю
    const winnerUser = usersDB[winnerBet.userId];
    if (winnerUser) {
        winnerUser.balance = (parseFloat(winnerUser.balance) + pool);
    }
}

// ==========================================================================
// ВСПОМОГАТЕЛЬНЫЕ MIDDLEWARES И ФУНКЦИИ АВТОРИЗАЦИИ
// ==========================================================================
function getOrCreateUser(initDataUnsafe) {
    // Используем "guest_user_id" для тестирования без реального Telegram ID
    const tgUser = initDataUnsafe?.user || { id: "guest_user_id", username: "Пользователь", first_name: "Пользователь" };
    const id = String(tgUser.id);
    
    if (!usersDB[id]) {
        usersDB[id] = {
            id: id,
            username: tgUser.username || tgUser.first_name || "Пользователь",
            first_name: tgUser.first_name || "",
            balance: 50.0, // Начальный баланс для новых пользователей
            avatar_url: tgUser.photo_url || "https://img.icons8.com/color/96/user.png",
            last_daily_case_open: null
        };
    }
    return usersDB[id];
}

// Middleware для парсинга Telegram Mini App InitData
function parseTelegramInitData(req, res, next) {
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
            console.error("Error parsing Telegram InitData:", e);
        }
    }
    req.user = getOrCreateUser(initDataUnsafe);
    next();
}

// ==========================================================================
// API РОУТЫ
// ==========================================================================
app.get('/api/user', parseTelegramInitData, (req, res) => {
    res.json(req.user);
});

app.post('/api/place_bet', parseTelegramInitData, (req, res) => {
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

    user.balance = parseFloat((user.balance - amount).toFixed(3));

    const existingBet = arenaState.bets.find(b => String(b.userId) === String(user.id));
    if (existingBet) {
        existingBet.amount = parseFloat((existingBet.amount + amount).toFixed(3));
    } else {
        const chosenColor = getUserColor(user.id, arenaState.roundNumber); // Используем динамический цвет
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

// Роут для получения состояния арены (важно, чтобы все поля были явно указаны)
app.get('/api/arena/state', parseTelegramInitData, (req, res) => {
    res.json({
        status: arenaState.status,
        roundNumber: arenaState.roundNumber,
        // round_number: arenaState.roundNumber, // Отправляем дублирующий ключ для 100% совместимости
        bets: arenaState.bets,
        timeLeft: arenaState.timeLeft,
        resolvedAt: arenaState.resolvedAt,
        winnerId: arenaState.winnerId,
        winnerName: arenaState.winnerName,
        winnerX: arenaState.winnerX,
        winnerY: arenaState.winnerY,
        totalPool: arenaState.totalPool,
        serverTime: Date.now() // Для синхронизации времени клиента с сервером
    });
});

// Эмуляция открытия ежедневного кейса
app.post('/api/open_daily_case', parseTelegramInitData, (req, res) => {
    const user = req.user;
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;

    if (user.last_daily_case_open && (now - new Date(user.last_daily_case_open).getTime() < cooldown)) {
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
        user.balance = parseFloat((user.balance + won.value).toFixed(3));
    }

    res.json({ success: true, wonItem: won, newBalance: user.balance });
});

// Эмуляция открытия кейса новичка
app.post('/api/open_newbie_case', parseTelegramInitData, (req, res) => {
    const user = req.user;
    const price = 0.1;

    if (parseFloat(user.balance) < price) {
        return res.status(400).json({ error: "Недостаточно баланса" });
    }

    user.balance = parseFloat((user.balance - price).toFixed(3));

    const rewards = [
        { id: 109, name: "Холодный огонь", type: "gift", value: 2.2 },
        { id: 112, name: "Мишка классический", type: "gift", value: 0.11 },
        { id: 113, name: "Пополнение 0.1 GRAM (Новичок)", type: "balance", value: 0.1 }
    ];
    const won = rewards[Math.floor(Math.random() * rewards.length)];

    if (won.type === "balance") {
        user.balance = parseFloat((user.balance + won.value).toFixed(3));
    }

    res.json({ success: true, wonItem: won, newBalance: user.balance });
});

// Эмуляция продажи подарка
app.post('/api/sell_gift', parseTelegramInitData, (req, res) => {
    const { price } = req.body;
    const user = req.user;
    const sellPrice = parseFloat(price) || 0.1; // Цена продажи

    user.balance = parseFloat((user.balance + sellPrice).toFixed(3));
    res.json({ success: true, newBalance: user.balance });
});

// Эмуляция информации о канале (для подписки)
app.get('/api/daily_case_info', (req, res) => {
    res.json({ channel_username: CHANNEL_USERNAME });
});

// Эмуляция пустого инвентаря
app.get('/api/inventory', (req, res) => {
    res.json([]);
});

// Эмуляция адреса для пополнения
app.get('/api/deposit_address', (req, res) => {
    res.json({ address: "EQAn...your_wallet_address_here..." });
});

// Эмуляция payload для транзакций
app.get('/api/generate_payload', (req, res) => {
    res.json({ payload: "te6ccgEBAQEAAgAAAA==" });
});

// Отдача index.html для любого другого запроса
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Server is running strictly on port ${PORT}`);
});

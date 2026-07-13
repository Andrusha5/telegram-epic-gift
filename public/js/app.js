const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Инъекция красивых стилей для новой игры "Арена"
const arenaStyle = document.createElement('style');
arenaStyle.innerHTML = `
    /* Кнопка-баннер новой игры на главном экране */
    .arena-banner-btn {
        width: 100%;
        background: linear-gradient(135deg, #1c1c1e 0%, #0c0c0e 100%);
        border: 1px solid #2c2c2e;
        border-radius: 20px;
        padding: 16px;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        position: relative;
        overflow: hidden;
        cursor: pointer;
        box-sizing: border-box;
        transition: transform 0.2s, border-color 0.2s;
    }
    .arena-banner-btn:active {
        transform: scale(0.98);
    }
    .arena-banner-btn:hover {
        border-color: #0088cc;
    }
    .arena-info-left {
        z-index: 2;
        text-align: left;
    }
    .arena-badge {
        background: linear-gradient(135deg, #ff9500, #ffcc00);
        color: #000;
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        padding: 4px 8px;
        border-radius: 20px;
        display: inline-block;
        margin-bottom: 6px;
    }
    .arena-banner-title {
        color: #fff;
        font-size: 18px;
        font-weight: bold;
        margin-bottom: 4px;
    }
    .arena-banner-desc {
        color: #8e8e93;
        font-size: 12px;
    }
    .arena-live-preview {
        width: 70px;
        height: 70px;
        background: #1c1c1e;
        border-radius: 12px;
        border: 1.5px solid #3a3a3c;
        overflow: hidden;
        position: relative;
    }

    /* Экран игры "Арена" */
    .arena-screen {
        padding: 16px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    .arena-header-row {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
    }
    .arena-back-btn {
        background: #2c2c2e;
        border: none;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 20px;
        cursor: pointer;
    }
    .arena-game-id {
        color: #8e8e93;
        font-size: 13px;
    }
    .arena-main-box {
        width: 100%;
        max-width: 330px;
        aspect-ratio: 1;
        background: #121214;
        border-radius: 24px;
        border: 2px solid #2c2c2e;
        position: relative;
        overflow: hidden;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .arena-canvas {
        width: 100%;
        height: 100%;
        display: block;
    }
    .arena-status-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: rgba(255, 255, 255, 0.4);
        font-size: 16px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 1px;
        animation: pulseText 1.5s infinite;
        pointer-events: none;
        text-align: center;
        z-index: 5;
    }
    .arena-countdown-timer {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: #fff;
        font-size: 48px;
        font-weight: 900;
        z-index: 5;
        pointer-events: none;
        text-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
    @keyframes pulseText {
        0% { opacity: 0.3; }
        50% { opacity: 0.8; }
        100% { opacity: 0.3; }
    }

    /* Сетка кейсов - 2 столбика */
    .cases-grid-layout {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
        width: 100%;
        box-sizing: border-box;
    }

    /* Нижняя панель управления ставками */
    .arena-controls {
        width: 100%;
        max-width: 330px;
        margin-top: 16px;
        display: flex;
        gap: 8px;
        align-items: center;
    }
    .arena-ctrl-btn {
        flex: 1;
        background: #2c2c2e;
        border: 1px solid #3a3a3c;
        border-radius: 14px;
        padding: 12px 0;
        color: #fff;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: transform 0.1s, border-color 0.2s;
    }
    .arena-ctrl-btn:active {
        transform: scale(0.95);
    }
    .arena-ctrl-btn-edit {
        flex: 0 0 50px;
        background: #1c1c1e;
        border-color: #2c2c2e;
        font-size: 18px;
    }
    .arena-ctrl-btn-edit img {
        width: 18px;
        height: 18px;
        filter: invert(1);
    }

    /* Модальное окно редактирования сумм */
    .arena-edit-modal {
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.85);
        display: flex; align-items: center; justify-content: center;
        z-index: 20000;
        opacity: 0; pointer-events: none;
        transition: opacity 0.3s ease;
    }
    .arena-edit-modal.show {
        opacity: 1; pointer-events: auto;
    }
    .arena-edit-content {
        background: #1c1c1e;
        border: 1px solid #2c2c2e;
        border-radius: 20px;
        padding: 24px;
        width: 90%; max-width: 300px;
        text-align: center;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    .arena-edit-inputs {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin: 16px 0;
    }
    .arena-edit-input {
        width: 100%;
        padding: 12px;
        background: #2c2c2e;
        border: 1px solid #3a3a3c;
        border-radius: 10px;
        color: #fff;
        font-size: 15px;
        text-align: center;
        box-sizing: border-box;
    }

    /* Список игроков под ареной */
    .arena-players-container {
        width: 100%;
        max-width: 330px;
        margin-top: 20px;
        text-align: left;
    }
    .arena-players-title {
        color: #fff;
        font-size: 15px;
        font-weight: bold;
        margin-bottom: 10px;
    }
    .arena-players-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .arena-player-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #1c1c1e;
        border: 1px solid #2c2c2e;
        border-radius: 12px;
        padding: 8px 12px;
    }
    .arena-player-info {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .arena-player-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        object-fit: cover;
    }
    .arena-player-name {
        color: #fff;
        font-size: 13px;
        font-weight: 500;
    }
    .arena-player-bet {
        color: #8e8e93;
        font-size: 12px;
    }
    .arena-player-chance {
        color: #28a745;
        font-size: 13px;
        font-weight: bold;
    }
`;
document.head.appendChild(arenaStyle);

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = window.location.origin;
    let currentUser = {};
    let isNewbieCaseMode = false; 

    const GRAMCOIN_ICON_URL = "/Images/Items/gram_popolnenie.png"; 

    // Безопасно получаем Telegram ID пользователя
    let userId = tg.initDataUnsafe?.user?.id;
    if (!userId) {
        try {
            const params = new URLSearchParams(tg.initData);
            const userRaw = params.get('user');
            if (userRaw) {
                userId = JSON.parse(userRaw).id;
            }
        } catch (e) {}
    }
    if (!userId) userId = "guest_user_id";

    // Сброс кэша для мультиаккаунтов
    try {
        const lastSavedUser = localStorage.getItem('last_logged_tg_user');
        if (lastSavedUser !== String(userId)) {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && (key.includes('ton-connect') || key.includes('ton_connect'))) {
                    localStorage.removeItem(key);
                }
            }
            localStorage.setItem('last_logged_tg_user', String(userId));
        }
    } catch (err) {}

    // Инициализация TON CONNECT
    let tonConnectUI = null;
    try {
        const manifestUrl = `${API_BASE_URL}/tonconnect-manifest.json`;
        const customStorage = {
            setItem: (key, value) => { try { localStorage.setItem(`ton-connect-${userId}-${key}`, value); } catch (e) {} },
            getItem: (key) => { try { return localStorage.getItem(`ton-connect-${userId}-${key}`); } catch (e) { return null; } },
            removeItem: (key) => { try { localStorage.removeItem(`ton-connect-${userId}-${key}`); } catch (e) {} }
        };
        if (typeof TON_CONNECT_UI !== 'undefined' && TON_CONNECT_UI.TonConnectUI) {
            tonConnectUI = new TON_CONNECT_UI.TonConnectUI({ manifestUrl, storage: customStorage });
        } else if (window.TonConnectUI) {
            tonConnectUI = new window.TonConnectUI({ manifestUrl, storage: customStorage });
        }
    } catch (err) {}

    // Добавляем верстку для новой игры Арена и перенастраиваем сетку кейсов на 2 столбика
    const bannerContainer = document.getElementById('banners-container') || document.querySelector('.cases-container');
    if (bannerContainer) {
        // Создаем кнопку живой игры над кейсами
        const liveBtnHtml = `
            <div class="arena-banner-btn" id="arena-banner-btn">
                <div class="arena-info-left">
                    <div class="arena-badge">Live Игра</div>
                    <div class="arena-banner-title">Арена Полигонов</div>
                    <div class="arena-banner-desc">Многопользовательское поле битвы</div>
                </div>
                <div class="arena-live-preview">
                    <canvas id="arena-mini-canvas" width="70" height="70"></canvas>
                </div>
            </div>
        `;
        bannerContainer.insertAdjacentHTML('beforebegin', liveBtnHtml);

        // Пересобираем кейсы в сетку из 2 столбиков
        const originalBanners = document.getElementById('banners-container');
        if (originalBanners) {
            originalBanners.className = "cases-grid-layout";
        }
    }

    // Создаем окно игры "Арена" в HTML
    const mainContainer = document.querySelector('.container') || document.body;
    const arenaSectionHtml = `
        <div id="arena-section" class="arena-screen hidden">
            <div class="arena-header-row">
                <button class="arena-back-btn" id="arena-back-home">&larr;</button>
                <div class="arena-game-id" id="arena-game-id-text">Игра #0</div>
                <div style="width:40px;"></div>
            </div>
            
            <div class="arena-main-box">
                <canvas id="arena-main-canvas" class="arena-canvas" width="300" height="300"></canvas>
                <div id="arena-status" class="arena-status-text">Ждем ставки...</div>
                <div id="arena-countdown" class="arena-countdown-timer hidden">15</div>
            </div>

            <!-- Управление ставками -->
            <div class="arena-controls">
                <button class="arena-ctrl-btn arena-ctrl-btn-edit" id="arena-btn-edit">✏️</button>
                <button class="arena-ctrl-btn" id="arena-bet-1">1.000 GRAM</button>
                <button class="arena-ctrl-btn" id="arena-bet-2">2.000 GRAM</button>
                <button class="arena-ctrl-btn" id="arena-bet-3">3.000 GRAM</button>
            </div>

            <!-- Список участников -->
            <div class="arena-players-container">
                <div class="arena-players-title" id="arena-players-title-count">Игроки · 0</div>
                <div class="arena-players-list" id="arena-players-list-container"></div>
            </div>
        </div>
    `;
    mainContainer.insertAdjacentHTML('beforeend', arenaSectionHtml);

    // Модалка настройки сумм ставок
    const editModalHtml = `
        <div class="arena-edit-modal" id="arena-edit-modal">
            <div class="arena-edit-content">
                <h3 style="color:#fff;margin:0 0 10px 0;font-size:16px;">Настройка быстрых ставок</h3>
                <div class="arena-edit-inputs">
                    <input type="number" step="0.1" min="0.1" class="arena-edit-input" id="edit-val-1" value="1.0">
                    <input type="number" step="0.1" min="0.1" class="arena-edit-input" id="edit-val-2" value="2.0">
                    <input type="number" step="0.1" min="0.1" class="arena-edit-input" id="edit-val-3" value="3.0">
                </div>
                <div style="display:flex;gap:10px;">
                    <button class="deposit-btn deposit-btn-cancel" style="padding:10px;" id="arena-edit-cancel">Отмена</button>
                    <button class="deposit-btn deposit-btn-pay" style="padding:10px;" id="arena-edit-save">Сохранить</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', editModalHtml);

    // Инициализация кастомных кнопок ставок из localStorage
    let betValues = [1.0, 2.0, 3.0];
    try {
        const saved = localStorage.getItem(`arena_bets_custom_${userId}`);
        if (saved) {
            betValues = JSON.parse(saved);
        }
    } catch(e){}

    function updateBetButtonsUI() {
        document.getElementById('arena-bet-1').innerText = `${parseFloat(betValues[0]).toFixed(1)} GRAM`;
        document.getElementById('arena-bet-2').innerText = `${parseFloat(betValues[1]).toFixed(1)} GRAM`;
        document.getElementById('arena-bet-3').innerText = `${parseFloat(betValues[3] || betValues[2]).toFixed(1)} GRAM`;
    }
    updateBetButtonsUI();

    // Логика кастомных кнопок редактирования
    document.getElementById('arena-btn-edit').addEventListener('click', () => {
        document.getElementById('edit-val-1').value = betValues[0];
        document.getElementById('edit-val-2').value = betValues[1];
        document.getElementById('edit-val-3').value = betValues[2] || 3.0;
        document.getElementById('arena-edit-modal').classList.add('show');
    });

    document.getElementById('arena-edit-cancel').addEventListener('click', () => {
        document.getElementById('arena-edit-modal').classList.remove('show');
    });

    document.getElementById('arena-edit-save').addEventListener('click', () => {
        const v1 = parseFloat(document.getElementById('edit-val-1').value);
        const v2 = parseFloat(document.getElementById('edit-val-2').value);
        const v3 = parseFloat(document.getElementById('edit-val-3').value);
        if (v1 >= 0.1 && v2 >= 0.1 && v3 >= 0.1) {
            betValues = [v1, v2, v3];
            localStorage.setItem(`arena_bets_custom_${userId}`, JSON.stringify(betValues));
            updateBetButtonsUI();
            document.getElementById('arena-edit-modal').classList.remove('show');
            showNotification("Быстрые ставки успешно настроены!", "⚙️");
        } else {
            showNotification("Минимальная ставка 0.1 GRAM!", "⚠️");
        }
    });

    // ----------------- ЖИВОЕ МИНИ-ПОЛЕ НА ГЛАВНОМ ЭКРАНЕ -----------------
    const miniCanvas = document.getElementById('arena-mini-canvas');
    if (miniCanvas) {
        const ctx = miniCanvas.getContext('2d');
        let ballX = 35, ballY = 35;
        let vx = 0.8, vy = 1.1;
        
        function animateMini() {
            ctx.fillStyle = '#1c1c1e';
            ctx.fillRect(0, 0, 70, 70);
            
            // Сетка шахматная
            ctx.strokeStyle = '#2c2c2e';
            ctx.lineWidth = 1;
            for(let i=0; i<70; i+=14){
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 70); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(70, i); ctx.stroke();
            }
            
            ballX += vx; ballY += vy;
            if (ballX < 4 || ballX > 66) vx = -vx;
            if (ballY < 4 || ballY > 66) vy = -vy;
            
            ctx.beginPath();
            ctx.arc(ballX, ballY, 4, 0, Math.PI*2);
            ctx.fillStyle = '#0088cc';
            ctx.fill();
            requestAnimationFrame(animateMini);
        }
        animateMini();
    }

    // ----------------- РЕНДЕРИНГ И ЛОГИКА ОСНОВНОЙ ИГРЫ АРЕНЫ -----------------
    const canvas = document.getElementById('arena-main-canvas');
    const ctx = canvas.getContext('2d');
    const statusText = document.getElementById('arena-status');
    const countdownText = document.getElementById('arena-countdown');

    let arenaData = {
        state: 'waiting',
        roundId: 0,
        bets: [],
        countdownLeft: 15,
        ballAngle: 0,
        ballSpeed: 0,
        ballX: 150,
        ballY: 150,
        arrowAlpha: 0,
        arrowAngle: 0,
        showArrow: false,
        endedTriggered: false
    };

    // Подготовка полигонов по периметру
    function getPerimeterPoint(d) {
        if (d <= 300) return { x: d, y: 0 };
        if (d <= 600) return { x: 300, y: d - 300 };
        if (d <= 900) return { x: 900 - d, y: 300 };
        return { x: 0, y: 1200 - d };
    }

    // Генерация полигонов секторов пропорционально ставкам игроков
    function buildPlayerSectors() {
        const sectors = [];
        if (arenaData.bets.length === 0) return sectors;

        const totalBets = arenaData.bets.reduce((sum, b) => sum + parseFloat(b.amount), 0);
        let currentPerimeter = 0;

        arenaData.bets.forEach((bet) => {
            const playerWeight = parseFloat(bet.amount) / totalBets;
            const size = playerWeight * 1200;
            const startD = currentPerimeter;
            const endD = (currentPerimeter + size) % 1200;

            const polyPoints = [{ x: 150, y: 150 }];
            
            // Начальная точка
            polyPoints.push(getPerimeterPoint(startD));

            // Захватываем углы
            const corners = [300, 600, 900, 1200];
            corners.forEach(corner => {
                if (startD < corner && (startD + size) >= corner) {
                    polyPoints.push(getPerimeterPoint(corner));
                }
            });

            // Конечная точка
            polyPoints.push(getPerimeterPoint(endD));

            sectors.push({
                userId: String(bet.userId),
                color: bet.color,
                points: polyPoints,
                bet: bet
            });

            currentPerimeter += size;
        });

        return sectors;
    }

    // Рендеринг сцены
    function drawArena() {
        ctx.clearRect(0,0,300,300);

        if (arenaData.bets.length === 0) {
            // Шахматная клетка (пустое поле)
            ctx.fillStyle = '#121214';
            ctx.fillRect(0,0,300,300);
            ctx.strokeStyle = '#1c1c1f';
            ctx.lineWidth = 1;
            for(let i=0; i<300; i+=30) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 300); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(300, i); ctx.stroke();
            }
            return;
        }

        const sectors = buildPlayerSectors();

        // 1. Отрисовка секторов
        sectors.forEach(sector => {
            ctx.beginPath();
            ctx.moveTo(sector.points[0].x, sector.points[0].y);
            for(let i=1; i<sector.points.length; i++) {
                ctx.lineTo(sector.points[i].x, sector.points[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = sector.color;
            ctx.fill();

            // Если сектор принадлежит текущему игроку, подсвечиваем его белой неоновой обводкой!
            if (String(sector.userId) === String(userId)) {
                ctx.strokeStyle = '#ffffff';
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 10;
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.shadowBlur = 0; // Сбрасываем тень
            }
        });

        // 2. Рисуем аватарки участников в центре полигонов
        sectors.forEach(sector => {
            // Ищем визуальный центр полигона (среднее арифметическое всех точек кроме центра)
            let avgX = 0, avgY = 0;
            const pts = sector.points;
            for(let i=1; i<pts.length; i++) {
                avgX += pts[i].x; avgY += pts[i].y;
            }
            avgX = (avgX / (pts.length - 1) + 150) / 2;
            avgY = (avgY / (pts.length - 1) + 150) / 2;

            ctx.save();
            ctx.beginPath();
            ctx.arc(avgX, avgY, 14, 0, Math.PI*2);
            ctx.clip();
            const img = new Image();
            img.src = sector.bet.avatarUrl || "https://img.icons8.com/color/96/user.png";
            ctx.drawImage(img, avgX-14, avgY-14, 28, 28);
            ctx.restore();

            // Белая каемка вокруг авы
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(avgX, avgY, 14, 0, Math.PI*2);
            ctx.stroke();
        });

        // 3. Стрелка-указатель
        if (arenaData.showArrow) {
            ctx.save();
            ctx.translate(arenaData.ballX, arenaData.ballY);
            ctx.rotate(arenaData.arrowAngle);
            ctx.beginPath();
            ctx.moveTo(0,0);
            ctx.lineTo(25, 0);
            ctx.lineTo(20, -5);
            ctx.moveTo(25, 0);
            ctx.lineTo(20, 5);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3.5;
            ctx.stroke();
            ctx.restore();
        }

        // 4. Отрисовка шарика
        if (arenaData.state === 'running' && !arenaData.showArrow) {
            ctx.beginPath();
            ctx.arc(arenaData.ballX, arenaData.ballY, 8, 0, Math.PI*2);
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(255,255,255,0.8)';
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    // Физическая симуляция полета шарика с постепенным замедлением
    let physicsInterval = null;
    function runBallPhysics() {
        let speed = 11.5;
        let angle = arenaData.ballAngle;
        let vx = speed * Math.cos(angle);
        let vy = speed * Math.sin(angle);
        const friction = 0.985; // Идеальное плавное замедление

        arenaData.showArrow = true;
        arenaData.arrowAngle = 0;

        // Фаза вращения стрелки направления (1.5 сек)
        let rotTime = 0;
        const arrowRotTimer = setInterval(() => {
            arenaData.arrowAngle += 0.25;
            drawArena();
            rotTime += 50;
            if (rotTime >= 1500) {
                clearInterval(arrowRotTimer);
                arenaData.arrowAngle = angle; // Ставим строго по выигрышному направлению
                drawArena();

                // Ждем 1 секунду
                setTimeout(() => {
                    arenaData.showArrow = false;

                    // Запускаем физику движения
                    physicsInterval = setInterval(() => {
                        arenaData.ballX += vx;
                        arenaData.ballY += vy;

                        // Рикошет от краев
                        if (arenaData.ballX < 8) { arenaData.ballX = 8; vx = -vx; }
                        if (arenaData.ballX > 292) { arenaData.ballX = 292; vx = -vx; }
                        if (arenaData.ballY < 8) { arenaData.ballY = 8; vy = -vy; }
                        if (arenaData.ballY > 292) { arenaData.ballY = 292; vy = -vy; }

                        vx *= friction;
                        vy *= friction;
                        speed = Math.sqrt(vx*vx + vy*vy);

                        drawArena();

                        if (speed < 0.08) {
                            clearInterval(physicsInterval);
                            // Шарик замер на 1 секунду перед объявлением результатов
                            setTimeout(() => {
                                triggerWinnerAnnouncement();
                            }, 1000);
                        }
                    }, 1000 / 60);
                }, 1000);
            }
        }, 50);
    }

    // Получаем сектор, в котором сейчас находится точка (x, y)
    function getWinningUser(x, y) {
        const sectors = buildPlayerSectors();
        let winningId = "guest_user_id";

        function isPointInPolygon(px, py, vertices) {
            let collision = false;
            for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
                if (((vertices[i].y > py) !== (vertices[j].y > py)) &&
                    (px < (vertices[j].x - vertices[i].x) * (py - vertices[i].y) / (vertices[j].y - vertices[i].y) + vertices[i].x)) {
                    collision = !collision;
                }
            }
            return collision;
        }

        sectors.forEach(sec => {
            if (isPointInPolygon(x, y, sec.points)) {
                winningId = sec.userId;
            }
        });
        return winningId;
    }

    // Объявляем победителя в кастомной модалке
    function triggerWinnerAnnouncement() {
        if (arenaData.endedTriggered) return;
        arenaData.endedTriggered = true;

        const winUserId = getWinningUser(arenaData.ballX, arenaData.ballY);
        const winPlayer = arenaData.bets.find(b => String(b.userId) === String(winUserId));

        if (winPlayer) {
            const totalBets = arenaData.bets.reduce((sum, b) => sum + parseFloat(b.amount), 0);
            const winChance = ((parseFloat(winPlayer.amount) / totalBets) * 100).toFixed(1);
            
            // Вычисляем чистый выигрыш с комиссией 15%
            const pureWin = totalBets - parseFloat(winPlayer.amount);
            const finalProfit = parseFloat(winPlayer.amount) + (pureWin * 0.85);

            showCustomModal({
                icon: `<img src="${winPlayer.avatarUrl}" style="width:74px;height:74px;border-radius:50%;object-fit:cover;border:2px solid #ff9500;">`,
                title: 'Победитель Арены!',
                message: `👑 Победил: @${winPlayer.username}\n💰 Выигрыш: ${finalProfit.toFixed(2)} GRAM\n🎯 Шанс на победу: ${winChance}%`,
                buttons: [{ text: 'Ура!', primary: true }]
            });
        }
        fetchUserData();
    }

    // ----------------- ИГРОВОЙ ОПРОС СЕРВЕРА (POLLING 1 SEC) -----------------
    async function pollArenaState() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/arena/state`);
            if (!res.ok) return;
            const data = await res.json();

            // Если раунд сменился — сбрасываем локальную анимацию
            if (data.roundId !== arenaData.roundId) {
                arenaData.roundId = data.roundId;
                arenaData.endedTriggered = false;
                arenaData.ballX = 150;
                arenaData.ballY = 150;
                clearInterval(physicsInterval);
            }

            arenaData.state = data.state;
            arenaData.bets = data.bets;
            arenaData.countdownLeft = data.countdownLeft;
            arenaData.ballAngle = data.ballAngle;

            // Рендер статусов
            if (arenaData.state === 'waiting') {
                statusText.innerText = "Ждем ставки...";
                statusText.classList.remove('hidden');
                countdownText.classList.add('hidden');
            } else if (arenaData.state === 'countdown') {
                statusText.classList.add('hidden');
                countdownText.classList.remove('hidden');
                countdownText.innerText = arenaData.countdownLeft;
            } else if (arenaData.state === 'running') {
                statusText.classList.add('hidden');
                countdownText.classList.add('hidden');
                if (arenaData.ballX === 150 && arenaData.ballY === 150) {
                    runBallPhysics();
                }
            } else if (arenaData.state === 'ended') {
                statusText.classList.add('hidden');
                countdownText.classList.add('hidden');
            }

            // Обновляем список участников
            const countLabel = document.getElementById('arena-players-title-count');
            countLabel.innerText = `Игроки · ${arenaData.bets.length}`;

            const totalBets = arenaData.bets.reduce((sum, b) => sum + parseFloat(b.amount), 0);
            const listContainer = document.getElementById('arena-players-list-container');
            listContainer.innerHTML = '';

            arenaData.bets.forEach(b => {
                const chance = ((parseFloat(b.amount) / totalBets) * 100).toFixed(1);
                const row = document.createElement('div');
                row.className = 'arena-player-row';
                row.innerHTML = `
                    <div class="arena-player-info">
                        <img class="arena-player-avatar" src="${b.avatarUrl}" onerror="this.src='https://img.icons8.com/color/96/user.png'">
                        <div>
                            <div class="arena-player-name">@${b.username}</div>
                            <div class="arena-player-bet">Ставка: ${parseFloat(b.amount).toFixed(1)} GRAM</div>
                        </div>
                    </div>
                    <div class="arena-player-chance">${chance}%</div>
                `;
                listContainer.appendChild(row);
            });

            document.getElementById('arena-game-id-text').innerText = `Игра #${arenaData.roundId}`;
            drawArena();

        } catch (e) {
            console.error("Ошибка опроса арены:", e);
        }
    }

    // Делаем ставку
    async function placeArenaBet(amount) {
        if (parseFloat(currentUser.balance || 0) < amount) {
            showNotification("Недостаточно баланса для ставки!", "⚠️");
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/arena/bet`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': tg.initData || ""
                },
                body: JSON.stringify({ amount })
            });

            if (res.ok) {
                showNotification(`Ставка ${amount.toFixed(1)} GRAM успешно принята!`, "🎯");
                fetchUserData();
                pollArenaState();
            } else {
                const err = await res.json();
                showNotification(err.error || "Ошибка принятия ставки", "⚠️");
            }
        } catch (e) {
            showNotification("Ошибка связи с сервером.", "⚠️");
        }
    }

    // Назначаем кнопки ставок
    document.getElementById('arena-bet-1').addEventListener('click', () => placeArenaBet(betValues[0]));
    document.getElementById('arena-bet-2').addEventListener('click', () => placeArenaBet(betValues[1]));
    document.getElementById('arena-bet-3').addEventListener('click', () => placeArenaBet(betValues[2]));

    // Запуск цикла опроса сервера игры (раз в 1 секунду)
    setInterval(pollArenaState, 1000);

    // Переходы между вкладками
    document.getElementById('arena-banner-btn').addEventListener('click', () => {
        navigateTo('arena');
    });

    document.getElementById('arena-back-home').addEventListener('click', () => {
        navigateTo('home');
    });

    // --- СТАРЫЙ ФУНКЦИОНАЛ ПРИЛОЖЕНИЯ (НАВИГАЦИЯ, КЕЙСЫ, ИНВЕНТАРЬ) ---
    const GIFT_POOL = [
        { id: 1, name: "Статуя птицы серая", icon: "/Images/Items/rare_bird.jpg", price: "20 GRAM", rawPrice: 20.0, isGold: true, type: "gift" },
        { id: 2, name: "Тыква", icon: "/Images/Items/pumpkin.jpg", price: "8 GRAM", rawPrice: 8.0, isGold: true, type: "gift" },
        { id: 3, name: "Шляпа", icon: "/Images/Items/hat.jpg", price: "7 GRAM", rawPrice: 7.0, isGold: true, type: "gift" },
        { id: 4, name: "Собачка Snoop Dogg", icon: "/Images/Items/snoopdog.jpg", price: "4 GRAM", rawPrice: 4.0, isGold: false, type: "gift" },
        { id: 5, name: "Рюкзак черный", icon: "/Images/Items/pack.jpg", price: "3 GRAM", rawPrice: 3.0, isGold: false, type: "gift" },
        { id: 6, name: "Доширак лапша", icon: "/Images/Items/ramen.jpg", price: "2.7 GRAM", rawPrice: 2.7, isGold: false, type: "gift" },
        { id: 7, name: "Факел", icon: "/Images/Items/chill_flame.jpg", price: "2.5 GRAM", rawPrice: 2.5, isGold: false, type: "gift" },
        { id: 8, name: "Мороженое пломбир", icon: "/Images/Items/plombir.jpg", price: "2.5 GRAM", rawPrice: 2.5, isGold: false, type: "gift" },
        { id: 9, name: "Алмазик", icon: "/Images/Items/almaz.jpg", price: "0.9 GRAM", rawPrice: 0.9, isGold: false, type: "gift" },
        { id: 10, name: "Роза", icon: "/Images/Items/roza.jpg", price: "0.27 GRAM", rawPrice: 0.27, isGold: false, type: "gift" },
        { id: 11, name: "Пополнение 0.1 GRAM", icon: GRAMCOIN_ICON_URL, price: "0.1 GRAM", rawPrice: 0.1, isGold: false, type: "balance" },
        { id: 12, name: "Пополнение 0.07 GRAM", icon: GRAMCOIN_ICON_URL, price: "0.07 GRAM", rawPrice: 0.07, isGold: false, type: "balance" },
        { id: 13, name: "Пополнение 0.05 GRAM", icon: GRAMCOIN_ICON_URL, price: "0.05 GRAM", rawPrice: 0.05, isGold: false, type: "balance" },
        { id: 14, name: "Пополнение 0.03 GRAM", icon: GRAMCOIN_ICON_URL, price: "0.03 GRAM", rawPrice: 0.03, isGold: false, type: "balance" }
    ];

    const NEWBIE_GIFT_POOL = [
        { id: 101, name: "Розовый мишка", icon: "/Images/Items/bearpink.png", price: "29 GRAM", rawPrice: 29.0, isGold: true, type: "gift" },
        { id: 102, name: "Шлем Неко", icon: "/Images/Items/Neko_helmet.png", price: "26.8 GRAM", rawPrice: 26.8, isGold: true, type: "gift" },
        { id: 103, name: "Перстень печатка", icon: "/Images/Items/signet_ring.png", price: "25.7 GRAM", rawPrice: 25.7, isGold: true, type: "gift" },
        { id: 104, name: "Папаха", icon: "/Images/Items/papakha.png", price: "18.5 GRAM", rawPrice: 18.5, isGold: true, type: "gift" },
        { id: 105, name: "Амулет Купидона", icon: "/Images/Items/cupid_charm.png", price: "15 GRAM", rawPrice: 15.0, isGold: true, type: "gift" },
        { id: 106, name: "Любовное зелье", icon: "/Images/Items/love_potion.png", price: "10 GRAM", rawPrice: 10.0, isGold: false, type: "gift" },
        { id: 107, name: "UFC Бокс", icon: "/Images/Items/UFC_box.png", price: "9.9 GRAM", rawPrice: 9.9, isGold: false, type: "gift" },
        { id: 108, name: "Всевидящее око", icon: "/Images/Items/eye.png", price: "5 GRAM", rawPrice: 5.0, isGold: false, type: "gift" },
        { id: 109, name: "Холодный огонь", icon: "/Images/Items/chill_flame.jpg", price: "2.2 GRAM", rawPrice: 2.2, isGold: false, type: "gift" },
        { id: 110, name: "Вкусный пломбир", icon: "/Images/Items/plombir.jpg", price: "2.2 GRAM", rawPrice: 2.2, isGold: false, type: "gift" },
        { id: 111, name: "Прекрасная роза", icon: "/Images/Items/roza.jpg", price: "0.2 GRAM", rawPrice: 0.2, isGold: false, type: "gift" },
        { id: 112, name: "Мишка классический", icon: "/Images/Items/michka.jpg", price: "0.11 GRAM", rawPrice: 0.11, isGold: false, type: "gift" },
        { id: 113, name: "Пополнение 0.1 GRAM (Новичок)", icon: GRAMCOIN_ICON_URL, price: "0.1 GRAM", rawPrice: 0.1, isGold: false, type: "balance" },
        { id: 114, name: "Пополнение 0.07 GRAM (Новичок)", icon: GRAMCOIN_ICON_URL, price: "0.07 GRAM", rawPrice: 0.07, isGold: false, type: "balance" },
        { id: 115, name: "Пополнение 0.05 GRAM (Новичок)", icon: GRAMCOIN_ICON_URL, price: "0.05 GRAM", rawPrice: 0.05, isGold: false, type: "balance" },
        { id: 116, name: "Пополнение 0.03 GRAM (Новичок)", icon: GRAMCOIN_ICON_URL, price: "0.03 GRAM", rawPrice: 0.03, isGold: false, type: "balance" },
        { id: 117, name: "Пополнение 0.01 GRAM (Новичок)", icon: GRAMCOIN_ICON_URL, price: "0.01 GRAM", rawPrice: 0.01, isGold: false, type: "balance" },
        { id: 118, name: "Пополнение 0.005 GRAM (Новичок)", icon: GRAMCOIN_ICON_URL, price: "0.005 GRAM", rawPrice: 0.005, isGold: false, type: "balance" }
    ];

    function navigateTo(target) {
        const sections = [
            elements.homeSection, elements.caseSection, elements.inventorySection, 
            elements.ratingSection, elements.balanceSection, document.getElementById('arena-section')
        ];
        sections.forEach(s => { if (s) s.classList.add('hidden'); });
        
        elements.bottomNavigation.classList.remove('hidden');

        if (target === 'home') {
            elements.homeSection.classList.remove('hidden');
            setActiveTab('home');
        } else if (target === 'inventory') {
            elements.inventorySection.classList.remove('hidden');
            setActiveTab('inventory');
            fetchInventory(); 
            initDepositSelect();
        } else if (target === 'rating') {
            elements.ratingSection.classList.remove('hidden');
            setActiveTab('rating');
        } else if (target === 'balance') {
            elements.balanceSection.classList.remove('hidden');
            elements.navTabs.forEach(tab => tab.classList.remove('active'));
        } else if (target === 'case') { 
            elements.caseSection.classList.remove('hidden');
            elements.bottomNavigation.classList.add('hidden'); 
            initRouletteTrack();
        } else if (target === 'arena') {
            document.getElementById('arena-section').classList.remove('hidden');
            elements.bottomNavigation.classList.add('hidden');
        }
    }

    function setActiveTab(targetId) {
        elements.navTabs.forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-target') === targetId);
        });
    }

    elements.navTabs.forEach(tab => {
        tab.addEventListener('click', () => navigateTo(tab.getAttribute('data-target')));
    });

    const backFromBal = document.getElementById('back-to-home-from-balance');
    if (backFromBal) {
        backFromBal.addEventListener('click', () => navigateTo('home'));
    }

    elements.dailyCaseBanner.addEventListener('click', () => {
        isNewbieCaseMode = false;
        elements.rewardsSectionContainer.classList.remove('hidden');
        elements.casePageMainTitle.innerText = "Ежедневный кейс";
        elements.rewardsGridTitle.innerText = "Ежедневные награды";
        elements.spinBtn.innerText = "Запустить";
        renderRewardsGrid();
        updateDailyCaseTimer(); 
        navigateTo('case');
    });

    elements.newbieCaseBanner.addEventListener('click', () => {
        isNewbieCaseMode = true;
        elements.rewardsSectionContainer.classList.remove('hidden'); 
        elements.casePageMainTitle.innerText = "Кейс новичка";
        elements.rewardsGridTitle.innerText = "Содержимое кейса";
        elements.spinBtn.innerText = "Открыть (0.1 GRAM)";
        renderRewardsGrid();
        updateDailyCaseTimer(); 
        navigateTo('case');
    });

    elements.bomzhCaseBanner.addEventListener('click', () => { showNotification("Кейс бомжа скоро появится в игре!", "🎒"); });
    elements.krutoyCaseBanner.addEventListener('click', () => { showNotification("Кейс крутого в разработке!", "😎"); });

    const backToHome = document.getElementById('back-to-home-button');
    if (backToHome) {
        backToHome.addEventListener('click', () => navigateTo('home'));
    }

    function initDepositSelect() {
        const select = document.getElementById('deposit-item-select');
        if (!select) return;
        select.innerHTML = '';
        const uniqueGifts = [];
        const map = new Map();
        for (const item of [...GIFT_POOL, ...NEWBIE_GIFT_POOL]) {
            if (item.type === 'gift' && !map.has(item.name)) {
                map.set(item.name, true);
                uniqueGifts.push(item);
            }
        }
        uniqueGifts.forEach(gift => {
            const option = document.createElement('option');
            option.value = gift.id;
            option.innerText = `${formatItemName(gift.name)} (${gift.price})`;
            select.appendChild(option);
        });
    }

    const confirmDepositBtn = document.getElementById('deposit-confirm-button');
    if (confirmDepositBtn) {
        confirmDepositBtn.addEventListener('click', async () => {
            const select = document.getElementById('deposit-item-select');
            const itemId = select.value;
            const allPools = [...GIFT_POOL, ...NEWBIE_GIFT_POOL];
            const selectedGift = allPools.find(g => g.id == itemId);

            showCustomModal({
                icon: `<img src="${selectedGift.icon}" style="width:70px;height:70px;object-fit:contain;" onerror="this.src='https://img.icons8.com/color/96/gift.png'">`,
                title: 'Подтвердить передачу?',
                message: `Вы действительно отправили подарок "${formatItemName(selectedGift.name)}" на аккаунт @Sintopa в Telegram?\n\nАдминистратор проверит отправку и зачислит его.`,
                buttons: [
                    {
                        text: 'Да, подтверждаю',
                        primary: true,
                        onClick: async () => {
                            try {
                                const res = await fetch(`${API_BASE_URL}/api/deposit_gift_request`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'X-Telegram-Init-Data': tg.initData || ""
                                    },
                                    body: JSON.stringify({ itemId: itemId })
                                });
                                if (res.ok) {
                                    showNotification(`Заявка на ввод "${formatItemName(selectedGift.name)}" отправлена!`, '📥');
                                } else {
                                    const errorData = await res.json();
                                    showNotification(errorData.error || 'Не удалось отправить заявку.', '⚠️');
                                }
                            } catch (err) {
                                showNotification('Ошибка связи с сервером.', '⚠️');
                            }
                        }
                    },
                    { text: 'Отмена', primary: false }
                ]
            });
        });
    }

    function renderRewardsGrid() {
        elements.rewardsGrid.innerHTML = '';
        const currentPool = isNewbieCaseMode ? NEWBIE_GIFT_POOL : GIFT_POOL;
        currentPool.forEach(gift => {
            const card = document.createElement('div');
            card.className = `reward-card ${gift.isGold ? 'gold-tier' : ''}`;
            const randomBadge = gift.type === 'gift' ? '<div class="reward-random-badge">random</div>' : '';
            card.innerHTML = `
                <div class="reward-price-top">${gift.price}</div>
                <img src="${gift.icon}" alt="${formatItemName(gift.name)}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                <div style="margin-bottom: 8px;"></div>
                ${randomBadge}
            `;
            elements.rewardsGrid.appendChild(card);
        });
    }

    async function fetchUserData() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/user`, { 
                headers: { 'X-Telegram-Init-Data': tg.initData || "" }
            });
            if (!res.ok) throw new Error();
            currentUser = await res.json();
        } catch (e) {
            console.error("Ошибка загрузки пользовательских данных:", e);
            currentUser = {
                balance: 0.000,
                username: tg.initDataUnsafe?.user?.username || "Пользователь",
                first_name: tg.initDataUnsafe?.user?.first_name || "Пользователь",
                avatar_url: "https://img.icons8.com/color/96/user.png",
                is_admin: false
            };
        }

        updateBalanceUI();
        const avUrls = currentUser.avatar_url || "https://img.icons8.com/color/96/user.png";
        ['user-avatar', 'inv-user-avatar'].forEach(id => {
            const img = document.getElementById(id);
            if (img) {
                img.src = avUrls;
                img.onerror = () => { img.src = "https://img.icons8.com/color/96/user.png"; };
            }
        });
        const rawName = currentUser.username || currentUser.first_name || "Пользователь";
        const truncatedName = formatUsername(rawName);
        const uNode = document.getElementById('user-username');
        if (uNode) uNode.innerText = truncatedName;
        const iNode = document.getElementById('inv-user-username');
        if (iNode) iNode.innerText = truncatedName;
        updateDailyCaseTimer();
    }

    function updateBalanceUI(forcedValue = null) {
        const val = forcedValue !== null ? parseFloat(forcedValue) : parseFloat(currentUser.balance || 0);
        const balVal = val.toFixed(3);
        if (elements.balanceDisplayPill) elements.balanceDisplayPill.innerText = balVal;
        if (elements.largeBalanceDisplay) elements.largeBalanceDisplay.innerText = balVal;
    }

    let dailyCaseTimerInterval;
    function updateDailyCaseTimer() {
        clearInterval(dailyCaseTimerInterval); 
        if (isNewbieCaseMode) {
            elements.spinBtn.classList.remove('hidden');
            elements.spinBtn.disabled = false;
            document.getElementById('timer-container').classList.add('hidden');
            return;
        }
        if (currentUser.is_admin || !currentUser.last_daily_case_open) {
            elements.spinBtn.classList.remove('hidden');
            elements.spinBtn.disabled = false;
            document.getElementById('timer-container').classList.add('hidden');
            return;
        }
        const lastOpen = new Date(currentUser.last_daily_case_open);
        const now = new Date();
        const cooldown = 24 * 60 * 60 * 1000; 
        const nextOpenTime = new Date(lastOpen.getTime() + cooldown);
        const timeLeftMs = nextOpenTime.getTime() - now.getTime();

        if (timeLeftMs <= 0) {
            elements.spinBtn.classList.remove('hidden');
            elements.spinBtn.disabled = false;
            document.getElementById('timer-container').classList.add('hidden');
        } else {
            elements.spinBtn.classList.add('hidden');
            elements.spinBtn.disabled = true;
            document.getElementById('timer-container').classList.remove('hidden');
            const tick = () => {
                const nowTick = new Date();
                const diff = nextOpenTime.getTime() - nowTick.getTime();
                if (diff <= 0) {
                    clearInterval(dailyCaseTimerInterval);
                    updateDailyCaseTimer();
                    return;
                }
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                document.getElementById('daily-case-timer').innerText = `${hours}ч ${minutes}м ${seconds}с`;
            };
            tick();
            dailyCaseTimerInterval = setInterval(tick, 1000); 
        }
    }

    async function fetchInventory() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/inventory`, { 
                headers: { 'X-Telegram-Init-Data': tg.initData || "" }
            });
            if (!res.ok) throw new Error();
            const items = await res.json();
            elements.inventoryGrid.innerHTML = '';
            
            if (items.length === 0) {
                elements.inventoryGrid.innerHTML = `
                    <div class="empty-inventory">
                        🎒 Ваш инвентарь пуст.<br>Открывайте кейсы и выигрывайте призы!
                    </div>`;
                return;
            }

            items.forEach(item => {
                const matchedItem = GIFT_POOL.find(g => g.name.toLowerCase() === item.name.toLowerCase()) || 
                                    NEWBIE_GIFT_POOL.find(g => g.name.toLowerCase() === item.name.toLowerCase()) || {};
                const imageSrc = matchedItem.icon || item.image_url;

                const card = document.createElement('div');
                card.className = 'reward-card';
                card.innerHTML = `
                    <div class="reward-price-top">${parseFloat(item.value).toFixed(2)} GRAM</div>
                    <img src="${imageSrc}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                    <div class="reward-name">${formatItemName(item.name)}</div>
                    <div class="inv-actions">
                        <button class="inv-btn withdraw-btn">Вывести</button>
                        <button class="inv-btn sell-btn">Продать</button>
                    </div>
                `;

                card.querySelector('.withdraw-btn').addEventListener('click', () => {
                    showCustomModal({
                        icon: `<img src="${imageSrc}" style="width:70px;height:70px;object-fit:contain;" onerror="this.src='https://img.icons8.com/color/96/gift.png'">`,
                        title: 'Вывод подарка',
                        message: `Отправить "${formatItemName(item.name)}" вам в Telegram? Он пропадет из вашего инвентаря.`,
                        buttons: [
                            {
                                text: 'Подтвердить вывод',
                                primary: true,
                                onClick: async () => {
                                    try {
                                        const withdrawRes = await fetch(`${API_BASE_URL}/api/withdraw_gift`, {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'X-Telegram-Init-Data': tg.initData || ""
                                            },
                                            body: JSON.stringify({ itemId: item.item_id })
                                        });
                                        if (withdrawRes.ok) {
                                            showNotification(`Подарок "${formatItemName(item.name)}" в очереди на вывод!`, '📥');
                                            fetchInventory(); 
                                        } else {
                                            const errorData = await withdrawRes.json();
                                            showNotification(errorData.error || 'Заявка отклонена.', '⚠️');
                                        }
                                    } catch (err) {
                                        showNotification('Ошибка сети.', '⚠️');
                                    }
                                }
                            },
                            { text: 'Отмена', primary: false }
                        ]
                    });
                });

                card.querySelector('.sell-btn').addEventListener('click', () => {
                    showCustomModal({
                        icon: '💰',
                        title: 'Продажа подарка',
                        message: `Вы действительно хотите продать подарок "${formatItemName(item.name)}" за ${item.value} GRAM?`,
                        buttons: [
                            {
                                text: 'Продать за GRAM',
                                primary: true,
                                onClick: async () => {
                                    try {
                                        const sellRes = await fetch(`${API_BASE_URL}/api/sell_gift`, {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'X-Telegram-Init-Data': tg.initData || ""
                                            },
                                            body: JSON.stringify({ itemId: item.item_id, price: item.value })
                                        });
                                        if (sellRes.ok) {
                                            const sellData = await sellRes.json();
                                            currentUser.balance = sellData.newBalance;
                                            showNotification(`Подарок успешно продан!`, '💰');
                                            fetchUserData();
                                            fetchInventory();
                                        }
                                    } catch (err) {}
                                }
                            },
                            { text: 'Отмена', primary: false }
                        ]
                    });
                });

                elements.inventoryGrid.appendChild(card);
            });
        } catch (error) {}
    }

    function initRouletteTrack() {
        elements.rouletteTrack.style.transition = 'none';
        elements.rouletteTrack.style.transform = 'translateX(0px)';
        void elements.rouletteTrack.offsetWidth; 
        elements.rouletteTrack.innerHTML = '';
        const currentPool = isNewbieCaseMode ? NEWBIE_GIFT_POOL : GIFT_POOL;
        for (let i = 0; i < 50; i++) {
            const randomItem = currentPool[Math.floor(Math.random() * currentPool.length)];
            const itemEl = document.createElement('div');
            itemEl.className = 'roulette-item';
            itemEl.innerHTML = `
                <img src="${randomItem.icon}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                <span>${randomItem.price}</span>
            `;
            elements.rouletteTrack.appendChild(itemEl);
        }
    }

    function spinRoulette(winningItem, onComplete) {
        const itemWidth = 96; 
        const gap = 8; 
        const itemFullWidth = itemWidth + gap; 
        const targetIndex = 35; 
        const trackItems = elements.rouletteTrack.children;
        if (trackItems[targetIndex]) {
            trackItems[targetIndex].className = 'roulette-item';
            trackItems[targetIndex].innerHTML = `
                <img src="${winningItem.icon}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                <span>${winningItem.price}</span>
            `;
        }
        const containerWidth = elements.rouletteTrack.parentElement.offsetWidth;
        const centerOffset = (containerWidth / 2) - (itemWidth / 2);
        const totalTranslate = (targetIndex * itemFullWidth) - centerOffset;
        elements.rouletteTrack.style.transition = 'transform 5s cubic-bezier(0.15, 0.85, 0.15, 1)';
        elements.rouletteTrack.style.transform = `translateX(-${totalTranslate}px)`;
        setTimeout(() => { onComplete(); }, 5100);
    }

    function processWinning(winningGift, apiNewBalance = null) {
        const isBalance = winningGift.type === "balance" || winningGift.name.toLowerCase().includes("пополнение");
        if (apiNewBalance !== null) {
            currentUser.balance = apiNewBalance;
            updateBalanceUI();
        }
        if (isNewbieCaseMode) elements.spinBtn.disabled = false;

        if (isBalance) {
            showCustomModal({
                icon: '💰',
                title: 'Баланс пополнен!',
                message: `🎉 Вы выиграли пополнение счета на +${winningGift.price}!`,
                buttons: [{ text: 'Отлично!', primary: true }]
            });
            fetchUserData();
            if (!isNewbieCaseMode) elements.spinBtn.disabled = false;
        } else { 
            showCustomModal({
                icon: `<img src="${winningGift.icon}" style="width:70px;height:70px;object-fit:contain;" onerror="this.src='https://img.icons8.com/color/96/gift.png'">`,
                title: 'Вы выиграли подарок!',
                message: `🎁 Ваша награда: "${formatItemName(winningGift.name)}"`,
                buttons: [
                    {
                        text: `Продать за ${winningGift.price}`,
                        primary: true,
                        onClick: async () => {
                            try {
                                const sellRes = await fetch(`${API_BASE_URL}/api/sell_gift`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg.initData || "" },
                                    body: JSON.stringify({ itemId: winningGift.id, price: winningGift.rawPrice })
                                });
                                if (sellRes.ok) {
                                    const sellData = await sellRes.json();
                                    currentUser.balance = sellData.newBalance;
                                    showNotification("Продано!", "💰");
                                    fetchUserData();
                                }
                            } catch (e) {}
                        }
                    },
                    {
                        text: 'В инвентарь',
                        primary: false,
                        onClick: () => {
                            showNotification(`📦 Сохранено!`, '🎒');
                            fetchUserData();
                        }
                    }
                ]
            });
            if (!isNewbieCaseMode) elements.spinBtn.disabled = false;
        }
    }

    elements.spinBtn.addEventListener('click', async () => {
        const spinCost = 0.1;
        if (isNewbieCaseMode && parseFloat(currentUser.balance || 0) < spinCost) {
            showNotification('Недостаточно баланса! (0.1 GRAM)', '⚠️');
            return;
        }
        elements.spinBtn.disabled = true;
        if (isNewbieCaseMode) {
            updateBalanceUI(Math.max(0, parseFloat(currentUser.balance || 0) - spinCost));
        }
        initRouletteTrack();

        setTimeout(async () => {
            try {
                const endpoint = isNewbieCaseMode ? `${API_BASE_URL}/api/open_newbie_case` : `${API_BASE_URL}/api/open_daily_case`;
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'X-Telegram-Init-Data': tg.initData || "" }
                });
                const data = await response.json();

                if (response.ok) {
                    const currentPool = isNewbieCaseMode ? NEWBIE_GIFT_POOL : GIFT_POOL;
                    let winningGift = currentPool.find(g => g.id === data.wonItem.id);
                    if (!winningGift) winningGift = currentPool.find(g => g.name.toLowerCase() === data.wonItem.name.toLowerCase());
                    
                    spinRoulette(winningGift, () => { processWinning(winningGift, data.newBalance); });
                } else {
                    fetchUserData(); 
                    if (data.error && data.error.includes('подписчиком канала')) {
                        const infoRes = await fetch(`${API_BASE_URL}/api/daily_case_info`, { headers: { 'X-Telegram-Init-Data': tg.initData || "" } });
                        const infoData = await infoRes.json();
                        showCustomModal({
                            icon: '📢',
                            title: 'Нужна подписка',
                            message: 'Пожалуйста, подпишитесь на канал!',
                            buttons: [{ text: 'Подписаться', primary: true, onClick: () => { tg.openLink(`https://t.me/${infoData.channel_username}`); elements.spinBtn.disabled = false; } }],
                            onClose: () => { elements.spinBtn.disabled = false; }
                        });
                    } else {
                        showNotification(data.error || 'Ошибка.', '⚠️');
                        elements.spinBtn.disabled = false;
                    }
                }
            } catch (error) {
                fetchUserData(); elements.spinBtn.disabled = false;
            }
        }, 50);
    });

    renderRewardsGrid();
    fetchUserData(); 
    navigateTo('home'); 
});

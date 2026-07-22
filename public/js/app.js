const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : {
    expand: () => {}, ready: () => {}, initData: "", initDataUnsafe: { user: { id: "guest_user_id", username: "Пользователь", first_name: "Пользователь" } },
    openLink: (url) => window.open(url, '_blank'), openTelegramLink: (url) => window.open(url, '_blank')
};

tg.expand();
tg.ready();

(function injectStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
        .arena-player-avatar-node { position: absolute !important; transform: translate(-50%, -50%) !important; border-radius: 50% !important; border: 2px solid #ffffff !important; box-shadow: 0 0 8px rgba(0,0,0,0.8) !important; object-fit: cover !important; pointer-events: none !important; z-index: 5 !important; }
        #arena-svg-canvas, #arena-ball-svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 16px; overflow: hidden; background: #110e25 !important; }
        #physics-ball { fill: #ffffff !important; r: 8 !important; filter: drop-shadow(0 0 12px #ffffff) !important; }
        @keyframes winningSectorPulse { 0% { filter: drop-shadow(0 0 15px var(--glow-color)) brightness(1.2); stroke: #ffffff; stroke-width: 4px; } 50% { filter: drop-shadow(0 0 35px var(--glow-color)) brightness(1.7); stroke: #ffffff; stroke-width: 8px; } 100% { filter: drop-shadow(0 0 15px var(--glow-color)) brightness(1.2); stroke: #ffffff; stroke-width: 4px; } }
        .winning-segment-glow { stroke: #ffffff !important; stroke-width: 6px !important; stroke-linejoin: round !important; animation: winningSectorPulse 0.35s infinite alternate !important; z-index: 100 !important; }
    `;
    document.head.appendChild(style);
})();

let localGuestId = localStorage.getItem('mock_guest_id');
if (!localGuestId) {
    localGuestId = 'guest_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('mock_guest_id', localGuestId);
}

let initDataHeader = tg.initData || "";
if (!initDataHeader) {
    const mockUser = { id: localGuestId, username: "Игрок_" + localGuestId.substring(6), first_name: "Игрок", photo_url: "https://img.icons8.com/color/96/user.png" };
    initDataHeader = "user=" + encodeURIComponent(JSON.stringify(mockUser));
}

function formatUsername(name) { return name ? (name.length > 15 ? name.substring(0, 15) + "..." : name) : "Пользователь"; }
function formatItemName(name) { return name ? name.replace(/\.(png|jpg|jpeg)$/i, '').replace(/_/g, ' ').trim() : ""; }
function formatWalletAddress(rawAddress) {
    if (!rawAddress) return "";
    try { if (typeof TON_CONNECT_UI !== 'undefined' && TON_CONNECT_UI.toUserFriendlyAddress) { const friendly = TON_CONNECT_UI.toUserFriendlyAddress(rawAddress); return friendly.substring(0, 4) + "-..." + friendly.substring(friendly.length - 4); } } catch(e) {}
    return rawAddress.substring(0, 4) + "-..." + rawAddress.substring(rawAddress.length - 4);
}

async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 10000 } = options; const controller = new AbortController(); const id = setTimeout(() => controller.abort(), timeout);
    try { const response = await fetch(resource, { ...options, signal: controller.signal }); clearTimeout(id); return response; } catch (e) { clearTimeout(id); throw e; }
}

function triggerBalanceBadge(amount) {
    const container = document.getElementById('balance-badge-container'); if (!container) return;
    const badge = document.createElement('div'); const isNegative = amount < 0;
    badge.className = `balance-popup-badge ${isNegative ? 'negative' : 'positive'}`;
    badge.innerText = (isNegative ? '' : '+') + amount.toFixed(3);
    container.appendChild(badge); setTimeout(() => badge.remove(), 2500);
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const API_BASE_URL = window.location.origin;
        let currentUser = {};
        let isNewbieCaseMode = false;
        const GRAMCOIN_ICON_URL = "/Images/Items/gram_popolnenie.png";

        let customBets = [0.1, 1.0, 5.0];
        let arenaPlayers = [];
        let isPollingActive = false;
        let isBallAnimating = false;
        let arenaStatusStr = "waiting";
        let currentRoundData = {};

        let countdownIntervalId = null;
        let localCountdownValue = 0;

        const safeSetText = (el, val) => { if (el) el.innerText = val; };

        let userId = tg.initDataUnsafe?.user?.id;
        if (!userId) {
            try { const params = new URLSearchParams(initDataHeader); const userRaw = params.get('user'); if (userRaw) userId = JSON.parse(userRaw).id; } catch (e) {}
        }
        if (!userId) userId = localGuestId;

        const elements = {
            homeSection: document.getElementById('home-section'), caseSection: document.getElementById('case-section'), inventorySection: document.getElementById('inventory-section'), ratingSection: document.getElementById('rating-section'), balanceSection: document.getElementById('balance-section'), arenaSection: document.getElementById('arena-section'), rouletteTrack: document.getElementById('roulette-track'), spinBtn: document.getElementById('spin-case-button'), balanceDisplayPill: document.getElementById('user-balance-pill-value'), largeBalanceDisplay: document.getElementById('large-balance-value'), rewardsGrid: document.getElementById('rewards-grid'), inventoryGrid: document.getElementById('inventory-grid'), bottomNavigation: document.querySelector('.floating-nav-container'), navTabs: document.querySelectorAll('.nav-tab'), dailyCaseBanner: document.getElementById('daily-case-banner'), newbieCaseBanner: document.getElementById('newbie-case-banner'), rewardsSectionContainer: document.getElementById('rewards-section-container'), rewardsGridTitle: document.getElementById('rewards-grid-title'), casePageMainTitle: document.getElementById('case-page-main-title'), connectWalletBtn: document.getElementById('connect-wallet-btn'), depositBalanceBtn: document.getElementById('deposit-balance-btn'), depositNoticeText: document.getElementById('deposit-notice-text'), depositAmountModal: document.getElementById('deposit-amount-modal'), depositModalCloseBtn: document.getElementById('deposit-modal-close-btn'), modalDepositInput: document.getElementById('modal-deposit-input'), modalDepositConfirmBtn: document.getElementById('modal-deposit-confirm-btn'), modalDepositCancelBtn: document.getElementById('modal-deposit-cancel-btn'), adminTgChatTrigger: document.getElementById('admin-tg-chat-trigger'), arenaRoundNumber: document.getElementById('arena-round-number'), arenaPlayersTotal: document.getElementById('arena-players-total'), bannedOverlay: document.getElementById('banned-screen')
        };

        function showBannedScreen() {
            if (elements.bannedOverlay) elements.bannedOverlay.classList.remove('hidden');
            stopArenaPolling();
            if (elements.bottomNavigation) elements.bottomNavigation.classList.add('hidden');
            document.querySelectorAll('.app-section').forEach(s => s.classList.add('hidden'));
        }

        // ===================== АРЕНА: ГЕОМЕТРИЯ И ДВИЖЕНИЕ =====================
        
        // Генерация точек пересечения с квадратом
        function getSquareIntersection(angle, cx, cy, size) {
            const half = size / 2;
            const tan = Math.tan(angle);
            // Нижняя грань
            if (angle >= 0 && angle < Math.PI / 2) return { x: cx + half, y: cy + half * tan };
            // Правая грань
            if (angle >= Math.PI / 2 && angle < Math.PI) return { x: cx - half / tan, y: cy + half };
            // Верхняя грань
            if (angle >= Math.PI && angle < 3 * Math.PI / 2) return { x: cx - half, y: cy - half * tan };
            // Левая грань
            return { x: cx + half / tan, y: cy - half };
        }

        // Алгоритм отрисовки поля (ИДЕАЛЬНОЕ ДЕЛЕНИЕ ПО ДИАГОНАЛИ)
        function drawArenaSegments() {
            const svg = document.getElementById('arena-svg-canvas');
            const avatarsContainer = document.getElementById('arena-avatars-container');
            if (!svg || !avatarsContainer) return;
            svg.innerHTML = ''; avatarsContainer.innerHTML = '';

            const N = arenaPlayers.length;
            if (N === 0) {
                const statusText = document.getElementById('arena-status-text');
                if (statusText) { statusText.classList.remove('hidden'); statusText.innerText = "Ждем ставки..."; }
                return;
            }

            const W = 320, H = 320, CX = W / 2, CY = H / 2;
            let totalBet = 0;
            arenaPlayers.forEach(p => totalBet += parseFloat(p.bet || 0));

            if (N === 1) {
                const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                rect.setAttribute("x", "0"); rect.setAttribute("y", "0"); rect.setAttribute("width", "100%"); rect.setAttribute("height", "100%");
                rect.setAttribute("fill", arenaPlayers[0].color || '#ff3b30');
                svg.appendChild(rect);
                createAvatarElement(CX, CY + 30, arenaPlayers[0].avatar, 48);
                return;
            }

            // Сортировка игроков по сумме ставки (от большего к меньшему) для красивой диагонали
            const sortedPlayers = [...arenaPlayers].sort((a, b) => parseFloat(b.bet) - parseFloat(a.bet));
            
            let currentAngle = -Math.PI / 2; // Начинаем с верхней точки
            const corners = [0, Math.PI/2, Math.PI, 3*Math.PI/2].map(a => a < 0 ? a + 2*Math.PI : a);

            sortedPlayers.forEach((player, index) => {
                const share = totalBet > 0 ? parseFloat(player.bet || 0) / totalBet : (1 / N);
                let nextAngle = currentAngle + 2 * Math.PI * share;

                const pathPoints = [{ x: CX, y: CY }];
                pathPoints.push(getSquareIntersection(currentAngle, CX, CY, W));

                let normalizedCurrent = (currentAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                let normalizedNext = (nextAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                if (nextAngle > currentAngle && normalizedNext < normalizedCurrent) normalizedNext += 2 * Math.PI;

                const crossedCorners = [];
                corners.forEach(cAngle => {
                    let normalizedCAngle = (cAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                    if (normalizedCAngle < normalizedCurrent && nextAngle > currentAngle) normalizedCAngle += 2 * Math.PI;
                    if (normalizedCAngle > normalizedCurrent && normalizedCAngle < normalizedNext) crossedCorners.push(cAngle);
                });
                crossedCorners.sort((a, b) => a - b);
                crossedCorners.forEach(cAngle => pathPoints.push(getSquareIntersection(cAngle, CX, CY, W)));
                pathPoints.push(getSquareIntersection(nextAngle, CX, CY, W));

                const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                poly.setAttribute("points", pathPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
                poly.setAttribute("fill", player.color || '#0088cc');
                poly.setAttribute("stroke", "rgba(255, 255, 255, 0.2)"); poly.setAttribute("stroke-width", "2");
                poly.setAttribute("data-user-id", player.userId);
                svg.appendChild(poly);

                // Расчет центра масс для аватарки
                let sumX = 0, sumY = 0, count = 0;
                pathPoints.forEach(p => { sumX += p.x; sumY += p.y; count++; });
                const avgX = Math.max(50, Math.min(270, sumX / count));
                const avgY = Math.max(50, Math.min(270, sumY / count));

                createAvatarElement(avgX, avgY, player.avatar, 36);
                currentAngle = nextAngle;
            });
            
            // Скрыть надпись "Ждем ставки..." при наличии игроков
            const statusText = document.getElementById('arena-status-text');
            if (statusText) statusText.classList.add('hidden');
        }

        function createAvatarElement(x, y, src, size) {
            const container = document.getElementById('arena-avatars-container');
            if (!container) return;
            const img = document.createElement('img');
            img.className = 'arena-player-avatar-node';
            img.src = src;
            img.style.left = `${x}px`; img.style.top = `${y}px`;
            img.style.width = `${size}px`; img.style.height = `${size}px`;
            img.onerror = () => { img.src = "https://img.icons8.com/color/96/user.png"; };
            container.appendChild(img);
        }

        // ===================== ФИЗИКА ШАРИКА =====================
        function simulateAndAnimateBall(targetX, targetY, onComplete) {
            if (isBallAnimating) return;
            isBallAnimating = true;

            const W = 320, H = 320;
            const canvas = document.getElementById('arena-ball-svg');
            canvas.innerHTML = '';

            // Создаем шарик
            const ball = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            ball.setAttribute("id", "physics-ball");
            ball.setAttribute("r", "8");
            ball.setAttribute("fill", "#ffffff");
            canvas.appendChild(ball);

            // Создаем текст победителя
            const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
            textEl.setAttribute("fill", "#ffffff");
            textEl.setAttribute("font-size", "12");
            textEl.setAttribute("font-weight", "900");
            textEl.setAttribute("text-anchor", "middle");
            textEl.setAttribute("filter", "drop-shadow(0px 2px 3px rgba(0,0,0,0.9))");
            canvas.appendChild(textEl);

            // Рандомная начальная позиция (не в центре)
            let startX = 30 + Math.random() * 260;
            let startY = 30 + Math.random() * 260;
            
            // Рандомный вектор скорости
            let angle = Math.random() * 2 * Math.PI;
            let speed = 4 + Math.random() * 6; 
            let vx = Math.cos(angle) * speed;
            let vy = Math.sin(angle) * speed;
            
            let x = startX, y = startY;
            let frame = 0;
            const friction = 0.985;
            const maxFrames = 350; // Ограничение времени анимации

            ball.setAttribute("cx", x.toFixed(1));
            ball.setAttribute("cy", y.toFixed(1));

            const animate = () => {
                frame++;
                
                // Торможение
                vx *= friction;
                vy *= friction;
                x += vx;
                y += vy;

                // Отскок от стенок
                if (x < 8) { x = 8; vx = -vx; }
                if (x > W - 8) { x = W - 8; vx = -vx; }
                if (y < 8) { y = 8; vy = -vy; }
                if (y > H - 8) { y = H - 8; vy = -vy; }

                ball.setAttribute("cx", x.toFixed(1));
                ball.setAttribute("cy", y.toFixed(1));
                textEl.setAttribute("x", x.toFixed(1));
                textEl.setAttribute("y", (y + 24).toFixed(1));

                // Если скорость почти нулевая или прошло много кадров -> завершаем
                if ((Math.abs(vx) < 0.15 && Math.abs(vy) < 0.15) || frame > maxFrames) {
                    // Плавно "приземляем" в финальную точку (серверную)
                    const finalX = parseFloat(targetX);
                    const finalY = parseFloat(targetY);
                    
                    // Завершающая анимация подлета к центру сектора
                    let smoothFrame = 0;
                    const smoothMax = 20;
                    const startFx = x, startFy = y;
                    
                    const smoothLand = () => {
                        smoothFrame++;
                        const progress = smoothFrame / smoothMax;
                        const ease = 1 - Math.pow(1 - progress, 3); // Ease Out
                        
                        const curX = startFx + (finalX - startFx) * ease;
                        const curY = startFy + (finalY - startFy) * ease;
                        
                        ball.setAttribute("cx", curX.toFixed(1));
                        ball.setAttribute("cy", curY.toFixed(1));
                        textEl.setAttribute("x", curX.toFixed(1));
                        textEl.setAttribute("y", (curY + 24).toFixed(1));

                        if (smoothFrame < smoothMax) {
                            requestAnimationFrame(smoothLand);
                        } else {
                            ball.setAttribute("cx", finalX.toFixed(1));
                            ball.setAttribute("cy", finalY.toFixed(1));
                            textEl.setAttribute("x", finalX.toFixed(1));
                            textEl.setAttribute("y", (finalY + 24).toFixed(1));
                            
                            // Проверяем победителя по координатам
                            const winner = getPlayerAtCoords(finalX, finalY);
                            if (winner) textEl.textContent = `🏆 ${winner.username}`;
                            else textEl.textContent = "🏆 Победитель!";

                            setTimeout(() => {
                                if (onComplete) onComplete();
                            }, 1500); // Задержка перед очисткой
                        }
                    };
                    smoothLand();
                    return;
                }
                requestAnimationFrame(animate);
            };
            animate();
        }

        // Определение победителя по координатам
        function getPlayerAtCoords(x, y) {
            if (arenaPlayers.length === 0) return null;
            if (arenaPlayers.length === 1) return arenaPlayers[0];
            
            const W = 320, H = 320, CX = W / 2, CY = H / 2;
            let totalBet = 0;
            arenaPlayers.forEach(p => totalBet += parseFloat(p.bet || 0));

            // Преобразуем координаты в угол
            let angle = Math.atan2(y - CY, x - CX);
            if (angle < 0) angle += 2 * Math.PI;

            let currentAngle = -Math.PI / 2;
            
            for (let i = 0; i < arenaPlayers.length; i++) {
                const player = arenaPlayers[i];
                const share = totalBet > 0 ? parseFloat(player.bet || 0) / totalBet : (1 / arenaPlayers.length);
                let nextAngle = currentAngle + 2 * Math.PI * share;

                let normalizedCurrent = (currentAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                let normalizedNext = (nextAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                let normalizedAngle = angle;
                
                if (nextAngle > currentAngle && normalizedNext < normalizedCurrent) normalizedNext += 2 * Math.PI;
                if (normalizedAngle < normalizedCurrent && nextAngle > currentAngle) normalizedAngle += 2 * Math.PI;

                if (normalizedAngle >= normalizedCurrent && normalizedAngle <= normalizedNext) return player;
                currentAngle = nextAngle;
            }
            return arenaPlayers[arenaPlayers.length - 1];
        }

        // ===================== UI И ПОЛЛИНГ =====================
        function updatePlayersListUI() {
            const listContainer = document.getElementById('arena-players-list');
            if (!listContainer) return;
            if (arenaPlayers.length === 0) {
                listContainer.innerHTML = `<div class="empty-list-placeholder">Ставок еще нет. Станьте первым!</div>`;
                safeSetText(elements.arenaPlayersTotal, '0'); return;
            }
            let totalBetSum = 0; arenaPlayers.forEach(p => totalBetSum += parseFloat(p.bet || 0));
            listContainer.innerHTML = '';
            arenaPlayers.forEach(p => {
                const pBet = parseFloat(p.bet) || 0;
                const chance = totalBetSum > 0 ? ((pBet / totalBetSum) * 100).toFixed(2) : '0.00';
                const row = document.createElement('div');
                row.className = 'player-list-row';
                row.style.borderLeft = `4px solid ${p.color || '#8d3df5'}`;
                row.innerHTML = `
                    <div class="player-row-left">
                        <img class="player-row-avatar" src="${p.avatar}" onerror="this.src='https://img.icons8.com/color/96/user.png';">
                        <div class="player-info-column">
                            <span class="player-row-name">${p.username || 'Игрок'}</span>
                            <span class="player-row-chance">${chance}%</span>
                        </div>
                    </div>
                    <div class="player-row-right">
                        <span class="player-row-bet-value">${pBet.toFixed(3)}</span>
                        <img class="player-row-coin" src="${GRAMCOIN_ICON_URL}">
                    </div>
                `;
                listContainer.appendChild(row);
            });
            safeSetText(elements.arenaPlayersTotal, arenaPlayers.length);
        }

        function renderBetButtons() {
            const balance = parseFloat(currentUser.balance || 0);
            const blockBets = isBallAnimating || (arenaStatusStr === 'finished');
            for (let i = 0; i < 3; i++) {
                const btn = document.getElementById(`bet-btn-${i + 1}`);
                if (!btn) continue;
                const betVal = parseFloat(customBets[i]);
                const betValSpan = btn.querySelector('.bet-val');
                if (betValSpan) betValSpan.innerText = betVal.toString();
                btn.setAttribute('data-bet', betVal);
                if (balance >= betVal && !blockBets) { btn.className = "bet-button active"; btn.disabled = false; }
                else { btn.className = "bet-button disabled"; btn.disabled = true; }
            }
        }

        function clearArenaRoundUi(forceClearBall = false) {
            const ballCanvas = document.getElementById('arena-ball-svg');
            const svgCanvas = document.getElementById('arena-svg-canvas');
            const avatarsContainer = document.getElementById('arena-avatars-container');
            const statusText = document.getElementById('arena-status-text');
            const countdownTimer = document.getElementById('arena-countdown-timer');

            if (forceClearBall && ballCanvas) ballCanvas.innerHTML = '';
            if (svgCanvas) svgCanvas.innerHTML = '';
            if (avatarsContainer) avatarsContainer.innerHTML = '';

            if (statusText) { statusText.classList.remove('hidden'); statusText.innerText = "Ждем ставки..."; }
            if (countdownTimer) countdownTimer.classList.add('hidden');
            safeSetText(elements.arenaPlayersTotal, '0');
            arenaPlayers = [];
            drawArenaSegments();
            updatePlayersListUI();
            renderBetButtons();
            isBallAnimating = false;
        }

        async function pollArenaLoop() {
            if (!isPollingActive) return;
            const arenaSection = document.getElementById('arena-section');
            if (!arenaSection || arenaSection.classList.contains('hidden')) { stopArenaPolling(); return; }

            try {
                const res = await fetchWithTimeout(`${API_BASE_URL}/api/arena/state`, { headers: { 'X-Telegram-Init-Data': initDataHeader }, timeout: 4000 });
                if (res.status === 403) { showBannedScreen(); return; }
                if (res.ok) {
                    const state = await res.json();
                    const correctRoundNumber = state.roundNumber || state.round_number || 1;
                    safeSetText(elements.arenaRoundNumber, correctRoundNumber);
                    arenaStatusStr = state.status || state.state || "waiting";

                    const rawBets = state.bets || state.players || state.activeBets || [];
                    const serverPlayers = rawBets.map(bet => ({
                        userId: bet.userId || bet.user_id || bet.id || "",
                        username: bet.username || bet.user_name || bet.name || "Игрок",
                        avatar: bet.avatar || bet.avatar_url || "https://img.icons8.com/color/96/user.png",
                        bet: parseFloat(bet.amount || bet.bet || 0),
                        color: bet.color || '#0088cc'
                    }));

                    arenaPlayers = serverPlayers;
                    drawArenaSegments();
                    updatePlayersListUI();

                    const statusText = document.getElementById('arena-status-text');
                    const countdownTimer = document.getElementById('arena-countdown-timer');
                    const stateTimeLeft = state.timeLeft !== undefined ? state.timeLeft : 0;
                    const serverTime = state.serverTime || Date.now();
                    const resolvedAt = state.resolvedAt || 0;

                    if (arenaStatusStr === 'countdown' && arenaPlayers.length >= 2) {
                        if (statusText) statusText.classList.add('hidden');
                        let serverCountdown = parseInt(stateTimeLeft, 10);
                        if (!isNaN(serverCountdown)) {
                            localCountdownValue = serverCountdown;
                            if (countdownTimer) { countdownTimer.classList.remove('hidden'); countdownTimer.innerText = localCountdownValue; }
                            
                            if (!countdownIntervalId) {
                                countdownIntervalId = setInterval(() => {
                                    localCountdownValue--;
                                    if (localCountdownValue <= 0) {
                                        clearInterval(countdownIntervalId); countdownIntervalId = null;
                                        if (countdownTimer) countdownTimer.classList.add('hidden');
                                    } else {
                                        if (countdownTimer) { countdownTimer.classList.remove('hidden'); countdownTimer.innerText = localCountdownValue; }
                                    }
                                }, 1000);
                            }
                        }
                    } else if (arenaStatusStr === 'finished') {
                        clearInterval(countdownIntervalId); countdownIntervalId = null;
                        if (countdownTimer) countdownTimer.classList.add('hidden');
                        if (statusText) statusText.classList.add('hidden');
                        
                        const winX = state.winnerX || state.winner_x || 160;
                        const winY = state.winnerY || state.winner_y || 160;
                        const winId = state.winnerId || state.winner_id || "";
                        const tPool = state.totalPool || state.total_pool || state.pool || 0;

                        // Запускаем анимацию только если она еще не идет
                        if (!isBallAnimating && arenaPlayers.length >= 2) {
                            // Запуск физики шарика
                            simulateAndAnimateBall(winX, winY, () => {
                                // Коллбек после остановки шарика
                                if (String(winId) === String(userId)) {
                                    showCustomModal({ icon: '🏆', title: 'Победа!', message: `🎉 Вы выиграли банк: +${parseFloat(tPool).toFixed(3)} GRAM!`, buttons: [{ text: 'Забрать!', primary: true }] });
                                    triggerBalanceBadge(parseFloat(tPool));
                                }
                                
                                // Очистка поля через 1.5 секунды
                                setTimeout(() => {
                                    clearArenaRoundUi(true);
                                    fetchUserData();
                                }, 1500);
                            });
                        }
                    } else if (arenaStatusStr === 'waiting') {
                        if (statusText) statusText.classList.remove('hidden');
                        if (!isBallAnimating && arenaPlayers.length === 0) {
                            clearArenaRoundUi(true);
                        }
                        clearInterval(countdownIntervalId); countdownIntervalId = null;
                    }
                    renderBetButtons();
                    updateBalanceUI();
                }
            } catch (err) { console.error("Polling error:", err); }
            finally { if (isPollingActive) setTimeout(pollArenaLoop, 1500); }
        }

        function startArenaPolling() { if (isPollingActive) return; isPollingActive = true; pollArenaLoop(); }
        function stopArenaPolling() { isPollingActive = false; clearInterval(countdownIntervalId); countdownIntervalId = null; }

        let localBetThrottle = false;
        const handleBetClick = async (e) => {
            const btn = e.currentTarget;
            if (btn.classList.contains('disabled') || localBetThrottle) return;
            const betValue = parseFloat(btn.getAttribute('data-bet'));
            if (isNaN(betValue) || betValue < 0.1) return;

            localBetThrottle = true; btn.style.opacity = '0.5';
            setTimeout(() => { localBetThrottle = false; btn.style.opacity = '1'; renderBetButtons(); }, 250);
            triggerBalanceBadge(-betValue);

            try {
                const res = await fetchWithTimeout(`${API_BASE_URL}/api/place_bet`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initDataHeader }, body: JSON.stringify({ amount: betValue }), timeout: 10000 });
                if (res.status === 403) { showBannedScreen(); return; }
                const data = await res.json();
                if (res.ok && data.success) { currentUser.balance = data.newBalance; setTimeout(() => { pollArenaLoop(); }, 100); }
                else { triggerBalanceBadge(betValue); fetchUserData(); }
            } catch (err) { console.warn("Bet error:", err); }
        };

        document.getElementById('bet-btn-1')?.addEventListener('click', handleBetClick);
        document.getElementById('bet-btn-2')?.addEventListener('click', handleBetClick);
        document.getElementById('bet-btn-3')?.addEventListener('click', handleBetClick);

        // ===================== КЕЙСЫ И ПРЕДМЕТЫ =====================
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
            { id: 115, name: "Пополнение 0.05 GRAM (Новичок)", icon: GRAMCOIN_ICON_URL, price: "0.05 GRAM", rawPrice: 0.05, isGold: false, type: "balance" }
        ];

        // ===================== ИНВЕНТАРЬ И ОТПРАВКА =====================
        function openSendGiftModal(userInventory) {
            const overlay = document.getElementById('custom-modal');
            const modalIcon = document.getElementById('modal-icon'); const modalTitle = document.getElementById('modal-title'); const modalMsg = document.getElementById('modal-message'); const actionsContainer = document.getElementById('modal-actions'); const closeX = document.getElementById('modal-close-btn');
            if (!overlay) return;
            if (modalIcon) modalIcon.innerHTML = "📤";
            if (modalTitle) modalTitle.innerText = "Отправить подарок другу";
            
            let itemsHtml = userInventory.map(item => `<option value="${item.item_id}">${formatItemName(item.name)} (${parseFloat(item.value).toFixed(3)} GRAM)</option>`).join('');
            modalMsg.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:12px; width:100%; text-align:left;">
                    <div><label style="font-size:12px; font-weight:700; color:#a5a1b8; display:block; margin-bottom:4px;">Telegram Юзернейм</label><input type="text" id="send-gift-username" placeholder="@friend" style="width:100%; background:#0b0914; border:1px solid #241c44; border-radius:12px; padding:12px; color:#fff; font-size:14px; box-sizing:border-box;"></div>
                    <div><label style="font-size:12px; font-weight:700; color:#a5a1b8; display:block; margin-bottom:4px;">Выберите подарок</label><select id="send-gift-item-select" style="width:100%; background:#0b0914; border:1px solid #241c44; border-radius:12px; padding:12px; color:#fff; font-size:14px; box-sizing:border-box; appearance:none;">${itemsHtml}</select></div>
                </div>
            `;
            actionsContainer.innerHTML = `<button id="send-gift-confirm-btn" class="modal-btn modal-btn-primary" style="margin-top:10px;">Отправить 🎁</button><button id="send-gift-cancel-btn" class="modal-btn modal-btn-secondary">Отмена</button>`;
            const handleClose = () => { overlay.classList.add('hidden'); };
            if (closeX) closeX.onclick = handleClose;
            document.getElementById('send-gift-cancel-btn').onclick = handleClose;
            document.getElementById('send-gift-confirm-btn').onclick = async () => {
                const targetUsername = document.getElementById('send-gift-username').value.trim();
                const itemId = document.getElementById('send-gift-item-select').value;
                if (!targetUsername) { showNotification("Введите юзернейм получателя", "⚠️"); return; }
                if (!itemId) { showNotification("Выберите предмет", "⚠️"); return; }
                const confirmBtn = document.getElementById('send-gift-confirm-btn');
                confirmBtn.disabled = true; confirmBtn.innerText = "Отправка...";
                try {
                    const res = await fetchWithTimeout(`${API_BASE_URL}/api/send_gift`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initDataHeader }, body: JSON.stringify({ targetUsername: targetUsername, itemId: parseInt(itemId) }), timeout: 8000 });
                    const data = await res.json();
                    if (res.status === 403) { showBannedScreen(); return; }
                    if (res.ok) { showNotification(data.message || "Подарок успешно отправлен!", "🎉"); overlay.classList.add('hidden'); fetchInventory(); fetchUserData(); }
                    else { showNotification(data.error || "Ошибка при отправке", "❌"); }
                } catch (err) { showNotification("Ошибка сети. Попробуйте позже.", "⚠️"); }
                finally { confirmBtn.disabled = false; confirmBtn.innerText = "Отправить 🎁"; }
            };
            overlay.classList.remove('hidden');
        }

        // ===================== НАВИГАЦИЯ И БАЛАНС =====================
        function navigateTo(target) {
            document.querySelectorAll('.app-section').forEach(s => s.classList.add('hidden'));
            if (elements.bottomNavigation) elements.bottomNavigation.classList.remove('hidden');
            if (target === 'home') { if (elements.homeSection) elements.homeSection.classList.remove('hidden'); setActiveTab('home'); stopArenaPolling(); }
            else if (target === 'inventory') { if (elements.inventorySection) elements.inventorySection.classList.remove('hidden'); setActiveTab('inventory'); fetchInventory(); stopArenaPolling(); }
            else if (target === 'rating') { if (elements.ratingSection) elements.ratingSection.classList.remove('hidden'); setActiveTab('rating'); stopArenaPolling(); }
            else if (target === 'balance') { if (elements.balanceSection) elements.balanceSection.classList.remove('hidden'); elements.navTabs.forEach(tab => tab.classList.remove('active')); stopArenaPolling(); }
            else if (target === 'case') { if (elements.caseSection) elements.caseSection.classList.remove('hidden'); if (elements.bottomNavigation) elements.bottomNavigation.classList.add('hidden'); initRouletteTrack(); stopArenaPolling(); }
            else if (target === 'arena') { if (elements.arenaSection) elements.arenaSection.classList.remove('hidden'); if (elements.bottomNavigation) elements.bottomNavigation.classList.add('hidden'); startArenaPolling(); }
        }

        function setActiveTab(targetId) { elements.navTabs.forEach(tab => tab.classList.toggle('active', tab.getAttribute('data-target') === targetId)); }
        elements.navTabs.forEach(tab => { tab.addEventListener('click', () => navigateTo(tab.getAttribute('data-target'))); });
        document.getElementById('game-arena-trigger')?.addEventListener('click', () => navigateTo('arena'));
        document.getElementById('back-to-home-from-arena')?.addEventListener('click', () => navigateTo('home'));
        document.getElementById('balance-pill')?.addEventListener('click', () => navigateTo('balance'));

        elements.dailyCaseBanner?.addEventListener('click', () => { isNewbieCaseMode = false; elements.rewardsSectionContainer.classList.remove('hidden'); safeSetText(elements.casePageMainTitle, "Ежедневный кейс"); safeSetText(elements.rewardsGridTitle, "🏆 Содержимое кейса"); safeSetText(elements.spinBtn, "Запустить"); renderRewardsGrid(); updateDailyCaseTimer(); navigateTo('case'); });
        elements.newbieCaseBanner?.addEventListener('click', () => { isNewbieCaseMode = true; elements.rewardsSectionContainer.classList.remove('hidden'); safeSetText(elements.casePageMainTitle, "Кейс новичка"); safeSetText(elements.rewardsGridTitle, "🏆 Содержимое кейса"); safeSetText(elements.spinBtn, "Открыть (0.1 GRAM)"); renderRewardsGrid(); updateDailyCaseTimer(); navigateTo('case'); });

        function renderRewardsGrid() {
            if (!elements.rewardsGrid) return; elements.rewardsGrid.innerHTML = '';
            const currentPool = isNewbieCaseMode ? NEWBIE_GIFT_POOL : GIFT_POOL;
            currentPool.forEach(gift => {
                const card = document.createElement('div'); card.className = `reward-card ${gift.isGold ? 'gold-tier' : ''}`;
                const randomBadge = gift.type === 'gift' ? '<div class="reward-random-badge">random</div>' : '';
                card.innerHTML = `<div class="reward-price-top">${gift.price}</div><img src="${gift.icon}" onerror="this.src='https://img.icons8.com/color/96/gift.png'"><div style="margin-bottom: 8px;"></div>${randomBadge}`;
                elements.rewardsGrid.appendChild(card);
            });
        }

        function initRouletteTrack() {
            if (!elements.rouletteTrack) return;
            elements.rouletteTrack.style.transition = 'none'; elements.rouletteTrack.style.transform = 'translate3d(0, 0, 0)';
            void elements.rouletteTrack.offsetWidth; elements.rouletteTrack.innerHTML = '';
            const currentPool = isNewbieCaseMode ? NEWBIE_GIFT_POOL : GIFT_POOL;
            for (let i = 0; i < 60; i++) {
                const randomItem = currentPool[Math.floor(Math.random() * currentPool.length)];
                const itemEl = document.createElement('div'); itemEl.className = 'roulette-item';
                itemEl.innerHTML = `<img src="${randomItem.icon}" onerror="this.src='https://img.icons8.com/color/96/gift.png'"><span>${randomItem.price}</span>`;
                elements.rouletteTrack.appendChild(itemEl);
            }
        }

        function spinRoulette(winningItem, onComplete) {
            if (!elements.rouletteTrack) return;
            const itemWidth = 96, gap = 8, itemFullWidth = itemWidth + gap, targetIndex = 45;
            const trackItems = elements.rouletteTrack.children;
            if (trackItems[targetIndex]) { trackItems[targetIndex].className = 'roulette-item'; trackItems[targetIndex].innerHTML = `<img src="${winningItem.icon}" onerror="this.src='https://img.icons8.com/color/96/gift.png'"><span>${winningItem.price}</span>`; }
            const containerWidth = elements.rouletteTrack.parentElement.offsetWidth;
            const centerOffset = (containerWidth / 2) - (itemWidth / 2);
            const totalTranslate = (targetIndex * itemFullWidth) - centerOffset;
            elements.rouletteTrack.style.transition = 'transform 5.5s cubic-bezier(0.12, 0.82, 0.12, 1)';
            elements.rouletteTrack.style.transform = `translate3d(-${totalTranslate}px, 0, 0)`;
            setTimeout(() => { onComplete(); }, 5600);
        }

        function processWinning(winningGift, apiNewBalance = null) {
            const isBalance = winningGift.type === "balance";
            if (apiNewBalance !== null) { currentUser.balance = apiNewBalance; updateBalanceUI(); }
            if (isNewbieCaseMode && elements.spinBtn) elements.spinBtn.disabled = false;
            if (isBalance) { showCustomModal({ icon: '💰', title: 'Баланс пополнен!', message: `🎉 Вы выиграли пополнение счета на +${winningGift.price}!`, buttons: [{ text: 'Отлично!', primary: true }] }); triggerBalanceBadge(winningGift.rawPrice); fetchUserData(); }
            else { showCustomModal({ icon: `<img src="${winningGift.icon}" style="width:70px;height:70px;object-fit:contain;" onerror="this.src='https://img.icons8.com/color/96/gift.png'">`, title: 'Вы выиграли подарок!', message: `🎁 Ваша награда: "${formatItemName(winningGift.name)}" сохранена в инвентарь!`, buttons: [{ text: `Продать за ${winningGift.price}`, primary: true, onClick: async () => { await fetch(`${API_BASE_URL}/api/sell_gift`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initDataHeader }, body: JSON.stringify({ itemId: winningGift.id, price: winningGift.rawPrice }) }); fetchUserData(); fetchInventory(); } }, { text: 'В инвентарь', primary: false, onClick: () => { showNotification(`📦 Сохранено в инвентарь!`, '🎒'); fetchUserData(); } }] }); }
        }

        elements.spinBtn?.addEventListener('click', async () => {
            const spinCost = 0.1;
            if (isNewbieCaseMode && parseFloat(currentUser.balance || 0) < spinCost) { showNotification('Недостаточно баланса! (0.1 GRAM)', '⚠️'); return; }
            elements.spinBtn.disabled = true;
            if (isNewbieCaseMode) { triggerBalanceBadge(-spinCost); updateBalanceUI(Math.max(0, parseFloat(currentUser.balance || 0) - spinCost)); }
            initRouletteTrack();
            setTimeout(async () => {
                try {
                    const endpoint = isNewbieCaseMode ? `${API_BASE_URL}/api/open_newbie_case` : `${API_BASE_URL}/api/open_daily_case`;
                    const response = await fetchWithTimeout(endpoint, { method: 'POST', headers: { 'X-Telegram-Init-Data': initDataHeader }, timeout: 4500 });
                    if (response.status === 403) { showBannedScreen(); return; }
                    const data = await response.json();
                    if (response.ok) {
                        const currentPool = isNewbieCaseMode ? NEWBIE_GIFT_POOL : GIFT_POOL;
                        let winningGift = currentPool.find(g => g.id === data.wonItem.id);
                        if (!winningGift) winningGift = currentPool.find(g => g.name.toLowerCase() === data.wonItem.name.toLowerCase());
                        spinRoulette(winningGift, () => { processWinning(winningGift, data.newBalance); });
                    } else { if (isNewbieCaseMode) triggerBalanceBadge(spinCost); fetchUserData(); showNotification(data.error || 'Ошибка.', "⚠️"); elements.spinBtn.disabled = false; }
                } catch (error) { if (isNewbieCaseMode) triggerBalanceBadge(spinCost); fetchUserData(); elements.spinBtn.disabled = false; showNotification('Ошибка сети при открытии.', '⚠️'); }
            }, 50);
        });

        async function fetchInventory() {
            if (!elements.inventoryGrid) return;
            try {
                const res = await fetchWithTimeout(`${API_BASE_URL}/api/inventory`, { headers: { 'X-Telegram-Init-Data': initDataHeader }, timeout: 3000 });
                if (res.status === 403) { showBannedScreen(); return; }
                if (!res.ok) throw new Error();
                const items = await res.json(); elements.inventoryGrid.innerHTML = '';
                if (items.length === 0) { elements.inventoryGrid.innerHTML = `<div class="empty-inventory">🎒 Ваш инвентарь пуст.<br>Открывайте кейсы!</div>`; return; }
                items.forEach(item => {
                    const matchedItem = GIFT_POOL.find(g => parseInt(g.id) === parseInt(item.item_id)) || NEWBIE_GIFT_POOL.find(g => parseInt(g.id) === parseInt(item.item_id)) || {};
                    const imageSrc = matchedItem.icon || item.image_url;
                    const card = document.createElement('div'); card.className = 'reward-card';
                    card.innerHTML = `
                        <div class="reward-price-top">${parseFloat(item.value).toFixed(2)} GRAM</div>
                        <img src="${imageSrc}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                        <div class="reward-name">${formatItemName(item.name)}</div>
                        <div class="inv-actions" style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:6px; width:100%; margin-top:10px;">
                            <button class="inv-btn withdraw-btn">Вывести</button>
                            <button class="inv-btn sell-btn">Продать</button>
                            <button class="inv-btn send-btn" style="background:#0088cc; color:#fff;">Отправить</button>
                        </div>
                    `;
                    card.querySelector('.withdraw-btn').addEventListener('click', () => { showCustomModal({ icon: `<img src="${imageSrc}" style="width:70px;height:70px;object-fit:contain;" onerror="this.src='https://img.icons8.com/color/96/gift.png'">`, title: 'Вывод подарка', message: `Отправить "${formatItemName(item.name)}" вам в Telegram?`, buttons: [{ text: 'Подтвердить вывод', primary: true, onClick: async () => { const withdrawRes = await fetchWithTimeout(`${API_BASE_URL}/api/withdraw_gift`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initDataHeader }, body: JSON.stringify({ itemId: item.item_id }), timeout: 3000 }); if (withdrawRes.status === 403) { showBannedScreen(); return; } if (withdrawRes.ok) { showNotification(`Подарок в очереди на вывод!`, '📥'); fetchInventory(); } else { const errorData = await withdrawRes.json(); showNotification(errorData.error || 'Заявка отклонена.', '⚠️'); } } }, { text: 'Отмена', primary: false }] }); });
                    card.querySelector('.sell-btn').addEventListener('click', () => { showCustomModal({ icon: '💰', title: 'Продажа подарка', message: `Продать подарок "${formatItemName(item.name)}" за ${item.value} GRAM?`, buttons: [{ text: 'Продать за GRAM', primary: true, onClick: async () => { const sellRes = await fetchWithTimeout(`${API_BASE_URL}/api/sell_gift`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initDataHeader }, body: JSON.stringify({ itemId: item.item_id, price: item.value }), timeout: 3000 }); if (sellRes.status === 403) { showBannedScreen(); return; } if (sellRes.ok) { const sellData = await sellRes.json(); currentUser.balance = sellData.newBalance; triggerBalanceBadge(parseFloat(item.value)); fetchUserData(); fetchInventory(); } } }, { text: 'Отмена', primary: false }] }); });
                    card.querySelector('.send-btn').addEventListener('click', () => { openSendGiftModal(items); });
                    elements.inventoryGrid.appendChild(card);
                });
            } catch (error) { console.error("Inventory fetch error:", error); }
        }

        function updateBalanceUI(forcedValue = null) {
            const baseBalance = (currentUser && currentUser.balance) ? parseFloat(currentUser.balance) : 0;
            const val = forcedValue !== null ? parseFloat(forcedValue) : baseBalance;
            const balVal = isNaN(val) ? "0.000" : val.toFixed(3);
            safeSetText(elements.balanceDisplayPill, balVal);
            safeSetText(elements.largeBalanceDisplay, balVal);
        }

        let dailyCaseTimerInterval;
        function updateDailyCaseTimer() {
            clearInterval(dailyCaseTimerInterval);
            if (isNewbieCaseMode) { if (elements.spinBtn) { elements.spinBtn.classList.remove('hidden'); elements.spinBtn.disabled = false; } document.getElementById('timer-container')?.classList.add('hidden'); return; }
            if (!currentUser.last_daily_case_open) { if (elements.spinBtn) { elements.spinBtn.classList.remove('hidden'); elements.spinBtn.disabled = false; } document.getElementById('timer-container')?.classList.add('hidden'); return; }
            const lastOpen = new Date(currentUser.last_daily_case_open);
            const now = new Date(); const cooldown = 24 * 60 * 60 * 1000;
            const nextOpenTime = new Date(lastOpen.getTime() + cooldown);
            const timeLeftMs = nextOpenTime.getTime() - now.getTime();

            if (timeLeftMs <= 0) { if (elements.spinBtn) { elements.spinBtn.classList.remove('hidden'); elements.spinBtn.disabled = false; } document.getElementById('timer-container')?.classList.add('hidden'); }
            else {
                if (elements.spinBtn) { elements.spinBtn.classList.add('hidden'); elements.spinBtn.disabled = true; }
                const t = document.getElementById('timer-container'); if (t) t.classList.remove('hidden');
                const tick = () => {
                    const nowTick = new Date(); const diff = nextOpenTime.getTime() - nowTick.getTime();
                    if (diff <= 0) { clearInterval(dailyCaseTimerInterval); updateDailyCaseTimer(); return; }
                    const hours = Math.floor(diff / (1000 * 60 * 60));
                    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                    safeSetText(document.getElementById('daily-case-timer'), `${hours}ч ${minutes}м ${seconds}с`);
                };
                tick(); dailyCaseTimerInterval = setInterval(tick, 1000);
            }
        }

        async function fetchUserData() {
            try {
                const res = await fetchWithTimeout(`${API_BASE_URL}/api/user`, { headers: { 'X-Telegram-Init-Data': initDataHeader }, timeout: 4000 });
                if (res.status === 403) { showBannedScreen(); return; }
                if (!res.ok) throw new Error();
                currentUser = await res.json();
            } catch (e) { console.warn("Local cache loaded"); }
            if (!currentUser) currentUser = {};
            updateBalanceUI();
            const mainAvatar = document.getElementById('user-avatar');
            if (mainAvatar) {
                const directUrl = currentUser.avatar_url;
                if (directUrl) mainAvatar.src = directUrl;
                else mainAvatar.src = `${API_BASE_URL}/api/avatar/${currentUser.id || userId}`;
                mainAvatar.onerror = () => { mainAvatar.src = "https://img.icons8.com/color/96/user.png"; };
            }
            const rawName = currentUser.username || currentUser.first_name || "Пользователь";
            safeSetText(document.getElementById('user-username'), formatUsername(rawName));
            updateDailyCaseTimer(); renderBetButtons();
        }

        renderRewardsGrid(); fetchUserData(); navigateTo('home');

    } catch (globalError) { console.error("Global init error:", globalError); }
});

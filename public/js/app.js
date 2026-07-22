const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : {
    expand: () => {},
    ready: () => {},
    initData: "",
    initDataUnsafe: { user: { id: "guest_user_id", username: "Пользователь", first_name: "Пользователь" } },
    openLink: (url) => window.open(url, '_blank'),
    openTelegramLink: (url) => window.open(url, '_blank')
};

tg.expand();
tg.ready();

// Инъекция стилей
(function injectStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
        .arena-player-avatar-node { position: absolute !important; transform: translate(-50%, -50%) !important; border-radius: 50% !important; border: 3px solid #ffffff !important; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5) !important; object-fit: cover !important; pointer-events: none !important; z-index: 5 !important; }
        #arena-svg-canvas, #arena-ball-svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 16px; overflow: hidden; background: transparent !important; aspect-ratio: 1/1 !important; }
        .ball-container, .ball-wrapper, .ball-svg, #arena-ball-svg, .arena-ball-svg, [class*="ball-container"], [class*="ball-wrapper"] { background: transparent !important; background-color: transparent !important; border: none !important; box-shadow: none !important; filter: none !important; }
        .game-arena-trigger .ball, .game-card .ball, .best-arena-preview .ball, #arena-preview-ball, .arena-preview-ball, .game-arena-trigger div.ball { background: #ffffff !important; background-color: #ffffff !important; border-radius: 50% !important; width: 12px !important; height: 12px !important; box-shadow: 0 0 12px #ffffff, 0 0 24px #ffffff, 0 0 35px #ffffff !important; filter: drop-shadow(0 0 6px #ffffff) !important; }
        #physics-ball { fill: #ffffff !important; r: 8 !important; filter: drop-shadow(0 0 8px #ffffff) !important; }
        @keyframes winningSectorPulse { 0% { filter: drop-shadow(0 0 15px var(--glow-color)) brightness(1.2); stroke: #ffffff; stroke-width: 5px; } 50% { filter: drop-shadow(0 0 35px var(--glow-color)) brightness(1.7); stroke: #ffffff; stroke-width: 8px; } 100% { filter: drop-shadow(0 0 15px var(--glow-color)) brightness(1.2); stroke: #ffffff; stroke-width: 5px; } }
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
    try {
        if (typeof TON_CONNECT_UI !== 'undefined' && TON_CONNECT_UI.toUserFriendlyAddress) {
            const friendly = TON_CONNECT_UI.toUserFriendlyAddress(rawAddress);
            return friendly.substring(0, 4) + "-..." + friendly.substring(friendly.length - 4);
        }
    } catch(e) {}
    return rawAddress.substring(0, 4) + "-..." + rawAddress.substring(rawAddress.length - 4);
}
function preloadImages(urls) { urls.forEach(url => { const img = new Image(); img.src = url; }); }

function createPRNG(seedString) {
    let h = 1779033703 ^ seedString.length;
    for (let i = 0; i < seedString.length; i++) { h = Math.imul(h ^ seedString.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    return function() { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }
}

const defaultColors = ['#ff3b30', '#4cd964', '#007aff', '#ffcc00', '#5856d6', '#ff2d55', '#5ac8fa', '#00e676', '#ff9500', '#0088cc'];
function getUserColor(userId, roundNumber) {
    const idStr = String(userId || 'guest') + "_" + String(roundNumber || 1);
    let hash = 0;
    for (let i = 0; i < idStr.length; i++) { hash = idStr.charCodeAt(i) + ((hash << 5) - hash); }
    return defaultColors[Math.abs(hash) % defaultColors.length];
}

async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 10000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e) { clearTimeout(id); throw e; }
}

function triggerBalanceBadge(amount) {
    const container = document.getElementById('balance-badge-container');
    if (!container) return;
    const badge = document.createElement('div');
    const isNegative = amount < 0;
    badge.className = `balance-popup-badge ${isNegative ? 'negative' : 'positive'}`;
    badge.innerText = (isNegative ? '' : '+') + amount.toFixed(3);
    container.appendChild(badge);
    setTimeout(() => badge.remove(), 2500);
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

        let lastAnimatedRound = null;
        let lastObservedRoundNumber = null;
        let localExpectedBetAmount = 0;
        let currentServerRoundNumber = 0;

        let countdownIntervalId = null;
        let localCountdownValue = 0;

        const ANIMATION_DURATION_MS = 4000;
        const POST_ANIMATION_GLOW_DURATION_MS = 1000;

        let animatingTimeout = null;
        function setBallAnimating(val) {
            isBallAnimating = val;
            if (animatingTimeout) clearTimeout(animatingTimeout);
            if (val) {
                animatingTimeout = setTimeout(() => {
                    if (isBallAnimating) {
                        console.warn("[ARENA] Сработал предохранитель!");
                        isBallAnimating = false;
                        clearArenaRoundUi(true);
                        fetchUserData();
                    }
                }, ANIMATION_DURATION_MS + POST_ANIMATION_GLOW_DURATION_MS + 1000);
            }
        }

        let preloadedAdminAddress = "EQC3481up9_gG98_wK8Jv_Zz1yLp9p0_Y-7Jv7x4b9a9JKe6";
        let preloadedPayloadBase64 = "te6ccgEBAQEAAgAAAA==";

        const safeSetText = (el, val) => { if (el) el.innerText = val; };

        const initialName = tg.initDataUnsafe?.user?.username || tg.initDataUnsafe?.user?.first_name || "Пользователь";
        safeSetText(document.getElementById('user-username'), formatUsername(initialName));

        let userId = tg.initDataUnsafe?.user?.id;
        if (!userId) {
            try {
                const params = new URLSearchParams(initDataHeader);
                const userRaw = params.get('user');
                if (userRaw) userId = JSON.parse(userRaw).id;
            } catch (e) {}
        }
        if (!userId) userId = localGuestId;

        const elements = {
            homeSection: document.getElementById('home-section'),
            caseSection: document.getElementById('case-section'),
            inventorySection: document.getElementById('inventory-section'),
            ratingSection: document.getElementById('rating-section'),
            balanceSection: document.getElementById('balance-section'),
            arenaSection: document.getElementById('arena-section'),
            rouletteTrack: document.getElementById('roulette-track'),
            spinBtn: document.getElementById('spin-case-button'),
            balanceDisplayPill: document.getElementById('user-balance-pill-value'),
            largeBalanceDisplay: document.getElementById('large-balance-value'),
            rewardsGrid: document.getElementById('rewards-grid'),
            inventoryGrid: document.getElementById('inventory-grid'),
            bottomNavigation: document.querySelector('.floating-nav-container'),
            navTabs: document.querySelectorAll('.nav-tab'),
            dailyCaseBanner: document.getElementById('daily-case-banner'),
            newbieCaseBanner: document.getElementById('newbie-case-banner'),
            rewardsSectionContainer: document.getElementById('rewards-section-container'),
            rewardsGridTitle: document.getElementById('rewards-grid-title'),
            casePageMainTitle: document.getElementById('case-page-main-title'),
            connectWalletBtn: document.getElementById('connect-wallet-btn'),
            depositBalanceBtn: document.getElementById('deposit-balance-btn'),
            depositNoticeText: document.getElementById('deposit-notice-text'),
            depositAmountModal: document.getElementById('deposit-amount-modal'),
            depositModalCloseBtn: document.getElementById('deposit-modal-close-btn'),
            modalDepositInput: document.getElementById('modal-deposit-input'),
            modalDepositConfirmBtn: document.getElementById('modal-deposit-confirm-btn'),
            modalDepositCancelBtn: document.getElementById('modal-deposit-cancel-btn'),
            adminTgChatTrigger: document.getElementById('admin-tg-chat-trigger'),
            arenaRoundNumber: document.getElementById('arena-round-number'),
            arenaPlayersTotal: document.getElementById('arena-players-total'),
            bannedOverlay: document.getElementById('banned-screen')
        };

        function showBannedScreen() {
            if (elements.bannedOverlay) elements.bannedOverlay.classList.remove('hidden');
            stopArenaPolling();
            if (elements.bottomNavigation) elements.bottomNavigation.classList.add('hidden');
            document.querySelectorAll('.app-section').forEach(s => s.classList.add('hidden'));
        }

        async function fetchPaymentParamsInternal() {
            const addrEndpoints = [`${API_BASE_URL}/api/deposit_address`];
            for (const url of addrEndpoints) {
                try {
                    const res = await fetchWithTimeout(url, { timeout: 15000 });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.address) { preloadedAdminAddress = data.address; break; }
                    }
                } catch (e) {}
            }
        }
        fetchPaymentParamsInternal();

        function loadSavedBets() {
            try {
                const saved = localStorage.getItem(`custom_bets_${userId}`);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length === 3) {
                        customBets = parsed.map(v => (isNaN(parseFloat(v)) || parseFloat(v) < 0.1) ? 0.1 : parseFloat(v));
                        return;
                    }
                }
            } catch (e) {}
            customBets = [0.1, 1.0, 5.0];
        }

        function loadCachedUserData() {
            try {
                const cachedData = localStorage.getItem(`user_cache_${userId}`);
                if (cachedData) {
                    const cache = JSON.parse(cachedData);
                    if (cache) {
                        if (cache.is_banned === true || cache.is_banned === 'true') { showBannedScreen(); return; }
                        currentUser = cache;
                        updateBalanceUI();
                        const rawName = cache.username || cache.first_name || "Пользователь";
                        safeSetText(document.getElementById('user-username'), formatUsername(rawName));
                        const mainAvatar = document.getElementById('user-avatar');
                        if (mainAvatar && cache.avatar_url) {
                            mainAvatar.src = cache.avatar_url;
                            mainAvatar.onerror = () => { mainAvatar.src = "https://img.icons8.com/color/96/user.png"; };
                        }
                    }
                }
            } catch (e) {}
        }

        function saveUserDataToCache(userData) {
            try { localStorage.setItem(`user_cache_${userId}`, JSON.stringify(userData)); } catch (e) {}
        }

        loadSavedBets();
        loadCachedUserData();

        function showNotification(message, icon = '🎁') {
            const container = document.getElementById('toast-container');
            if (!container) return;
            const toast = document.createElement('div');
            toast.className = 'custom-toast';
            toast.innerHTML = `<div class="custom-toast-icon">${icon}</div><div class="custom-toast-content">${message}</div><button class="custom-toast-close">&times;</button>`;
            container.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 50);
            toast.querySelector('.custom-toast-close').addEventListener('click', () => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 400);
            });
            setTimeout(() => { if (toast.parentNode) { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); } }, 5000);
        }

        function showCustomModal({ icon = '🎁', title, message, buttons = [], onClose = null }) {
            const overlay = document.getElementById('custom-modal');
            const modalIcon = document.getElementById('modal-icon');
            const modalTitle = document.getElementById('modal-title');
            const modalMsg = document.getElementById('modal-message');
            const actionsContainer = document.getElementById('modal-actions');
            const closeX = document.getElementById('modal-close-btn');
            if (!overlay) return;
            if (modalIcon) modalIcon.innerHTML = icon;
            if (modalTitle) modalTitle.innerText = title;
            if (modalMsg) modalMsg.innerText = message;
            if (actionsContainer) actionsContainer.innerHTML = '';
            buttons.forEach(btnConfig => {
                const btn = document.createElement('button');
                btn.className = `modal-btn ${btnConfig.primary ? 'modal-btn-primary' : 'modal-btn-secondary'}`;
                btn.innerText = btnConfig.text;
                btn.addEventListener('click', () => { overlay.classList.add('hidden'); if (btnConfig.onClick) btnConfig.onClick(); });
                if (actionsContainer) actionsContainer.appendChild(btn);
            });
            const handleClose = () => { overlay.classList.add('hidden'); if (onClose) onClose(); };
            if (closeX) closeX.onclick = handleClose;
            overlay.classList.remove('hidden');
        }

        // TON Connect
        let tonConnectUI = null;
        try {
            const manifestUrl = `${API_BASE_URL}/tonconnect-manifest.json`;
            const customStorage = {
                setItem: (key, value) => { try { localStorage.setItem(`tc-${userId}-${key}`, value); } catch (e) {} },
                getItem: (key) => { try { return localStorage.getItem(`tc-${userId}-${key}`); } catch (e) { return null; } },
                removeItem: (key) => { try { localStorage.removeItem(`tc-${userId}-${key}`); } catch (e) {} }
            };
            const initTonConnect = () => {
                const TC_SDK = window.TON_CONNECT_UI || window.TonConnectUI;
                if (TC_SDK) {
                    tonConnectUI = new TC_SDK.TonConnectUI({ manifestUrl, storage: customStorage });
                    tonConnectUI.onStatusChange(wallet => {
                        if (wallet) {
                            const displayAddress = formatWalletAddress(wallet.account.address);
                            if (elements.connectWalletBtn) {
                                elements.connectWalletBtn.innerText = `Привязан: (${displayAddress})`;
                                elements.connectWalletBtn.style.background = 'linear-gradient(135deg, #00e676, #00b34a)';
                                elements.connectWalletBtn.style.color = '#000000';
                            }
                            if (elements.depositBalanceBtn) elements.depositBalanceBtn.removeAttribute('disabled');
                            if (elements.depositNoticeText) {
                                elements.depositNoticeText.innerText = "Кошелек подключен!";
                                elements.depositNoticeText.style.color = '#00e676';
                            }
                        } else {
                            if (elements.connectWalletBtn) {
                                elements.connectWalletBtn.innerText = 'Привязать кошелёк';
                                elements.connectWalletBtn.style.background = 'linear-gradient(135deg, var(--accent-purple), #6a0dad)';
                                elements.connectWalletBtn.style.color = '#ffffff';
                            }
                            if (elements.depositBalanceBtn) elements.depositBalanceBtn.setAttribute('disabled', 'true');
                            if (elements.depositNoticeText) {
                                elements.depositNoticeText.innerText = "Пополнение доступно после привязки кошелька";
                                elements.depositNoticeText.style.color = '#a5a1b8';
                            }
                        }
                    });
                    if (elements.connectWalletBtn) {
                        elements.connectWalletBtn.addEventListener('click', async () => {
                            if (tonConnectUI.connected) {
                                showCustomModal({
                                    icon: '🔌',
                                    title: 'Отключить кошелек?',
                                    message: 'Вы уверены, что хотите отвязать текущий TON-кошелек?',
                                    buttons: [{ text: 'Отвязать', primary: true, onClick: async () => { await tonConnectUI.disconnect(); showNotification("Кошелек успешно отвязан", "🔌"); } }, { text: 'Отмена', primary: false }]
                                });
                            } else {
                                await tonConnectUI.openModal();
                            }
                        });
                    }
                }
            };
            if (window.TON_CONNECT_UI || window.TonConnectUI) { initTonConnect(); } else { document.addEventListener('ton-connect-ui-loaded', initTonConnect); }
        } catch (err) {}

        if (elements.depositBalanceBtn) {
            elements.depositBalanceBtn.addEventListener('click', () => { if (elements.depositAmountModal) { elements.depositAmountModal.classList.remove('hidden'); if (elements.modalDepositInput) elements.modalDepositInput.value = "0.1"; } });
        }
        const closeDepositModal = () => { if (elements.depositAmountModal) elements.depositAmountModal.classList.add('hidden'); };
        if (elements.depositModalCloseBtn) elements.depositModalCloseBtn.addEventListener('click', closeDepositModal);
        if (elements.modalDepositCancelBtn) elements.modalDepositCancelBtn.addEventListener('click', closeDepositModal);
        if (elements.modalDepositConfirmBtn) {
            elements.modalDepositConfirmBtn.addEventListener('click', async () => {
                const amount = parseFloat(elements.modalDepositInput.value);
                if (isNaN(amount) || amount < 0.1) { showNotification("Минимальная сумма пополнения — 0.1 TON", "⚠️"); return; }
                if (!tonConnectUI || !tonConnectUI.connected) { showNotification("Пожалуйста, сначала привяжите кошелек!", "⚠️"); return; }
                closeDepositModal();
                try {
                    const nanoAmount = Math.floor(amount * 1000000000).toString();
                    const transaction = { validUntil: Math.floor(Date.now() / 1000) + 360, messages: [{ address: preloadedAdminAddress, amount: nanoAmount, payload: preloadedPayloadBase64 }] };
                    showNotification("Подтвердите транзакцию...", "⏳");
                    const result = await tonConnectUI.sendTransaction(transaction);
                    if (result) {
                        currentUser.balance = parseFloat((parseFloat(currentUser.balance) + amount).toFixed(3));
                        updateBalanceUI();
                        triggerBalanceBadge(amount);
                        showNotification(`Баланс пополнен на +${amount.toFixed(3)} TON!`, "💎");
                        fetch(`${API_BASE_URL}/api/verify_payment`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initDataHeader }, body: JSON.stringify({ amount: amount }) }).then(res => { if (res.status === 403) showBannedScreen(); else if (res.ok) fetchUserData(); }).catch(e => console.error("Verify backend error:", e));
                    }
                } catch (err) { showNotification("Транзакция отменена кошельком.", "⚠️"); }
            });
        }

        // ===================== АРЕНА =====================
        function drawArenaSegments() {
            const svg = document.getElementById('arena-svg-canvas');
            const avatarsContainer = document.getElementById('arena-avatars-container');
            if (!svg || !avatarsContainer) return;
            svg.innerHTML = '';
            avatarsContainer.innerHTML = '';

            const N = arenaPlayers.length;
            if (N === 0) return;

            const W = 320, H = 320, CX = W / 2, CY = H / 2;
            let totalBet = 0;
            arenaPlayers.forEach(p => totalBet += parseFloat(p.bet || 0));

            if (N === 1) {
                const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                rect.setAttribute("x", "0"); rect.setAttribute("y", "0"); rect.setAttribute("width", "100%"); rect.setAttribute("height", "100%");
                rect.setAttribute("fill", arenaPlayers[0].color || '#ff3b30');
                rect.setAttribute("stroke", "rgba(255, 255, 255, 0.25)"); rect.setAttribute("stroke-width", "3");
                svg.appendChild(rect);
                createAvatarElement(CX, 240, arenaPlayers[0].avatar, 56);
                return;
            }

            let currentAngle = -Math.PI / 2;
            const corners = [Math.atan2(1, 1), Math.atan2(1, -1), Math.atan2(-1, -1), Math.atan2(-1, 1)].map(a => a < 0 ? a + 2 * Math.PI : a);

            for (let i = 0; i < N; i++) {
                const player = arenaPlayers[i];
                const share = totalBet > 0 ? parseFloat(player.bet || 0) / totalBet : (1 / N);
                let nextAngle = currentAngle + 2 * Math.PI * share;

                const pathPoints = [{ x: CX, y: CY }];
                pathPoints.push(getSquareIntersection(currentAngle, W, H));

                let normalizedCurrent = (currentAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                let normalizedNext = (nextAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                if (nextAngle > currentAngle && normalizedNext < normalizedCurrent) normalizedNext += 2 * Math.PI;

                const crossedCorners = [];
                for (let cAngle of corners) {
                    let normalizedCAngle = (cAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                    if (normalizedCAngle < normalizedCurrent && nextAngle > currentAngle) normalizedCAngle += 2 * Math.PI;
                    if (normalizedCAngle > normalizedCurrent && normalizedCAngle < normalizedNext) crossedCorners.push(cAngle);
                }
                crossedCorners.sort((a, b) => a - b);
                for (let cAngle of crossedCorners) pathPoints.push(getSquareIntersection(cAngle, W, H));
                pathPoints.push(getSquareIntersection(nextAngle, W, H));

                const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                poly.setAttribute("points", pathPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
                poly.setAttribute("fill", player.color || '#5856d6');
                poly.setAttribute("stroke", "rgba(255, 255, 255, 0.35)"); poly.setAttribute("stroke-width", "3"); poly.setAttribute("stroke-linejoin", "round");
                svg.appendChild(poly);

                const c = getPolygonCentroid(pathPoints);
                createAvatarElement(Math.max(50, Math.min(270, c.x)), Math.max(50, Math.min(270, c.y)), player.avatar, 38);
                currentAngle = nextAngle;
            }
        }

        function getSquareIntersection(angle, W, H) {
            const cx = W/2, cy = H/2, halfSize = W/2;
            const tan = Math.tan(angle);
            if (angle >= 0 && angle < Math.PI/2) return tan <= 1 ? {x: cx + halfSize, y: cy + halfSize * tan} : {x: cx + halfSize / tan, y: cy + halfSize};
            if (angle >= Math.PI/2 && angle < Math.PI) return tan >= -1 ? {x: cx - halfSize / tan, y: cy + halfSize} : {x: cx - halfSize, y: cy - halfSize * tan};
            if (angle >= Math.PI && angle < 3*Math.PI/2) return tan <= 1 ? {x: cx - halfSize, y: cy - halfSize * tan} : {x: cx - halfSize / tan, y: cy - halfSize};
            if (angle >= 3*Math.PI/2 && angle <= 2*Math.PI) return tan >= -1 ? {x: cx + halfSize / tan, y: cy - halfSize} : {x: cx + halfSize, y: cy + halfSize * tan};
            return {x: cx + halfSize, y: cy};
        }

        function getPolygonCentroid(pts) {
            if (pts.length === 0) return { x: 160, y: 160 };
            let first = pts[0], last = pts[pts.length - 1];
            let closeCycle = false;
            if (first.x !== last.x || first.y !== last.y) { pts.push({ x: first.x, y: first.y }); closeCycle = true; }
            let area = 0, cx = 0, cy = 0;
            for (let i = 0; i < pts.length - 1; i++) {
                let p1 = pts[i], p2 = pts[i+1];
                let factor = (p1.x * p2.y - p2.x * p1.y);
                area += factor; cx += (p1.x + p2.x) * factor; cy += (p1.y + p2.y) * factor;
            }
            area = area / 2;
            if (closeCycle) pts.pop();
            if (Math.abs(area) < 0.01) {
                let sx = 0, sy = 0; pts.forEach(p => { sx += p.x; sy += p.y; });
                return { x: sx / pts.length, y: sy / pts.length };
            }
            cx = cx / (6 * area); cy = cy / (6 * area);
            return { x: cx, y: cy };
        }

        function createAvatarElement(x, y, src, size) {
            const container = document.getElementById('arena-avatars-container');
            if (!container) return;
            const centerX = 160, centerY = 160;
            let dx = x - centerX, dy = y - centerY, dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 75) {
                if (dist < 2) { x = centerX + 60; y = centerY + 60; }
                else { x = centerX + (dx / dist) * 85; y = centerY + (dy / dist) * 85; }
            }
            const img = document.createElement('img');
            img.className = 'arena-player-avatar-node';
            img.src = src;
            img.style.left = `${x}px`; img.style.top = `${y}px`;
            img.style.width = `${size}px`; img.style.height = `${size}px`;
            img.onerror = () => { img.src = "https://img.icons8.com/color/96/user.png"; };
            container.appendChild(img);
        }

        function updatePlayersListUI() {
            const listContainer = document.getElementById('arena-players-list');
            if (!listContainer) return;
            if (arenaPlayers.length === 0) {
                listContainer.innerHTML = `<div class="empty-list-placeholder">Ставок еще нет. Станьте первым!</div>`;
                safeSetText(elements.arenaPlayersTotal, '0');
                return;
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
                        <img class="player-row-avatar" src="${p.avatar}" onerror="this.src='https://img.icons8.com/color/96/user.png';" alt="Avatar">
                        <div class="player-info-column">
                            <span class="player-row-name">${p.username || 'Игрок'}</span>
                            <span class="player-row-chance">${chance}% шанс</span>
                        </div>
                    </div>
                    <div class="player-row-right">
                        <span class="player-row-bet-value">${pBet.toFixed(3)}</span>
                        <img class="player-row-coin" src="${GRAMCOIN_ICON_URL}" alt="GRAM">
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
            localExpectedBetAmount = 0;
            drawArenaSegments();
            updatePlayersListUI();
            renderBetButtons();
        }

        function getMergedPlayers(serverPlayers, roundNumber) {
            const myIdStr = String(userId);
            const serverMe = serverPlayers.find(p => String(p.userId) === myIdStr);
            const serverMyBet = serverMe ? parseFloat(serverMe.bet) : 0;
            if (serverMyBet >= localExpectedBetAmount) localExpectedBetAmount = serverMyBet;
            const diff = localExpectedBetAmount - serverMyBet;
            let merged = serverPlayers.map(p => ({ ...p }));
            if (diff > 0.0001) {
                const existingMe = merged.find(p => String(p.userId) === myIdStr);
                if (existingMe) existingMe.bet = parseFloat(existingMe.bet) + diff;
                else {
                    merged.push({
                        userId: userId,
                        username: currentUser.username || "Я",
                        avatar: currentUser.avatar_url || "https://img.icons8.com/color/96/user.png",
                        bet: diff,
                        color: getUserColor(userId, roundNumber)
                    });
                }
            }
            return merged;
        }

        async function pollArenaLoop(forceInstant = false) {
            if (isBallAnimating && !forceInstant) { if (isPollingActive) setTimeout(pollArenaLoop, 1000); return; }
            if (!isPollingActive && !forceInstant) return;
            const arenaSection = document.getElementById('arena-section');
            if (!arenaSection || arenaSection.classList.contains('hidden')) { stopArenaPolling(); return; }

            try {
                const res = await fetchWithTimeout(`${API_BASE_URL}/api/arena/state`, { headers: { 'X-Telegram-Init-Data': initDataHeader }, timeout: 4000 });
                if (res.status === 403) { showBannedScreen(); return; }
                if (res.ok) {
                    const state = await res.json();
                    const correctRoundNumber = state.roundNumber || state.round_number || 1;
                    currentServerRoundNumber = correctRoundNumber;
                    safeSetText(elements.arenaRoundNumber, correctRoundNumber);
                    arenaStatusStr = state.status || state.state || "waiting";

                    const rawBets = state.bets || state.players || state.activeBets || [];
                    const serverPlayers = rawBets.map(bet => ({
                        userId: bet.userId || bet.user_id || bet.id || "",
                        username: bet.username || bet.user_name || bet.name || "Игрок",
                        avatar: bet.avatar || bet.avatar_url || "https://img.icons8.com/color/96/user.png",
                        bet: parseFloat(bet.amount || bet.bet || 0),
                        color: bet.color || getUserColor(bet.userId || bet.user_id || bet.id, correctRoundNumber)
                    }));

                    if (correctRoundNumber !== lastObservedRoundNumber) {
                        localExpectedBetAmount = 0;
                        lastObservedRoundNumber = correctRoundNumber;
                        setBallAnimating(false);
                        lastAnimatedRound = null;
                        clearArenaRoundUi(true);
                    }

                    if (arenaStatusStr === 'waiting' && serverPlayers.length === 0) localExpectedBetAmount = 0;
                    arenaPlayers = getMergedPlayers(serverPlayers, correctRoundNumber);
                    drawArenaSegments();
                    updatePlayersListUI();

                    const statusText = document.getElementById('arena-status-text');
                    const countdownTimer = document.getElementById('arena-countdown-timer');
                    const stateTimeLeft = state.timeLeft !== undefined ? state.timeLeft : 0;
                    const serverTime = state.serverTime || Date.now();
                    const resolvedAt = state.resolvedAt || 0;

                    if (arenaStatusStr === 'countdown') {
                        if (statusText) statusText.classList.add('hidden');
                        let serverCountdown = parseInt(stateTimeLeft, 10);
                        if (!isNaN(serverCountdown)) {
                            if (Math.abs(localCountdownValue - serverCountdown) > 1 || !countdownIntervalId) {
                                localCountdownValue = serverCountdown;
                                if (countdownTimer) { countdownTimer.classList.remove('hidden'); countdownTimer.innerText = localCountdownValue; }
                            }
                            if (!countdownIntervalId) {
                                countdownIntervalId = setInterval(() => {
                                    localCountdownValue--;
                                    if (localCountdownValue <= 0) { clearInterval(countdownIntervalId); countdownIntervalId = null; if (countdownTimer) countdownTimer.classList.add('hidden'); setTimeout(() => { pollArenaLoop(true); }, 50); }
                                    else { if (countdownTimer) { countdownTimer.classList.remove('hidden'); countdownTimer.innerText = localCountdownValue; } }
                                }, 1000);
                            }
                        }
                    } else if (arenaStatusStr === 'finished') {
                        clearInterval(countdownIntervalId); countdownIntervalId = null;
                        if (countdownTimer) countdownTimer.classList.add('hidden');

                        const winId = state.winnerId || state.winner_id || "";
                        const winX = state.winnerX || state.winner_x || 160;
                        const winY = state.winnerY || state.winner_y || 160;
                        const tPool = state.totalPool || state.total_pool || state.pool || 0;

                        if (correctRoundNumber !== lastAnimatedRound) {
                            lastAnimatedRound = correctRoundNumber;
                            setBallAnimating(true);
                            // Имитация анимации
                            setTimeout(() => {
                                setBallAnimating(false);
                                if (String(winId) === String(userId)) {
                                    showCustomModal({ icon: '🏆', title: 'Победа!', message: `🎉 Вы получили весь банк: +${parseFloat(tPool).toFixed(3)} GRAM!`, buttons: [{ text: 'Забрать!', primary: true }] });
                                    triggerBalanceBadge(parseFloat(tPool));
                                }
                                clearArenaRoundUi(false);
                                fetchUserData();
                            }, 2000);
                        }
                    } else {
                        clearInterval(countdownIntervalId); countdownIntervalId = null;
                        if (countdownTimer) countdownTimer.classList.add('hidden');
                        if (statusText && !isBallAnimating) { statusText.classList.remove('hidden'); statusText.innerText = "Ждем ставки..."; }
                    }
                    renderBetButtons();
                    updateBalanceUI();
                }
            } catch (err) { console.error("Error polling:", err); }
            finally { if (isPollingActive && !isBallAnimating && !forceInstant) setTimeout(pollArenaLoop, 1500); }
        }

        function startArenaPolling() { if (isPollingActive) return; isPollingActive = true; pollArenaLoop(); }
        function stopArenaPolling() { isPollingActive = false; clearInterval(countdownIntervalId); countdownIntervalId = null; if (!isBallAnimating) clearArenaRoundUi(true); }

        let localBetThrottle = false;
        const handleBetClick = async (e) => {
            const btn = e.currentTarget;
            if (btn.classList.contains('disabled') || localBetThrottle) return;
            const betValue = parseFloat(btn.getAttribute('data-bet'));
            if (isNaN(betValue) || betValue < 0.1) return;

            localBetThrottle = true; btn.style.opacity = '0.5';
            setTimeout(() => { localBetThrottle = false; btn.style.opacity = '1'; renderBetButtons(); }, 250);

            localExpectedBetAmount = parseFloat((localExpectedBetAmount + betValue).toFixed(3));
            arenaPlayers = getMergedPlayers(arenaPlayers, lastObservedRoundNumber || 1);
            drawArenaSegments(); updatePlayersListUI(); updateBalanceUI();
            triggerBalanceBadge(-betValue);

            try {
                const res = await fetchWithTimeout(`${API_BASE_URL}/api/place_bet`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initDataHeader }, body: JSON.stringify({ amount: betValue }), timeout: 10000 });
                if (res.status === 403) { showBannedScreen(); return; }
                const data = await res.json();
                if (res.ok && data.success) { currentUser.balance = data.newBalance; setTimeout(() => { pollArenaLoop(true); }, 150); }
                else { triggerBalanceBadge(betValue); localExpectedBetAmount = parseFloat(Math.max(0, localExpectedBetAmount - betValue).toFixed(3)); fetchUserData(); }
            } catch (err) { console.warn("Сетевой лаг. Ставка в очереди..."); }
        };

        document.getElementById('bet-btn-1')?.addEventListener('click', handleBetClick);
        document.getElementById('bet-btn-2')?.addEventListener('click', handleBetClick);
        document.getElementById('bet-btn-3')?.addEventListener('click', handleBetClick);

        // Настройка кнопок ставок
        const editBetsModal = document.getElementById('edit-bets-modal');
        document.getElementById('bet-edit-trigger')?.addEventListener('click', () => {
            document.getElementById('bet-input-1').value = customBets[0];
            document.getElementById('bet-input-2').value = customBets[1];
            document.getElementById('bet-input-3').value = customBets[2];
            editBetsModal.classList.remove('hidden');
        });
        document.getElementById('edit-bets-close-btn')?.addEventListener('click', () => editBetsModal.classList.add('hidden'));
        document.getElementById('cancel-bets-btn')?.addEventListener('click', () => editBetsModal.classList.add('hidden'));
        
        document.getElementById('save-bets-btn')?.addEventListener('click', () => {
            let b1 = parseFloat(document.getElementById('bet-input-1').value);
            let b2 = parseFloat(document.getElementById('bet-input-2').value);
            let b3 = parseFloat(document.getElementById('bet-input-3').value);
            b1 = parseFloat(b1.toFixed(3)); b2 = parseFloat(b2.toFixed(3)); b3 = parseFloat(b3.toFixed(3));
            if (isNaN(b1) || b1 < 0.1 || isNaN(b2) || b2 < 0.1 || isNaN(b3) || b3 < 0.1) { showNotification("Ставка не может быть меньше 0.1 GRAM!", "⚠️"); return; }
            customBets = [b1, b2, b3];
            try { localStorage.setItem(`custom_bets_${userId}`, JSON.stringify(customBets)); } catch(e) {}
            editBetsModal.classList.add('hidden');
            showNotification("Кнопки настроены!", "✏️");
            renderBetButtons();
        });

        // ===================== ИНВЕНТАРЬ И ОТПРАВКА =====================
        function openSendGiftModal(userInventory) {
            const overlay = document.getElementById('custom-modal');
            const modalIcon = document.getElementById('modal-icon');
            const modalTitle = document.getElementById('modal-title');
            const modalMsg = document.getElementById('modal-message');
            const actionsContainer = document.getElementById('modal-actions');
            const closeX = document.getElementById('modal-close-btn');

            if (!overlay) return;

            // Создаем контент модалки
            if (modalIcon) modalIcon.innerHTML = "📤";
            if (modalTitle) modalTitle.innerText = "Отправить подарок другу";
            
            let itemsHtml = userInventory.map(item => `
                <option value="${item.item_id}">${formatItemName(item.name)} (${parseFloat(item.value).toFixed(3)} GRAM)</option>
            `).join('');

            modalMsg.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:12px; width:100%; text-align:left;">
                    <div>
                        <label style="font-size:12px; font-weight:700; color:#a5a1b8; display:block; margin-bottom:4px;">Telegram Юзернейм</label>
                        <input type="text" id="send-gift-username" placeholder="@friend" style="width:100%; background:#0b0914; border:1px solid #241c44; border-radius:12px; padding:12px; color:#fff; font-size:14px; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:12px; font-weight:700; color:#a5a1b8; display:block; margin-bottom:4px;">Выберите подарок</label>
                        <select id="send-gift-item-select" style="width:100%; background:#0b0914; border:1px solid #241c44; border-radius:12px; padding:12px; color:#fff; font-size:14px; box-sizing:border-box; appearance:none;">
                            ${itemsHtml}
                        </select>
                    </div>
                </div>
            `;

            actionsContainer.innerHTML = `
                <button id="send-gift-confirm-btn" class="modal-btn modal-btn-primary" style="margin-top:10px;">Отправить 🎁</button>
                <button id="send-gift-cancel-btn" class="modal-btn modal-btn-secondary">Отмена</button>
            `;

            const handleClose = () => { overlay.classList.add('hidden'); };
            if (closeX) closeX.onclick = handleClose;
            document.getElementById('send-gift-cancel-btn').onclick = handleClose;

            document.getElementById('send-gift-confirm-btn').onclick = async () => {
                const targetUsername = document.getElementById('send-gift-username').value.trim();
                const itemId = document.getElementById('send-gift-item-select').value;

                if (!targetUsername) { showNotification("Введите юзернейм получателя", "⚠️"); return; }
                if (!itemId) { showNotification("Выберите предмет", "⚠️"); return; }

                const confirmBtn = document.getElementById('send-gift-confirm-btn');
                confirmBtn.disabled = true;
                confirmBtn.innerText = "Отправка...";

                try {
                    const res = await fetchWithTimeout(`${API_BASE_URL}/api/send_gift`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initDataHeader },
                        body: JSON.stringify({ targetUsername: targetUsername, itemId: parseInt(itemId) }),
                        timeout: 8000
                    });

                    const data = await res.json();

                    if (res.status === 403) { showBannedScreen(); return; }
                    
                    if (res.ok) {
                        showNotification(data.message || "Подарок успешно отправлен!", "🎉");
                        overlay.classList.add('hidden');
                        fetchInventory(); // Обновляем инвентарь
                        fetchUserData();
                    } else {
                        showNotification(data.error || "Ошибка при отправке", "❌");
                    }
                } catch (err) {
                    showNotification("Ошибка сети. Попробуйте позже.", "⚠️");
                } finally {
                    confirmBtn.disabled = false;
                    confirmBtn.innerText = "Отправить 🎁";
                }
            };

            overlay.classList.remove('hidden');
        }

        // ===================== НАВИГАЦИЯ =====================
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
        document.getElementById('back-to-home-from-balance')?.addEventListener('click', () => navigateTo('home'));
        document.getElementById('back-to-home-button')?.addEventListener('click', () => navigateTo('home'));
        document.getElementById('balance-pill')?.addEventListener('click', () => navigateTo('balance'));

        // Кейсы
        const GIFT_POOL = [
            { id: 1, name: "Статуя птицы серая", icon: "/Images/Items/rare_bird.jpg", price: "20 GRAM", rawPrice: 20.0, isGold: true, type: "gift" },
            { id: 2, name: "Тыква", icon: "/Images/Items/pumpkin.jpg", price: "8 GRAM", rawPrice: 8.0, isGold: true, type: "gift" },
            { id: 10, name: "Роза", icon: "/Images/Items/roza.jpg", price: "0.27 GRAM", rawPrice: 0.27, isGold: false, type: "gift" },
            { id: 11, name: "Пополнение 0.1 GRAM", icon: GRAMCOIN_ICON_URL, price: "0.1 GRAM", rawPrice: 0.1, isGold: false, type: "balance" }
        ];
        const NEWBIE_GIFT_POOL = [
            { id: 101, name: "Розовый мишка", icon: "/Images/Items/bearpink.png", price: "29 GRAM", rawPrice: 29.0, isGold: true, type: "gift" },
            { id: 112, name: "Мишка классический", icon: "/Images/Items/michka.jpg", price: "0.11 GRAM", rawPrice: 0.11, isGold: false, type: "gift" }
        ];

        elements.dailyCaseBanner?.addEventListener('click', () => { isNewbieCaseMode = false; elements.rewardsSectionContainer.classList.remove('hidden'); safeSetText(elements.casePageMainTitle, "Ежедневный кейс"); safeSetText(elements.rewardsGridTitle, "🏆 Содержимое кейса"); safeSetText(elements.spinBtn, "Запустить"); renderRewardsGrid(); updateDailyCaseTimer(); navigateTo('case'); });
        elements.newbieCaseBanner?.addEventListener('click', () => { isNewbieCaseMode = true; elements.rewardsSectionContainer.classList.remove('hidden'); safeSetText(elements.casePageMainTitle, "Кейс новичка"); safeSetText(elements.rewardsGridTitle, "🏆 Содержимое кейса"); safeSetText(elements.spinBtn, "Открыть (0.1 GRAM)"); renderRewardsGrid(); updateDailyCaseTimer(); navigateTo('case'); });

        function renderRewardsGrid() {
            if (!elements.rewardsGrid) return;
            elements.rewardsGrid.innerHTML = '';
            const currentPool = isNewbieCaseMode ? NEWBIE_GIFT_POOL : GIFT_POOL;
            currentPool.forEach(gift => {
                const card = document.createElement('div');
                card.className = `reward-card ${gift.isGold ? 'gold-tier' : ''}`;
                card.innerHTML = `<div class="reward-price-top">${gift.price}</div><img src="${gift.icon}" onerror="this.src='https://img.icons8.com/color/96/gift.png'"><div style="margin-bottom: 8px;"></div>`;
                elements.rewardsGrid.appendChild(card);
            });
        }

        function initRouletteTrack() {
            if (!elements.rouletteTrack) return;
            elements.rouletteTrack.style.transition = 'none';
            elements.rouletteTrack.style.transform = 'translate3d(0, 0, 0)';
            void elements.rouletteTrack.offsetWidth;
            elements.rouletteTrack.innerHTML = '';
            const currentPool = isNewbieCaseMode ? NEWBIE_GIFT_POOL : GIFT_POOL;
            for (let i = 0; i < 60; i++) {
                const randomItem = currentPool[Math.floor(Math.random() * currentPool.length)];
                const itemEl = document.createElement('div');
                itemEl.className = 'roulette-item';
                itemEl.innerHTML = `<img src="${randomItem.icon}" onerror="this.src='https://img.icons8.com/color/96/gift.png'"><span>${randomItem.price}</span>`;
                elements.rouletteTrack.appendChild(itemEl);
            }
        }

        function spinRoulette(winningItem, onComplete) {
            if (!elements.rouletteTrack) return;
            const itemWidth = 96, gap = 8, itemFullWidth = itemWidth + gap, targetIndex = 45;
            const trackItems = elements.rouletteTrack.children;
            if (trackItems[targetIndex]) {
                trackItems[targetIndex].className = 'roulette-item';
                trackItems[targetIndex].innerHTML = `<img src="${winningItem.icon}" onerror="this.src='https://img.icons8.com/color/96/gift.png'"><span>${winningItem.price}</span>`;
            }
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

            if (isBalance) {
                showCustomModal({ icon: '💰', title: 'Баланс пополнен!', message: `🎉 Вы выиграли пополнение счета на +${winningGift.price}!`, buttons: [{ text: 'Отлично!', primary: true }] });
                triggerBalanceBadge(winningGift.rawPrice);
                fetchUserData();
            } else {
                showCustomModal({
                    icon: `<img src="${winningGift.icon}" style="width:70px;height:70px;object-fit:contain;" onerror="this.src='https://img.icons8.com/color/96/gift.png'">`,
                    title: 'Вы выиграли подарок!',
                    message: `🎁 Ваша награда: "${formatItemName(winningGift.name)}" сохранена в инвентарь!`,
                    buttons: [{ text: `Продать за ${winningGift.price}`, primary: true, onClick: async () => { await fetch(`${API_BASE_URL}/api/sell_gift`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initDataHeader }, body: JSON.stringify({ itemId: winningGift.id, price: winningGift.rawPrice }) }); fetchUserData(); fetchInventory(); } }, { text: 'В инвентарь', primary: false, onClick: () => { showNotification(`📦 Сохранено в инвентарь!`, '🎒'); fetchUserData(); } }]
                });
            }
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
                    } else {
                        if (isNewbieCaseMode) triggerBalanceBadge(spinCost);
                        fetchUserData();
                        showNotification(data.error || 'Ошибка.', "⚠️");
                        elements.spinBtn.disabled = false;
                    }
                } catch (error) {
                    if (isNewbieCaseMode) triggerBalanceBadge(spinCost);
                    fetchUserData(); elements.spinBtn.disabled = false;
                    showNotification('Ошибка сети при открытии.', '⚠️');
                }
            }, 50);
        });

        // ===================== ИНВЕНТАРЬ И ДЕПОЗИТ =====================
        async function fetchInventory() {
            if (!elements.inventoryGrid) return;
            try {
                const res = await fetchWithTimeout(`${API_BASE_URL}/api/inventory`, { headers: { 'X-Telegram-Init-Data': initDataHeader }, timeout: 3000 });
                if (res.status === 403) { showBannedScreen(); return; }
                if (!res.ok) throw new Error();
                const items = await res.json();
                elements.inventoryGrid.innerHTML = '';

                if (items.length === 0) {
                    elements.inventoryGrid.innerHTML = `<div class="empty-inventory">🎒 Ваш инвентарь пуст.<br>Открывайте кейсы!</div>`;
                    return;
                }

                items.forEach(item => {
                    const matchedItem = GIFT_POOL.find(g => parseInt(g.id) === parseInt(item.item_id)) || NEWBIE_GIFT_POOL.find(g => parseInt(g.id) === parseInt(item.item_id)) || {};
                    const imageSrc = matchedItem.icon || item.image_url;

                    const card = document.createElement('div');
                    card.className = 'reward-card';
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

                    card.querySelector('.withdraw-btn').addEventListener('click', () => {
                        showCustomModal({
                            icon: `<img src="${imageSrc}" style="width:70px;height:70px;object-fit:contain;" onerror="this.src='https://img.icons8.com/color/96/gift.png'">`,
                            title: 'Вывод подарка',
                            message: `Отправить "${formatItemName(item.name)}" вам в Telegram?`,
                            buttons: [{ text: 'Подтвердить вывод', primary: true, onClick: async () => {
                                const withdrawRes = await fetchWithTimeout(`${API_BASE_URL}/api/withdraw_gift`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initDataHeader }, body: JSON.stringify({ itemId: item.item_id }), timeout: 3000 });
                                if (withdrawRes.status === 403) { showBannedScreen(); return; }
                                if (withdrawRes.ok) { showNotification(`Подарок в очереди на вывод!`, '📥'); fetchInventory(); }
                                else { const errorData = await withdrawRes.json(); showNotification(errorData.error || 'Заявка отклонена.', '⚠️'); }
                            } }, { text: 'Отмена', primary: false }]
                        });
                    });

                    card.querySelector('.sell-btn').addEventListener('click', () => {
                        showCustomModal({
                            icon: '💰', title: 'Продажа подарка', message: `Продать подарок "${formatItemName(item.name)}" за ${item.value} GRAM?`,
                            buttons: [{ text: 'Продать за GRAM', primary: true, onClick: async () => {
                                const sellRes = await fetchWithTimeout(`${API_BASE_URL}/api/sell_gift`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initDataHeader }, body: JSON.stringify({ itemId: item.item_id, price: item.value }), timeout: 3000 });
                                if (sellRes.status === 403) { showBannedScreen(); return; }
                                if (sellRes.ok) { const sellData = await sellRes.json(); currentUser.balance = sellData.newBalance; triggerBalanceBadge(parseFloat(item.value)); fetchUserData(); fetchInventory(); }
                            } }, { text: 'Отмена', primary: false }]
                        });
                    });

                    // НОВАЯ КНОПКА "ОТПРАВИТЬ"
                    card.querySelector('.send-btn').addEventListener('click', () => {
                        openSendGiftModal(items);
                    });

                    elements.inventoryGrid.appendChild(card);
                });
            } catch (error) { console.error("Inventory fetch error:", error); }
        }

        // ===================== БАЛАНС =====================
        function updateBalanceUI(forcedValue = null) {
            const baseBalance = (currentUser && currentUser.balance) ? parseFloat(currentUser.balance) : 0;
            const val = forcedValue !== null ? parseFloat(forcedValue) : baseBalance;
            const myIdStr = String(userId);
            const serverMe = arenaPlayers.find(p => String(p.userId) === myIdStr);
            const serverMyBet = serverMe ? parseFloat(serverMe.bet) : 0;
            const diff = Math.max(0, localExpectedBetAmount - serverMyBet);
            const finalBalance = Math.max(0, val - diff);
            const balVal = isNaN(finalBalance) ? "0.000" : finalBalance.toFixed(3);
            safeSetText(elements.balanceDisplayPill, balVal);
            safeSetText(elements.largeBalanceDisplay, balVal);
        }

        let dailyCaseTimerInterval;
        function updateDailyCaseTimer() {
            clearInterval(dailyCaseTimerInterval);
            if (currentUser && (currentUser.isAdmin === true || currentUser.isAdmin === "true")) {
                if (elements.spinBtn) { elements.spinBtn.classList.remove('hidden'); elements.spinBtn.disabled = false; }
                document.getElementById('timer-container')?.classList.add('hidden');
                return;
            }
            if (isNewbieCaseMode) {
                if (elements.spinBtn) { elements.spinBtn.classList.remove('hidden'); elements.spinBtn.disabled = false; }
                document.getElementById('timer-container')?.classList.add('hidden');
                return;
            }
            if (!currentUser.last_daily_case_open) {
                if (elements.spinBtn) { elements.spinBtn.classList.remove('hidden'); elements.spinBtn.disabled = false; }
                document.getElementById('timer-container')?.classList.add('hidden');
                return;
            }
            const lastOpen = new Date(currentUser.last_daily_case_open);
            const now = new Date();
            const cooldown = 24 * 60 * 60 * 1000;
            const nextOpenTime = new Date(lastOpen.getTime() + cooldown);
            const timeLeftMs = nextOpenTime.getTime() - now.getTime();

            if (timeLeftMs <= 0) {
                if (elements.spinBtn) { elements.spinBtn.classList.remove('hidden'); elements.spinBtn.disabled = false; }
                document.getElementById('timer-container')?.classList.add('hidden');
            } else {
                if (elements.spinBtn) { elements.spinBtn.classList.add('hidden'); elements.spinBtn.disabled = true; }
                const t = document.getElementById('timer-container'); if (t) t.classList.remove('hidden');
                const tick = () => {
                    const nowTick = new Date();
                    const diff = nextOpenTime.getTime() - nowTick.getTime();
                    if (diff <= 0) { clearInterval(dailyCaseTimerInterval); updateDailyCaseTimer(); return; }
                    const hours = Math.floor(diff / (1000 * 60 * 60));
                    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                    safeSetText(document.getElementById('daily-case-timer'), `${hours}ч ${minutes}м ${seconds}с`);
                };
                tick();
                dailyCaseTimerInterval = setInterval(tick, 1000);
            }
        }

        async function fetchUserData() {
            try {
                const res = await fetchWithTimeout(`${API_BASE_URL}/api/user`, { headers: { 'X-Telegram-Init-Data': initDataHeader }, timeout: 4000 });
                if (res.status === 403) { showBannedScreen(); return; }
                if (!res.ok) throw new Error();
                currentUser = await res.json();
                saveUserDataToCache(currentUser);
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
            updateDailyCaseTimer();
            renderBetButtons();
        }

        renderRewardsGrid();
        fetchUserData();
        navigateTo('home');

    } catch (globalError) { console.error("Global init error:", globalError); }
});

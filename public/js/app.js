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

// FALLBACK ДЛЯ ТЕСТОВ
let localGuestId = localStorage.getItem('mock_guest_id');
if (!localGuestId) {
    localGuestId = 'guest_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('mock_guest_id', localGuestId);
}

let initDataHeader = tg.initData || "";
if (!initDataHeader) {
    const mockUser = {
        id: localGuestId,
        username: "Игрок_" + localGuestId.substring(6),
        first_name: "Игрок",
        photo_url: "https://img.icons8.com/color/96/user.png"
    };
    initDataHeader = "user=" + encodeURIComponent(JSON.stringify(mockUser));
}

function formatUsername(name) {
    if (!name) return "Пользователь";
    return name.length > 15 ? name.substring(0, 15) + "..." : name;
}

function formatItemName(name) {
    if (!name) return "";
    let clean = name.replace(/\.(png|jpg|jpeg)$/i, '');
    clean = clean.replace(/_/g, ' ');
    return clean.trim();
}

function getFriendlyAddress(rawAddress) {
    try {
        if (typeof TON_CONNECT_UI !== 'undefined' && TON_CONNECT_UI.toUserFriendlyAddress) {
            return TON_CONNECT_UI.toUserFriendlyAddress(rawAddress);
        }
    } catch(e) {}
    return rawAddress; 
}

function formatWalletAddress(rawAddress) {
    if (!rawAddress) return "";
    const friendly = getFriendlyAddress(rawAddress);
    return friendly.substring(0, 4) + "-..." + friendly.substring(friendly.length - 4);
}

function preloadImages(urls) {
    urls.forEach(url => {
        const img = new Image();
        img.src = url;
    });
}

function createPRNG(seedString) {
    let h = 1779033703 ^ seedString.length;
    for (let i = 0; i < seedString.length; i++) {
        h = Math.imul(h ^ seedString.charCodeAt(i), 3432918353);
        h = h << 13 | h >>> 19;
    }
    return function() {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return ((h ^= h >>> 16) >>> 0) / 4294967296;
    }
}

// Стабильная палитра цветов
const defaultColors = ['#8d3df5', '#00e676', '#0088cc', '#ff9500', '#ff3b30', '#c25dff'];

function getUserColor(userId, roundNumber) {
    const idStr = String(userId || 'guest') + "_" + String(roundNumber || 1);
    let hash = 0;
    for (let i = 0; i < idStr.length; i++) {
        hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % defaultColors.length;
    return defaultColors[index];
}

async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 10000 } = options; 
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

// ВСПЛЫВАЮЩИЕ ПИЛЮЛИ ИЗМЕНЕНИЯ БАЛАНСА
function triggerBalanceBadge(amount) {
    const container = document.getElementById('balance-badge-container');
    if (!container) return;

    const badge = document.createElement('div');
    const isNegative = amount < 0;
    badge.className = `balance-popup-badge ${isNegative ? 'negative' : 'positive'}`;
    
    const formattedAmount = (isNegative ? '' : '+') + amount.toFixed(3);
    badge.innerText = formattedAmount;

    container.appendChild(badge);

    setTimeout(() => {
        badge.remove();
    }, 2500);
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
        let currentRoundSignature = null;
        let arenaStatusStr = "waiting";

        let lastAnimatedRound = null;
        let localExpectedBetAmount = 0;
        let lastObservedRoundNumber = null;
        let lastRenderedBalance = null;

        let countdownIntervalId = null;
        let localCountdownValue = 0;

        let preloadedAdminAddress = null;
        let preloadedPayloadBase64 = null;
        let isPreloadingPayment = false;

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
            bomzhCaseBanner: document.getElementById('bomzh-case-banner'),
            krutoyCaseBanner: document.getElementById('krutoy-case-banner'),
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
            if (elements.bannedOverlay) {
                elements.bannedOverlay.classList.remove('hidden');
            }
            stopArenaPolling();
            if (elements.bottomNavigation) elements.bottomNavigation.classList.add('hidden');
            const sections = [
                elements.homeSection, elements.caseSection, elements.inventorySection, 
                elements.ratingSection, elements.balanceSection, elements.arenaSection
            ];
            sections.forEach(s => { if (s) s.classList.add('hidden'); });
        }

        async function fetchPaymentParamsInternal() {
            preloadedAdminAddress = null;
            preloadedPayloadBase64 = null;

            const addrEndpoints = [
                `${API_BASE_URL}/api/deposit_address`,
                `${API_BASE_URL}/api/deposit-address`,
                `${API_BASE_URL}/api/address`
            ];
            for (const url of addrEndpoints) {
                try {
                    const res = await fetchWithTimeout(url, { timeout: 15000 });
                    if (res.ok) {
                        const data = await res.json();
                        preloadedAdminAddress = data.address || data.deposit_address || data.wallet;
                        if (preloadedAdminAddress) break;
                    }
                } catch (e) {}
            }

            const payloadEndpoints = [
                `${API_BASE_URL}/api/generate_payload?text=${userId}`,
                `${API_BASE_URL}/api/generate-payload?text=${userId}`,
                `${API_BASE_URL}/api/payload?text=${userId}`
            ];
            for (const url of payloadEndpoints) {
                try {
                    const res = await fetchWithTimeout(url, { timeout: 15000 });
                    if (res.ok) {
                        const data = await res.json();
                        preloadedPayloadBase64 = data.payload || data.payload_base64;
                        if (preloadedPayloadBase64) break;
                    }
                } catch (e) {}
            }

            return preloadedAdminAddress && preloadedPayloadBase64;
        }

        async function ensurePaymentParamsForUserAction() {
            if (preloadedAdminAddress && preloadedPayloadBase64) {
                return true; 
            }

            if (isPreloadingPayment) {
                let waitedTime = 0;
                while (isPreloadingPayment && waitedTime < 15000) { 
                    await new Promise(r => setTimeout(r, 500));
                    waitedTime += 500;
                }
                if (preloadedAdminAddress && preloadedPayloadBase64) return true;
            }

            isPreloadingPayment = true;
            let attempts = 0;
            const MAX_ATTEMPTS = 2; 
            let success = false;
            while (attempts < MAX_ATTEMPTS) {
                success = await fetchPaymentParamsInternal();
                if (success) break;
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            isPreloadingPayment = false;
            return success;
        }
        
        fetchPaymentParamsInternal();

        function loadSavedBets() {
            try {
                const saved = localStorage.getItem(`custom_bets_${userId}`);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length === 3) {
                        customBets = parsed.map(v => {
                            const num = parseFloat(v);
                            return (isNaN(num) || num < 0.1) ? 0.1 : num;
                        });
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
                        if (cache.is_banned === true || cache.is_banned === 'true') {
                            showBannedScreen();
                            return;
                        }
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
            try {
                localStorage.setItem(`user_cache_${userId}`, JSON.stringify(userData));
            } catch (e) {}
        }

        loadSavedBets();
        loadCachedUserData();

        function showNotification(message, icon = '🎁') {
            const container = document.getElementById('toast-container');
            if (!container) return;

            const toast = document.createElement('div');
            toast.className = 'custom-toast';
            toast.innerHTML = `
                <div class="custom-toast-icon">${icon}</div>
                <div class="custom-toast-content">${message}</div>
                <button class="custom-toast-close">&times;</button>
            `;
            container.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 50);

            toast.querySelector('.custom-toast-close').addEventListener('click', () => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 400);
            });

            setTimeout(() => {
                if (toast.parentNode) {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 400);
                }
            }, 5000);
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
                btn.addEventListener('click', () => {
                    overlay.classList.add('hidden');
                    if (btnConfig.onClick) btnConfig.onClick();
                });
                if (actionsContainer) actionsContainer.appendChild(btn);
            });

            const handleClose = () => {
                overlay.classList.add('hidden');
                if (onClose) onClose();
            };

            if (closeX) closeX.onclick = handleClose;
            overlay.classList.remove('hidden');
        }

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
                                    buttons: [
                                        {
                                            text: 'Отвязать',
                                            primary: true,
                                            onClick: async () => {
                                                await tonConnectUI.disconnect();
                                                showNotification("Кошелек успешно отвязан", "🔌");
                                            }
                                        },
                                        { text: 'Отмена', primary: false }
                                    ]
                                });
                            } else {
                                await tonConnectUI.openModal();
                            }
                        });
                    }
                }
            };

            if (window.TON_CONNECT_UI || window.TonConnectUI) {
                initTonConnect();
            } else {
                document.addEventListener('ton-connect-ui-loaded', initTonConnect);
            }
        } catch (err) {}

        if (elements.depositBalanceBtn) {
            elements.depositBalanceBtn.addEventListener('click', async () => {
                elements.depositBalanceBtn.disabled = true; 
                const success = await ensurePaymentParamsForUserAction();
                if (success) {
                    elements.depositAmountModal.classList.remove('hidden');
                    if (elements.modalDepositInput) elements.modalDepositInput.value = "0.1";
                } else {
                    showNotification("Не удалось получить адрес пополнения. Повторите попытку.", "⚠️");
                }
                elements.depositBalanceBtn.disabled = false; 
            });
        }

        const closeDepositModal = () => {
            if (elements.depositAmountModal) elements.depositAmountModal.classList.add('hidden');
        };

        if (elements.depositModalCloseBtn) elements.depositModalCloseBtn.addEventListener('click', closeDepositModal);
        if (elements.modalDepositCancelBtn) elements.modalDepositCancelBtn.addEventListener('click', closeDepositModal);

        if (elements.modalDepositConfirmBtn) {
            elements.modalDepositConfirmBtn.addEventListener('click', async () => {
                const amount = parseFloat(elements.modalDepositInput.value);
                if (isNaN(amount) || amount < 0.1) {
                    showNotification("Минимальная сумма пополнения — 0.1 TON", "⚠️");
                    return;
                }

                if (!tonConnectUI || !tonConnectUI.connected) {
                    showNotification("Пожалуйста, сначала привяжите кошелек!", "⚠️");
                    return;
                }

                if (!preloadedAdminAddress || !preloadedPayloadBase64) {
                    showNotification("Реквизиты потеряны, повторная попытка...", "⏳");
                    const success = await ensurePaymentParamsForUserAction();
                    if (!success) {
                        showNotification("Не удалось получить адрес. Попробуйте еще раз.", "⚠️");
                        closeDepositModal();
                        return;
                    }
                }

                closeDepositModal();

                try {
                    const nanoAmount = Math.floor(amount * 1000000000).toString();

                    const transaction = {
                        validUntil: Math.floor(Date.now() / 1000) + 360,
                        messages: [
                            {
                                address: preloadedAdminAddress, 
                                amount: nanoAmount,
                                payload: preloadedPayloadBase64 
                            }
                        ]
                    };

                    showNotification("Подтвердите транзакцию...", "⏳");
                    const result = await tonConnectUI.sendTransaction(transaction);

                    if (result) {
                        currentUser.balance = parseFloat((parseFloat(currentUser.balance) + amount).toFixed(3));
                        updateBalanceUI();
                        triggerBalanceBadge(amount);
                        showNotification(`Баланс пополнен на +${amount.toFixed(3)} TON!`, "💎");

                        fetch(`${API_BASE_URL}/api/verify_payment`, {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'X-Telegram-Init-Data': initDataHeader
                            },
                            body: JSON.stringify({ amount: amount })
                        }).then(res => {
                            if (res.status === 403) showBannedScreen();
                            else if (res.ok) fetchUserData();
                        }).catch(e => console.error("Verify backend error:", e));
                    }
                } catch (err) {
                    showNotification("Транзакция отменена кошельком.", "⚠️");
                }
            });
        }

        // -----------------------------------------------------------------------
        // ГЕОМЕТРИЧЕСКИЙ ДВИЖОК SVG И МУЛЬТИПЛЕЕРНАЯ СИНХРОНИЗАЦИЯ BEST ARENA
        // -----------------------------------------------------------------------
        
        function calculateSharesProtection(players) {
            const N = players.length;
            if (N === 0) return [];
            let bets = players.map(p => {
                const val = parseFloat(p.bet);
                return isNaN(val) ? 0 : val;
            });
            const total = bets.reduce((a, b) => a + b, 0);
            if (total === 0) return bets.map(() => 1 / N);

            let rawShares = bets.map(b => b / total);
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

        function getSquareIntersection(angle) {
            const cx = 160, cy = 160;
            const size = 320;
            const halfSize = size / 2;
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
            if (Math.abs(angle - Math.PI/2) < 0.001) return {x: cx, y: cy + halfSize};
            if (Math.abs(angle - Math.PI) < 0.001) return {x: cx - halfSize, y: cy};
            if (Math.abs(angle - 3*Math.PI/2) < 0.001) return {x: cx, y: cy - halfSize};
            return { x: cx + halfSize, y: cy }; 
        }

        function getCornerAnglesRad() {
            return [
                Math.atan2(1, 1),      
                Math.atan2(1, -1),     
                Math.atan2(-1, -1),    
                Math.atan2(-1, 1)      
            ].map(a => (a < 0 ? a + 2 * Math.PI : a)); 
        }

        function drawArenaSegments() {
            try {
                const svg = document.getElementById('arena-svg-canvas');
                const avatarsContainer = document.getElementById('arena-avatars-container');
                if (!svg || !avatarsContainer) return;

                if (arenaStatusStr === 'waiting') {
                    isBallAnimating = false;
                }

                if (isBallAnimating) return;

                svg.innerHTML = '';
                avatarsContainer.innerHTML = '';

                const N = arenaPlayers.length;
                if (N === 0) return;

                const W = 320; 
                const H = 320;
                const CX = W / 2;
                const CY = H / 2;

                const shares = calculateSharesProtection(arenaPlayers);
                
                if (N === 1) {
                    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    rect.setAttribute("x", "0");
                    rect.setAttribute("y", "0");
                    rect.setAttribute("width", "100%");
                    rect.setAttribute("height", "100%");
                    rect.setAttribute("fill", arenaPlayers[0].color);
                    svg.appendChild(rect);
                    
                    createAvatarElement(CX, 240, arenaPlayers[0].avatar, 56); 
                    return; 
                }

                if (N === 2) {
                    const s = Math.sqrt(2 * shares[0]); 
                    const sizeX = (W * s);
                    const sizeY = (H * s);

                    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    bg.setAttribute("width", "100%");
                    bg.setAttribute("height", "100%");
                    bg.setAttribute("fill", arenaPlayers[1].color); 
                    svg.appendChild(bg);

                    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                    const p1Pts = [{x:0, y:0}, {x:sizeX, y:0}, {x:0, y:sizeY}];
                    poly.setAttribute("points", p1Pts.map(p => `${p.x},${p.y}`).join(' '));
                    poly.setAttribute("fill", arenaPlayers[0].color); 
                    svg.appendChild(poly);

                    const c1 = getPolygonCentroid(p1Pts);
                    const p2Pts = [ 
                        {x:sizeX, y:0}, {x:W, y:0}, {x:W, y:H}, {x:0, y:H}, {x:0, y:sizeY}
                    ];
                    const c2 = getPolygonCentroid(p2Pts);

                    createAvatarElement(c1.x, c1.y, arenaPlayers[0].avatar, 24 + shares[0] * 30);
                    createAvatarElement(c2.x, c2.y, arenaPlayers[1].avatar, 24 + shares[1] * 30);
                    return; 
                }

                let currentAngle = -Math.PI / 2; 
                const corners = getCornerAnglesRad(); 

                for (let i = 0; i < N; i++) {
                    const player = arenaPlayers[i];
                    const share = shares[i];
                    let nextAngle = currentAngle + 2 * Math.PI * share;

                    const pathPoints = [];
                    pathPoints.push({ x: CX, y: CY }); 

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

                    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                    poly.setAttribute("points", pathPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
                    poly.setAttribute("fill", player.color);
                    svg.appendChild(poly);

                    const c = getPolygonCentroid(pathPoints);
                    createAvatarElement(c.x, c.y, player.avatar, 24 + share * 24);

                    currentAngle = nextAngle;
                }
            } catch(e) {
                console.error("Error drawing arena segments:", e);
            }
        }

        function getPlayerAtCoords(x, y) {
            const N = arenaPlayers.length;
            if (N === 0) return null;
            if (N === 1) return arenaPlayers[0];

            const shares = calculateSharesProtection(arenaPlayers);

            if (N === 2) {
                const W = 320, H = 320;
                const s = Math.sqrt(2 * shares[0]);
                const sizeX = (W * s);
                const sizeY = (H * s);
                if (x >= 0 && x <= sizeX && y >= 0 && y <= sizeY && (x/sizeX + y/sizeY <= 1)) {
                    return arenaPlayers[0];
                }
                return arenaPlayers[1];
            } else {
                const CX = 160, CY = 160;
                let angle = Math.atan2(y - CY, x - CX);
                if (angle < 0) angle += 2 * Math.PI; 

                let currentSearchAngle = (-Math.PI / 2); 
                for (let i = 0; i < arenaPlayers.length; i++) {
                    const player = arenaPlayers[i];
                    const share = shares[i];
                    const nextSearchAngle = currentSearchAngle + 2 * Math.PI * share;

                    let normalizedCurrent = (currentSearchAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                    let normalizedNext = (nextSearchAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                    let normalizedAngle = angle;

                    if (nextSearchAngle > currentSearchAngle && normalizedNext < normalizedCurrent) {
                        normalizedNext += 2 * Math.PI;
                    }
                    if (normalizedAngle < normalizedCurrent && nextSearchAngle > currentSearchAngle) { 
                        normalizedAngle += 2 * Math.PI;
                    }

                    if (normalizedAngle >= normalizedCurrent && normalizedAngle <= normalizedNext) {
                        return player;
                    }
                    currentSearchAngle = nextSearchAngle;
                }
                return arenaPlayers[arenaPlayers.length - 1]; 
            }
        }

        function createAvatarElement(x, y, src, size) {
            const container = document.getElementById('arena-avatars-container');
            if (!container) return;
            const img = document.createElement('img');
            img.className = 'arena-player-avatar-node';
            img.src = src;
            img.style.left = `${x}px`;
            img.style.top = `${y}px`;
            img.style.width = `${size}px`;
            img.style.height = `${size}px`;
            img.onerror = () => { img.src = "https://img.icons8.com/color/96/user.png"; };
            container.appendChild(img);
        }

        function updatePlayersListUI() {
            try {
                const listContainer = document.getElementById('arena-players-list');
                if (!listContainer) return;

                if (arenaPlayers.length === 0) {
                    listContainer.innerHTML = `<div class="empty-list-placeholder">Ставок еще нет. Станьте первым!</div>`;
                    safeSetText(elements.arenaPlayersTotal, '0');
                    return;
                }

                let totalBetSum = 0;
                arenaPlayers.forEach(p => {
                    const val = parseFloat(p.bet);
                    if (!isNaN(val)) totalBetSum += val;
                });

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
            } catch (e) { console.error("Error updating players list UI:", e); }
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

                if (balance >= betVal && !blockBets) {
                    btn.className = "bet-button active";
                    btn.disabled = false;
                } else {
                    btn.className = "bet-button disabled";
                    btn.disabled = true;
                }
            }
        }

        function simulateBallPathDeterministic(targetX, targetY, seedSignature, boardWidth = 320, boardHeight = 320, ballRadius = 8) {
            const friction = 0.981; 
            const rng = createPRNG(seedSignature);

            const rngSpeed = createPRNG(seedSignature + "_speed_determinator");
            const baseRoundSpeed = 38 + rngSpeed() * 57; 

            for (let trial = 0; trial < 3000; trial++) {
                const startX = boardWidth / 2;
                const startY = boardHeight / 2;

                const angle = rng() * Math.PI * 2;
                const speed = baseRoundSpeed + rng() * 10; 

                let vx = Math.cos(angle) * speed;
                let vy = Math.sin(angle) * speed;

                let path = [];
                let currentVx = vx;
                let currentVy = vy;
                let currentX = startX;
                let currentY = startY;

                while (Math.abs(currentVx) > 0.04 || Math.abs(currentVy) > 0.04) {
                    currentX += currentVx;
                    currentY += currentVy;

                    if (currentX - ballRadius < 0) {
                        currentX = ballRadius;
                        currentVx = -currentVx;
                    } else if (currentX + ballRadius > boardWidth) {
                        currentX = boardWidth - ballRadius;
                        currentVx = -currentVx;
                    }

                    if (currentY - ballRadius < 0) {
                        currentY = ballRadius;
                        currentVy = -currentVy;
                    } else if (currentY + ballRadius > boardHeight) {
                        currentY = boardHeight - ballRadius;
                        currentVy = -currentVy;
                    }

                    currentVx *= friction;
                    currentVy *= friction;

                    path.push({ x: currentX, y: currentY });
                }

                const dx = currentX - targetX;
                const dy = currentY - targetY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 15) { 
                    return { path };
                }
            }
            return null; 
        }

        function animateBouncingBall(targetX, targetY, seedSignature, onComplete) {
            if (isBallAnimating) return;
            isBallAnimating = true;

            renderBetButtons(); 

            const ballCanvas = document.getElementById('arena-ball-svg');
            if (!ballCanvas) return;

            ballCanvas.innerHTML = ''; 

            const ballElement = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            ballElement.setAttribute("id", "physics-ball");
            ballElement.setAttribute("r", "8");
            ballElement.setAttribute("fill", "#ffffff");
            ballCanvas.appendChild(ballElement);

            const textElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
            textElement.setAttribute("id", "physics-ball-text");
            textElement.setAttribute("fill", "#ffffff");
            textElement.setAttribute("font-size", "12");
            textElement.setAttribute("font-weight", "900");
            textElement.setAttribute("text-anchor", "middle");
            textElement.setAttribute("filter", "drop-shadow(0px 2px 3px rgba(0,0,0,0.9))");
            ballCanvas.appendChild(textElement);

            const W = 320;
            const H = 320;

            let simulation = simulateBallPathDeterministic(targetX, targetY, seedSignature, W, H, 8);
            let lastMatchedPlayer = null;

            if (!simulation) {
                let frame = 0;
                const totalFrames = 180; 
                const step = () => {
                    if (frame >= totalFrames) {
                        isBallAnimating = false;
                        onComplete();
                        return;
                    }
                    const t = frame / totalFrames;
                    const easeOut = 1 - Math.pow(1 - t, 3); 
                    const currentX = (W / 2) + (targetX - (W / 2)) * easeOut;
                    const currentY = (H / 2) + (targetY - (H / 2)) * easeOut;

                    ballElement.setAttribute("cx", currentX.toFixed(1));
                    ballElement.setAttribute("cy", currentY.toFixed(1));

                    const textX = currentX;
                    const isNearTopWall = currentY < 40;
                    const textY = isNearTopWall ? (currentY + 24) : (currentY - 16);

                    textElement.setAttribute("x", textX.toFixed(1));
                    textElement.setAttribute("y", textY.toFixed(1));

                    const activePlayer = getPlayerAtCoords(currentX, currentY) || lastMatchedPlayer || arenaPlayers[0];
                    if (activePlayer && activePlayer.username) {
                        lastMatchedPlayer = activePlayer;
                        textElement.textContent = activePlayer.username;
                    } else {
                        textElement.textContent = "Игрок";
                    }

                    frame++;
                    requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
                return;
            }

            let frameIndex = 0;
            const path = simulation.path;

            const renderFrame = () => {
                if (frameIndex >= path.length) {
                    isBallAnimating = false;
                    onComplete();
                    return;
                }

                const pos = path[frameIndex];
                ballElement.setAttribute("cx", pos.x.toFixed(1));
                ballElement.setAttribute("cy", pos.y.toFixed(1));

                const textX = pos.x;
                const isNearTopWall = pos.y < 40;
                const textY = isNearTopWall ? (pos.y + 24) : (pos.y - 16);

                textElement.setAttribute("x", textX.toFixed(1));
                textElement.setAttribute("y", textY.toFixed(1));

                const activePlayer = getPlayerAtCoords(pos.x, pos.y) || lastMatchedPlayer || arenaPlayers[0];
                if (activePlayer && activePlayer.username) {
                    lastMatchedPlayer = activePlayer;
                    textElement.textContent = activePlayer.username;
                } else {
                    textElement.textContent = "Игрок";
                }

                frameIndex++;
                requestAnimationFrame(renderFrame);
            };

            requestAnimationFrame(renderFrame);
        }

        function getMergedPlayers(serverPlayers, roundNumber) {
            const myIdStr = String(userId);
            const serverMe = serverPlayers.find(p => String(p.userId) === myIdStr);
            const serverMyBet = serverMe ? parseFloat(serverMe.bet) : 0;

            if (serverMyBet >= localExpectedBetAmount) {
                localExpectedBetAmount = serverMyBet;
            }

            const diff = localExpectedBetAmount - serverMyBet;
            let merged = serverPlayers.map(p => ({ ...p }));

            if (diff > 0.0001) {
                const existingMe = merged.find(p => String(p.userId) === myIdStr);
                if (existingMe) {
                    existingMe.bet = parseFloat(existingMe.bet) + diff;
                } else {
                    const myAvatar = currentUser.avatar_url || "https://img.icons8.com/color/96/user.png";
                    const myName = currentUser.username || currentUser.first_name || "Я";
                    
                    const chosenColor = getUserColor(userId, roundNumber);

                    merged.push({
                        userId: userId,
                        username: myName,
                        avatar: myAvatar,
                        bet: diff,
                        color: chosenColor
                    });
                }
            }
            return merged;
        }

        async function pollArenaLoop() {
            if (!isPollingActive) return;

            const arenaSection = document.getElementById('arena-section');
            if (!arenaSection || arenaSection.classList.contains('hidden')) {
                stopArenaPolling();
                return;
            }

            try {
                const res = await fetchWithTimeout(`${API_BASE_URL}/api/arena/state`, {
                    headers: { 'X-Telegram-Init-Data': initDataHeader },
                    timeout: 4000
                });

                if (res.status === 403) {
                    showBannedScreen();
                    return;
                }

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
                        color: bet.color || getUserColor(bet.userId || bet.user_id || bet.id, correctRoundNumber)
                    }));

                    if (correctRoundNumber !== lastObservedRoundNumber) {
                        localExpectedBetAmount = 0;
                        lastObservedRoundNumber = correctRoundNumber;
                        isBallAnimating = false;
                        const ballCanvas = document.getElementById('arena-ball-svg');
                        if (ballCanvas) ballCanvas.innerHTML = '';
                    }

                    if (arenaStatusStr === 'waiting' && serverPlayers.length === 0) {
                        localExpectedBetAmount = 0;
                    }

                    arenaPlayers = getMergedPlayers(serverPlayers, correctRoundNumber);

                    drawArenaSegments();
                    updatePlayersListUI();

                    const statusText = document.getElementById('arena-status-text');
                    const countdownTimer = document.getElementById('arena-countdown-timer');

                    const stateTimeLeft = state.timeLeft !== undefined ? state.timeLeft : (state.time_left !== undefined ? state.time_left : (state.timer !== undefined ? state.timer : ""));
                    const serverTime = state.serverTime || Date.now(); 
                    const resolvedAt = state.resolvedAt || 0; 

                    if (arenaStatusStr === 'countdown') {
                        if (statusText) statusText.classList.add('hidden');
                        
                        localCountdownValue = parseInt(stateTimeLeft, 10);
                        if (!isNaN(localCountdownValue)) {
                            if (countdownTimer) {
                                countdownTimer.classList.remove('hidden');
                                countdownTimer.innerText = localCountdownValue;
                            }
                            
                            clearInterval(countdownIntervalId);
                            countdownIntervalId = setInterval(() => {
                                localCountdownValue--;
                                if (localCountdownValue <= 0) {
                                    clearInterval(countdownIntervalId);
                                    if (countdownTimer) countdownTimer.classList.add('hidden');
                                } else {
                                    if (countdownTimer) {
                                        countdownTimer.classList.remove('hidden');
                                        countdownTimer.innerText = localCountdownValue;
                                    }
                                }
                            }, 1000);
                        }
                    } else if (arenaStatusStr === 'finished') {
                        clearInterval(countdownIntervalId);
                        if (countdownTimer) countdownTimer.classList.add('hidden');

                        const winId = state.winnerId || state.winner_id || "";
                        const winX = state.winnerX || state.winner_x || 0;
                        const winY = state.winnerY || state.winner_y || 0;
                        const winName = state.winnerName || state.winner_name || "Победитель";
                        const tPool = state.totalPool || state.total_pool || state.pool || 0;

                        const signature = winId + "_" + tPool + "_" + winX + "_" + winY + "_" + correctRoundNumber;
                        const age = serverTime - resolvedAt; 

                        if (correctRoundNumber !== lastAnimatedRound && age < 7000) {
                            lastAnimatedRound = correctRoundNumber;
                            currentRoundSignature = signature;
                            
                            if (statusText) statusText.classList.add('hidden');

                            animateBouncingBall(winX, winY, signature, () => {
                                const isWeWinner = (String(winId) === String(userId));
                                if (isWeWinner) {
                                    showCustomModal({
                                        icon: '🏆',
                                        title: 'Победа!',
                                        message: `🎉 Поздравляем! Вы получили весь банк: +${parseFloat(tPool).toFixed(3)} GRAM!`,
                                        buttons: [{ text: 'Забрать!', primary: true }]
                                    });
                                    triggerBalanceBadge(parseFloat(tPool));
                                }
                                
                                const ballCanvas = document.getElementById('arena-ball-svg');
                                if (ballCanvas) ballCanvas.innerHTML = '';
                                
                                fetchUserData();
                            });
                        } else if (correctRoundNumber !== lastAnimatedRound && age >= 7000) {
                            lastAnimatedRound = correctRoundNumber;
                            currentRoundSignature = signature;
                            
                            const ballCanvas = document.getElementById('arena-ball-svg');
                            if (ballCanvas) ballCanvas.innerHTML = '';
                            
                            fetchUserData();
                        }
                    } else {
                        clearInterval(countdownIntervalId);
                        if (statusText && !isBallAnimating) {
                            statusText.classList.remove('hidden');
                            statusText.innerText = "Ждем ставки...";
                        }
                        if (countdownTimer) {
                            countdownTimer.classList.add('hidden');
                        }
                        
                        if (!isBallAnimating) {
                            const ballCanvas = document.getElementById('arena-ball-svg');
                            if (ballCanvas) ballCanvas.innerHTML = '';
                        }
                    }

                    renderBetButtons();
                    updateBalanceUI();
                }
            } catch (err) {
                console.error("Error polling arena state:", err);
            } finally {
                if (isPollingActive) {
                    setTimeout(pollArenaLoop, 1500); 
                }
            }
        }

        function startArenaPolling() {
            if (isPollingActive) return;
            isPollingActive = true;
            pollArenaLoop();
        }

        function stopArenaPolling() {
            isPollingActive = false;
            clearInterval(countdownIntervalId);
        }

        function resetArenaGame() {
            stopArenaPolling();
            const statusText = document.getElementById('arena-status-text');
            const countdownTimer = document.getElementById('arena-countdown-timer');
            const svg = document.getElementById('arena-svg-canvas');
            const avatarsContainer = document.getElementById('arena-avatars-container');
            const ballSvg = document.getElementById('arena-ball-svg');

            if (statusText) {
                statusText.classList.remove('hidden');
                statusText.innerText = "Ждем ставки...";
            }
            if (countdownTimer) countdownTimer.classList.add('hidden');
            if (svg) svg.innerHTML = '';
            if (avatarsContainer) avatarsContainer.innerHTML = '';
            if (ballSvg) ballSvg.innerHTML = ''; 

            safeSetText(elements.arenaRoundNumber, '0');
            safeSetText(elements.arenaPlayersTotal, '0');
            arenaPlayers = []; 
            localExpectedBetAmount = 0; 
            isBallAnimating = false;
            updatePlayersListUI(); 

            renderBetButtons();
        }

        const handleBetClick = async (e) => {
            const btn = e.currentTarget;
            if (btn.classList.contains('disabled')) return;

            const betValue = parseFloat(btn.getAttribute('data-bet'));
            if (isNaN(betValue) || betValue < 0.1) return; 

            localExpectedBetAmount = parseFloat((localExpectedBetAmount + betValue).toFixed(3));
            arenaPlayers = getMergedPlayers(arenaPlayers, lastObservedRoundNumber || 1);
            
            drawArenaSegments();
            updatePlayersListUI();
            updateBalanceUI();

            triggerBalanceBadge(-betValue);

            try {
                const res = await fetchWithTimeout(`${API_BASE_URL}/api/place_bet`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Telegram-Init-Data': initDataHeader
                    },
                    body: JSON.stringify({ amount: betValue }),
                    timeout: 4000
                });

                if (res.status === 403) {
                    showBannedScreen();
                    return;
                }

                const data = await res.json();
                
                if (res.ok && data.success) {
                    currentUser.balance = data.newBalance;
                } else {
                    triggerBalanceBadge(betValue);
                    localExpectedBetAmount = parseFloat(Math.max(0, localExpectedBetAmount - betValue).toFixed(3));
                    fetchUserData();
                }
            } catch (err) {
                triggerBalanceBadge(betValue);
                localExpectedBetAmount = parseFloat(Math.max(0, localExpectedBetAmount - betValue).toFixed(3));
                fetchUserData();
            }
        };

        const betBtn1 = document.getElementById('bet-btn-1');
        const betBtn2 = document.getElementById('bet-btn-2');
        const betBtn3 = document.getElementById('bet-btn-3');
        if (betBtn1) betBtn1.addEventListener('click', handleBetClick);
        if (betBtn2) betBtn2.addEventListener('click', handleBetClick);
        if (betBtn3) betBtn3.addEventListener('click', handleBetClick);

        const editBetsModal = document.getElementById('edit-bets-modal');
        const betEditTrigger = document.getElementById('bet-edit-trigger');
        const editBetsClose = document.getElementById('edit-bets-close-btn');
        const cancelBetsBtn = document.getElementById('cancel-bets-btn');
        const saveBetsBtn = document.getElementById('save-bets-btn');

        if (betEditTrigger) {
            betEditTrigger.addEventListener('click', () => {
                document.getElementById('bet-input-1').value = customBets[0];
                document.getElementById('bet-input-2').value = customBets[1];
                document.getElementById('bet-input-3').value = customBets[2];
                editBetsModal.classList.remove('hidden');
            });
        }

        const closeEditBetsModal = () => {
            editBetsModal.classList.add('hidden');
        };

        if (editBetsClose) editBetsClose.addEventListener('click', closeEditBetsModal);
        if (cancelBetsBtn) cancelBetsBtn.addEventListener('click', closeEditBetsModal);

        const enforceThreeDecimals = (e) => {
            let val = e.target.value;
            val = val.replace(/,/g, '.'); 
            val = val.replace(/[^0-9.]/g, ''); 
            
            const dots = val.split('.');
            if (dots.length > 2) {
                val = dots[0] + '.' + dots.slice(1).join('');
            }
            if (val.includes('.')) {
                const parts = val.split('.');
                if (parts[1].length > 3) {
                    val = parts[0] + '.' + parts[1].substring(0, 3);
                }
            }
            e.target.value = val;
        };

        const betInput1 = document.getElementById('bet-input-1');
        const betInput2 = document.getElementById('bet-input-2');
        const betInput3 = document.getElementById('bet-input-3');
        if (betInput1) betInput1.addEventListener('input', enforceThreeDecimals);
        if (betInput2) betInput2.addEventListener('input', enforceThreeDecimals);
        if (betInput3) betInput3.addEventListener('input', enforceThreeDecimals);

        if (saveBetsBtn) {
            saveBetsBtn.addEventListener('click', () => {
                let b1 = parseFloat(document.getElementById('bet-input-1').value);
                let b2 = parseFloat(document.getElementById('bet-input-2').value);
                let b3 = parseFloat(document.getElementById('bet-input-3').value);

                b1 = parseFloat(b1.toFixed(3));
                b2 = parseFloat(b2.toFixed(3));
                b3 = parseFloat(b3.toFixed(3));

                if (isNaN(b1) || b1 < 0.1 || isNaN(b2) || b2 < 0.1 || isNaN(b3) || b3 < 0.1) {
                    showNotification("Ставка не может быть меньше 0.1 GRAM!", "⚠️");
                    return;
                }

                customBets = [b1, b2, b3];
                try {
                    localStorage.setItem(`custom_bets_${userId}`, JSON.stringify(customBets));
                } catch(e) {}

                closeEditBetsModal();
                showNotification("Кнопки ставок настроены!", "✏️");
                renderBetButtons();
            });
        }

        if (elements.adminTgChatTrigger) {
            elements.adminTgChatTrigger.addEventListener('click', () => {
                tg.openTelegramLink("https://t.me/Sintopa");
            });
        }

        const arenaTrigger = document.getElementById('game-arena-trigger');
        if (arenaTrigger) {
            arenaTrigger.addEventListener('click', () => {
                navigateTo('arena');
            });
        }

        const backFromArena = document.getElementById('back-to-home-from-arena');
        if (backFromArena) {
            backFromArena.addEventListener('click', () => {
                navigateTo('home');
            });
        }

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

        const allImagesToPreload = [
            "/Images/Logo/logotip.png",
            GRAMCOIN_ICON_URL,
            "/Images/Cases/freebox.png",
            "/Images/Cases/keysnovichka.png",
            "/Images/Cases/bomzh.png",
            "/Images/Cases/krutoy.png"
        ];
        [...GIFT_POOL, ...NEWBIE_GIFT_POOL].forEach(item => {
            if (item.icon) allImagesToPreload.push(item.icon);
        });
        preloadImages(allImagesToPreload);

        function navigateTo(target) {
            const sections = [
                elements.homeSection, elements.caseSection, elements.inventorySection, 
                elements.ratingSection, elements.balanceSection, elements.arenaSection
            ];
            sections.forEach(s => { if (s) s.classList.add('hidden'); });
            
            if (elements.bottomNavigation) elements.bottomNavigation.classList.remove('hidden');

            if (target === 'home') {
                if (elements.homeSection) elements.homeSection.classList.remove('hidden');
                setActiveTab('home');
                stopArenaPolling();
            } else if (target === 'inventory') {
                if (elements.inventorySection) elements.inventorySection.classList.remove('hidden');
                setActiveTab('inventory');
                fetchInventory(); 
                initDepositSelect();
                stopArenaPolling();
            } else if (target === 'rating') {
                if (elements.ratingSection) elements.ratingSection.classList.remove('hidden');
                setActiveTab('rating');
                stopArenaPolling();
            } else if (target === 'balance') {
                if (elements.balanceSection) elements.balanceSection.classList.remove('hidden');
                elements.navTabs.forEach(tab => tab.classList.remove('active'));
                stopArenaPolling();
            } else if (target === 'case') { 
                if (elements.caseSection) elements.caseSection.classList.remove('hidden');
                if (elements.bottomNavigation) elements.bottomNavigation.classList.add('hidden'); 
                initRouletteTrack();
                stopArenaPolling();
            } else if (target === 'arena') { 
                if (elements.arenaSection) elements.arenaSection.classList.remove('hidden');
                if (elements.bottomNavigation) elements.bottomNavigation.classList.add('hidden');
                resetArenaGame(); 
                startArenaPolling();
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
        if (backFromBal) backFromBal.addEventListener('click', () => navigateTo('home'));

        if (elements.dailyCaseBanner) {
            elements.dailyCaseBanner.addEventListener('click', () => {
                isNewbieCaseMode = false;
                if (elements.rewardsSectionContainer) elements.rewardsSectionContainer.classList.remove('hidden');
                safeSetText(elements.casePageMainTitle, "Ежедневный кейс");
                safeSetText(elements.rewardsGridTitle, "🏆 Содержимое кейса");
                safeSetText(elements.spinBtn, "Запустить");
                renderRewardsGrid();
                updateDailyCaseTimer(); 
                navigateTo('case');
            });
        }

        if (elements.newbieCaseBanner) {
            elements.newbieCaseBanner.addEventListener('click', () => {
                isNewbieCaseMode = true;
                if (elements.rewardsSectionContainer) elements.rewardsSectionContainer.classList.remove('hidden'); 
                safeSetText(elements.casePageMainTitle, "Кейс новичка");
                safeSetText(elements.rewardsGridTitle, "🏆 Содержимое кейса");
                safeSetText(elements.spinBtn, "Открыть (0.1 GRAM)");
                renderRewardsGrid();
                updateDailyCaseTimer(); 
                navigateTo('case');
            });
        }

        const backToHome = document.getElementById('back-to-home-button');
        if (backToHome) backToHome.addEventListener('click', () => navigateTo('home'));

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

                if (!selectedGift) return;

                showCustomModal({
                    icon: `<img src="${selectedGift.icon}" style="width:70px;height:70px;object-fit:contain;" onerror="this.src='https://img.icons8.com/color/96/gift.png'">`,
                    title: 'Подтвердить передачу?',
                    message: `Вы действительно отправили подарок "${formatItemName(selectedGift.name)}" на аккаунт @Sintopa в Telegram?`,
                    buttons: [
                        {
                            text: 'Да, подтверждаю',
                            primary: true,
                            onClick: async () => {
                                try {
                                    const res = await fetchWithTimeout(`${API_BASE_URL}/api/deposit_gift_request`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initDataHeader },
                                        body: JSON.stringify({ itemId: itemId }),
                                        timeout: 3000
                                    });

                                    if (res.status === 403) {
                                        showBannedScreen();
                                        return;
                                    }

                                    if (res.ok) {
                                        showNotification(`Заявка отправлена Sintopa! Ожидайте...`, '📥');
                                    } else {
                                        const errorData = await res.json();
                                        showNotification(errorData.error || 'Не удалось отправить.', '⚠️');
                                    }
                                } catch (err) {
                                    showNotification('Ошибка связи.', '⚠️');
                                }
                            }
                        },
                        { text: 'Отмена', primary: false }
                    ]
                });
            });
        }

        function renderRewardsGrid() {
            if (!elements.rewardsGrid) return;
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
                const res = await fetchWithTimeout(`${API_BASE_URL}/api/user`, { 
                    headers: { 'X-Telegram-Init-Data': initDataHeader },
                    timeout: 4000 
                });

                if (res.status === 403) {
                    showBannedScreen();
                    return;
                }

                if (!res.ok) throw new Error();
                currentUser = await res.json();
                saveUserDataToCache(currentUser);
            } catch (e) {
                console.warn("Local cache loaded");
            }

            if (!currentUser) currentUser = {};

            updateBalanceUI();
            
            const mainAvatar = document.getElementById('user-avatar');
            if (mainAvatar) {
                const directUrl = currentUser.avatar_url;
                if (directUrl) {
                    mainAvatar.src = directUrl;
                } else {
                    mainAvatar.src = `${API_BASE_URL}/api/avatar/${currentUser.id || userId}`;
                }
                mainAvatar.onerror = () => { mainAvatar.src = "https://img.icons8.com/color/96/user.png"; };
            }

            const rawName = currentUser.username || currentUser.first_name || "Пользователь";
            safeSetText(document.getElementById('user-username'), formatUsername(rawName));
            updateDailyCaseTimer();
            renderBetButtons(); 
        }

        function updateBalanceUI(forcedValue = null) {
            const baseBalance = (currentUser && currentUser.balance) ? parseFloat(currentUser.balance) : 0;
            const val = forcedValue !== null ? parseFloat(forcedValue) : baseBalance;

            const myIdStr = String(userId);
            const serverMe = arenaPlayers.find(p => String(p.userId) === myIdStr);
            const serverMyBet = serverMe ? parseFloat(serverMe.bet) : 0;
            const diff = Math.max(0, localExpectedBetAmount - serverMyBet);

            const finalBalance = Math.max(0, val - diff);
            const balVal = isNaN(finalBalance) ? "0.000" : finalBalance.toFixed(3);
            
            if (lastRenderedBalance === balVal) return; 
            lastRenderedBalance = balVal;

            safeSetText(elements.balanceDisplayPill, balVal);
            safeSetText(elements.largeBalanceDisplay, balVal);
        }

        let dailyCaseTimerInterval;
        function updateDailyCaseTimer() {
            clearInterval(dailyCaseTimerInterval); 
            
            // ЕСЛИ АДМИНИСТРАТОР — ПОЛНОСТЬЮ ОТКЛЮЧАЕМ БЛОКИРУЮЩИЙ ТАЙМЕР НА КЛИЕНТЕ
            if (currentUser && (currentUser.isAdmin === true || currentUser.isAdmin === "true")) {
                if (elements.spinBtn) elements.spinBtn.classList.remove('hidden');
                if (elements.spinBtn) elements.spinBtn.disabled = false;
                const t = document.getElementById('timer-container'); 
                if (t) t.classList.add('hidden');
                return;
            }

            if (isNewbieCaseMode) {
                if (elements.spinBtn) elements.spinBtn.classList.remove('hidden');
                if (elements.spinBtn) elements.spinBtn.disabled = false;
                const t = document.getElementById('timer-container'); if (t) t.classList.add('hidden');
                return;
            }
            if (!currentUser.last_daily_case_open) {
                if (elements.spinBtn) elements.spinBtn.classList.remove('hidden');
                if (elements.spinBtn) elements.spinBtn.disabled = false;
                const t = document.getElementById('timer-container'); if (t) t.classList.add('hidden');
                return;
            }
            const lastOpen = new Date(currentUser.last_daily_case_open);
            const now = new Date();
            const cooldown = 24 * 60 * 60 * 1000; 
            const nextOpenTime = new Date(lastOpen.getTime() + cooldown);
            const timeLeftMs = nextOpenTime.getTime() - now.getTime();

            if (timeLeftMs <= 0) {
                if (elements.spinBtn) elements.spinBtn.classList.remove('hidden');
                if (elements.spinBtn) elements.spinBtn.disabled = false;
                const t = document.getElementById('timer-container'); if (t) t.classList.add('hidden');
            } else {
                if (elements.spinBtn) elements.spinBtn.classList.add('hidden');
                if (elements.spinBtn) elements.spinBtn.disabled = true;
                const t = document.getElementById('timer-container'); if (t) t.classList.remove('hidden');
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
                    safeSetText(document.getElementById('daily-case-timer'), `${hours}ч ${minutes}м ${seconds}с`);
                };
                tick();
                dailyCaseTimerInterval = setInterval(tick, 1000); 
            }
        }

        async function fetchInventory() {
            if (!elements.inventoryGrid) return;
            try {
                const res = await fetchWithTimeout(`${API_BASE_URL}/api/inventory`, { 
                    headers: { 'X-Telegram-Init-Data': initDataHeader },
                    timeout: 3000
                });

                if (res.status === 403) {
                    showBannedScreen();
                    return;
                }

                if (!res.ok) throw new Error();
                const items = await res.json();
                elements.inventoryGrid.innerHTML = '';
                
                if (items.length === 0) {
                    elements.inventoryGrid.innerHTML = `
                        <div class="empty-inventory">
                            🎒 Ваш инвентарь пуст.<br>Открывайте кейсы!
                        </div>`;
                    return;
                }

                items.forEach(item => {
                    const matchedItem = GIFT_POOL.find(g => parseInt(g.id) === parseInt(item.item_id)) || 
                                        NEWBIE_GIFT_POOL.find(g => parseInt(g.id) === parseInt(item.item_id)) || {};
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
                            message: `Отправить "${formatItemName(item.name)}" вам в Telegram?`,
                            buttons: [
                                {
                                    text: 'Подтвердить вывод',
                                    primary: true,
                                    onClick: async () => {
                                        try {
                                            const withdrawRes = await fetchWithTimeout(`${API_BASE_URL}/api/withdraw_gift`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initDataHeader },
                                                body: JSON.stringify({ itemId: item.item_id }),
                                                timeout: 3000
                                            });

                                            if (withdrawRes.status === 403) {
                                                showBannedScreen();
                                                return;
                                            }

                                            if (withdrawRes.ok) {
                                                showNotification(`Подарок в очереди на вывод!`, '📥');
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
                            message: `Продать подарок "${formatItemName(item.name)}" за ${item.value} GRAM?`,
                            buttons: [
                                {
                                    text: 'Продать за GRAM',
                                    primary: true,
                                    onClick: async () => {
                                        try {
                                            const sellRes = await fetchWithTimeout(`${API_BASE_URL}/api/sell_gift`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initDataHeader },
                                                body: JSON.stringify({ itemId: item.item_id, price: item.value }),
                                                timeout: 3000
                                            });

                                            if (sellRes.status === 403) {
                                                showBannedScreen();
                                                return;
                                            }

                                            if (sellRes.ok) {
                                                const sellData = await sellRes.json();
                                                currentUser.balance = sellData.newBalance;
                                                triggerBalanceBadge(parseFloat(item.value));
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
                itemEl.innerHTML = `
                    <img src="${randomItem.icon}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                    <span>${randomItem.price}</span>
                `;
                elements.rouletteTrack.appendChild(itemEl);
            }
        }

        function spinRoulette(winningItem, onComplete) {
            if (!elements.rouletteTrack) return;
            const itemWidth = 96; 
            const gap = 8; 
            const itemFullWidth = itemWidth + gap; 
            const targetIndex = 45; 
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
            
            elements.rouletteTrack.style.transition = 'transform 5.5s cubic-bezier(0.12, 0.82, 0.12, 1)';
            elements.rouletteTrack.style.transform = `translate3d(-${totalTranslate}px, 0, 0)`;
            setTimeout(() => { onComplete(); }, 5600);
        }

        function processWinning(winningGift, apiNewBalance = null) {
            const isBalance = winningGift.type === "balance" || winningGift.name.toLowerCase().includes("пополнение");
            if (apiNewBalance !== null) {
                currentUser.balance = apiNewBalance;
                updateBalanceUI();
            }
            if (isNewbieCaseMode && elements.spinBtn) elements.spinBtn.disabled = false;

            if (isBalance) {
                showCustomModal({
                    icon: '💰',
                    title: 'Баланс пополнен!',
                    message: `🎉 Вы выиграли пополнение счета на +${winningGift.price}!`,
                    buttons: [{ text: 'Отлично!', primary: true }]
                });
                triggerBalanceBadge(winningGift.rawPrice);
                fetchUserData();
                if (!isNewbieCaseMode && elements.spinBtn) elements.spinBtn.disabled = false;
            } else { 
                showCustomModal({
                    icon: `<img src="${winningGift.icon}" style="width:70px;height:70px;object-fit:contain;" onerror="this.src='https://img.icons8.com/color/96/gift.png'">`,
                    title: 'Вы выиграли подарок!',
                    message: `🎁 Ваша награда: "${formatItemName(winningGift.name)}" сохранена в инвентарь!`,
                    buttons: [
                        {
                            text: `Продать за ${winningGift.price}`,
                            primary: true,
                            onClick: async () => {
                                try {
                                    const sellRes = await fetchWithTimeout(`${API_BASE_URL}/api/sell_gift`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initDataHeader },
                                        body: JSON.stringify({ itemId: winningGift.id, price: winningGift.rawPrice }),
                                        timeout: 3000
                                    });

                                    if (sellRes.status === 403) {
                                        showBannedScreen();
                                        return;
                                    }

                                    if (sellRes.ok) {
                                        const sellData = await sellRes.json();
                                        currentUser.balance = sellData.newBalance;
                                        triggerBalanceBadge(winningGift.rawPrice);
                                        fetchUserData();
                                    }
                                } catch (e) {}
                            }
                        },
                        {
                            text: 'В инвентарь',
                            primary: false,
                            onClick: () => {
                                showNotification(`📦 Сохранено в инвентарь!`, '🎒');
                                fetchUserData();
                            }
                        }
                    ]
                });
                if (!isNewbieCaseMode && elements.spinBtn) elements.spinBtn.disabled = false;
            }
        }

        if (elements.spinBtn) {
            elements.spinBtn.addEventListener('click', async () => {
                const spinCost = 0.1;
                if (isNewbieCaseMode && parseFloat(currentUser.balance || 0) < spinCost) {
                    showNotification('Недостаточно баланса! (0.1 GRAM)', '⚠️');
                    return;
                }
                elements.spinBtn.disabled = true;
                if (isNewbieCaseMode) {
                    triggerBalanceBadge(-spinCost);
                    updateBalanceUI(Math.max(0, parseFloat(currentUser.balance || 0) - spinCost));
                }
                initRouletteTrack();

                setTimeout(async () => {
                    try {
                        const endpoint = isNewbieCaseMode ? `${API_BASE_URL}/api/open_newbie_case` : `${API_BASE_URL}/api/open_daily_case`;
                        const response = await fetchWithTimeout(endpoint, {
                            method: 'POST',
                            headers: { 'X-Telegram-Init-Data': initDataHeader },
                            timeout: 4500
                        });

                        if (response.status === 403) {
                            showBannedScreen();
                            return;
                        }

                        const data = await response.json();

                        if (response.ok) {
                            const currentPool = isNewbieCaseMode ? NEWBIE_GIFT_POOL : GIFT_POOL;
                            let winningGift = currentPool.find(g => g.id === data.wonItem.id);
                            if (!winningGift) winningGift = currentPool.find(g => g.name.toLowerCase() === data.wonItem.name.toLowerCase());
                            
                            spinRoulette(winningGift, () => { processWinning(winningGift, data.newBalance); });
                        } else {
                            if (isNewbieCaseMode) {
                                triggerBalanceBadge(spinCost);
                            }
                            fetchUserData(); 
                            if (data.error && data.error.includes('подписчиком канала')) {
                                const infoRes = await fetchWithTimeout(`${API_BASE_URL}/api/daily_case_info`, { 
                                    headers: { 'X-Telegram-Init-Data': initDataHeader },
                                    timeout: 3000
                                });
                                const infoData = await infoRes.json();
                                
                                showCustomModal({
                                    icon: '📢',
                                    title: 'Нужна подписка',
                                    message: 'Пожалуйста, подпишитесь на наш канал, чтобы открыть этот кейс!',
                                    buttons: [{ 
                                        text: 'Подписаться', 
                                        primary: true, 
                                        onClick: () => { 
                                            const channelLink = `https://t.me/${infoData.channel_username.replace('@', '')}`;
                                            if (tg.openTelegramLink) {
                                                tg.openTelegramLink(channelLink);
                                            } else {
                                                window.open(channelLink, '_blank');
                                            }
                                            elements.spinBtn.disabled = false; 
                                        } 
                                    }],
                                    onClose: () => { elements.spinBtn.disabled = false; }
                                });
                            } else {
                                showNotification(data.error || 'Ошибка.', "⚠️");
                                elements.spinBtn.disabled = false;
                            }
                        }
                    } catch (error) {
                        if (isNewbieCaseMode) {
                            triggerBalanceBadge(spinCost);
                        }
                        fetchUserData(); elements.spinBtn.disabled = false;
                        showNotification('Ошибка сети при открытии.', '⚠️');
                    }
                }, 50);
            });
        }

        const balancePillBtn = document.getElementById('balance-pill');
        if (balancePillBtn) {
            balancePillBtn.addEventListener('click', () => {
                navigateTo('balance');
            });
        }

        renderRewardsGrid();
        fetchUserData(); 
        navigateTo('home'); 

    } catch (globalError) {
        showNotification("Сбой инициализации.", "❌");
    }
});

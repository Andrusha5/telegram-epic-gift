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

// Детерминированный генератор случайных чисел (Seeded PRNG) для синхронизации физики движения
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

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = window.location.origin;
    let currentUser = {};
    let isNewbieCaseMode = false; 
    const GRAMCOIN_ICON_URL = "/Images/Items/gram_popolnenie.png"; 

    let customBets = [1, 2, 3];
    let arenaPlayers = []; 
    let arenaPollInterval = null;
    let isBallAnimating = false;
    let currentRoundSignature = null;

    const safeSetText = (el, val) => { if (el) el.innerText = val; };
    const initialName = tg.initDataUnsafe?.user?.username || tg.initDataUnsafe?.user?.first_name || "Пользователь";
    safeSetText(document.getElementById('user-username'), formatUsername(initialName));

    let userId = tg.initDataUnsafe?.user?.id;
    if (!userId) {
        try {
            const params = new URLSearchParams(tg.initData);
            const userRaw = params.get('user');
            if (userRaw) userId = JSON.parse(userRaw).id;
        } catch (e) {}
    }
    if (!userId) userId = "guest_user_id";

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
        bottomNavigation: document.getElementById('bottom-navigation'),
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
        adminTgChatTrigger: document.getElementById('admin-tg-chat-trigger')
    };

    function loadSavedBets() {
        try {
            const saved = localStorage.getItem(`custom_bets_${userId}`);
            if (saved) {
                customBets = JSON.parse(saved);
            }
        } catch (e) {}
    }

    function loadCachedUserData() {
        try {
            const cachedData = localStorage.getItem(`user_cache_${userId}`);
            if (cachedData) {
                const cache = JSON.parse(cachedData);
                currentUser = cache;
                updateBalanceUI();
                const rawName = cache.username || cache.first_name || "Пользователь";
                safeSetText(document.getElementById('user-username'), formatUsername(rawName));
                
                const mainAvatar = document.getElementById('user-avatar');
                if (mainAvatar) {
                    mainAvatar.src = cache.avatar_url || `${API_BASE_URL}/api/avatar/${userId}`;
                    mainAvatar.onerror = () => { mainAvatar.src = "https://img.icons8.com/color/96/user.png"; };
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

    // Настройка TON Connect
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
                            elements.depositNoticeText.innerText = "Кошелек успешно подключен к системе!";
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
        elements.depositBalanceBtn.addEventListener('click', () => {
            if (elements.depositAmountModal) {
                elements.depositAmountModal.classList.remove('hidden');
                if (elements.modalDepositInput) {
                    elements.modalDepositInput.value = "0.1";
                }
            }
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

            closeDepositModal();

            try {
                const res = await fetch(`${API_BASE_URL}/api/deposit_address`);
                const data = await res.json();
                const adminAddress = data.address;

                if (!adminAddress) {
                    showNotification("Ошибка: адрес не настроен.", "⚠️");
                    return;
                }

                const payloadRes = await fetch(`${API_BASE_URL}/api/generate_payload?text=${userId}`);
                const payloadData = await payloadRes.json();
                const payloadBase64 = payloadData.payload;

                const nanoAmount = Math.floor(amount * 1000000000).toString();

                const transaction = {
                    validUntil: Math.floor(Date.now() / 1000) + 360,
                    messages: [
                        {
                            address: adminAddress,
                            amount: nanoAmount,
                            payload: payloadBase64 
                        }
                    ]
                };

                showNotification("Подтвердите транзакцию...", "⏳");
                const result = await tonConnectUI.sendTransaction(transaction);

                if (result) {
                    showNotification("Транзакция отправлена! Проверяем...", "⏳");
                    let checkCount = 0;
                    const checkInterval = setInterval(async () => {
                        checkCount++;
                        if (checkCount > 15) {
                            clearInterval(checkInterval);
                            showNotification("Баланс обновится при подтверждении сетью TON.", "⏳");
                            return;
                        }

                        try {
                            const verifyRes = await fetch(`${API_BASE_URL}/api/verify-payment`, {
                                method: 'POST',
                                headers: { 
                                    'Content-Type': 'application/json',
                                    'X-Telegram-Init-Data': tg.initData || ""
                                },
                                body: JSON.stringify({ amount: amount, userId: userId })
                            });
                            const verifyData = await verifyRes.json();
                            if (verifyRes.ok && verifyData.success) {
                                clearInterval(checkInterval);
                                showNotification(`Баланс пополнен на +${amount.toFixed(2)} GRAM!`, "💎");
                                fetchUserData();
                            }
                        } catch (e) {}
                    }, 3000);
                }
            } catch (err) {
                showNotification("Транзакция отменена кошельком.", "⚠️");
            }
        });
    }

    // -----------------------------------------------------------------------
    // ДИНАМИЧЕСКИЙ SVG ДВИЖОК И МУЛЬТИПЛЕЕРНАЯ СИНХРОНИЗАЦИЯ BEST ARENA
    // -----------------------------------------------------------------------
    const gameTrigger = document.getElementById('game-arena-trigger');
    if (gameTrigger) {
        gameTrigger.addEventListener('click', () => {
            navigateTo('arena');
        });
    }

    const backFromArena = document.getElementById('back-to-home-from-arena');
    if (backFromArena) {
        backFromArena.addEventListener('click', () => {
            navigateTo('home');
        });
    }

    function drawArenaSegments() {
        const svg = document.getElementById('arena-svg-canvas');
        const avatarsContainer = document.getElementById('arena-avatars-container');
        if (!svg || !avatarsContainer) return;

        if (isBallAnimating) {
            return;
        }

        svg.innerHTML = '';
        avatarsContainer.innerHTML = '';

        const N = arenaPlayers.length;
        if (N === 0) return;

        const W = 320; 
        const H = 320;

        const totalBetSum = arenaPlayers.reduce((sum, p) => sum + parseFloat(p.bet), 0);

        let currentX = 0;

        arenaPlayers.forEach((player) => {
            const percentage = totalBetSum > 0 ? (parseFloat(player.bet) / totalBetSum) : (1 / N);
            const segmentWidth = W * percentage;

            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", currentX.toFixed(1));
            rect.setAttribute("y", "0");
            rect.setAttribute("width", segmentWidth.toFixed(1));
            rect.setAttribute("height", "100%");
            rect.setAttribute("fill", player.color);
            svg.appendChild(rect);

            const centerX = currentX + (segmentWidth / 2);
            const centerY = H / 2;

            const calculatedAvatarSize = Math.min(64, Math.max(16, segmentWidth * 0.4));
            createAvatarElement(centerX, centerY, player.avatar, calculatedAvatarSize);

            currentX += segmentWidth;
        });
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

    // Динамический рендеринг списка участников снизу
    function updatePlayersListUI() {
        const listContainer = document.getElementById('arena-players-list');
        if (!listContainer) return;

        if (arenaPlayers.length === 0) {
            listContainer.innerHTML = `<div class="empty-list-placeholder">Ставок еще нет. Станьте первым!</div>`;
            return;
        }

        listContainer.innerHTML = '';
        arenaPlayers.forEach(p => {
            const row = document.createElement('div');
            row.className = 'player-list-row';
            row.style.borderLeft = `4px solid ${p.color}`;
            row.innerHTML = `
                <div class="player-row-left">
                    <img class="player-row-avatar" src="${p.avatar}" onerror="this.src='https://img.icons8.com/color/96/user.png';">
                    <span class="player-row-name">${p.username}</span>
                </div>
                <div class="player-row-right">
                    <span class="player-row-bet-value">${p.bet.toFixed(3)}</span>
                    <img class="player-row-coin" src="${GRAMCOIN_ICON_URL}" alt="GRAM">
                </div>
            `;
            listContainer.appendChild(row);
        });
    }

    function renderBetButtons() {
        const balance = parseFloat(currentUser.balance || 0);
        for (let i = 0; i < 3; i++) {
            const btn = document.getElementById(`bet-btn-${i + 1}`);
            if (!btn) continue;
            
            const betVal = parseFloat(customBets[i]);
            btn.querySelector('.bet-val').innerText = betVal.toString();
            btn.setAttribute('data-bet', betVal);

            if (balance >= betVal) {
                btn.className = "bet-button active";
                btn.disabled = false;
            } else {
                btn.className = "bet-button disabled";
                btn.disabled = true;
            }
        }
    }

    // Полностью синхронизированный расчет траектории на сиде (Никакого рассинхрона между игроками)
    function simulateBallPathDeterministic(targetX, seedSignature, boardWidth = 320, boardHeight = 320, ballRadius = 8) {
        const friction = 0.985;
        const rng = createPRNG(seedSignature);

        for (let trial = 0; trial < 2000; trial++) {
            const startX = boardWidth / 2;
            const startY = boardHeight / 2;

            // Движения запускаются на высокой скорости (быстрый старт)
            const angle = rng() * Math.PI * 2;
            const speed = 19 + rng() * 5; 

            let vx = Math.cos(angle) * speed;
            let vy = Math.sin(angle) * speed;

            let path = [];
            let currentVx = vx;
            let currentVy = vy;
            let currentX = startX;
            let currentY = startY;

            while (Math.abs(currentVx) > 0.08 || Math.abs(currentVy) > 0.08) {
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

            // Проверяем, остановился ли шарик на нужном секторе
            if (Math.abs(currentX - targetX) < 10) {
                return { path };
            }
        }
        return null;
    }

    function animateBouncingBall(targetX, seedSignature, onComplete) {
        if (isBallAnimating) return;
        isBallAnimating = true;

        const canvas = document.getElementById('arena-svg-canvas');
        if (!canvas) return;

        let ballElement = document.getElementById('physics-ball');
        if (ballElement) ballElement.remove();

        // Полностью белый шарик без обводок и рамок
        ballElement = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        ballElement.setAttribute("id", "physics-ball");
        ballElement.setAttribute("r", "8");
        ballElement.setAttribute("fill", "#ffffff");
        canvas.appendChild(ballElement);

        const W = 320;
        const H = 320;

        let simulation = simulateBallPathDeterministic(targetX, seedSignature, W, H, 8);
        if (!simulation) {
            let frame = 0;
            const totalFrames = 100;
            const step = () => {
                if (frame >= totalFrames) {
                    isBallAnimating = false;
                    onComplete();
                    return;
                }
                const t = frame / totalFrames;
                const easeOut = 1 - Math.pow(1 - t, 3);
                const currentX = (W / 2) + (targetX - (W / 2)) * easeOut;
                const currentY = (H / 2);
                ballElement.setAttribute("cx", currentX.toFixed(1));
                ballElement.setAttribute("cy", currentY.toFixed(1));
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

            frameIndex++;
            requestAnimationFrame(renderFrame);
        };

        requestAnimationFrame(renderFrame);
    }

    function startArenaPolling() {
        if (arenaPollInterval) return;

        const poll = async () => {
            const arenaSection = document.getElementById('arena-section');
            if (!arenaSection || arenaSection.classList.contains('hidden')) {
                stopArenaPolling();
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/api/arena/state`, {
                    headers: { 'X-Telegram-Init-Data': tg.initData || "" }
                });
                if (!res.ok) return;
                const state = await res.json();

                arenaPlayers = state.bets.map(bet => ({
                    id: bet.userId,
                    username: bet.username,
                    avatar: bet.avatar || "https://img.icons8.com/color/96/user.png",
                    bet: parseFloat(bet.amount),
                    color: bet.color
                }));

                drawArenaSegments();
                updatePlayersListUI();

                const statusText = document.getElementById('arena-status-text');
                const countdownTimer = document.getElementById('arena-countdown-timer');

                if (state.status === 'countdown') {
                    if (statusText) statusText.classList.add('hidden');
                    if (countdownTimer) {
                        countdownTimer.classList.remove('hidden');
                        countdownTimer.innerText = state.timeLeft;
                    }
                } else if (state.status === 'finished') {
                    const signature = state.winnerId + "_" + state.totalPool + "_" + state.winnerX;
                    if (currentRoundSignature !== signature && state.winnerX) {
                        currentRoundSignature = signature;
                        
                        if (statusText) {
                            statusText.classList.remove('hidden');
                            statusText.innerText = "Шарик запущен...";
                        }
                        if (countdownTimer) countdownTimer.classList.add('hidden');

                        animateBouncingBall(state.winnerX, signature, () => {
                            const isWeWinner = (String(state.winnerId) === String(userId));
                            
                            if (isWeWinner) {
                                showCustomModal({
                                    icon: '🏆',
                                    title: 'Победа!',
                                    message: `🎉 Поздравляем! Белый шарик остановился на вашем секторе! Вы получили весь банк: +${parseFloat(state.totalPool).toFixed(3)} GRAM!`,
                                    buttons: [{ text: 'Забрать!', primary: true }]
                                });
                                showNotification(`Зачислено: +${parseFloat(state.totalPool).toFixed(3)} GRAM!`, "💎");
                            } else {
                                showNotification(`Игрок ${state.winnerName} выиграл ${parseFloat(state.totalPool).toFixed(3)} GRAM!`, "🏆");
                            }
                            fetchUserData();
                        });
                    }
                } else {
                    if (statusText && !isBallAnimating) {
                        statusText.classList.remove('hidden');
                        statusText.innerText = "Ждем ставки...";
                    }
                    if (countdownTimer) {
                        countdownTimer.classList.add('hidden');
                    }
                }

                renderBetButtons();

            } catch (err) {}
        };

        poll();
        arenaPollInterval = setInterval(poll, 1000);
    }

    function stopArenaPolling() {
        if (arenaPollInterval) {
            clearInterval(arenaPollInterval);
            arenaPollInterval = null;
        }
    }

    function resetArenaGame() {
        stopArenaPolling();
        const statusText = document.getElementById('arena-status-text');
        const countdownTimer = document.getElementById('arena-countdown-timer');
        const svg = document.getElementById('arena-svg-canvas');
        const avatarsContainer = document.getElementById('arena-avatars-container');

        if (statusText) {
            statusText.classList.remove('hidden');
            statusText.innerText = "Ждем ставки...";
        }
        if (countdownTimer) countdownTimer.classList.add('hidden');
        if (svg) svg.innerHTML = '';
        if (avatarsContainer) avatarsContainer.innerHTML = '';

        renderBetButtons();
    }

    const handleBetClick = async (e) => {
        const btn = e.currentTarget;
        if (btn.classList.contains('disabled')) return;

        const betValue = parseFloat(btn.getAttribute('data-bet'));
        if (isNaN(betValue) || betValue < 0.1) return;

        btn.classList.add('disabled');
        btn.disabled = true;

        try {
            const res = await fetch(`${API_BASE_URL}/api/place_bet`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': tg.initData || ""
                },
                body: JSON.stringify({ amount: betValue })
            });
            const data = await res.json();
            
            if (res.ok && data.success) {
                showNotification(`Ставка добавлена: -${betValue} GRAM`, "🎮");
                currentUser.balance = data.newBalance;
                updateBalanceUI();
            } else {
                showNotification(data.error || "Ошибка ставки", "⚠️");
            }
        } catch (err) {
            showNotification("Ошибка сети", "⚠️");
        } finally {
            fetchUserData();
        }
    };

    document.getElementById('bet-btn-1').addEventListener('click', handleBetClick);
    document.getElementById('bet-btn-2').addEventListener('click', handleBetClick);
    document.getElementById('bet-btn-3').addEventListener('click', handleBetClick);

    // Настройка ставок
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

    document.getElementById('bet-input-1').addEventListener('input', enforceThreeDecimals);
    document.getElementById('bet-input-2').addEventListener('input', enforceThreeDecimals);
    document.getElementById('bet-input-3').addEventListener('input', enforceThreeDecimals);

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
            showNotification("Кнопки ставок успешно настроены!", "✏️");
            renderBetButtons();
        });
    }

    if (elements.adminTgChatTrigger) {
        elements.adminTgChatTrigger.addEventListener('click', () => {
            tg.openTelegramLink("https://t.me/Sintopa");
        });
    }

    // ----------------- ПУЛЫ НАГРАД -----------------
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
                                const res = await fetch(`${API_BASE_URL}/api/deposit_gift_request`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg.initData || "" },
                                    body: JSON.stringify({ itemId: itemId })
                                });
                                if (res.ok) {
                                    showNotification(`Заявка на ввод отправлена!`, '📥');
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
            const res = await fetch(`${API_BASE_URL}/api/user`, { 
                headers: { 'X-Telegram-Init-Data': tg.initData || "" }
            });
            if (!res.ok) throw new Error();
            currentUser = await res.json();
            
            saveUserDataToCache(currentUser);
        } catch (e) {}

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
        const val = forcedValue !== null ? parseFloat(forcedValue) : parseFloat(currentUser.balance || 0);
        const balVal = val.toFixed(3);
        safeSetText(elements.balanceDisplayPill, balVal);
        safeSetText(elements.largeBalanceDisplay, balVal);
    }

    let dailyCaseTimerInterval;
    function updateDailyCaseTimer() {
        clearInterval(dailyCaseTimerInterval); 
        if (isNewbieCaseMode) {
            if (elements.spinBtn) elements.spinBtn.classList.remove('hidden');
            if (elements.spinBtn) elements.spinBtn.disabled = false;
            const t = document.getElementById('timer-container'); if (t) t.classList.add('hidden');
            return;
        }
        if (currentUser.is_admin || !currentUser.last_daily_case_open) {
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
            const res = await fetch(`${API_BASE_URL}/api/inventory`, { 
                headers: { 'X-Telegram-Init-Data': tg.initData || "" }
            });
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
                        message: `Отправить "${formatItemName(item.name)}" вам в Telegram?`,
                        buttons: [
                            {
                                text: 'Подтвердить вывод',
                                primary: true,
                                onClick: async () => {
                                    try {
                                        const withdrawRes = await fetch(`${API_BASE_URL}/api/withdraw_gift`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg.initData || "" },
                                            body: JSON.stringify({ itemId: item.item_id })
                                        });
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
                                        const sellRes = await fetch(`${API_BASE_URL}/api/sell_gift`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg.initData || "" },
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
            fetchUserData();
            if (!isNewbieCaseMode && elements.spinBtn) elements.spinBtn.disabled = false;
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
    }

    if (document.getElementById('balance-pill')) {
        document.getElementById('balance-pill').addEventListener('click', () => {
            navigateTo('balance');
        });
    }

    renderRewardsGrid();
    fetchUserData(); 
    navigateTo('home'); 
});

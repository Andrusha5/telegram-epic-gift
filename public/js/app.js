const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// ==========================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (ГЛОБАЛЬНЫЕ ДЛЯ ЗАЩИТЫ ОТ СБОЕВ)
// ==========================================================================
function formatItemName(name) {
    if (!name) return "";
    let clean = name.replace(/\.(png|jpg|jpeg)$/i, '');
    clean = clean.replace(/_/g, ' ');
    return clean.trim();
}

function formatUsername(name) {
    if (!name) return "Пользователь";
    return name.length > 10 ? name.substring(0, 10) + "..." : name;
}

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = window.location.origin;
    let currentUser = {};
    let isNewbieCaseMode = false; 

    const GRAMCOIN_ICON_URL = "/Images/Items/gram_popolnenie.png"; 

    let userId = tg.initDataUnsafe?.user?.id;
    if (!userId) {
        try {
            const params = new URLSearchParams(tg.initData);
            const userRaw = params.get('user');
            if (userRaw) userId = JSON.parse(userRaw).id;
        } catch (e) {}
    }
    if (!userId) userId = "guest_user_id";

    // Сброс кэша для бесшовной смены аккаунтов
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

    // Элементы интерфейса
    const elements = {
        homeSection: document.getElementById('home-section'),
        caseSection: document.getElementById('case-section'),
        inventorySection: document.getElementById('inventory-section'),
        ratingSection: document.getElementById('rating-section'), 
        balanceSection: document.getElementById('balance-section'), 
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
        depositNoticeText: document.getElementById('deposit-notice-text')
    };

    const safeSetText = (el, val) => { if (el) el.innerText = val; };

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

    // ==========================================================================
    // ПОДКЛЮЧЕНИЕ TON CONNECT И КОШЕЛЬКА (ПОЛНОСТЬЮ РАБОЧИЙ)
    // ==========================================================================
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

        if (tonConnectUI) {
            // Обработчик кнопки привязки
            if (elements.connectWalletBtn) {
                elements.connectWalletBtn.addEventListener('click', async () => {
                    try {
                        if (tonConnectUI.connected) {
                            await tonConnectUI.disconnect();
                        } else {
                            await tonConnectUI.openModal();
                        }
                    } catch (err) {
                        showNotification("Ошибка TON-кошелька", "⚠️");
                    }
                });
            }

            // Наблюдение за статусом
            tonConnectUI.onStatusChange(wallet => {
                if (wallet) {
                    if (elements.connectWalletBtn) elements.connectWalletBtn.innerText = "Кошелек привязан ✅";
                    if (elements.depositBalanceBtn) elements.depositBalanceBtn.disabled = false;
                    if (elements.depositNoticeText) {
                        elements.depositNoticeText.innerText = "Кошелек успешно подключен!";
                        elements.depositNoticeText.style.color = "#28a745";
                    }
                } else {
                    if (elements.connectWalletBtn) elements.connectWalletBtn.innerText = "Привязать кошелёк";
                    if (elements.depositBalanceBtn) elements.depositBalanceBtn.disabled = true;
                    if (elements.depositNoticeText) {
                        elements.depositNoticeText.innerText = "Пополнение доступно после привязки кошелька";
                        elements.depositNoticeText.style.color = "#8e8e93";
                    }
                }
            });
        }
    } catch (err) {
        console.error("TON Connect Error:", err);
    }

    // Обработчик пополнения баланса
    if (elements.depositBalanceBtn) {
        elements.depositBalanceBtn.addEventListener('click', () => {
            showNotification("Сервис пополнения временно перегружен, попробуйте позже!", "⚠️");
        });
    }

    // ----------------- ЖИВАЯ МИНИ-ИГРА НА БАННЕРЕ -----------------
    const miniCanvas = document.getElementById('arena-mini-canvas');
    if (miniCanvas) {
        const miniCtx = miniCanvas.getContext('2d');
        let bx = 35, by = 35, vx = 0.9, vy = 1.1;
        function renderMini() {
            miniCtx.fillStyle = '#1c1c1e';
            miniCtx.fillRect(0,0,70,70);
            miniCtx.strokeStyle = '#2c2c2e';
            miniCtx.lineWidth = 1;
            for(let i=0; i<70; i+=14){
                miniCtx.beginPath(); miniCtx.moveTo(i, 0); miniCtx.lineTo(i, 70); miniCtx.stroke();
                miniCtx.beginPath(); miniCtx.moveTo(0, i); miniCtx.lineTo(70, i); miniCtx.stroke();
            }
            bx += vx; by += vy;
            if(bx < 4 || bx > 66) vx = -vx;
            if(by < 4 || by > 66) vy = -vy;
            miniCtx.beginPath();
            miniCtx.arc(bx, by, 4, 0, Math.PI*2);
            miniCtx.fillStyle = '#0088cc';
            miniCtx.fill();
            requestAnimationFrame(renderMini);
        }
        renderMini();
    }

    // Кнопка игры Best Arena (в разработке)
    const bannerBtn = document.getElementById('arena-banner-btn');
    if (bannerBtn) {
        bannerBtn.addEventListener('click', () => {
            showNotification("Игра Best Arena временно находится в разработке!", "🎮");
        });
    }

    // ----------------- СПИСКИ ПРЕДМЕТОВ И КЕЙСЫ -----------------
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

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: БЕЗОПАСНАЯ НАВИГАЦИЯ БЕЗ СБОЕВ JS
    function navigateTo(target) {
        const sections = [
            elements.homeSection, elements.caseSection, elements.inventorySection, 
            elements.ratingSection, elements.balanceSection
        ].filter(Boolean); // Исключаем пустые элементы
        
        sections.forEach(s => s.classList.add('hidden'));
        
        if (elements.bottomNavigation) elements.bottomNavigation.classList.remove('hidden');

        if (target === 'home') {
            if (elements.homeSection) elements.homeSection.classList.remove('hidden');
            setActiveTab('home');
        } else if (target === 'inventory') {
            if (elements.inventorySection) elements.inventorySection.classList.remove('hidden');
            setActiveTab('inventory');
            fetchInventory(); 
            initDepositSelect();
        } else if (target === 'rating') {
            if (elements.ratingSection) elements.ratingSection.classList.remove('hidden');
            setActiveTab('rating');
        } else if (target === 'balance') {
            if (elements.balanceSection) elements.balanceSection.classList.remove('hidden');
            elements.navTabs.forEach(tab => tab.classList.remove('active'));
        } else if (target === 'case') { 
            if (elements.caseSection) elements.caseSection.classList.remove('hidden');
            if (elements.bottomNavigation) elements.bottomNavigation.classList.add('hidden'); 
            initRouletteTrack();
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
            safeSetText(elements.rewardsGridTitle, "Ежедневные награды");
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
            safeSetText(elements.rewardsGridTitle, "Содержимое кейса");
            safeSetText(elements.spinBtn, "Открыть (0.1 GRAM)");
            renderRewardsGrid();
            updateDailyCaseTimer(); 
            navigateTo('case');
        });
    }

    if (elements.bomzhCaseBanner) elements.bomzhCaseBanner.addEventListener('click', () => { showNotification("Кейс бомжа скоро появится в игре!", "🎒"); });
    if (elements.krutoyCaseBanner) elements.krutoyCaseBanner.addEventListener('click', () => { showNotification("Кейс крутого в разработке!", "😎"); });

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
                message: `Вы действительно отправили подарок "${formatItemName(selectedGift.name)}" на аккаунт @Sintopa в Telegram?\n\nАдминистратор проверит отправку и зачислит его.`,
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
        safeSetText(document.getElementById('user-username'), truncatedName);
        safeSetText(document.getElementById('inv-user-username'), truncatedName);
        updateDailyCaseTimer();
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
                                            headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg.initData || "" },
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
        if (!elements.rouletteTrack) return;
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

    renderRewardsGrid();
    fetchUserData(); 
    navigateTo('home'); 
});

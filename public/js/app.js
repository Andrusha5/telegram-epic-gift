// СТАРТУЕМ С ПЕРВОЙ ЖЕ МИЛЛИСЕКУНДЫ!
// Это предотвращает зависание загрузочного экрана Telegram на слабых устройствах.
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = window.location.origin;
    let currentUser = {};
    let isNewbieCaseMode = false; 

    const GRAMCOIN_ICON_URL = "/Images/Items/gram_popolnenie.png"; 

    // --- БЕЗОПАСНАЯ ИНИЦИАЛИЗАЦИЯ TON CONNECT SDK ---
    let tonConnectUI = null;
    try {
        const manifestUrl = `${API_BASE_URL}/tonconnect-manifest.json`;
        
        // Автоматически определяем конструктор, защищая SPA от падения
        if (typeof TonConnectUI !== 'undefined') {
            if (typeof TonConnectUI.TonConnectUI === 'function') {
                tonConnectUI = new TonConnectUI.TonConnectUI({ manifestUrl });
            } else if (typeof TonConnectUI === 'function') {
                tonConnectUI = new TonConnectUI({ manifestUrl });
            }
        }
    } catch (err) {
        console.error("Не удалось подключить TON Connect UI:", err);
    }

    // Награды ежедневного кейса (отсортированы от самых дорогих к дешевым)
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

    // Награды кейса новичка
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
        connectWalletBtn: document.getElementById('connect-wallet-btn')
    };

    // --- ФУНКЦИЯ ОЧИСТКИ ИМЕНИ ПОДАРКОВ ---
    function formatItemName(name) {
        if (!name) return "";
        let clean = name.replace(/\.(png|jpg|jpeg)$/i, '');
        clean = clean.replace(/_/g, ' ');
        return clean.trim();
    }

    // --- Безопасное форматирование юзернейма ---
    function formatUsername(name) {
        if (!name) return "Пользователь";
        return name.length > 10 ? name.substring(0, 10) + "..." : name;
    }

    // --- УВЕДОМЛЕНИЯ ВНИЗУ ---
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

    // --- МОДАЛЬНОЕ ОКНО ПО ЦЕНТРУ ---
    function showCustomModal({ icon = '🎁', title, message, buttons = [], onClose = null }) {
        const overlay = document.getElementById('custom-modal');
        const modalIcon = document.getElementById('modal-icon');
        const modalTitle = document.getElementById('modal-title');
        const modalMsg = document.getElementById('modal-message');
        const actionsContainer = document.getElementById('modal-actions');
        const closeX = document.getElementById('modal-close-btn');

        modalIcon.innerHTML = icon;
        modalTitle.innerText = title;
        modalMsg.innerText = message;
        actionsContainer.innerHTML = '';

        buttons.forEach(btnConfig => {
            const btn = document.createElement('button');
            btn.className = `modal-btn ${btnConfig.primary ? 'modal-btn-primary' : 'modal-btn-secondary'}`;
            btn.innerText = btnConfig.text;
            btn.addEventListener('click', () => {
                overlay.classList.add('hidden');
                if (btnConfig.onClick) btnConfig.onClick();
            });
            actionsContainer.appendChild(btn);
        });

        const handleClose = () => {
            overlay.classList.add('hidden');
            if (onClose) onClose();
        };

        closeX.onclick = handleClose;
        overlay.classList.remove('hidden');
    }

    // --- ОБРАБОТКА ПОДКЛЮЧЕНИЯ КОШЕЛЬКА TON CONNECT ---
    if (tonConnectUI) {
        // Подписка на обновление статуса подключения
        tonConnectUI.onStatusChange(wallet => {
            if (wallet) {
                const address = wallet.account.address;
                const friendlyAddress = address.slice(0, 4) + '...' + address.slice(-4);
                
                elements.connectWalletBtn.innerText = `Отключить (${friendlyAddress})`;
                elements.connectWalletBtn.style.background = 'linear-gradient(135deg, #28a745, #218838)';
                elements.connectWalletBtn.style.boxShadow = '0 4px 15px rgba(40, 167, 69, 0.4)';
                showNotification("Кошелек успешно подключен!", "💎");
            } else {
                elements.connectWalletBtn.innerText = 'Привязать кошелёк';
                elements.connectWalletBtn.style.background = 'linear-gradient(135deg, #0088cc, #00a2ff)';
                elements.connectWalletBtn.style.boxShadow = '0 4px 15px rgba(0, 136, 204, 0.4)';
            }
        });

        // Слушатель нажатия на кнопку "Привязать"
        elements.connectWalletBtn.addEventListener('click', async () => {
            if (tonConnectUI.connected) {
                showCustomModal({
                    icon: '💎',
                    title: 'Отключить кошелек?',
                    message: 'Вы уверены, что хотите отвязать текущий TON кошелек?',
                    buttons: [
                        {
                            text: 'Да, отключить',
                            primary: true,
                            onClick: async () => {
                                await tonConnectUI.disconnect();
                                showNotification("Кошелек успешно отключен.", "ℹ️");
                            }
                        },
                        { text: 'Отмена', primary: false }
                    ]
                });
            } else {
                // Открывает нативное меню TON Connect прямо в Telegram!
                await tonConnectUI.openModal();
            }
        });
    }

    // --- НАЖАТИЕ НА БАЛАНС -> Открытие нового полноэкранного окна ---
    document.getElementById('balance-pill').addEventListener('click', () => {
        navigateTo('balance');
    });

    // --- Навигация по вкладкам ---
    function navigateTo(target) {
        [elements.homeSection, elements.caseSection, elements.inventorySection, elements.ratingSection, elements.balanceSection].forEach(s => {
            if (s) s.classList.add('hidden');
        });
        
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

    // Назад из баланса
    document.getElementById('back-to-home-from-balance').addEventListener('click', () => navigateTo('home'));

    // Вход в Ежедневный кейс
    elements.dailyCaseBanner.addEventListener('click', () => {
        isNewbieCaseMode = false;
        elements.rewardsSectionContainer.classList.remove('hidden');
        elements.casePageMainTitle.innerText = "Ежедневный кейс";
        elements.rewardsGridTitle.innerText = "Ежедневные награды";
        elements.spinBtn.innerText = "Запустить";
        renderRewardsGrid();
        navigateTo('case');
    });

    // Вход в Кейс Новичка
    elements.newbieCaseBanner.addEventListener('click', () => {
        isNewbieCaseMode = true;
        elements.rewardsSectionContainer.classList.remove('hidden'); 
        elements.casePageMainTitle.innerText = "Кейс новичка";
        elements.rewardsGridTitle.innerText = "Содержимое кейса";
        elements.spinBtn.innerText = "Открыть (0.1 GRAM)";
        renderRewardsGrid();
        navigateTo('case');
    });

    // Новые кейсы (кнопки-заглушки)
    elements.bomzhCaseBanner.addEventListener('click', () => {
        showNotification("Кейс бомжа скоро появится в игре!", "🎒");
    });

    elements.krutoyCaseBanner.addEventListener('click', () => {
        showNotification("Кейс крутого в разработке!", "😎");
    });

    document.getElementById('back-to-home-button').addEventListener('click', () => navigateTo('home'));

    // --- Инициализация списка ввода ---
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

    // --- Ввод подарка ---
    document.getElementById('deposit-confirm-button').addEventListener('click', async () => {
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

    // --- Отрисовка наград кейса (БЕЗ НАЗВАНИЙ ПРЕДМЕТОВ) ---
    function renderRewardsGrid() {
        elements.rewardsGrid.innerHTML = '';
        const currentPool = isNewbieCaseMode ? NEWBIE_GIFT_POOL : GIFT_POOL;
        currentPool.forEach(gift => {
            const card = document.createElement('div');
            card.className = `reward-card ${gift.isGold ? 'gold-tier' : ''}`;
            const randomBadge = gift.type === 'gift' ? '<div class="reward-random-badge">random</div>' : '';

            // Оставляем только цену, крупную картинку и плашку random
            card.innerHTML = `
                <div class="reward-price-top">${gift.price}</div>
                <img src="${gift.icon}" alt="${formatItemName(gift.name)}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                <div style="margin-bottom: 8px;"></div>
                ${randomBadge}
            `;
            elements.rewardsGrid.appendChild(card);
        });
    }

    // --- Загрузка данных юзера ---
    async function fetchUserData() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/user`, { 
                headers: { 'X-Telegram-Init-Data': tg.initData || "" }
            });
            if (!res.ok) throw new Error();
            currentUser = await res.json();
        } catch (e) {
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
        document.getElementById('user-username').innerText = truncatedName;
        document.getElementById('inv-user-username').innerText = truncatedName;
        
        updateDailyCaseTimer();
    }

    // Вспомогательная функция обновления отображения баланса на экранах
    function updateBalanceUI(forcedValue = null) {
        const val = forcedValue !== null ? parseFloat(forcedValue) : parseFloat(currentUser.balance || 0);
        const balVal = val.toFixed(3);
        if (elements.balanceDisplayPill) {
            elements.balanceDisplayPill.innerText = balVal;
        }
        if (elements.largeBalanceDisplay) {
            elements.largeBalanceDisplay.innerText = balVal;
        }
    }

    // --- Таймер кейса ---
    let dailyCaseTimerInterval;
    function updateDailyCaseTimer() {
        clearInterval(dailyCaseTimerInterval); 

        if (currentUser.is_admin) {
            elements.spinBtn.classList.remove('hidden');
            elements.spinBtn.disabled = false;
            document.getElementById('timer-container').classList.add('hidden');
            return;
        }

        if (!currentUser.last_daily_case_open) {
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
            if (isNewbieCaseMode) {
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
    }

    // --- Загрузка инвентаря ---
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
                                        showNotification('Ошибка сети при выводе.', '⚠️');
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
                        message: `Вы действительно хотите мгновенно продать подарок "${formatItemName(item.name)}" за ${item.value} GRAM?`,
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
                                            showNotification(`Вы успешно продали "${formatItemName(item.name)}" за +${item.value} GRAM!`, '💰');
                                            fetchUserData();
                                            fetchInventory();
                                        } else {
                                            const errorData = await sellRes.json();
                                            showNotification(errorData.error || 'Не удалось продать подарок.', '⚠️');
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

                elements.inventoryGrid.appendChild(card);
            });
        } catch (error) {
            elements.inventoryGrid.innerHTML = '<div class="empty-inventory" style="color: var(--red-alert);">Ошибка загрузки инвентаря.</div>';
        }
    }

    // --- Инициализация ленты рулетки (БЕЗ НАЗВАНИЙ ПРЕДМЕТОВ) ---
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

    // --- Прокрутка рулетки ---
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

        setTimeout(() => {
            onComplete();
        }, 5100);
    }

    // --- Обработка выигрыша ---
    function processWinning(winningGift, apiNewBalance = null) {
        const isBalance = winningGift.type === "balance" || winningGift.name.toLowerCase().includes("пополнение");
        
        if (apiNewBalance !== null) {
            currentUser.balance = apiNewBalance;
            updateBalanceUI();
        }

        if (isBalance) {
            showCustomModal({
                icon: '💰',
                title: 'Баланс пополнен!',
                message: `🎉 Вы выиграли пополнение счета на +${winningGift.price}!`,
                buttons: [{ text: 'Отлично!', primary: true }]
            });
            fetchUserData();
            elements.spinBtn.disabled = false;
        } else { 
            showCustomModal({
                icon: `<img src="${winningGift.icon}" style="width:70px;height:70px;object-fit:contain;" onerror="this.src='https://img.icons8.com/color/96/gift.png'">`,
                title: 'Вы выиграли подарок!',
                message: `🎁 Ваша награда: "${formatItemName(winningGift.name)}"\n\nЖелаете мгновенно продать подарок за ${winningGift.price} или сохранить его в Инвентаре?`,
                buttons: [
                    {
                        text: `Продать за ${winningGift.price}`,
                        primary: true,
                        onClick: async () => {
                            try {
                                const sellRes = await fetch(`${API_BASE_URL}/api/sell_gift`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'X-Telegram-Init-Data': tg.initData || ""
                                    },
                                    body: JSON.stringify({ itemId: winningGift.id, price: winningGift.rawPrice })
                                });
                                if (sellRes.ok) {
                                    const sellData = await sellRes.json();
                                    currentUser.balance = sellData.newBalance;
                                    showNotification("Подарок успешно продан за " + winningGift.price, "💰");
                                    fetchUserData();
                                } else {
                                    const errorData = await sellRes.json();
                                    showNotification(errorData.error || 'Ошибка соединения при продаже.', '⚠️');
                                }
                            } catch (e) {
                                showNotification('Ошибка связи с сервером при продаже.', '⚠️');
                            }
                        }
                    },
                    {
                        text: 'Оставить себе в инвентарь',
                        primary: false,
                        onClick: () => {
                            showNotification(`📦 Подарок "${formatItemName(winningGift.name)}" сохранен в Инвентарь!`, '🎒');
                            fetchUserData();
                        }
                    }
                ]
            });
            elements.spinBtn.disabled = false;
        }
    }

    // --- Обработка кнопки запуска (МГНОВЕННОЕ СПИСАНИЕ НА КЛИЕНТЕ) ---
    elements.spinBtn.addEventListener('click', async () => {
        const spinCost = 0.1;
        if (isNewbieCaseMode && parseFloat(currentUser.balance || 0) < spinCost) {
            showNotification('Недостаточно баланса! Требуется минимум 0.1 GRAM', '⚠️');
            return;
        }

        elements.spinBtn.disabled = true;

        // --- МГНОВЕННОЕ ВИЗУАЛЬНОЕ СПИСАНИЕ С БАЛАНСА НА ЭКРАНАХ ---
        if (isNewbieCaseMode) {
            const tempDeductedBalance = Math.max(0, parseFloat(currentUser.balance || 0) - spinCost);
            updateBalanceUI(tempDeductedBalance);
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
                    if (!winningGift) { 
                        winningGift = currentPool.find(g => g.name.toLowerCase() === data.wonItem.name.toLowerCase());
                    }

                    if (!winningGift) { 
                        showNotification('Неизвестный предмет выигран.', '❓');
                        elements.spinBtn.disabled = false;
                        fetchUserData(); // Восстанавливаем точный баланс
                        return;
                    }

                    spinRoulette(winningGift, () => {
                        processWinning(winningGift, data.newBalance);
                    });

                } else {
                    fetchUserData(); // Восстанавливаем баланс при ошибке

                    if (data.error && data.error.includes('подписчиком канала')) {
                        const infoRes = await fetch(`${API_BASE_URL}/api/daily_case_info`, {
                            headers: { 'X-Telegram-Init-Data': tg.initData || "" }
                        });
                        const infoData = await infoRes.json();
                        const channelUrl = `https://t.me/${infoData.channel_username}`;

                        showCustomModal({
                            icon: '📢',
                            title: 'Нужна подписка',
                            message: 'Пожалуйста, подпишитесь на наш Telegram-канал, чтобы открыть бесплатный кейс!',
                            buttons: [
                                {
                                    text: 'Перейти на канал',
                                    primary: true,
                                    onClick: () => {
                                        tg.openLink(channelUrl);
                                        elements.spinBtn.disabled = false;
                                    }
                                }
                            ],
                            onClose: () => { elements.spinBtn.disabled = false; }
                        });
                    } else {
                        showNotification(data.error || 'Ошибка при открытии кейса.', '⚠️');
                        elements.spinBtn.disabled = false;
                    }
                }
            } catch (error) {
                fetchUserData(); // Восстанавливаем баланс при ошибке сети
                showNotification('Ошибка связи с сервером при открытии кейса.', '⚠️');
                elements.spinBtn.disabled = false;
            }
        }, 50);
    });

    renderRewardsGrid();
    
    // --- ПЕРЕНЕСЕНО В ФОН (ПОЛНОСТЬЮ ИСКЛЮЧАЕТ ЗАВИСАНИЕ) ---
    fetchUserData(); 
    navigateTo('home'); 
});

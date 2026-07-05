document.addEventListener('DOMContentLoaded', async () => {
    let tg = window.Telegram.WebApp;
    tg.expand();

    const API_BASE_URL = window.location.origin;
    let currentUser = {};

    // --- ПУЛЫ ПРЕДМЕТОВ (ВАШИ ПРОВЕРЕННЫЕ СПИСКИ) ---
    // ЕЖЕДНЕВНЫЙ КЕЙС
    const GIFT_POOL_DAILY_CASE = [
        { id: 1, name: "Статуя птицы серая", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/954503c70e7e4d70b330820aa63c3a2664b43859d4fc5932.jpg", price: "20 TON", rawPrice: 20.0, isGold: true, type: "gift" },
        { id: 2, name: "Тыква", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/7da852289f424f4d8dbb74918372a50122e06951b2946cd3.jpg", price: "8 TON", rawPrice: 8.0, isGold: true, type: "gift" },
        { id: 3, name: "Шляпа", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/e8f404864d1b4fbfb591f0d577333bb7104e6b42b7b7aeff.jpg", price: "7 TON", rawPrice: 7.0, isGold: true, type: "gift" },
        { id: 4, name: "Собачка Snoop Dogg", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/c6a7b6471f8c4118aaf9bdc540ae6a00a21971af7fcb4cb6.jpg", price: "4 TON", rawPrice: 4.0, isGold: false, type: "gift" },
        { id: 5, name: "Рюкзак черный", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/b90f1ee2e18f4f45b092c6f1f5ec65f5b3283fdc18f3c876.jpg", price: "3 TON", rawPrice: 3.0, isGold: false, type: "gift" },
        { id: 6, name: "Доширак лапша", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/a4ddba996b304ed48118547363bf124191da7bb40deb532d.jpg", price: "2.7 TON", rawPrice: 2.7, isGold: false, type: "gift" },
        { id: 7, name: "Факел", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/c5e6656920a9373951204199f5834b44e30c33a961865c2.jpg", price: "2.5 TON", rawPrice: 2.5, isGold: false, type: "gift" },
        { id: 8, name: "Мороженое пломбир", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/668ac26d91c343b7972d8d74243b8a21ca21ba758b8f1471.jpg", price: "2.5 TON", rawPrice: 2.5, isGold: false, type: "gift" },
        { id: 9, name: "Алмазик", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/afdc136081d946a48e604a37f3ab43e27bac6e6419778bd1.jpg", price: "0.9 TON", rawPrice: 0.9, isGold: false, type: "gift" },
        { id: 10, name: "Роза", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/b595febe2739482d9aa250edb5fce5893e24113d46164d46.jpg", price: "0.27 TON", rawPrice: 0.27, isGold: false, type: "gift" },
        { id: 11, name: "Пополнение 0.1 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.1 TON", rawPrice: 0.1, type: "balance" },
        { id: 12, name: "Пополнение 0.07 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.07 TON", rawPrice: 0.07, type: "balance" },
        { id: 13, name: "Пополнение 0.05 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.05 TON", rawPrice: 0.05, type: "balance" },
        { id: 14, name: "Пополнение 0.03 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.03 TON", rawPrice: 0.03, type: "balance" }
    ];

    // КЕЙС НОВИЧКА (ПУЛ ЗАПОЛНИМ ПОСЛЕ ВАШИХ 13 КАРТИНОК)
    const GIFT_POOL_STARTER_CASE = [
        // Здесь будут ваши 13 предметов + 5 пополнений
        // Пока что пустой, чтобы не было ошибок
        { id: 100, name: "Подарок новичка (placeholder)", icon: "https://img.icons8.com/color/96/gift.png", price: "0.01 TON", rawPrice: 0.01, type: "gift" },
        { id: 101, name: "Пополнение 0.09 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.09 TON", rawPrice: 0.09, type: "balance" },
        { id: 102, name: "Пополнение 0.07 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.07 TON", rawPrice: 0.07, type: "balance" },
        { id: 103, name: "Пополнение 0.05 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.05 TON", rawPrice: 0.05, type: "balance" },
        { id: 104, name: "Пополнение 0.005 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.005 TON", rawPrice: 0.005, type: "balance" },
        { id: 105, name: "Пополнение 0.001 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.001 TON", rawPrice: 0.001, type: "balance" }
    ];


    const elements = {
        homeSection: document.getElementById('home-section'),
        dailyCaseSection: document.getElementById('daily-case-section'),
        starterCaseSection: document.getElementById('starter-case-section'),
        inventorySection: document.getElementById('inventory-section'),

        dailyRouletteTrack: document.getElementById('daily-roulette-track'),
        spinDailyCaseButton: document.getElementById('spin-daily-case-button'),
        dailyRewardsGrid: document.getElementById('daily-rewards-grid'),
        
        starterRouletteTrack: document.getElementById('starter-roulette-track'),
        spinStarterCaseButton: document.getElementById('spin-starter-case-button'),
        starterRewardsGrid: document.getElementById('starter-rewards-grid'),

        balanceDisplay: [
            document.getElementById('user-balance'), 
            document.getElementById('daily-case-user-balance'), 
            document.getElementById('starter-case-user-balance'),
            document.getElementById('inv-user-balance')
        ],
        
        inventoryGrid: document.getElementById('inventory-grid'),
        bottomNavigation: document.getElementById('bottom-navigation'),
        navTabs: document.querySelectorAll('.nav-tab')
    };

    // --- КРАСИВЫЕ КЛИЕНТСКИЕ УВЕДОМЛЕНИЯ ВНИЗУ (С КНОПКОЙ ЗАКРЫТИЯ ×) ---
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

    // --- Переключение страниц ---
    function navigateTo(target) {
        // Скрываем все секции
        [elements.homeSection, elements.dailyCaseSection, elements.starterCaseSection, elements.inventorySection].forEach(s => s.classList.add('hidden'));
        elements.bottomNavigation.classList.remove('hidden'); // Показываем нижнее меню по умолчанию

        // Активируем нужную секцию
        if (target === 'home') {
            elements.homeSection.classList.remove('hidden');
            setActiveTab('home');
        } else if (target === 'inventory') {
            elements.inventorySection.classList.remove('hidden');
            setActiveTab('inventory');
            fetchInventory(); 
            initDepositSelect(); 
        } else if (target === 'daily-case') {
            elements.dailyCaseSection.classList.remove('hidden');
            elements.bottomNavigation.classList.add('hidden'); // Скрываем меню для кейса
            initRouletteTrack(GIFT_POOL_DAILY_CASE, elements.dailyRouletteTrack);
        } else if (target === 'starter-case') {
            elements.starterCaseSection.classList.remove('hidden');
            elements.bottomNavigation.classList.add('hidden'); 
            initRouletteTrack(GIFT_POOL_STARTER_CASE, elements.starterRouletteTrack);
        }
    }

    function setActiveTab(targetId) {
        elements.navTabs.forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-target') === targetId);
        });
    }

    // ОБНОВЛЕННЫЕ ОБРАБОТЧИКИ НАВИГАЦИИ
    document.getElementById('daily-case-banner').addEventListener('click', () => navigateTo('daily-case'));
    // Кнопка кейса новичка пока неактивна
    document.getElementById('starter-case-banner').addEventListener('click', () => {
        showNotification('Кейс новичка пока недоступен. Следите за обновлениями!', '🚧');
        // navigateTo('starter-case'); // Раскомментировать, когда кейс будет готов
    });
    
    document.getElementById('back-to-home-button').addEventListener('click', () => navigateTo('home'));
    document.getElementById('back-to-home-from-starter-button').addEventListener('click', () => navigateTo('home'));

    elements.navTabs.forEach(tab => {
        tab.addEventListener('click', () => navigateTo(tab.getAttribute('data-target')));
    });

    // --- Заполнение списка призов для ввода (Депозит) ---
    function initDepositSelect() {
        const select = document.getElementById('deposit-item-select');
        if (!select) return;
        select.innerHTML = '<option value="">Выберите подарок для ввода</option>'; // Placeholder

        const giftsOnly = GIFT_POOL_DAILY_CASE.filter(g => g.type === 'gift'); // Только подарки из основного пула
        giftsOnly.forEach(gift => {
            const option = document.createElement('option');
            option.value = gift.id;
            option.innerText = `${gift.name} (${gift.price})`;
            select.appendChild(option);
        });
    }

    // --- Обработка нажатия подтверждения Ввода подарка ---
    document.getElementById('deposit-confirm-button').addEventListener('click', async () => {
        const select = document.getElementById('deposit-item-select');
        const itemId = select.value;
        if (!itemId) {
            showNotification('Пожалуйста, выберите подарок из списка.', '⚠️');
            return;
        }

        const selectedGift = GIFT_POOL_DAILY_CASE.find(g => g.id == itemId) || GIFT_POOL_STARTER_CASE.find(g => g.id == itemId);

        showCustomModal({
            icon: `<img src="${selectedGift.icon}" style="width:70px;height:70px;object-fit:contain;">`,
            title: 'Подтвердить передачу?',
            message: `Вы подтверждаете, что отправили подарок "${selectedGift.name}" на аккаунт @Sintopa в Телеграм?\n\nАдминистратор проверит отправку и зачислит предмет.`,
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
                                showNotification(`Заявка на ввод подарка "${selectedGift.name}" создана и отправлена админу!`, '📥');
                            } else {
                                const errorData = await res.json();
                                showNotification(errorData.error || 'Не удалось создать заявку.', '⚠️');
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

    // --- Отрисовка наград кейса ---
    function renderRewardsGrid(giftPool, targetGridElement) {
        targetGridElement.innerHTML = '';
        giftPool.forEach(gift => {
            const card = document.createElement('div');
            card.className = `reward-card ${gift.isGold ? 'gold-tier' : ''}`;
            const randomBadge = gift.type === 'gift' ? '<div class="reward-random-badge">random</div>' : '';

            card.innerHTML = `
                <div class="reward-price-top">${gift.price}</div>
                <img src="${gift.icon}" alt="${gift.name}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                <div class="reward-name">${gift.name}</div>
                ${randomBadge}
            `;
            targetGridElement.appendChild(card);
        });
    }

    // --- Загрузка данных пользователя ---
    async function fetchUserData() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/user`, { 
                headers: { 'X-Telegram-Init-Data': tg.initData || "" }
            });
            if (!res.ok) throw new Error();
            currentUser = await res.json();
        } catch (e) {
            currentUser = {
                balance: 21.980,
                username: tg.initDataUnsafe?.user?.username || "Андрей",
                first_name: tg.initDataUnsafe?.user?.first_name || "Андрей",
                avatar_url: "https://img.icons8.com/color/96/user.png",
                is_admin: true,
                last_daily_case_open: new Date('2000-01-01'),
                last_starter_case_open: new Date('2000-01-01')
            };
        }

        elements.balanceDisplay.forEach(d => {
            if (d) d.innerText = `${parseFloat(currentUser.balance || 0).toFixed(3)} TON`;
        });

        const avUrls = currentUser.avatar_url || "https://img.icons8.com/color/96/user.png";
        ['user-avatar', 'daily-case-user-avatar', 'starter-case-user-avatar', 'inv-user-avatar'].forEach(id => {
            const img = document.getElementById(id);
            if (img) {
                img.src = avUrls;
                img.onerror = () => { img.src = "https://img.icons8.com/color/96/user.png"; };
            }
        });
        
        document.getElementById('user-username').innerText = currentUser.username || currentUser.first_name || "Пользователь";
        document.getElementById('inv-user-username').innerText = currentUser.username || currentUser.first_name || "Пользователь";
        
        updateDailyCaseTimer();
    }

    // --- Таймер кейса ---
    let dailyCaseTimerInterval;
    function updateDailyCaseTimer() {
        clearInterval(dailyCaseTimerInterval); 

        const homeDailyCaseStatus = document.getElementById('home-daily-case-status');
        const spinDailyButton = elements.spinDailyCaseButton;
        const dailyTimerContainer = document.getElementById('daily-case-timer-container');
        const dailyTimerClock = document.getElementById('daily-case-timer');

        if (currentUser.is_admin) {
            homeDailyCaseStatus.innerText = 'Доступно без ограничений (Админ)!';
            homeDailyCaseStatus.style.color = 'var(--green-success)';
            spinDailyButton.disabled = false;
            dailyTimerContainer.classList.add('hidden');
            return;
        }

        const lastOpen = new Date(currentUser.last_daily_case_open);
        const now = new Date();
        const cooldown = 24 * 60 * 60 * 1000; 
        const nextOpenTime = new Date(lastOpen.getTime() + cooldown);
        let timeLeftMs = nextOpenTime.getTime() - now.getTime();

        if (timeLeftMs <= 0) {
            homeDailyCaseStatus.innerText = 'Доступно!';
            homeDailyCaseStatus.style.color = 'var(--green-success)';
            spinDailyButton.disabled = false;
            dailyTimerContainer.classList.add('hidden');
        } else {
            spinDailyButton.disabled = true;
            dailyTimerContainer.classList.remove('hidden');

            const tick = () => {
                const nowTick = new Date();
                timeLeftMs = nextOpenTime.getTime() - nowTick.getTime();
                if (timeLeftMs <= 0) {
                    clearInterval(dailyCaseTimerInterval);
                    updateDailyCaseTimer(); // Обновляем статус после истечения таймера
                    return;
                }
                const hours = Math.floor(timeLeftMs / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((timeLeftMs % (1000 * 60)) / 1000);
                
                const timerString = `${hours}ч ${minutes}м ${seconds}с`;
                dailyTimerClock.innerText = timerString;
                homeDailyCaseStatus.innerText = `Доступно через: ${timerString}`;
                homeDailyCaseStatus.style.color = 'var(--red-alert)';
            };
            tick();
            dailyCaseTimerInterval = setInterval(tick, 1000); 
        }
    }

    // --- Загрузка плоского инвентаря ---
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
                        🎒 Ваш инвентарь пуст.<br>Оставляйте призы себе, чтобы увидеть их здесь!
                    </div>`;
                return;
            }

            items.forEach(item => {
                const matchedItem = GIFT_POOL_DAILY_CASE.find(g => g.name.toLowerCase() === item.name.toLowerCase()) || 
                                   GIFT_POOL_STARTER_CASE.find(g => g.name.toLowerCase() === item.name.toLowerCase()) || {}; // Ищем в обоих пулах
                const imageSrc = matchedItem.icon || item.image_url;

                const card = document.createElement('div');
                card.className = 'reward-card';
                card.innerHTML = `
                    <div class="reward-price-top">${parseFloat(item.value).toFixed(2)} TON</div>
                    <img src="${imageSrc}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                    <div class="reward-name">${item.name}</div>
                    <div class="inv-actions">
                        <button class="inv-btn withdraw-btn" data-item-id="${item.item_id}">Вывести</button>
                        <button class="inv-btn sell-btn" data-item-id="${item.item_id}" data-item-price="${item.value}">Продать</button>
                    </div>
                `;

                // Кнопка Вывода
                card.querySelector('.withdraw-btn').addEventListener('click', (e) => {
                    const itemId = e.target.dataset.itemId;
                    const selectedGift = GIFT_POOL_DAILY_CASE.find(g => g.id == itemId) || GIFT_POOL_STARTER_CASE.find(g => g.id == itemId); // Ищем в обоих пулах
                    showCustomModal({
                        icon: `<img src="${selectedGift.icon}" style="width:70px;height:70px;object-fit:contain;">`,
                        title: 'Вывод подарка',
                        message: `Отправить "${selectedGift.name}" вам в Telegram? Он будет списан из вашего инвентаря.`,
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
                                            body: JSON.stringify({ itemId: itemId })
                                        });

                                        if (withdrawRes.ok) {
                                            showNotification(`Подарок "${selectedGift.name}" в очереди на вывод! Админ свяжется с вами.`, '📥');
                                            fetchInventory(); 
                                        } else {
                                            const errorData = await withdrawRes.json();
                                            showNotification(errorData.error || 'Заявка на вывод отклонена.', '⚠️');
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

                // Кнопка Продажи
                card.querySelector('.sell-btn').addEventListener('click', (e) => {
                    const itemId = e.target.dataset.itemId;
                    const itemPrice = e.target.dataset.itemPrice;
                    const selectedGift = GIFT_POOL_DAILY_CASE.find(g => g.id == itemId) || GIFT_POOL_STARTER_CASE.find(g => g.id == itemId);

                    showCustomModal({
                        icon: '💰',
                        title: 'Продажа подарка',
                        message: `Вы действительно хотите мгновенно продать подарок "${selectedGift.name}" за ${itemPrice} TON?`,
                        buttons: [
                            {
                                text: 'Продать за TON',
                                primary: true,
                                onClick: async () => {
                                    try {
                                        const sellRes = await fetch(`${API_BASE_URL}/api/sell_gift`, {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'X-Telegram-Init-Data': tg.initData || ""
                                            },
                                            body: JSON.stringify({ itemId: itemId, price: itemPrice })
                                        });

                                        if (sellRes.ok) {
                                            const sellData = await sellRes.json();
                                            currentUser.balance = sellData.newBalance;
                                            showNotification(`Вы успешно продали "${selectedGift.name}" за +${itemPrice} TON!`, '💰');
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
            elements.inventoryGrid.innerHTML = '<div class="empty-inventory">Ошибка загрузки инвентаря.</div>';
        }
    }

    // --- Инициализация ленты рулетки (универсальная функция) ---
    function initRouletteTrack(giftPool, rouletteTrackElement) {
        rouletteTrackElement.style.transition = 'none';
        rouletteTrackElement.style.transform = 'translateX(0px)';
        void rouletteTrackElement.offsetWidth; 

        rouletteTrackElement.innerHTML = '';

        for (let i = 0; i < 50; i++) {
            const randomItem = giftPool[Math.floor(Math.random() * giftPool.length)];
            const itemEl = document.createElement('div');
            itemEl.className = 'roulette-item';
            itemEl.innerHTML = `
                <img src="${randomItem.icon}" alt="${randomItem.name}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                <span>${randomItem.price}</span>
            `;
            rouletteTrackElement.appendChild(itemEl);
        }
    }

    // --- Математически идеальная прокрутка рулетки (универсальная) ---
    function spinRoulette(winningItem, rouletteTrackElement, onComplete) {
        const itemWidth = 84; 
        const gap = 8; 
        const itemFullWidth = itemWidth + gap; 
        const targetIndex = 35; 

        const trackItems = rouletteTrackElement.children;
        if (trackItems[targetIndex]) {
            trackItems[targetIndex].className = 'roulette-item';
            trackItems[targetIndex].innerHTML = `
                <img src="${winningItem.icon}" alt="${winningItem.name}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                <span>${winningItem.price}</span>
            `;
        }

        const containerWidth = rouletteTrackElement.parentElement.offsetWidth;
        const centerOffset = (containerWidth / 2) - (itemWidth / 2);
        const totalTranslate = (targetIndex * itemFullWidth) - centerOffset;

        rouletteTrackElement.style.transition = 'transform 5s cubic-bezier(0.15, 0.85, 0.15, 1)';
        rouletteTrackElement.style.transform = `translateX(-${totalTranslate}px)`;

        setTimeout(() => {
            onComplete();
        }, 5100);
    }

    // --- ОБРАБОТЧИКИ КЛИКОВ ПО КЕЙСАМ ---
    // ЕЖЕДНЕВНЫЙ КЕЙС
    elements.spinDailyCaseButton.addEventListener('click', async () => {
        elements.spinDailyCaseButton.disabled = true;
        initRouletteTrack(GIFT_POOL_DAILY_CASE, elements.dailyRouletteTrack);

        setTimeout(async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/open_case`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg.initData || "" },
                    body: JSON.stringify({ caseType: 'daily_case' })
                });
                const data = await response.json();

                if (response.ok) {
                    let winningGift = GIFT_POOL_DAILY_CASE.find(g => g.id === data.wonItem.id);
                    if (!winningGift) { winningGift = GIFT_POOL_DAILY_CASE.find(g => g.name.toLowerCase() === data.wonItem.name.toLowerCase()); }

                    spinRoulette(winningGift, elements.dailyRouletteTrack, () => {
                        processWinning(winningGift, elements.spinDailyCaseButton);
                    });
                } else {
                    if (data.error && data.error.includes('подписчиком канала')) {
                        const infoRes = await fetch(`${API_BASE_URL}/api/daily_case_info`, { headers: { 'X-Telegram-Init-Data': tg.initData || "" } });
                        const infoData = await infoRes.json();
                        const channelUrl = `https://t.me/${infoData.channel_username}`;

                        showCustomModal({
                            icon: '📢',
                            title: 'Нужна подписка',
                            message: 'Пожалуйста, подпишитесь на наш Telegram-канал, чтобы получить возможность открывать бесплатные ежедневные кейсы!',
                            buttons: [
                                { text: 'Перейти на канал', primary: true, onClick: () => { tg.openLink(channelUrl); elements.spinDailyCaseButton.disabled = false; } }
                            ],
                            onClose: () => { elements.spinDailyCaseButton.disabled = false; }
                        });
                    } else {
                        showNotification(data.error || 'Ошибка при открытии кейса.', '⚠️');
                        elements.spinDailyCaseButton.disabled = false;
                    }
                }
            } catch (error) {
                showNotification('Ошибка связи с базой данных.', '⚠️');
                elements.spinDailyCaseButton.disabled = false;
            }
        }, 50);
    });

    // КЕЙС НОВИЧКА (ЛОГИКА БУДЕТ АКТИВНА ПОСЛЕ ЗАГРУЗКИ КАРТИНОК)
    elements.spinStarterCaseButton.addEventListener('click', async () => {
        elements.spinStarterCaseButton.disabled = true;
        initRouletteTrack(GIFT_POOL_STARTER_CASE, elements.starterRouletteTrack);

        setTimeout(async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/open_case`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg.initData || "" },
                    body: JSON.stringify({ caseType: 'starter_case' })
                });
                const data = await response.json();

                if (response.ok) {
                    let winningGift = GIFT_POOL_STARTER_CASE.find(g => g.id === data.wonItem.id);
                    if (!winningGift) { winningGift = GIFT_POOL_STARTER_CASE.find(g => g.name.toLowerCase() === data.wonItem.name.toLowerCase()); }

                    spinRoulette(winningGift, elements.starterRouletteTrack, () => {
                        processWinning(winningGift, elements.spinStarterCaseButton);
                    });
                } else {
                    showNotification(data.error || 'Ошибка при открытии кейса.', '⚠️');
                    elements.spinStarterCaseButton.disabled = false;
                }
            } catch (error) {
                showNotification('Ошибка связи с базой данных.', '⚠️');
                elements.spinStarterCaseButton.disabled = false;
            }
        }, 50);
    });

    // --- Обработка выигрыша (передаем кнопку для активации) ---
    function processWinning(winningGift, spinButtonElement) {
        if (winningGift.type === "balance" || winningGift.name.toLowerCase().includes("пополнение")) {
            showCustomModal({
                icon: '💰',
                title: 'Баланс пополнен!',
                message: `🎉 Вы успешно выиграли пополнение счета на +${winningGift.price}!`,
                buttons: [{ text: 'Отлично!', primary: true }]
            });
            fetchUserData();
            spinButtonElement.disabled = false;
        } else {
            showCustomModal({
                icon: `<img src="${winningGift.icon}" style="width:70px;height:70px;object-fit:contain;">`,
                title: 'Вы выиграли подарок!',
                message: `🎁 Ваша награда: "${winningGift.name}"!\n\nЖелаете мгновенно продать подарок за ${winningGift.price} или сохранить его в Инвентаре?`,
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
                                    showNotification(`Подарок успешно продан за +${winningGift.price}!`, '💰');
                                    fetchUserData();
                                }
                            } catch (e) {
                                showNotification('Ошибка соединения при продаже.', '⚠️');
                            }
                        }
                    },
                    {
                        text: 'Оставить себе в инвентарь',
                        primary: false,
                        onClick: () => {
                            showNotification(`📦 Подарок "${winningGift.name}" бережно упакован в ваш Инвентарь!`, '🎒');
                            fetchUserData();
                        }
                    }
                ]
            });
            spinButtonElement.disabled = false;
        }
    }


    // Инициализация
    renderRewardsGrid(GIFT_POOL_DAILY_CASE, elements.dailyRewardsGrid);
    renderRewardsGrid(GIFT_POOL_STARTER_CASE, elements.starterRewardsGrid); // Для нового кейса
    await fetchUserData(); 
    navigateTo('home'); 
});

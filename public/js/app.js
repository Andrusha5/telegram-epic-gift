document.addEventListener('DOMContentLoaded', async () => {
    let tg = window.Telegram.WebApp;
    tg.expand();

    const API_BASE_URL = window.location.origin;
    let currentUser = {};
    let GIFT_POOL = []; // Теперь подгружается динамически!

    const elements = {
        homeSection: document.getElementById('home-section'),
        caseSection: document.getElementById('case-section'),
        inventorySection: document.getElementById('inventory-section'),
        rouletteTrack: document.getElementById('roulette-track'),
        spinBtn: document.getElementById('spin-case-button'),
        balanceDisplay: [document.getElementById('user-balance'), document.getElementById('case-user-balance'), document.getElementById('inv-user-balance')],
        rewardsGrid: document.getElementById('rewards-grid'),
        inventoryGrid: document.getElementById('inventory-grid'),
        bottomNavigation: document.getElementById('bottom-navigation'),
        navTabs: document.querySelectorAll('.nav-tab')
    };

    // Загрузка пула призов из БД
    async function loadGiftsPool() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/gifts_pool`);
            if (res.ok) {
                GIFT_POOL = await res.json();
                renderRewardsGrid();
            }
        } catch (e) {
            console.error("Не удалось загрузить пул призов", e);
        }
    }

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

    function navigateTo(target) {
        [elements.homeSection, elements.caseSection, elements.inventorySection].forEach(s => s.classList.add('hidden'));
        elements.bottomNavigation.classList.remove('hidden');

        if (target === 'home') {
            elements.homeSection.classList.remove('hidden');
            setActiveTab('home');
        } else if (target === 'inventory') {
            elements.inventorySection.classList.remove('hidden');
            setActiveTab('inventory');
            fetchInventory(); 
            initDepositSelect();
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

    document.getElementById('daily-case-banner').addEventListener('click', () => navigateTo('case'));
    document.getElementById('back-to-home-button').addEventListener('click', () => navigateTo('home'));

    function initDepositSelect() {
        const select = document.getElementById('deposit-item-select');
        if (!select) return;
        select.innerHTML = '';

        const giftsOnly = GIFT_POOL.filter(g => g.type === 'gift');
        giftsOnly.forEach(gift => {
            const option = document.createElement('option');
            option.value = gift.id;
            option.innerText = `${gift.name} (${gift.price})`;
            select.appendChild(option);
        });
    }

    document.getElementById('deposit-confirm-button').addEventListener('click', async () => {
        const select = document.getElementById('deposit-item-select');
        const itemId = select.value;
        const selectedGift = GIFT_POOL.find(g => g.id == itemId);
        if (!selectedGift) return;

        showCustomModal({
            icon: `<img src="${selectedGift.icon}" style="width:70px;height:70px;object-fit:contain;">`,
            title: 'Подтвердить передачу?',
            message: `Вы подтверждаете, что отправили подарок "${selectedGift.name}" на аккаунт @Sintopa в Телеграм?`,
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
                                showNotification(`Заявка создана!`, '📥');
                            } else {
                                showNotification('Не удалось создать заявку.', '⚠️');
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

    function renderRewardsGrid() {
        if (!elements.rewardsGrid) return;
        elements.rewardsGrid.innerHTML = '';
        GIFT_POOL.forEach(gift => {
            const card = document.createElement('div');
            card.className = `reward-card ${gift.isGold ? 'gold-tier' : ''}`;
            const randomBadge = gift.type === 'gift' ? '<div class="reward-random-badge">random</div>' : '';

            card.innerHTML = `
                <div class="reward-price-top">${gift.price}</div>
                <img src="${gift.icon}" alt="${gift.name}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                <div class="reward-name">${gift.name}</div>
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
            currentUser = {
                balance: 0.0,
                username: tg.initDataUnsafe?.user?.username || "Пользователь",
                first_name: tg.initDataUnsafe?.user?.first_name || "Пользователь",
                avatar_url: "https://img.icons8.com/color/96/user.png",
                is_admin: false
            };
        }

        elements.balanceDisplay.forEach(d => {
            if (d) d.innerText = `${parseFloat(currentUser.balance || 0).toFixed(3)} TON`;
        });

        const avUrls = currentUser.avatar_url || "https://img.icons8.com/color/96/user.png";
        ['user-avatar', 'case-user-avatar', 'inv-user-avatar'].forEach(id => {
            const img = document.getElementById(id);
            if (img) img.src = avUrls;
        });
        
        document.getElementById('user-username').innerText = currentUser.username || currentUser.first_name;
        document.getElementById('inv-user-username').innerText = currentUser.username || currentUser.first_name;
        
        updateDailyCaseTimer();
    }

    let dailyCaseTimerInterval;
    function updateDailyCaseTimer() {
        clearInterval(dailyCaseTimerInterval); 

        if (currentUser.is_admin) {
            document.getElementById('home-case-status').innerText = 'Режим админа!';
            elements.spinBtn.classList.remove('hidden');
            elements.spinBtn.disabled = false;
            document.getElementById('timer-container').classList.add('hidden');
            return;
        }

        if (!currentUser.last_daily_case_open) {
            document.getElementById('home-case-status').innerText = 'Доступно!';
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
            document.getElementById('home-case-status').innerText = 'Доступно!';
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
                
                const timerString = `${hours}ч ${minutes}м ${seconds}с`;
                document.getElementById('daily-case-timer').innerText = timerString;
                document.getElementById('home-case-status').innerText = `Доступно через: ${timerString}`;
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
            const items = await res.json();
            elements.inventoryGrid.innerHTML = '';
            
            if (items.length === 0) {
                elements.inventoryGrid.innerHTML = `<div class="empty-inventory">🎒 Ваш инвентарь пуст.</div>`;
                return;
            }

            items.forEach(item => {
                const matchedItem = GIFT_POOL.find(g => g.id === item.item_id) || {};
                const imageSrc = matchedItem.icon || item.image_url;

                const card = document.createElement('div');
                card.className = 'reward-card';
                card.innerHTML = `
                    <div class="reward-price-top">${parseFloat(item.value).toFixed(2)} TON</div>
                    <img src="${imageSrc}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                    <div class="reward-name">${item.name}</div>
                    <div class="inv-actions">
                        <button class="inv-btn withdraw-btn">Вывести</button>
                        <button class="inv-btn sell-btn">Продать</button>
                    </div>
                `;

                card.querySelector('.withdraw-btn').addEventListener('click', () => {
                    showCustomModal({
                        icon: `<img src="${imageSrc}" style="width:70px;height:70px;object-fit:contain;">`,
                        title: 'Вывод подарка',
                        message: `Вывести "${item.name}"?`,
                        buttons: [
                            {
                                text: 'Подтвердить вывод',
                                primary: true,
                                onClick: async () => {
                                    const withdrawRes = await fetch(`${API_BASE_URL}/api/withdraw_gift`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg.initData || "" },
                                        body: JSON.stringify({ itemId: item.item_id })
                                    });
                                    if (withdrawRes.ok) {
                                        showNotification(`Заявка создана!`, '📥');
                                        fetchInventory(); 
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
                        message: `Продать за ${item.value} TON?`,
                        buttons: [
                            {
                                text: 'Продать',
                                primary: true,
                                onClick: async () => {
                                    const sellRes = await fetch(`${API_BASE_URL}/api/sell_gift`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg.initData || "" },
                                        body: JSON.stringify({ itemId: item.item_id }) // Больше цену не шлем!
                                    });
                                    if (sellRes.ok) {
                                        showNotification(`Продано!`, '💰');
                                        fetchUserData();
                                        fetchInventory();
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
            elements.inventoryGrid.innerHTML = '<div class="empty-inventory">Ошибка загрузки.</div>';
        }
    }

    function initRouletteTrack() {
        elements.rouletteTrack.style.transition = 'none';
        elements.rouletteTrack.style.transform = 'translateX(0px)';
        void elements.rouletteTrack.offsetWidth; 
        elements.rouletteTrack.innerHTML = '';

        if (GIFT_POOL.length === 0) return;

        for (let i = 0; i < 50; i++) {
            const randomItem = GIFT_POOL[Math.floor(Math.random() * GIFT_POOL.length)];
            const itemEl = document.createElement('div');
            itemEl.className = 'roulette-item';
            itemEl.innerHTML = `
                <img src="${randomItem.icon}">
                <span>${randomItem.price}</span>
            `;
            elements.rouletteTrack.appendChild(itemEl);
        }
    }

    function spinRoulette(winningItem, onComplete) {
        const itemWidth = 84; 
        const gap = 8; 
        const itemFullWidth = itemWidth + gap; 
        const targetIndex = 35; 

        const trackItems = elements.rouletteTrack.children;
        if (trackItems[targetIndex]) {
            trackItems[targetIndex].innerHTML = `
                <img src="${winningItem.icon}">
                <span>${winningItem.price}</span>
            `;
        }

        const containerWidth = elements.rouletteTrack.parentElement.offsetWidth;
        const centerOffset = (containerWidth / 2) - (itemWidth / 2);
        const totalTranslate = (targetIndex * itemFullWidth) - centerOffset;

        elements.rouletteTrack.style.transition = 'transform 5s cubic-bezier(0.15, 0.85, 0.15, 1)';
        elements.rouletteTrack.style.transform = `translateX(-${totalTranslate}px)`;

        setTimeout(onComplete, 5100);
    }

    function processWinning(winningGift) {
        if (winningGift.type === "balance") {
            showCustomModal({
                icon: '💰',
                title: 'Баланс пополнен!',
                message: `🎉 Вы выиграли +${winningGift.price}!`,
                buttons: [{ text: 'Отлично!', primary: true }]
            });
            fetchUserData();
            elements.spinBtn.disabled = false;
        } else {
            showCustomModal({
                icon: `<img src="${winningGift.icon}" style="width:70px;height:70px;object-fit:contain;">`,
                title: 'Вы выиграли подарок!',
                message: `🎁 Награда: "${winningGift.name}"! Продать её или сохранить?`,
                buttons: [
                    {
                        text: `Продать за ${winningGift.price}`,
                        primary: true,
                        onClick: async () => {
                            const sellRes = await fetch(`${API_BASE_URL}/api/sell_gift`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg.initData || "" },
                                body: JSON.stringify({ itemId: winningGift.id })
                            });
                            if (sellRes.ok) {
                                showNotification(`Продано!`, '💰');
                                fetchUserData();
                            }
                        }
                    },
                    {
                        text: 'В инвентарь',
                        primary: false,
                        onClick: () => {
                            showNotification(`Сохранено!`, '🎒');
                            fetchUserData();
                        }
                    }
                ]
            });
            elements.spinBtn.disabled = false;
        }
    }

    elements.spinBtn.addEventListener('click', async () => {
        elements.spinBtn.disabled = true;
        initRouletteTrack();

        setTimeout(async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/open_daily_case`, {
                    method: 'POST',
                    headers: { 'X-Telegram-Init-Data': tg.initData || "" }
                });
                const data = await response.json();

                if (response.ok) {
                    const winningGift = GIFT_POOL.find(g => g.id === data.wonItem.id);
                    spinRoulette(winningGift, () => processWinning(winningGift));
                } else {
                    showNotification(data.error || 'Ошибка', '⚠️');
                    elements.spinBtn.disabled = false;
                }
            } catch (error) {
                showNotification('Ошибка сети.', '⚠️');
                elements.spinBtn.disabled = false;
            }
        }, 50);
    });

    // Стартовая инициализация порядка вызовов
    await loadGiftsPool();
    await fetchUserData(); 
    navigateTo('home'); 
});

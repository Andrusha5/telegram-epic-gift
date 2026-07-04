document.addEventListener('DOMContentLoaded', async () => {
    let tg = window.Telegram.WebApp;
    tg.expand();

    const API_BASE_URL = window.location.origin;
    let currentUser = {};

    // --- ТВОЙ ПРОВЕРЕННЫЙ, ОТЛАЖЕННЫЙ СПИСОК ПРИЗОВ С КАРТИНКАМИ (ОТ ДОРОГИХ К ДЕШЕВЫМ) ---
    const GIFT_POOL = [
        { id: 1, name: "Статуя птицы серая", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/954503c70e7e4d70b330820aa63c3a2664b43859d4fc5932.jpg", price: "20 TON", rawPrice: 20.0, isGold: true, type: "gift" },
        { id: 2, name: "Тыква", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/7da852289f424f4d8dbb74918372a50122e06951b2946cd3.jpg", price: "8 TON", rawPrice: 8.0, isGold: true, type: "gift" },
        { id: 3, name: "Шляпа", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/e8f404864d1b4fbfb591f0d577333bb7104e6b42b7b7aeff.jpg", price: "7 TON", rawPrice: 7.0, isGold: true, type: "gift" },
        { id: 4, name: "Собачка Snoop Dogg", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/c6a7b6471f8c4118aaf9bdc540ae6a00a21971af7fcb4cb6.jpg", price: "4 TON", rawPrice: 4.0, isGold: false, type: "gift" },
        { id: 5, name: "Рюкзак черный", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/b90f1ee2e18f4f45b092c6f1f5ec65f5b3283fdc18f3c876.jpg", price: "3 TON", rawPrice: 3.0, isGold: false, type: "gift" },
        { id: 6, name: "Доширак лапша", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/a4ddba996b304ed48118547363bf124191da7bb40deb532d.jpg", price: "2.7 TON", rawPrice: 2.7, isGold: false, type: "gift" },
        { id: 7, name: "Факел", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/c5e6656920a94373951204199f5834b44e30c33a961865c2.jpg", price: "2.5 TON", rawPrice: 2.5, isGold: false, type: "gift" },
        { id: 8, name: "Мороженое пломбир", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/668ac26d91c343b7972d8d74243b8a21ca21ba758b8f1471.jpg", price: "2.5 TON", rawPrice: 2.5, isGold: false, type: "gift" },
        { id: 9, name: "Алмазик", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/afdc136081d946a48e604a37f3ab43e27bac6e6419778bd1.jpg", price: "0.9 TON", rawPrice: 0.9, isGold: false, type: "gift" },
        { id: 10, name: "Роза", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/b595febe2739482d9aa250edb5fce5893e24113d46164d46.jpg", price: "0.27 TON", rawPrice: 0.27, isGold: false, type: "gift" },
        // Пополнения баланса
        { id: 11, name: "Пополнение 0.1 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.1 TON", rawPrice: 0.1, isGold: false, type: "balance" },
        { id: 12, name: "Пополнение 0.07 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.07 TON", rawPrice: 0.07, isGold: false, type: "balance" },
        { id: 13, name: "Пополнение 0.05 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.05 TON", rawPrice: 0.05, isGold: false, type: "balance" },
        { id: 14, name: "Пополнение 0.03 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.03 TON", rawPrice: 0.03, isGold: false, type: "balance" }
    ];

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

    // --- КРАСИВЫЕ КАСТОМНЫЕ УВЕДОМЛЕНИЯ (5 секунд) ---
    function showNotification(message, icon = '🎁') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'custom-toast';
        toast.innerHTML = `
            <div class="custom-toast-icon">${icon}</div>
            <div class="custom-toast-content">${message}</div>
        `;
        container.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 50);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 5000);
    }

    // --- Переключение страниц ---
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

    // --- Отрисовка наград в два столбика ---
    function renderRewardsGrid() {
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

    // --- Загрузка пользователя (с защитой от зависания и установкой аватаров) ---
    async function fetchUserData() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/user`, { 
                headers: { 'X-Telegram-Init-Data': tg.initData || "" }
            });
            if (!res.ok) throw new Error();
            currentUser = await res.json();
        } catch (e) {
            console.warn("Сеть недоступна. Запуск в офлайн-режиме.");
            currentUser = {
                balance: 21.980,
                username: tg.initDataUnsafe?.user?.username || "СВЕРХСЕКРЕТНЫЙ",
                first_name: tg.initDataUnsafe?.user?.first_name || "СВЕРХСЕКРЕТНЫЙ",
                avatar_url: "https://img.icons8.com/color/96/user.png",
                is_admin: true
            };
        }

        elements.balanceDisplay.forEach(d => {
            if (d) d.innerText = `${parseFloat(currentUser.balance || 0).toFixed(3)} TON`;
        });

        // ПРИНУДИТЕЛЬНО ОБНОВЛЯЕМ АВАТАР ВО ВСЕХ ТРЕХ МЕСТАХ
        const avUrls = currentUser.avatar_url || "https://img.icons8.com/color/96/user.png";
        
        ['user-avatar', 'case-user-avatar', 'inv-user-avatar'].forEach(id => {
            const img = document.getElementById(id);
            if (img) {
                img.src = avUrls;
                img.onerror = () => { img.src = "https://img.icons8.com/color/96/user.png"; };
            }
        });
        
        document.getElementById('user-username').innerText = currentUser.username || currentUser.first_name || "Пользователь";
        document.getElementById('inv-user-username').innerText = currentUser.username || currentUser.first_name || "Пользователь";
        document.getElementById('home-case-status').innerText = "Доступен!";
    }

    // --- Загрузка инвентаря с верными кнопками и ценами ---
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
                const card = document.createElement('div');
                card.className = 'reward-card';
                card.innerHTML = `
                    <div class="reward-price-top">${parseFloat(item.value).toFixed(2)} TON</div>
                    <div class="item-qty">x${item.quantity}</div>
                    <img src="${item.image_url}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                    <div class="reward-name">${item.name}</div>
                    <div class="inv-actions">
                        <button class="inv-btn withdraw-btn">Вывести</button>
                        <button class="inv-btn sell-btn">Продать</button>
                    </div>
                `;

                // Обработчик вывода предмета
                card.querySelector('.withdraw-btn').addEventListener('click', async () => {
                    const confirmAction = confirm(`Вы уверены, что хотите вывести подарок "${item.name}" в Telegram? Он пропадет из вашего инвентаря.`);
                    if (!confirmAction) return;

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
                            showNotification(`Заявка на вывод подарка "${item.name}" создана! Мы свяжемся с вами в ЛС.`, '📥');
                            fetchInventory(); // Обновляем инвентарь на экране
                        } else {
                            showNotification('Не удалось создать заявку на вывод.', '⚠️');
                        }
                    } catch (err) {
                        showNotification('Ошибка связи с сервером при выводе.', '⚠️');
                    }
                });

                // Обработчик продажи предмета
                card.querySelector('.sell-btn').addEventListener('click', async () => {
                    const confirmAction = confirm(`Вы уверены, что хотите продать подарок "${item.name}" за ${item.value} TON?`);
                    if (!confirmAction) return;

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
                            showNotification(`Подарок "${item.name}" успешно продан за +${item.value} TON!`, '💰');
                            fetchUserData();
                            fetchInventory();
                        } else {
                            showNotification('Не удалось продать подарок.', '⚠️');
                        }
                    } catch (err) {
                        showNotification('Ошибка связи с сервером при продаже.', '⚠️');
                    }
                });

                elements.inventoryGrid.appendChild(card);
            });
        } catch (error) {
            elements.inventoryGrid.innerHTML = '<div class="empty-inventory">Ошибка загрузки инвентаря.</div>';
        }
    }

    // --- Рулетка ---
    function initRouletteTrack() {
        elements.rouletteTrack.style.transition = 'none';
        elements.rouletteTrack.style.transform = 'translateX(0px)';
        
        void elements.rouletteTrack.offsetWidth; 

        elements.rouletteTrack.innerHTML = '';

        for (let i = 0; i < 50; i++) {
            const randomItem = GIFT_POOL[Math.floor(Math.random() * GIFT_POOL.length)];
            const itemEl = document.createElement('div');
            itemEl.className = 'roulette-item';
            itemEl.innerHTML = `
                <img src="${randomItem.icon}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                <span>${randomItem.price}</span>
            `;
            elements.rouletteTrack.appendChild(itemEl);
        }
    }

    // МАТЕМАТИЧЕСКИ ТОЧНЫЙ СПИН БЕЗ РАССИНХРОНОВ (ОСТАНАВЛИВАЕТСЯ ТАК, КАК НАПИСАНО)
    function spinRoulette(winningItem, onComplete) {
        const itemWidth = 84; 
        const gap = 8; 
        const itemFullWidth = itemWidth + gap; // 92
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
    function processWinning(winningGift, isMock = false, apiNewBalance = null) {
        if (winningGift.type === "balance" || winningGift.name.toLowerCase().includes("пополнение")) {
            showNotification(`🎉 Вы выиграли пополнение баланса на +${winningGift.price}!`, '💰');
            fetchUserData();
            elements.spinBtn.disabled = false;
        } else {
            tg.showPopup({
                title: '🎁 Поздравляем!',
                message: `Вы выиграли подарок: "${winningGift.name}"!\n\nПродать этот подарок за ${winningGift.price} или оставить себе в инвентарь?`,
                buttons: [
                    { id: 'sell', type: 'default', text: `Продать за ${winningGift.price}` },
                    { id: 'keep', type: 'ok', text: 'Оставить себе' }
                ]
            }, async (buttonId) => {
                if (buttonId === 'sell') {
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
                            showNotification(`💰 Вы успешно продали подарок за +${winningGift.price}!`, '💰');
                            fetchUserData();
                        }
                    } catch (e) {
                        showNotification('Ошибка связи с сервером.', '⚠️');
                    }
                } else {
                    showNotification(`📦 Подарок "${winningGift.name}" успешно сохранен в вашем Инвентаре!`, '🎒');
                    fetchUserData();
                }
                elements.spinBtn.disabled = false;
            });
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
                    let winningGift = GIFT_POOL.find(g => g.id === data.wonItem.id);
                    if (!winningGift) {
                        winningGift = GIFT_POOL.find(g => g.name.toLowerCase() === data.wonItem.name.toLowerCase());
                    }

                    spinRoulette(winningGift, () => {
                        processWinning(winningGift, false, data.newBalance);
                    });

                } else {
                    showNotification(data.error || 'Ошибка при открытии кейса.', '⚠️');
                    elements.spinBtn.disabled = false;
                }
            } catch (error) {
                showNotification('Произошла ошибка соединения с базой данных.', '⚠️');
                elements.spinBtn.disabled = false;
            }
        }, 50);
    });

    renderRewardsGrid();
    await fetchUserData(); 
    navigateTo('home'); 
});

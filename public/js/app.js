document.addEventListener('DOMContentLoaded', async () => {
    const tg = window.Telegram.WebApp;
    if (!tg) {
        console.error("Telegram WebApp SDK не загружен. Запустите в Telegram.");
        window.Telegram = {
            WebApp: {
                initData: 'user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22%D0%A1%D0%92%D0%95%D0%A0%D0%A5%D0%A1%D0%95%D0%9A%D0%A0%D0%95%D0%A2%D0%9D%D0%AB%D0%99%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3A%22verylongusername123%22%7D',
                initDataUnsafe: {
                    user: { id: 123456789, first_name: "СВЕРХСЕКРЕТНЫЙ", username: "admin_test" }
                },
                expand: () => {},
                showPopup: (options, callback) => {
                    const result = confirm(`${options.title || 'Внимание'}\n${options.message}`);
                    if (callback) callback(result ? 'sell' : 'keep');
                },
                openLink: (url) => window.open(url, '_blank'),
                BackButton: { 
                    show: () => {}, 
                    hide: () => {}, 
                    onClick: (cb) => { window.onBackBtn = cb; } 
                }
            }
        };
    } else {
        tg.expand();
    }

    const API_BASE_URL = window.location.origin;
    let currentUser = {}; 

    // --- ПРИЗЫ С ТВОИМИ ИЗОБРАЖЕНИЯМИ СТРОГО СОВПАДАЮЩИЕ С РЕАЛЬНОСТЬЮ (По убыванию цены) ---
    const GIFT_POOL = [
        { id: 1, name: "Статуя птицы серая", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/a4ddba996b304ed48118547363bf124191da7bb40deb532d.jpg", price: "20 TON", rawPrice: 20.0, isGold: true, type: "gift", weight: 1 },
        { id: 2, name: "Тыква", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/c5e6656920a94373951204199f5834b44e30c33a961865c2.jpg", price: "8 TON", rawPrice: 8.0, isGold: true, type: "gift", weight: 3 },
        { id: 3, name: "Шляпа", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/668ac26d91c343b7972d8d74243b8a21ca21ba758b8f1471.jpg", price: "7 TON", rawPrice: 7.0, isGold: true, type: "gift", weight: 5 },
        { id: 4, name: "Собачка Snoop Dogg", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/afdc136081d946a48e604a37f3ab43e27bac6e6419778bd1.jpg", price: "4 TON", rawPrice: 4.0, isGold: false, type: "gift", weight: 10 },
        { id: 5, name: "Рюкзак черный", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/b595febe2739482d9aa250edb5fce5893e24113d46164d46.jpg", price: "3 TON", rawPrice: 3.0, isGold: false, type: "gift", weight: 15 },
        { id: 6, name: "Доширак лапша", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/954503c70e7e4d70b330820aa63c3a2664b43859d4fc5932.jpg", price: "2.7 TON", rawPrice: 2.7, isGold: false, type: "gift", weight: 25 },
        { id: 7, name: "Факел", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/7da852289f424f4d8dbb74918372a50122e06951b2946cd3.jpg", price: "2.5 TON", rawPrice: 2.5, isGold: false, type: "gift", weight: 30 },
        { id: 8, name: "Мороженое пломбир", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/e8f404864d1b4fbfb591f0d577333bb7104e6b42b7b7aeff.jpg", price: "2.5 TON", rawPrice: 2.5, isGold: false, type: "gift", weight: 30 },
        { id: 9, name: "Алмазик", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/c6a7b6471f8c4118aaf9bdc540ae6a00a21971af7fcb4cb6.jpg", price: "0.9 TON", rawPrice: 0.9, isGold: false, type: "gift", weight: 70 },
        { id: 10, name: "Роза", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/b90f1ee2e18f4f45b092c6f1f5ec65f5b3283fdc18f3c876.jpg", price: "0.27 TON", rawPrice: 0.27, isGold: false, type: "gift", weight: 120 },
        // Пополнения баланса (от большего к меньшему)
        { id: 11, name: "Пополнение 0.1 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.1 TON", rawPrice: 0.1, isGold: false, type: "balance", weight: 200 },
        { id: 12, name: "Пополнение 0.07 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.07 TON", rawPrice: 0.07, isGold: false, type: "balance", weight: 300 },
        { id: 13, name: "Пополнение 0.05 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.05 TON", rawPrice: 0.05, isGold: false, type: "balance", weight: 400 },
        { id: 14, name: "Пополнение 0.03 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.03 TON", rawPrice: 0.03, isGold: false, type: "balance", weight: 500 }
    ];

    const elements = {
        homeSection: document.getElementById('home-section'),
        userAvatar: document.getElementById('user-avatar'),
        userUsername: document.getElementById('user-username'),
        userBalance: document.getElementById('user-balance'),
        dailyCaseBanner: document.getElementById('daily-case-banner'),
        homeCaseStatus: document.getElementById('home-case-status'),

        caseSection: document.getElementById('case-section'),
        caseUserAvatar: document.getElementById('case-user-avatar'),
        caseUserBalance: document.getElementById('case-user-balance'),
        backToHomeButton: document.getElementById('back-to-home-button'),
        spinCaseButton: document.getElementById('spin-case-button'),
        timerContainer: document.getElementById('timer-container'),
        dailyCaseTimer: document.getElementById('daily-case-timer'),
        rouletteTrack: document.getElementById('roulette-track'),
        rewardsGrid: document.getElementById('rewards-grid')
    };

    function navigateTo(sectionId) {
        if (sectionId === 'home') {
            elements.caseSection.classList.add('hidden');
            elements.homeSection.classList.remove('hidden');
            if (tg.BackButton) tg.BackButton.hide();
        } else if (sectionId === 'case') {
            elements.homeSection.classList.add('hidden');
            elements.caseSection.classList.remove('hidden');
            if (tg.BackButton) {
                tg.BackButton.show();
                tg.BackButton.onClick(() => navigateTo('home'));
            }
            initRouletteTrack(); 
        }
    }

    elements.dailyCaseBanner.addEventListener('click', () => navigateTo('case'));
    elements.backToHomeButton.addEventListener('click', () => navigateTo('home'));

    function showAlert(message, isError = false) {
        if (tg && tg.showPopup) {
            tg.showPopup({
                title: isError ? 'Ошибка' : 'Успех',
                message: message,
                buttons: [{ id: 'ok', type: 'ok', text: 'Ок' }]
            });
        } else {
            alert(message);
        }
    }

    // --- Отрисовка наград в два столбика ---
    function renderRewardsGrid() {
        elements.rewardsGrid.innerHTML = '';
        GIFT_POOL.forEach(gift => {
            const card = document.createElement('div');
            card.className = `reward-card ${gift.isGold ? 'gold-tier' : ''}`;
            
            // Показываем плашку random только у ПОДАРКОВ (type: "gift"). У пополнений убираем!
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

    // --- Инициализация ленты рулетки ---
    function initRouletteTrack() {
        elements.rouletteTrack.style.transition = 'none';
        elements.rouletteTrack.style.transform = 'translateX(0px)';
        
        // Принудительный сброс DOM-анимации, чтобы повторные прокрутки не багались у админа!
        void elements.rouletteTrack.offsetWidth; 

        elements.rouletteTrack.innerHTML = '';

        for (let i = 0; i < 50; i++) {
            const randomItem = GIFT_POOL[Math.floor(Math.random() * GIFT_POOL.length)];
            const itemEl = document.createElement('div');
            itemEl.className = 'roulette-item';
            itemEl.innerHTML = `
                <img src="${randomItem.icon}" alt="${randomItem.name}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                <span class="item-value-mini">${randomItem.price}</span>
            `;
            elements.rouletteTrack.appendChild(itemEl);
        }
    }

    // --- Математически выверенная анимация прокрутки ---
    function spinRoulette(winningItem, onComplete) {
        const itemWidth = 84; 
        const gap = 8; 
        const itemFullWidth = itemWidth + gap; 
        const targetIndex = 35; // Предмет, который остановится под прицелом

        const trackItems = elements.rouletteTrack.children;
        if (trackItems[targetIndex]) {
            // ФИОЛЕТОВЫЙ ВЫДЕЛЯЮЩИЙ КЛАСС (highlight) УБРАН ДЛЯ ДОСТИЖЕНИЯ ЭФФЕКТА РЕАЛЬНОГО РАНДОМА
            trackItems[targetIndex].className = 'roulette-item';
            trackItems[targetIndex].innerHTML = `
                <img src="${winningItem.icon}" alt="${winningItem.name}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                <span class="item-value-mini">${winningItem.price}</span>
            `;
        }

        // Вычисляем точную дистанцию сдвига, чтобы winningItem остановился РОВНО по центру прицела (без сдвигов)
        const containerWidth = elements.rouletteTrack.parentElement.offsetWidth;
        const centerOffset = (containerWidth / 2) - (itemWidth / 2);
        const totalTranslate = (targetIndex * itemFullWidth) - centerOffset;

        elements.rouletteTrack.style.transition = 'transform 5s cubic-bezier(0.15, 0.85, 0.15, 1)';
        elements.rouletteTrack.style.transform = `translateX(-${totalTranslate}px)`;

        setTimeout(() => {
            onComplete();
        }, 5100);
    }

    // --- Проверка на Админа на фронте ---
    function checkIsAdmin() {
        if (!currentUser) return false;
        return currentUser.is_admin === true;
    }

    // --- Загрузка данных профиля пользователя ---
    async function fetchUserData() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/user`, {
                headers: { 'X-Telegram-Init-Data': tg.initData }
            });
            if (!response.ok) throw new Error('Failed to fetch user data');
            const user = await response.json();
            currentUser = user; 

            let usernameToDisplay = 'Без имени';
            if (user.username) {
                usernameToDisplay = user.username.length > 12 ? 
                    user.username.slice(0, 12) + '...' : 
                    `@${user.username}`;
            } else if (user.first_name) {
                usernameToDisplay = user.first_name.length > 12 ? 
                    user.first_name.slice(0, 12) + '...' : 
                    user.first_name;
            }

            elements.userUsername.innerText = usernameToDisplay;
            elements.userAvatar.src = user.avatar_url || 'https://via.placeholder.com/40';
            elements.userBalance.innerText = `${parseFloat(user.balance).toFixed(3)} TON`;

            elements.caseUserAvatar.src = user.avatar_url || 'https://via.placeholder.com/40';
            elements.caseUserBalance.innerText = `${parseFloat(user.balance).toFixed(3)} TON`;

            updateDailyCaseTimer();

        } catch (error) {
            console.error('Error loading user data:', error);
            currentUser = {
                first_name: "СВЕРХСЕКРЕТНЫЙ", 
                username: "admin_test", 
                balance: 0.000,
                is_admin: true,
                last_daily_case_open: null
            };
            elements.userUsername.innerText = "@admin_test";
            elements.userBalance.innerText = "0.000 TON";
            elements.caseUserBalance.innerText = "0.000 TON";
            updateDailyCaseTimer();
        }
    }

    // --- Таймер кейса ---
    let dailyCaseTimerInterval;
    function updateDailyCaseTimer() {
        clearInterval(dailyCaseTimerInterval); 

        // ЕСЛИ ТЫ АДМИН — ТАЙМЕРА ДЛЯ ТЕБЯ НЕТ, КРУТИ БЕСКОНЕЧНО!
        if (checkIsAdmin()) {
            elements.homeCaseStatus.innerText = 'Доступно без ограничений (Админ)!';
            elements.homeCaseStatus.style.color = 'var(--green-success)';
            elements.spinCaseButton.classList.remove('hidden');
            elements.spinCaseButton.disabled = false;
            elements.timerContainer.classList.add('hidden');
            return;
        }

        if (!currentUser.last_daily_case_open) {
            elements.homeCaseStatus.innerText = 'Доступно!';
            elements.homeCaseStatus.style.color = 'var(--green-success)';
            elements.spinCaseButton.classList.remove('hidden');
            elements.spinCaseButton.disabled = false;
            elements.timerContainer.classList.add('hidden');
            return;
        }

        const lastOpen = new Date(currentUser.last_daily_case_open);
        const now = new Date();
        const cooldown = 24 * 60 * 60 * 1000; 
        const nextOpenTime = new Date(lastOpen.getTime() + cooldown);
        const timeLeftMs = nextOpenTime.getTime() - now.getTime();

        if (timeLeftMs <= 0) {
            elements.homeCaseStatus.innerText = 'Доступно!';
            elements.homeCaseStatus.style.color = 'var(--green-success)';
            elements.spinCaseButton.classList.remove('hidden');
            elements.spinCaseButton.disabled = false;
            elements.timerContainer.classList.add('hidden');
        } else {
            elements.spinCaseButton.classList.add('hidden');
            elements.spinCaseButton.disabled = true;
            elements.timerContainer.classList.remove('hidden');

            const hours = Math.floor(timeLeftMs / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeLeftMs % (1000 * 60)) / 1000);
            
            const timerString = `${hours}h ${minutes}m ${seconds}s`;
            elements.dailyCaseTimer.innerText = timerString;
            elements.homeCaseStatus.innerText = `Доступно через: ${timerString}`;
            elements.homeCaseStatus.style.color = 'var(--red-alert)';

            dailyCaseTimerInterval = setInterval(updateDailyCaseTimer, 1000); 
        }
    }

    // --- Обработка выигрыша (ПРОДАТЬ ИЛИ ОСТАВИТЬ) ---
    function processWinning(winningGift, isMock = false, apiNewBalance = null) {
        if (winningGift.type === "balance" || winningGift.name.toLowerCase().includes("пополнение")) {
            showAlert(`🎉 Баланс пополнен на +${winningGift.price}!`, false);
            fetchUserData();
            finishSpinCycle(isMock);
        } else {
            tg.showPopup({
                title: '🎁 Поздравляем!',
                message: `Вы выиграли: "${winningGift.name}"!\n\nВы хотите продать подарок за ${winningGift.price} или оставить его себе?`,
                buttons: [
                    { id: 'sell', type: 'default', text: `Продать за ${winningGift.price}` },
                    { id: 'keep', type: 'ok', text: 'Оставить себе' }
                ]
            }, async (buttonId) => {
                if (buttonId === 'sell') {
                    const sellAmount = winningGift.rawPrice;
                    try {
                        const sellRes = await fetch(`${API_BASE_URL}/api/sell_gift`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Telegram-Init-Data': tg.initData
                            },
                            body: JSON.stringify({ itemId: winningGift.id, price: sellAmount })
                        });
                        if (sellRes.ok) {
                            const sellData = await sellRes.json();
                            currentUser.balance = sellData.newBalance;
                        } else {
                            currentUser.balance = (parseFloat(currentUser.balance) + sellAmount).toFixed(3);
                        }
                        showAlert(`💰 Успешно продано! Баланс пополнен на +${winningGift.price}.`, false);
                        fetchUserData();
                    } catch (e) {
                        currentUser.balance = (parseFloat(currentUser.balance) + sellAmount).toFixed(3);
                        showAlert(`💰 Успешно продано! Баланс пополнен на +${winningGift.price}.`, false);
                        fetchUserData();
                    }
                } else {
                    showAlert(`📦 Подарок "${winningGift.name}" бережно отложен в твою коллекцию!`, false);
                }
                finishSpinCycle(isMock);
            });
        }
    }

    function finishSpinCycle(isMock) {
        if (!isMock) {
            currentUser.last_daily_case_open = new Date().toISOString();
        }
        updateDailyCaseTimer();
        elements.spinCaseButton.disabled = false;
    }

    // --- Нажатие Запустить ---
    elements.spinCaseButton.addEventListener('click', async () => {
        elements.spinCaseButton.disabled = true;

        // Полная пересборка ленты для повторной прокрутки без зависаний
        initRouletteTrack();

        // Задержка 50мс перед запуском анимации, чтобы браузер гарантированно применил сброс на 0px
        setTimeout(async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/open_daily_case`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Telegram-Init-Data': tg.initData
                    }
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
                    if (data.error && data.error.includes('подписчиком канала')) {
                        try {
                            const infoRes = await fetch(`${API_BASE_URL}/api/daily_case_info`, {
                                headers: { 'X-Telegram-Init-Data': tg.initData }
                            });
                            const infoData = await infoRes.json();
                            const channelUrl = `https://t.me/${infoData.channel_username}`;

                            tg.showPopup({
                                title: 'Нужна подписка',
                                message: 'Пожалуйста, подпишитесь на наш телеграм-канал, чтобы открыть ежедневный кейс!',
                                buttons: [{ id: 'subscribe', type: 'default', text: 'Подписаться' }]
                            }, (buttonId) => {
                                if (buttonId === 'subscribe') {
                                    tg.openLink(channelUrl);
                                }
                            });
                        } catch (err) {
                            showAlert(data.error, true);
                        }
                    } else {
                        showAlert(data.error || 'Ошибка при открытии кейса.', true);
                    }
                    elements.spinCaseButton.disabled = false;
                }
            } catch (error) {
                console.error('Error opening daily case:', error);
                elements.spinCaseButton.disabled = false;
            }
        }, 50);
    });

    renderRewardsGrid();
    await fetchUserData(); 
    navigateTo('home'); 
});

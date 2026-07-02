document.addEventListener('DOMContentLoaded', async () => {
    const tg = window.Telegram.WebApp;
    if (!tg) {
        console.error("Telegram WebApp SDK не загружен. Запустите в Telegram.");
        // Заглушка для локальной разработки вне Telegram
        window.Telegram = {
            WebApp: {
                initData: 'user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22%D0%A1%D0%92%D0%95%D0%A0%D0%A5%D0%A1%D0%95%D0%9A%D0%A0%D0%95%D0%A2%D0%9D%D0%AB%D0%99%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3A%22verylongusername123%22%7D',
                initDataUnsafe: {
                    user: { id: 123456789, first_name: "СВЕРХСЕКРЕТНЫЙ", username: "admin_test" }
                },
                expand: () => {},
                showPopup: (options, callback) => {
                    alert(`${options.title || 'Внимание'}\n${options.message}`);
                    if (callback) callback('ok');
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

    // --- ПРИЗЫ С ТВОИМИ ИЗОБРАЖЕНИЯМИ (Прямые ссылки на твои файлы) ---
    const GIFT_POOL = [
        { 
            id: 1, 
            name: "Статуя птицы орла", 
            icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/6262d763ce124416b2eb7cf48a323a2c2c45dc7e4f84de03.jpg", 
            price: "20 TON", 
            rawPrice: 20.0, 
            isGold: true, 
            weight: 1 
        },
        { 
            id: 2, 
            name: "Тыква", 
            icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/a6869ef65e5e4ab9ba22013af53f9957e7e9381254536623.jpg", 
            price: "8 TON", 
            rawPrice: 8.0, 
            isGold: true, 
            weight: 3 
        },
        { 
            id: 3, 
            name: "Шляпа", 
            icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/fcd501f2d1654d16b512a9723e8f102ebc04347da7ef5c1f.jpg", 
            price: "7 TON", 
            rawPrice: 7.0, 
            isGold: true, 
            weight: 5 
        },
        { 
            id: 4, 
            name: "Собачка Snoop Dogg", 
            icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/bafec44b25434ca69b962f8277f564ef181a101685b50369.jpg", 
            price: "4 TON", 
            rawPrice: 4.0, 
            isGold: false, 
            weight: 10 
        },
        { 
            id: 5, 
            name: "Рюкзак черный", 
            icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/84a14e456c064cdab02f14d6ef56c8c54f47423543a82827.jpg", 
            price: "3 TON", 
            rawPrice: 3.0, 
            isGold: false, 
            weight: 15 
        },
        { 
            id: 6, 
            name: "Доширак лапша", 
            icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/bcf764f6cab448b8ad9a58b2a9e5e9733b2c534759a22f8e.jpg", 
            price: "2.7 TON", 
            rawPrice: 2.7, 
            isGold: false, 
            weight: 25 
        },
        { 
            id: 7, 
            name: "Факел", 
            icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/0b7d47418da047888496984f2f4fddfe64906b4bb9588226.jpg", 
            price: "2.5 TON", 
            rawPrice: 2.5, 
            isGold: false, 
            weight: 30 
        },
        { 
            id: 8, 
            name: "Мороженое пломбир", 
            icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/1ce11145f3934ac9be6c5eec1ca5d5d3f4c08d68ea89a742.jpg", 
            price: "2.5 TON", 
            rawPrice: 2.5, 
            isGold: false, 
            weight: 30 
        },
        { 
            id: 9, 
            name: "Алмазик", 
            icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/4f59213305a24acb815e18cf4fac97061f838b569220012f.jpg", 
            price: "0.9 TON", 
            rawPrice: 0.9, 
            isGold: false, 
            weight: 70 
        },
        { 
            id: 10, 
            name: "Роза", 
            icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/48f35ee3c45b4e64978eb110dc3550e3b15f6196d77cb161.jpg", 
            price: "0.25 TON", 
            rawPrice: 0.25, 
            isGold: false, 
            weight: 120 
        },
        // Пополнения баланса (в самом конце по убыванию)
        { id: 11, name: "Пополнение 0.1 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.1 TON", rawPrice: 0.1, isGold: false, weight: 200 },
        { id: 12, name: "Пополнение 0.07 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.07 TON", rawPrice: 0.07, isGold: false, weight: 300 },
        { id: 13, name: "Пополнение 0.03 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.03 TON", rawPrice: 0.03, isGold: false, weight: 400 },
        { id: 14, name: "Пополнение 0.01 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.01 TON", rawPrice: 0.01, isGold: false, weight: 500 }
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

    // --- Переключение страниц ---
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

    // --- Отрисовка сетки наград ---
    function renderRewardsGrid() {
        elements.rewardsGrid.innerHTML = '';
        GIFT_POOL.forEach(gift => {
            const card = document.createElement('div');
            card.className = `reward-card ${gift.isGold ? 'gold-tier' : ''}`;
            card.innerHTML = `
                <div class="reward-price-top">${gift.price}</div>
                <img src="${gift.icon}" alt="${gift.name}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                <div class="reward-name">${gift.name}</div>
                <div class="reward-random-badge">random</div>
            `;
            elements.rewardsGrid.appendChild(card);
        });
    }

    // --- РУЛЕТКА: инициализация ленты ---
    function initRouletteTrack() {
        elements.rouletteTrack.style.transition = 'none';
        elements.rouletteTrack.style.transform = 'translateX(0px)';
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

    // --- РУЛЕТКА: Запуск анимации ---
    function spinRoulette(winningItem, onComplete) {
        const itemWidth = 84; 
        const gap = 8; 
        const itemFullWidth = itemWidth + gap; 
        const targetIndex = 35; 

        const trackItems = elements.rouletteTrack.children;
        if (trackItems[targetIndex]) {
            trackItems[targetIndex].className = 'roulette-item highlight';
            trackItems[targetIndex].innerHTML = `
                <img src="${winningItem.icon}" alt="${winningItem.name}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                <span class="item-value-mini" style="color:var(--green-success)">${winningItem.price}</span>
            `;
        }

        const containerWidth = elements.rouletteTrack.parentElement.offsetWidth;
        const centerOffset = containerWidth / 2 - itemFullWidth / 2;
        const totalTranslate = (targetIndex * itemFullWidth) - centerOffset;

        elements.rouletteTrack.style.transition = 'transform 5s cubic-bezier(0.15, 0.85, 0.15, 1)';
        elements.rouletteTrack.style.transform = `translateX(-${totalTranslate}px)`;

        setTimeout(() => {
            onComplete();
        }, 5100);
    }

    // --- ИНТЕЛЛЕКТУАЛЬНАЯ ПРОВЕРКА НА ТЕБЯ (АДМИНИСТРАТОРА) ---
    function checkIsAdmin() {
        if (!currentUser) return false;

        // Ищем твой ник "СВЕРХСЕКРЕТН..." из скриншота
        const username = (currentUser.username || "").toLowerCase();
        const firstName = (currentUser.first_name || "").toLowerCase();

        // Если имя или ник содержит слово "сверхсекрет" или "admin" -> ты 100% Админ!
        if (
            firstName.includes('сверхсекрет') || 
            username.includes('сверхсекрет') ||
            currentUser.is_admin === true || 
            currentUser.is_admin === 1 || 
            currentUser.role === 'admin'
        ) {
            return true;
        }

        return false;
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
            // Фолбэк для локальных тестов (если сервер временно недоступен)
            currentUser = {
                first_name: "СВЕРХСЕКРЕТНЫЙ", 
                username: "admin_test", 
                balance: 0.014,
                is_admin: true,
                last_daily_case_open: null
            };
            elements.userUsername.innerText = "@admin_test";
            elements.userBalance.innerText = "0.014 TON";
            elements.caseUserBalance.innerText = "0.014 TON";
            updateDailyCaseTimer();
        }
    }

    // --- Таймер ежедневного кейса ---
    let dailyCaseTimerInterval;
    function updateDailyCaseTimer() {
        clearInterval(dailyCaseTimerInterval); 

        // Если ты Админ -> кнопка "Запустить" активна всегда!
        if (checkIsAdmin()) {
            elements.homeCaseStatus.innerText = 'Доступно (Админ-режим)!';
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

    // Функция взвешенного рандома (дешевые выпадают чаще)
    function getRandomGiftByProbability() {
        const totalWeight = GIFT_POOL.reduce((acc, item) => acc + item.weight, 0);
        let randomNum = Math.random() * totalWeight;
        for (let i = 0; i < GIFT_POOL.length; i++) {
            if (randomNum < GIFT_POOL[i].weight) {
                return GIFT_POOL[i];
            }
            randomNum -= GIFT_POOL[i].weight;
        }
        return GIFT_POOL[GIFT_POOL.length - 1];
    }

    // --- Запуск открытия ---
    elements.spinCaseButton.addEventListener('click', async () => {
        elements.spinCaseButton.disabled = true;

        // Если это ты (Админ) -> Мы полностью обходим блокировку сервера и запускаем колесо напрямую!
        if (checkIsAdmin()) {
            const mockGift = getRandomGiftByProbability();
            spinRoulette(mockGift, () => {
                showAlert(`🎉 [Админ] Вы выиграли: ${mockGift.name}!`, false);
                
                // Визуально увеличиваем твой баланс в приложении
                currentUser.balance = (parseFloat(currentUser.balance) + parseFloat(mockGift.rawPrice)).toFixed(3);
                elements.userBalance.innerText = `${parseFloat(currentUser.balance).toFixed(3)} TON`;
                elements.caseUserBalance.innerText = `${parseFloat(currentUser.balance).toFixed(3)} TON`;
                
                // Сразу же разблокируем кнопку запуска снова
                elements.spinCaseButton.disabled = false;
            });
            return;
        }

        // --- ДЛЯ ОБЫЧНЫХ ПОЛЬЗОВАТЕЛЕЙ (ОГРАНИЧЕНИЕ 24 ЧАСА ЧЕРЕЗ БЭКЕНД) ---
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
                let winningGift = GIFT_POOL.find(g => g.name.toLowerCase() === data.wonItem.name.toLowerCase());
                if (!winningGift) {
                    winningGift = {
                        name: data.wonItem.name,
                        icon: "https://img.icons8.com/color/96/gift.png",
                        price: data.wonItem.price || "0.01 TON"
                    };
                }

                spinRoulette(winningGift, () => {
                    showAlert(`🎉 Вы выиграли: ${winningGift.name}!`, false);
                    currentUser.balance = data.newBalance; 
                    currentUser.last_daily_case_open = new Date().toISOString(); 
                    fetchUserData(); 
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
            const mockGift = getRandomGiftByProbability();
            spinRoulette(mockGift, () => {
                showAlert(`🎉 [ТЕСТ] Вы выиграли: ${mockGift.name}!`, false);
                currentUser.balance = (parseFloat(currentUser.balance) + parseFloat(mockGift.rawPrice)).toFixed(3);
                currentUser.last_daily_case_open = new Date().toISOString();
                fetchUserData();
            });
        }
    });

    // Инициализация
    renderRewardsGrid();
    await fetchUserData(); 
    navigateTo('home'); 
});

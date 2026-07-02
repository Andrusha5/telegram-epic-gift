document.addEventListener('DOMContentLoaded', async () => {
    const tg = window.Telegram.WebApp;
    if (!tg) {
        console.error("Telegram WebApp SDK не загружен. Запустите в Telegram.");
        // Заглушка для локальной разработки вне Telegram
        window.Telegram = {
            WebApp: {
                initData: 'user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22Dev%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3A%22verylongusername123%22%7D',
                initDataUnsafe: {
                    user: { id: 123456789, username: "admin_test" }
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

    // ==========================================
    // НАСТРОЙКА АДМИНИСТРАТОРА (Впиши сюда свой Telegram ID)
    // ==========================================
    const ADMIN_TELEGRAM_ID = 123456789; // <-- ЗАМЕНИ это число на свой настоящий Telegram ID!

    // --- ПРЕМИАЛЬНЫЙ СПИСОК ПРИЗОВ BestGifts ---
    // Вес (weight) определяет частоту выпадения в тестовом/офлайн режиме.
    // Чем меньше вес, тем реже выпадает (самые дорогие — самые редкие).
    const GIFT_POOL = [
        { id: 1, name: "Статуя птицы орла", icon: "https://img.icons8.com/color/96/eagle.png", price: "20 TON", rawPrice: 20.0, isGold: true, weight: 2 },
        { id: 2, name: "Тыква", icon: "https://img.icons8.com/color/96/pumpkin.png", price: "8 TON", rawPrice: 8.0, isGold: true, weight: 5 },
        { id: 3, name: "Шляпа", icon: "https://img.icons8.com/color/96/top-hat.png", price: "7 TON", rawPrice: 7.0, isGold: true, weight: 8 },
        { id: 4, name: "Собачка Snoop Dogg", icon: "https://img.icons8.com/color/96/dog.png", price: "4 TON", rawPrice: 4.0, isGold: false, weight: 15 },
        { id: 5, name: "Рюкзак черный", icon: "https://img.icons8.com/color/96/backpack.png", price: "3 TON", rawPrice: 3.0, isGold: false, weight: 25 },
        { id: 6, name: "Доширак лапша", icon: "https://img.icons8.com/color/96/ramen.png", price: "2.7 TON", rawPrice: 2.7, isGold: false, weight: 35 },
        { id: 7, name: "Факел", icon: "https://img.icons8.com/color/96/torch.png", price: "2.5 TON", rawPrice: 2.5, isGold: false, weight: 40 },
        { id: 8, name: "Мороженое пломбир", icon: "https://img.icons8.com/color/96/ice-cream-cone.png", price: "2.5 TON", rawPrice: 2.5, isGold: false, weight: 40 },
        { id: 9, name: "Алмазик", icon: "https://img.icons8.com/color/96/diamond.png", price: "0.9 TON", rawPrice: 0.9, isGold: false, weight: 80 },
        { id: 10, name: "Роза", icon: "https://img.icons8.com/color/96/rose.png", price: "0.25 TON", rawPrice: 0.25, isGold: false, weight: 150 },
        // Пополнения баланса
        { id: 11, name: "Пополнение", icon: "https://img.icons8.com/color/96/coins.png", price: "0.1 TON", rawPrice: 0.1, isGold: false, weight: 250 },
        { id: 12, name: "Пополнение", icon: "https://img.icons8.com/color/96/coins.png", price: "0.07 TON", rawPrice: 0.07, isGold: false, weight: 350 },
        { id: 13, name: "Пополнение", icon: "https://img.icons8.com/color/96/coins.png", price: "0.03 TON", rawPrice: 0.03, isGold: false, weight: 450 },
        { id: 14, name: "Пополнение", icon: "https://img.icons8.com/color/96/coins.png", price: "0.01 TON", rawPrice: 0.01, isGold: false, weight: 600 }
    ];

    const elements = {
        // Главная
        homeSection: document.getElementById('home-section'),
        userAvatar: document.getElementById('user-avatar'),
        userUsername: document.getElementById('user-username'),
        userBalance: document.getElementById('user-balance'),
        dailyCaseBanner: document.getElementById('daily-case-banner'),
        homeCaseStatus: document.getElementById('home-case-status'),

        // Страница кейса
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
            initRouletteTrack(); // Заполняем ленту при открытии
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

    // --- Отрисовка сетки наград (2 колонки, цена сверху, случайный выбор снизу) ---
    function renderRewardsGrid() {
        elements.rewardsGrid.innerHTML = '';
        GIFT_POOL.forEach(gift => {
            const card = document.createElement('div');
            card.className = `reward-card ${gift.isGold ? 'gold-tier' : ''}`;
            card.innerHTML = `
                <div class="reward-price-top">${gift.price}</div>
                <img src="${gift.icon}" alt="${gift.name}">
                <div class="reward-name">${gift.name}</div>
                <div class="reward-random-badge">random</div>
            `;
            elements.rewardsGrid.appendChild(card);
        });
    }

    // --- РУЛЕТКА: инициализация ленты предпросмотра ---
    function initRouletteTrack() {
        elements.rouletteTrack.style.transition = 'none';
        elements.rouletteTrack.style.transform = 'translateX(0px)';
        elements.rouletteTrack.innerHTML = '';

        // Генерируем случайную ленту из 50 элементов для плавного заноса
        for (let i = 0; i < 50; i++) {
            const randomItem = GIFT_POOL[Math.floor(Math.random() * GIFT_POOL.length)];
            const itemEl = document.createElement('div');
            itemEl.className = 'roulette-item';
            itemEl.innerHTML = `
                <img src="${randomItem.icon}" alt="${randomItem.name}">
                <span class="item-value-mini">${randomItem.price}</span>
            `;
            elements.rouletteTrack.appendChild(itemEl);
        }
    }

    // --- РУЛЕТКА: Запуск анимации прокрутки ---
    function spinRoulette(winningItem, onComplete) {
        const itemWidth = 84; 
        const gap = 8; 
        const itemFullWidth = itemWidth + gap; 
        const targetIndex = 35; // Элемент, на котором произойдет остановка

        // Подменяем элемент на нужный приз
        const trackItems = elements.rouletteTrack.children;
        if (trackItems[targetIndex]) {
            trackItems[targetIndex].className = 'roulette-item highlight';
            trackItems[targetIndex].innerHTML = `
                <img src="${winningItem.icon}" alt="${winningItem.name}">
                <span class="item-value-mini" style="color:var(--green-success)">${winningItem.price}</span>
            `;
        }

        // Центрируем элемент на экране
        const containerWidth = elements.rouletteTrack.parentElement.offsetWidth;
        const centerOffset = containerWidth / 2 - itemFullWidth / 2;
        const totalTranslate = (targetIndex * itemFullWidth) - centerOffset;

        elements.rouletteTrack.style.transition = 'transform 5s cubic-bezier(0.15, 0.85, 0.15, 1)';
        elements.rouletteTrack.style.transform = `translateX(-${totalTranslate}px)`;

        setTimeout(() => {
            onComplete();
        }, 5100);
    }

    // --- СТРОГАЯ ПРОВЕРКА НА ПРАВА АДМИНИСТРАТОРА ---
    function checkIsAdmin() {
        if (!currentUser) return false;

        // 1. Проверяем Telegram ID из SDK WebApp напрямую
        const tgUserId = tg.initDataUnsafe?.user?.id;
        if (tgUserId && tgUserId === ADMIN_TELEGRAM_ID) {
            return true;
        }

        // 2. Проверяем ID пользователя из нашей базы данных
        if (currentUser.telegram_id && currentUser.telegram_id === ADMIN_TELEGRAM_ID) {
            return true;
        }
        if (currentUser.id && currentUser.id === ADMIN_TELEGRAM_ID) {
            return true;
        }

        // 3. Проверяем флаг роли, возвращенный бэкендом
        if (currentUser.is_admin === true || currentUser.is_admin === 1 || currentUser.role === 'admin') {
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
            // Фолбэк для тестов (здесь ID совпадает с константой для проверки локально)
            currentUser = {
                id: 123456789,
                telegram_id: 123456789,
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

        // Если пользователь Админ -> разрешаем открывать бесконечно и мгновенно!
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

    // Функция взвешенного рандома по цене (для офлайн тестирования)
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
                    
                    // Если админ — НЕ записываем дату открытия, чтобы кнопка всегда была активна
                    if (!checkIsAdmin()) {
                        currentUser.last_daily_case_open = new Date().toISOString(); 
                    }
                    fetchUserData(); 
                });

            } else {
                // Ошибка подписки на канал
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
            
            // --- ЭМУЛЯЦИЯ (ОФЛАЙН РЕЖИМ ДЛЯ ТЕСТА) ---
            const mockGift = getRandomGiftByProbability();
            spinRoulette(mockGift, () => {
                showAlert(`🎉 [ТЕСТ] Вы выиграли: ${mockGift.name}!`, false);
                currentUser.balance = (parseFloat(currentUser.balance) + parseFloat(mockGift.rawPrice)).toFixed(3);
                
                // Если админ — не устанавливаем дату последнего открытия
                if (!checkIsAdmin()) {
                    currentUser.last_daily_case_open = new Date().toISOString();
                }
                fetchUserData();
            });
        }
    });

    // Инициализация
    renderRewardsGrid();
    await fetchUserData(); 
    navigateTo('home'); 
});

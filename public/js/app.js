document.addEventListener('DOMContentLoaded', async () => {
    const tg = window.Telegram.WebApp;
    if (!tg) {
        console.error("Telegram WebApp SDK не загружен. Запустите в Telegram.");
        // Заглушка для локальной разработки вне Telegram
        window.Telegram = {
            WebApp: {
                initData: 'user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22Dev%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3A%22verylongusername123%22%7D',
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

    // --- 15 ПОДАРКОВ ДЛЯ РУЛЕТКИ ---
    const GIFT_POOL = [
        { id: 1, name: "Кольцо с брилл.", icon: "https://img.icons8.com/color/96/diamond-ring.png", price: "83.98", isGold: true },
        { id: 2, name: "Золотое кольцо", icon: "https://img.icons8.com/color/96/wedding-ring.png", price: "35.58", isGold: true },
        { id: 3, name: "Snoop Dogg", icon: "https://img.icons8.com/color/96/dog.png", price: "4.63", isGold: false },
        { id: 4, name: "Мороженое", icon: "https://img.icons8.com/color/96/ice-cream-cone.png", price: "1.20", isGold: false },
        { id: 5, name: "Свеча", icon: "https://img.icons8.com/color/96/candle.png", price: "0.50", isGold: false },
        { id: 6, name: "Алмаз", icon: "https://img.icons8.com/color/96/diamond.png", price: "150.00", isGold: true },
        { id: 7, name: "Корона", icon: "https://img.icons8.com/color/96/crown.png", price: "250.00", isGold: true },
        { id: 8, name: "Золотой слиток", icon: "https://img.icons8.com/color/96/gold-bars.png", price: "100.00", isGold: true },
        { id: 9, name: "Часы Rolex", icon: "https://img.icons8.com/color/96/watch.png", price: "75.00", isGold: true },
        { id: 10, name: "Очки", icon: "https://img.icons8.com/color/96/sunglasses.png", price: "2.50", isGold: false },
        { id: 11, name: "Наушники", icon: "https://img.icons8.com/color/96/headphones.png", price: "5.00", isGold: false },
        { id: 12, name: "Геймпад", icon: "https://img.icons8.com/color/96/game-controller.png", price: "8.00", isGold: false },
        { id: 13, name: "Кепка", icon: "https://img.icons8.com/color/96/baseball-cap.png", price: "1.50", isGold: false },
        { id: 14, name: "Мешок TON", icon: "https://img.icons8.com/color/96/money-bag.png", price: "20.00", isGold: true },
        { id: 15, name: "Золотой ключ", icon: "https://img.icons8.com/color/96/key.png", price: "10.00", isGold: false }
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

    // --- Отрисовка сетки наград (15 подарков под кейсом) ---
    function renderRewardsGrid() {
        elements.rewardsGrid.innerHTML = '';
        GIFT_POOL.forEach(gift => {
            const card = document.createElement('div');
            card.className = `reward-card ${gift.isGold ? 'gold-tier' : ''}`;
            card.innerHTML = `
                <div class="reward-badge-price">${gift.price} <span style="font-size: 0.55rem;">💎</span></div>
                <img src="${gift.icon}" alt="${gift.name}">
                <div class="reward-name">${gift.name}</div>
            `;
            elements.rewardsGrid.appendChild(card);
        });
    }

    // --- РУЛЕТКА: инициализация ленты предпросмотра ---
    function initRouletteTrack() {
        elements.rouletteTrack.style.transition = 'none';
        elements.rouletteTrack.style.transform = 'translateX(0px)';
        elements.rouletteTrack.innerHTML = '';

        // Создаем случайную ленту из 50 элементов для эффекта бесконечности
        for (let i = 0; i < 50; i++) {
            const randomItem = GIFT_POOL[Math.floor(Math.random() * GIFT_POOL.length)];
            const itemEl = document.createElement('div');
            itemEl.className = 'roulette-item';
            itemEl.innerHTML = `
                <img src="${randomItem.icon}" alt="${randomItem.name}">
                <span class="item-value-mini">${randomItem.price} TON</span>
            `;
            elements.rouletteTrack.appendChild(itemEl);
        }
    }

    // --- РУЛЕТКА: Запуск анимации прокрутки ---
    function spinRoulette(winningItem, onComplete) {
        const itemWidth = 84; // Ширина элемента в CSS
        const gap = 8; // Отступы между элементами
        const itemFullWidth = itemWidth + gap; // Полный шаг
        const targetIndex = 35; // На каком по счету элементе остановимся (ближе к концу ленты)

        // Заменяем элемент на позиции targetIndex на наш выигранный приз
        const trackItems = elements.rouletteTrack.children;
        if (trackItems[targetIndex]) {
            trackItems[targetIndex].className = 'roulette-item highlight';
            trackItems[targetIndex].innerHTML = `
                <img src="${winningItem.icon}" alt="${winningItem.name}">
                <span class="item-value-mini" style="color:var(--green-success)">${winningItem.price} TON</span>
            `;
        }

        // Вычисляем смещение, чтобы выигранный элемент встал ровно по центру экрана
        const containerWidth = elements.rouletteTrack.parentElement.offsetWidth;
        const centerOffset = containerWidth / 2 - itemFullWidth / 2;
        const totalTranslate = (targetIndex * itemFullWidth) - centerOffset;

        // Плавное вращение через CSS transitions
        elements.rouletteTrack.style.transition = 'transform 5s cubic-bezier(0.15, 0.85, 0.15, 1)';
        elements.rouletteTrack.style.transform = `translateX(-${totalTranslate}px)`;

        // По окончанию вращения вызываем функцию коллбэка
        setTimeout(() => {
            onComplete();
        }, 5100);
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

            // Сокращение имени
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

            // На главной
            elements.userUsername.innerText = usernameToDisplay;
            elements.userAvatar.src = user.avatar_url || 'https://via.placeholder.com/40';
            elements.userBalance.innerText = `${parseFloat(user.balance).toFixed(3)} TON`;

            // На вкладке кейса
            elements.caseUserAvatar.src = user.avatar_url || 'https://via.placeholder.com/40';
            elements.caseUserBalance.innerText = `${parseFloat(user.balance).toFixed(3)} TON`;

            updateDailyCaseTimer();

        } catch (error) {
            console.error('Error loading user data:', error);
            // Если бэкенд выключен, генерируем тестовые данные для проверки локально
            currentUser = {
                balance: 0.014,
                last_daily_case_open: null
            };
            elements.userUsername.innerText = "@test_user";
            elements.userBalance.innerText = "0.014 TON";
            elements.caseUserBalance.innerText = "0.014 TON";
            updateDailyCaseTimer();
        }
    }

    // --- Таймер ежедневного кейса ---
    let dailyCaseTimerInterval;
    function updateDailyCaseTimer() {
        clearInterval(dailyCaseTimerInterval); 

        if (!currentUser.last_daily_case_open) {
            // КЕЙС ДОСТУПЕН
            elements.homeCaseStatus.innerText = 'Доступно!';
            elements.homeCaseStatus.style.color = 'var(--green-success)';
            elements.spinCaseButton.classList.remove('hidden');
            elements.spinCaseButton.disabled = false;
            elements.timerContainer.classList.add('hidden');
            return;
        }

        const lastOpen = new Date(currentUser.last_daily_case_open);
        const now = new Date();
        const cooldown = 24 * 60 * 60 * 1000; // 24 часа
        const nextOpenTime = new Date(lastOpen.getTime() + cooldown);
        const timeLeftMs = nextOpenTime.getTime() - now.getTime();

        if (timeLeftMs <= 0) {
            elements.homeCaseStatus.innerText = 'Доступно!';
            elements.homeCaseStatus.style.color = 'var(--green-success)';
            elements.spinCaseButton.classList.remove('hidden');
            elements.spinCaseButton.disabled = false;
            elements.timerContainer.classList.add('hidden');
        } else {
            // КЕЙС ОЖИДАЕТ КУЛДАУН
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

    // --- Запуск (Клик по кнопке "Запустить") ---
    elements.spinCaseButton.addEventListener('click', async () => {
        elements.spinCaseButton.disabled = true;

        try {
            // Мгновенный запрос на бэкенд для проверки подписки и получения выигрыша
            const response = await fetch(`${API_BASE_URL}/api/open_daily_case`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': tg.initData
                }
            });

            const data = await response.json();

            if (response.ok) {
                // Если подписка есть и запрос успешен — крутим рулетку!
                
                // Ищем выигранный элемент в пуле подарков по имени или ставим дефолтный, если нет совпадения
                let winningGift = GIFT_POOL.find(g => g.name.toLowerCase() === data.wonItem.name.toLowerCase());
                if (!winningGift) {
                    winningGift = {
                        name: data.wonItem.name,
                        icon: "https://img.icons8.com/color/96/gift.png",
                        price: data.wonItem.price || "1.00"
                    };
                }

                spinRoulette(winningGift, () => {
                    // Анимация завершилась
                    showAlert(`🎉 Вы выиграли: ${winningGift.name}!`, false);
                    currentUser.balance = data.newBalance; 
                    currentUser.last_daily_case_open = new Date().toISOString(); 
                    fetchUserData(); 
                });

            } else {
                // Если пользователь не подписан на канал — просим подписаться
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
            
            // --- РЕЖИМ ТЕСТИРОВАНИЯ (если сервер не запущен) ---
            // Если бэкенда нет, сэмулируем выигрыш для теста:
            const mockGift = GIFT_POOL[Math.floor(Math.random() * GIFT_POOL.length)];
            spinRoulette(mockGift, () => {
                showAlert(`🎉 [ТЕСТ] Вы выиграли: ${mockGift.name}!`, false);
                currentUser.balance = (parseFloat(currentUser.balance) + parseFloat(mockGift.price)).toFixed(3);
                currentUser.last_daily_case_open = new Date().toISOString();
                fetchUserData();
            });
        }
    });

    // Инициализация интерфейса
    renderRewardsGrid();
    await fetchUserData(); 
    navigateTo('home'); 
});

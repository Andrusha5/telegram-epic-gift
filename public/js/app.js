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
                BackButton: { hide: () => {} }
            }
        };
    } else {
        tg.expand();
    }

    const API_BASE_URL = window.location.origin;
    let currentUser = {}; 

    const elements = {
        userAvatar: document.getElementById('user-avatar'),
        userUsername: document.getElementById('user-username'),
        userBalance: document.getElementById('user-balance'),
        mainContent: document.getElementById('main-content'),
        navButtons: document.querySelectorAll('.nav-button'),
        sections: document.querySelectorAll('section[id$="-section"]'),
        homeSection: document.getElementById('home-section'),
        dailyCaseCard: document.getElementById('daily-case-card'),
        openDailyCaseButton: document.getElementById('open-daily-case-button'),
        dailyCaseTimer: document.getElementById('daily-case-timer')
    };

    // --- Общие функции UI ---
    function showSection(sectionId) {
        elements.sections.forEach(section => {
            section.classList.add('hidden');
        });
        const sectionEl = document.getElementById(`${sectionId}-section`);
        if (sectionEl) {
            sectionEl.classList.remove('hidden');
        }

        elements.navButtons.forEach(btn => {
            if (btn.dataset.target === sectionId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        tg.BackButton.hide(); 
    }

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

    // --- Загрузка и отображение профиля пользователя ---
    async function fetchUserData() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/user`, {
                headers: {
                    'X-Telegram-Init-Data': tg.initData
                }
            });
            if (!response.ok) throw new Error('Failed to fetch user data');
            const user = await response.json();
            currentUser = user; 

            // Логика сокращения юзернейма до 12 символов
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

            // Запускаем таймер кейса
            updateDailyCaseTimer();

        } catch (error) {
            console.error('Error loading user data:', error);


showAlert('Не удалось загрузить данные пользователя.', true);
        }
    }

    // --- Таймер ежедневного кейса ---
    let dailyCaseTimerInterval;
    function updateDailyCaseTimer() {
        clearInterval(dailyCaseTimerInterval); 

        if (!currentUser.last_daily_case_open) return;

        const lastOpen = new Date(currentUser.last_daily_case_open);
        const now = new Date();
        const cooldown = 24 * 60 * 60 * 1000; // Ровно 24 часа
        const nextOpenTime = new Date(lastOpen.getTime() + cooldown);
        const timeLeftMs = nextOpenTime.getTime() - now.getTime();

        if (timeLeftMs <= 0) {
            elements.dailyCaseTimer.innerText = 'Доступно!';
            elements.dailyCaseTimer.style.color = 'var(--green-success)';
            elements.openDailyCaseButton.disabled = false;
        } else {
            elements.openDailyCaseButton.disabled = true;
            const hours = Math.floor(timeLeftMs / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeLeftMs % (1000 * 60)) / 1000);
            elements.dailyCaseTimer.innerText = `Доступно через: ${hours}ч ${minutes}м ${seconds}с`;
            elements.dailyCaseTimer.style.color = 'var(--red-alert)';

            dailyCaseTimerInterval = setInterval(updateDailyCaseTimer, 1000); 
        }
    }

    // --- Открытие кейса ---
    elements.openDailyCaseButton.addEventListener('click', async () => {
        elements.openDailyCaseButton.disabled = true; 
        elements.dailyCaseCard.classList.remove('clickable');

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
                showAlert(`Вы выиграли: ${data.wonItem.name}!`, false);
                currentUser.balance = data.newBalance; 
                currentUser.last_daily_case_open = new Date().toISOString(); 
                fetchUserData(); 
            } else {
                // Если нет подписки, показываем всплывающее окно с кнопкой перехода в канал
                if (data.error && data.error.includes('подписчиком канала')) {
                    try {
                        const infoRes = await fetch(`${API_BASE_URL}/api/daily_case_info`, {
                            headers: { 'X-Telegram-Init-Data': tg.initData }
                        });
                        const infoData = await infoRes.json();
                        const channelUrl = `https://t.me/${infoData.channel_username}`;

                        tg.showPopup({
                            title: 'Нужна подписка',
                            message: data.error,
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
            }
        } catch (error) {
            console.error('Error opening daily case:', error);
            showAlert('Произошла ошибка при открытии кейса. Попробуйте еще раз.', true);
        } finally {
            elements.openDailyCaseButton.disabled = false; 
            elements.dailyCaseCard.classList.add('clickable');
        }
    });

    // --- Переключение меню (на будущее) ---
    elements.navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const target = button.dataset.target;
            showSection(target);
        });
    });

    // Запуск приложения
    await fetchUserData(); 
    showSection('home'); 
});
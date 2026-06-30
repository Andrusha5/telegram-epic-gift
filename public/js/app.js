document.addEventListener('DOMContentLoaded', async () => {
    const tg = window.Telegram.WebApp;
    if (!tg) {
        console.error("Telegram WebApp SDK не загружен. Запустите в Telegram.");
        // Заглушка для локальной разработки вне Telegram
        document.getElementById('user-username').innerText = 'DevUser';
        document.getElementById('user-avatar').src = 'https://via.placeholder.com/40';
        document.getElementById('user-balance').innerText = '100.000 TON';
        window.Telegram = {
            WebApp: {
                initData: 'user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22Dev%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3A%22devuser%22%2C%22language_code%22%3A%22ru%22%2C%22is_premium%22%3Atrue%7D',
                initDataUnsafe: {
                    user: { id: 123456789, username: 'devuser', first_name: 'Dev', photo_url: 'https://via.placeholder.com/40' },
                    query_id: '123'
                },
                expand: () => console.log('WebApp expanded'),
                showPopup: (options) => alert(`${options.title || ''}\n${options.message}`),
                BackButton: {
                    show: () => console.log('BackButton show'),
                    hide: () => console.log('BackButton hide'),
                    onClick: (cb) => {
                        window.history.back = cb; // Упрощенно
                        console.log('BackButton click handler set');
                    }
                }
            }
        };
    } else {
        tg.expand();
    }

    const API_BASE_URL = window.location.origin;
    let currentUser = {}; // Хранит данные текущего пользователя

    const elements = {
        userAvatar: document.getElementById('user-avatar'),
        userUsername: document.getElementById('user-username'),
        userBalance: document.getElementById('user-balance'),
        mainContent: document.getElementById('main-content'),
        navButtons: document.querySelectorAll('.nav-button'),
        sections: document.querySelectorAll('section[id$="-section"]'),
        homeSection: document.getElementById('home-section'),
        adminSection: document.getElementById('admin-section'),
        dailyCaseCard: document.getElementById('daily-case-card'),
        openDailyCaseButton: document.getElementById('open-daily-case-button'),
        dailyCaseTimer: document.getElementById('daily-case-timer'),
        adminPanelButtonContainer: document.getElementById('admin-panel-button-container'),
        openAdminPanelButton: document.getElementById('open-admin-panel-button'),

        // Admin Panel elements
        adminTabButtons: document.querySelectorAll('.admin-tab-button'),
        adminTabContents: document.querySelectorAll('.admin-tab-content'),
        itemsManagementTab: document.getElementById('items-management-tab'),
        dailyCaseConfigTab: document.getElementById('daily-case-config-tab'),

        itemIdInput: document.getElementById('item-id'),
        itemNameInput: document.getElementById('item-name'),
        itemDescriptionInput: document.getElementById('item-description'),
        itemImageUrlInput: document.getElementById('item-image-url'),
        itemTypeSelect: document.getElementById('item-type'),
        itemValueInput: document.getElementById('item-value'),
        saveItemButton: document.getElementById('save-item-button'),
        clearItemFormButton: document.getElementById('clear-item-form-button'),
        itemsListContainer: document.getElementById('items-list-container'),

        dailyCaseDropsConfigList: document.getElementById('daily-case-drops-config-list'),
        totalChanceSpan: document.getElementById('total-chance'),
        saveDailyCaseDropsButton: document.getElementById('save-daily-case-drops-button')
    };

    // --- Общие функции UI ---
    function showSection(sectionId) {
        elements.sections.forEach(section => {
            section.classList.add('hidden');
        });
        document.getElementById(`${sectionId}-section`).classList.remove('hidden');

        elements.navButtons.forEach(btn => {
            if (btn.dataset.target === sectionId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Кнопка "назад" только для админки
        if (sectionId === 'admin') {
            tg.BackButton.show();
            tg.BackButton.onClick(() => showSection('home'));
        } else {
            tg.BackButton.hide();
        }
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

    // --- Обновление данных пользователя ---
    async function fetchUserData() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/user`, {
                headers: {
                    'X-Telegram-Init-Data': tg.initData // Передаем initData для авторизации
                }
            });
            if (!response.ok) throw new Error('Failed to fetch user data');
            const user = await response.json();
            currentUser = user; // Сохраняем данные текущего пользователя

            elements.userUsername.innerText = user.username ?
                (user.username.length > 12 ? user.username.slice(0, 12) + '...' : `@${user.username}`) :
                user.first_name || 'Без имени';
            elements.userAvatar.src = user.avatar_url || 'https://via.placeholder.com/40';
            elements.userBalance.innerText = `${parseFloat(user.balance).toFixed(3)} TON`;

            // Показываем кнопку админки, если пользователь админ
            if (user.is_admin) {
                elements.adminPanelButtonContainer.classList.remove('hidden');
            } else {
                elements.adminPanelButtonContainer.classList.add('hidden');
            }

            // Обновляем таймер кейса
            updateDailyCaseTimer();

        } catch (error) {
            console.error('Error loading user data:', error);
            showAlert('Не удалось загрузить данные пользователя.', true);
        }
    }

    // --- Логика ежедневного кейса ---
    let dailyCaseTimerInterval;
    function updateDailyCaseTimer() {
        clearInterval(dailyCaseTimerInterval); // Очищаем старый таймер

        const lastOpen = new Date(currentUser.last_daily_case_open);
        const now = new Date();
        const cooldown = 24 * 60 * 60 * 1000; // 24 часа
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

            dailyCaseTimerInterval = setInterval(updateDailyCaseTimer, 1000); // Обновляем каждую секунду
        }
    }

    elements.openDailyCaseButton.addEventListener('click', async () => {
        elements.openDailyCaseButton.disabled = true; // Отключаем кнопку на время запроса
        elements.dailyCaseCard.classList.remove('clickable');

        try {
            const response = await fetch(`${API_BASE_URL}/api/open_daily_case`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': tg.initData
                },
                body: JSON.stringify({ userId: currentUser.id })
            });

            const data = await response.json();

            if (response.ok) {
                showAlert(`Вы выиграли: ${data.wonItem.name}!`, false);
                currentUser.balance = data.newBalance; // Обновляем баланс в локальной переменной
                currentUser.last_daily_case_open = new Date().toISOString(); // Обновляем время открытия
                fetchUserData(); // Обновить UI и таймер
            } else {
                // Проверка на ошибку подписки на канал
                if (data.error && data.error.includes('подписчиком канала')) {
                    const channelUsername = (await (await fetch(`${API_BASE_URL}/api/daily_case_info`, {
                        headers: { 'X-Telegram-Init-Data': tg.initData }
                    })).json()).channel_username;
                    const channelUrl = `https://t.me/${channelUsername}`;
                    tg.showPopup({
                        title: 'Требуется подписка',
                        message: data.error + `\n\n[Перейти на канал](${channelUrl})`,
                        buttons: [{ id: 'subscribe', type: 'default', text: 'Подписаться' }]
                    }, (buttonId) => {
                        if (buttonId === 'subscribe') {
                            tg.openLink(channelUrl);
                        }
                    });
                } else {
                    showAlert(data.error || 'Ошибка при открытии кейса.', true);
                }
            }
        } catch (error) {
            console.error('Error opening daily case:', error);
            showAlert('Произошла ошибка при открытии кейса. Попробуйте еще раз.', true);
        } finally {
            elements.openDailyCaseButton.disabled = false; // Включаем кнопку обратно
            elements.dailyCaseCard.classList.add('clickable');
        }
    });

    // --- Админ-панель: Управление предметами ---
    async function fetchItems() {
        try {
            const response = await fetch(`${API_BASE_URL}/admin/items`, {
                headers: { 'X-Telegram-Init-Data': tg.initData }
            });
            if (!response.ok) throw new Error('Failed to fetch items');
            const items = await response.json();

            elements.itemsListContainer.innerHTML = '';
            items.forEach(item => {
                const itemEntry = document.createElement('div');
                itemEntry.classList.add('item-entry');
                itemEntry.innerHTML = `
                    <div class="item-entry-info">
                        <span class="name">${item.name}</span>
                        <span>Тип: ${item.type}</span>
                        <span>Значение: ${parseFloat(item.value).toFixed(3)}</span>
                        <span>ID: ${item.id}</span>
                    </div>
                    <div class="item-entry-actions">
                        <button class="edit-item-button" data-item='${JSON.stringify(item)}'>
                            <img src="https://img.icons8.com/ios-filled/24/ffffff/edit.png" alt="Edit">
                        </button>
                    </div>
                `;
                elements.itemsListContainer.appendChild(itemEntry);
            });
        } catch (error) {
            console.error('Admin: Error fetching items:', error);
            showAlert('Админ: Не удалось загрузить список предметов.', true);
        }
    }

    function clearItemForm() {
        elements.itemIdInput.value = '';
        elements.itemNameInput.value = '';
        elements.itemDescriptionInput.value = '';
        elements.itemImageUrlInput.value = '';
        elements.itemTypeSelect.value = '';
        elements.itemValueInput.value = '';
    }

    elements.saveItemButton.addEventListener('click', async () => {
        const item = {
            id: elements.itemIdInput.value || undefined,
            name: elements.itemNameInput.value,
            description: elements.itemDescriptionInput.value,
            image_url: elements.itemImageUrlInput.value,
            type: elements.itemTypeSelect.value,
            value: parseFloat(elements.itemValueInput.value) || 0
        };

        if (!item.name || !item.type) {
            return showAlert('Название и тип предмета обязательны.', true);
        }

        try {
            const response = await fetch(`${API_BASE_URL}/admin/item`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': tg.initData
                },
                body: JSON.stringify(item)
            });
            const data = await response.json();
            if (response.ok) {
                showAlert('Предмет сохранен!', false);
                clearItemForm();
                fetchItems(); // Обновить список предметов
                fetchDailyCaseDropsConfig(); // Обновить настройки кейса
            } else {
                showAlert(data.error || 'Ошибка при сохранении предмета.', true);
            }
        } catch (error) {
            console.error('Admin: Error saving item:', error);
            showAlert('Админ: Произошла ошибка при сохранении предмета.', true);
        }
    });

    elements.clearItemFormButton.addEventListener('click', clearItemForm);

    elements.itemsListContainer.addEventListener('click', (event) => {
        const editButton = event.target.closest('.edit-item-button');
        if (editButton) {
            const item = JSON.parse(editButton.dataset.item);
            elements.itemIdInput.value = item.id;
            elements.itemNameInput.value = item.name;
            elements.itemDescriptionInput.value = item.description;
            elements.itemImageUrlInput.value = item.image_url;
            elements.itemTypeSelect.value = item.type;
            elements.itemValueInput.value = item.value;
        }
    });

    // --- Админ-панель: Настройка ежедневного кейса ---
    let allItems = []; // Список всех предметов для выбора в кейсе

    async function fetchDailyCaseDropsConfig() {
        try {
            const itemsResponse = await fetch(`${API_BASE_URL}/admin/items`, {
                headers: { 'X-Telegram-Init-Data': tg.initData }
            });
            allItems = await itemsResponse.json();

            const dropsConfigResponse = await fetch(`${API_BASE_URL}/admin/daily_case_drops_config`, {
                headers: { 'X-Telegram-Init-Data': tg.initData }
            });
            const currentDrops = await dropsConfigResponse.json();

            elements.dailyCaseDropsConfigList.innerHTML = '';
            let totalChance = 0;

            allItems.forEach(item => {
                const drop = currentDrops.find(d => d.item_id === item.id);
                const chance = drop ? drop.chance : 0;
                totalChance += parseFloat(chance);

                const dropEntry = document.createElement('div');
                dropEntry.classList.add('case-drop-entry');
                dropEntry.innerHTML = `
                    <div class="case-drop-entry-info">
                        <span class="name">${item.name} (ID: ${item.id})</span>
                        <span>Тип: ${item.type}, Значение: ${parseFloat(item.value).toFixed(3)}</span>
                    </div>
                    <div class="case-drop-entry-actions">
                        <input type="number" class="drop-chance-input" data-item-id="${item.id}" value="${parseFloat(chance).toFixed(2)}" step="0.01" min="0" max="100">
                        <span>%</span>
                    </div>
                `;
                elements.dailyCaseDropsConfigList.appendChild(dropEntry);
            });
            elements.totalChanceSpan.innerText = `${totalChance.toFixed(2)}%`;
            elements.totalChanceSpan.style.color = Math.abs(totalChance - 100) < 0.01 ? 'var(--green-success)' : 'var(--red-alert)';

            // Обновление общего шанса при изменении полей
            elements.dailyCaseDropsConfigList.querySelectorAll('.drop-chance-input').forEach(input => {
                input.addEventListener('input', updateOverallChanceDisplay);
            });

        } catch (error) {
            console.error('Admin: Error fetching daily case drops config:', error);
            showAlert('Админ: Не удалось загрузить настройки дропов кейса.', true);
        }
    }

    function updateOverallChanceDisplay() {
        let currentTotalChance = 0;
        elements.dailyCaseDropsConfigList.querySelectorAll('.drop-chance-input').forEach(input => {
            currentTotalChance += parseFloat(input.value) || 0;
        });
        elements.totalChanceSpan.innerText = `${currentTotalChance.toFixed(2)}%`;
        elements.totalChanceSpan.style.color = Math.abs(currentTotalChance - 100) < 0.01 ? 'var(--green-success)' : 'var(--red-alert)';
    }

    elements.saveDailyCaseDropsButton.addEventListener('click', async () => {
        const drops = [];
        let currentTotalChance = 0;
        elements.dailyCaseDropsConfigList.querySelectorAll('.drop-chance-input').forEach(input => {
            const itemId = parseInt(input.dataset.itemId);
            const chance = parseFloat(input.value);
            if (!isNaN(chance) && chance > 0) {
                drops.push({ item_id: itemId, chance: chance });
                currentTotalChance += chance;
            }
        });

        if (Math.abs(currentTotalChance - 100) > 0.01) {
            return showAlert(`Сумма шансов должна быть 100%. Текущая сумма: ${currentTotalChance.toFixed(2)}%.`, true);
        }

        try {
            const response = await fetch(`${API_BASE_URL}/admin/set_daily_case_drops`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': tg.initData
                },
                body: JSON.stringify({ drops: drops })
            });
            const data = await response.json();
            if (response.ok) {
                showAlert('Настройки кейса сохранены!', false);
                fetchDailyCaseDropsConfig();
            } else {
                showAlert(data.error || 'Ошибка при сохранении настроек кейса.', true);
            }
        } catch (error) {
            console.error('Admin: Error saving daily case drops:', error);
            showAlert('Админ: Произошла ошибка при сохранении настроек кейса.', true);
        }
    });

    // --- Обработчики навигации ---
    elements.navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const target = button.dataset.target;
            showSection(target);
            // Если вы добавите инвентарь или рейтинг, логику загрузки данных сюда
        });
    });

    elements.openAdminPanelButton.addEventListener('click', () => {
        showSection('admin');
        // Показываем первую вкладку админки по умолчанию
        elements.adminTabButtons.forEach(btn => btn.classList.remove('active'));
        elements.adminTabContents.forEach(content => content.classList.add('hidden'));
        elements.adminTabButtons[0].classList.add('active');
        elements.adminTabContents[0].classList.remove('hidden');

        fetchItems(); // Загружаем предметы для управления
    });

    elements.adminTabButtons.forEach(button => {
        button.addEventListener('click', () => {
            elements.adminTabButtons.forEach(btn => btn.classList.remove('active'));
            elements.adminTabContents.forEach(content => content.classList.add('hidden'));
            button.classList.add('active');
            document.getElementById(`${button.dataset.target}-tab`).classList.remove('hidden');

            if (button.dataset.target === 'items-management') {
                fetchItems();
            } else if (button.dataset.target === 'daily-case-config') {
                fetchDailyCaseDropsConfig();
            }
        });
    });

    // Инициализация приложения
    await fetchUserData(); // Загружаем данные пользователя и обновляем UI
    showSection('home'); // Показываем главную страницу по умолчанию
});
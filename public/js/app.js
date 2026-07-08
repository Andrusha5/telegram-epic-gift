const tg = window.Telegram.WebApp;
tg.expand();

// Хранилище состояния приложения
const state = {
    user: null,
    rewards: [],
    inventory: [],
    activeTab: 'home',
    isSpinning: false
};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    loadAllData();
    
    document.getElementById('spin-case-button').addEventListener('click', startSpin);
    document.getElementById('back-to-home-button').addEventListener('click', () => switchTab('home'));
    document.getElementById('deposit-confirm-button').addEventListener('click', confirmDeposit);
});

// Заголовки авторизации Telegram Web App
function getHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (tg.initData) {
        headers['x-telegram-init-data'] = tg.initData;
    }
    return headers;
}

// Загрузка всей информации
async function loadAllData() {
    showLoader(true);
    await fetchUser();
    await fetchRewards();
    await fetchInventory();
    showLoader(false);
}

// Загрузка пользователя
async function fetchUser() {
    try {
        const res = await fetch('/api/user/me', { headers: getHeaders() });
        const user = await res.json();
        if (user && !user.error) {
            state.user = user;
            updateUserUI();
        } else {
            showToast('⚠️ Ошибка авторизации. Запустите через Telegram.', 'red');
        }
    } catch (e) {
        console.error(e);
        showToast('📡 Ошибка сети с сервером', 'red');
    }
}

// Получение наград кейса
async function fetchRewards() {
    try {
        const res = await fetch('/api/case/rewards');
        state.rewards = await res.json();
        renderRewardsGrid();
        renderDepositSelect();
    } catch (e) {
        console.error(e);
    }
}

// Получение инвентаря
async function fetchInventory() {
    try {
        const res = await fetch('/api/inventory', { headers: getHeaders() });
        state.inventory = await res.json();
        renderInventoryGrid();
    } catch (e) {
        console.error(e);
    }
}

// Отображение данных пользователя на экранах
function updateUserUI() {
    const balance = parseFloat(state.user.balance).toFixed(3);
    const username = state.user.username || 'Пользователь';
    const avatar = state.user.avatar_url || 'https://img.icons8.com/color/96/user.png';

    // Главная
    document.getElementById('user-username').innerText = username;
    document.getElementById('user-balance').innerText = balance;
    document.getElementById('user-avatar').src = avatar;

    // Экран кейса
    document.getElementById('case-user-balance').innerText = balance;
    document.getElementById('case-user-avatar').src = avatar;

    // Инвентарь
    document.getElementById('inv-user-username').innerText = username;
    document.getElementById('inv-user-balance').innerText = balance;
    document.getElementById('inv-user-avatar').src = avatar;

    // Таймер кейса
    updateTimer();
}

// Таймер обратного отсчета
let timerInterval = null;
function updateTimer() {
    if (timerInterval) clearInterval(timerInterval);

    const lastOpen = new Date(state.user.last_daily_case_open);
    const cooldown = 24 * 60 * 60 * 1000;
    const now = new Date();
    const diff = now - lastOpen;

    const spinBtn = document.getElementById('spin-case-button');
    const timerContainer = document.getElementById('timer-container');
    const statusText = document.getElementById('home-case-status');

    if (diff < cooldown) {
        spinBtn.disabled = true;
        spinBtn.classList.add('hidden');
        timerContainer.classList.remove('hidden');
        statusText.innerText = 'Недоступен';

        const runTimer = () => {
            const timePassed = new Date() - lastOpen;
            const timeLeft = cooldown - timePassed;

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                spinBtn.disabled = false;
                spinBtn.classList.remove('hidden');
                timerContainer.classList.add('hidden');
                statusText.innerText = 'Доступен бесплатно!';
                return;
            }

            const h = Math.floor(timeLeft / (1000 * 60 * 60));
            const m = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((timeLeft % (1000 * 60)) / 1000);

            document.getElementById('daily-case-timer').innerText = 
                `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
        };

        runTimer();
        timerInterval = setInterval(runTimer, 1000);
    } else {
        spinBtn.disabled = false;
        spinBtn.classList.remove('hidden');
        timerContainer.classList.add('hidden');
        statusText.innerText = 'Доступен бесплатно!';
    }
}

// Сетка наград
function renderRewardsGrid() {
    const grid = document.getElementById('rewards-grid');
    grid.innerHTML = '';
    state.rewards.forEach(item => {
        const isGold = parseFloat(item.chance) < 1.0;
        const card = document.createElement('div');
        card.className = `reward-card ${isGold ? 'gold-tier' : ''}`;
        card.innerHTML = `
            <div class="reward-price-top">${item.value} GRAM</div>
            <img src="${item.image_url}" alt="${item.name}">
            <div class="reward-name">${item.name}</div>
            <div class="reward-random-badge">${item.chance}%</div>
        `;
        grid.appendChild(card);
    });
}

// Заполнение селекта ввода NFT
function renderDepositSelect() {
    const select = document.getElementById('deposit-item-select');
    select.innerHTML = '';
    state.rewards.filter(i => i.type === 'gift').forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.innerText = item.name;
        select.appendChild(option);
    });
}

// Сетка инвентаря
function renderInventoryGrid() {
    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';

    if (state.inventory.length === 0) {
        grid.innerHTML = `<div class="empty-inventory">🎒 У вас пока нет подарков.<br>Откройте бесплатный Ежедневный кейс!</div>`;
        return;
    }

    state.inventory.forEach(item => {
        const card = document.createElement('div');
        card.className = 'reward-card';
        card.innerHTML = `
            <div class="reward-price-top">${item.value} GRAM</div>
            <img src="${item.image_url}" alt="${item.name}">
            <div class="reward-name">${item.name} (x${item.quantity})</div>
            <div class="inv-actions">
                <button class="inv-btn sell-btn" onclick="sellItem(${item.id})">Продать</button>
                <button class="inv-btn withdraw-btn" onclick="withdrawItem(${item.id})">Вывести</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Подтверждение депозита подарка
async function confirmDeposit() {
    const select = document.getElementById('deposit-item-select');
    const itemId = select.value;
    if (!itemId) return;

    try {
        const res = await fetch('/api/deposit/confirm', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ itemId })
        });
        const data = await res.json();
        if (data.success) {
            showModal('📤 Заявка принята!', 'Заявка на депозит успешно отправлена администратору. После ручной проверки подарок появится у вас в инвентаре.', '🎁');
        } else {
            showToast(data.error || 'Ошибка при отправке', 'red');
        }
    } catch (e) {
        showToast('Ошибка сети', 'red');
    }
}

// Продажа предмета
window.sellItem = async function(itemId) {
    try {
        const res = await fetch('/api/inventory/sell', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ itemId })
        });
        const data = await res.json();
        if (data.success) {
            showToast('💰 Предмет успешно продан!', 'green');
            await loadAllData();
        } else {
            showToast(data.error || 'Ошибка при продаже', 'red');
        }
    } catch (e) {
        showToast('Ошибка сети', 'red');
    }
};

window.withdrawItem = function(itemId) {
    showModal('📤 Вывод подарка NFT', 'Для вывода вашего подарка в Telegram обратитесь к нашему менеджеру @Sintopa, указав ID вашей транзакции и ID вашего Telegram.', '✈️');
};

// Вращение рулетки
async function startSpin() {
    if (state.isSpinning) return;
    state.isSpinning = true;

    const spinBtn = document.getElementById('spin-case-button');
    spinBtn.disabled = true;

    try {
        const res = await fetch('/api/case/spin', {
            method: 'POST',
            headers: getHeaders()
        });
        const data = await res.json();

        if (data.error) {
            showToast(data.error, 'red');
            state.isSpinning = false;
            spinBtn.disabled = false;
            return;
        }

        const wonItem = data.wonItem;
        
        // Генерация ленты рулетки
        const track = document.getElementById('roulette-track');
        track.style.transition = 'none';
        track.style.transform = 'translateX(0)';
        track.innerHTML = '';

        const itemWidth = 92; // 84px ширина + 8px gap
        const totalItems = 60; // Количество элементов в ленте
        const targetIndex = 48; // Элемент на котором остановится рулетка

        let trackHTML = '';
        for (let i = 0; i < totalItems; i++) {
            let item;
            if (i === targetIndex) {
                item = wonItem;
            } else {
                item = state.rewards[Math.floor(Math.random() * state.rewards.length)];
            }
            trackHTML += `
                <div class="roulette-item">
                    <img src="${item.image_url}" alt="">
                    <span>${item.value} GRAM</span>
                </div>
            `;
        }
        track.innerHTML = trackHTML;

        // Расчет смещения для центрирования
        const containerWidth = document.querySelector('.roulette-container').offsetWidth;
        const targetOffset = (targetIndex * itemWidth) - (containerWidth / 2) + (itemWidth / 2);

        // Запуск плавной анимации прокрутки
        setTimeout(() => {
            track.style.transition = 'transform 5s cubic-bezier(0.1, 0.8, 0.1, 1)';
            track.style.transform = `translateX(-${targetOffset}px)`;
        }, 50);

        // Показ поздравления по окончании
        setTimeout(async () => {
            state.isSpinning = false;
            showModal(
                '🎉 Поздравляем!',
                `Вы выиграли приз: <b>${wonItem.name}</b> (ценность: ${wonItem.value} GRAM)`,
                '🎁'
            );
            await loadAllData();
        }, 5100);

    } catch (e) {
        console.error(e);
        showToast('Ошибка при открытии кейса', 'red');
        state.isSpinning = false;
        spinBtn.disabled = false;
    }
}

// Навигация
function initNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (state.isSpinning) return;
            const target = tab.getAttribute('data-target');
            switchTab(target);
        });
    });

    // Обработка клика по карточкам кейсов
    document.getElementById('daily-case-banner').addEventListener('click', () => {
        switchTab('case');
    });
    document.getElementById('newbie-case-banner').addEventListener('click', () => {
        showToast('🔒 Этот кейс сейчас недоступен.', 'red');
    });
}

function switchTab(tabName) {
    if (state.isSpinning) return;
    state.activeTab = tabName;

    // Экраны
    document.getElementById('home-section').classList.add('hidden');
    document.getElementById('case-section').classList.add('hidden');
    document.getElementById('inventory-section').classList.add('hidden');

    if (tabName === 'home') {
        document.getElementById('home-section').classList.remove('hidden');
    } else if (tabName === 'case') {
        document.getElementById('case-section').classList.remove('hidden');
    } else if (tabName === 'inventory') {
        document.getElementById('inventory-section').classList.remove('hidden');
    }

    // Активные табы в меню
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(t => t.classList.remove('active'));
    
    const activeTab = document.querySelector(`.nav-tab[data-target="${tabName === 'case' ? 'home' : tabName}"]`);
    if (activeTab) activeTab.classList.add('active');
}

// Всплывающие Уведомления (Toasts)
function showToast(text, color = 'purple') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.style.borderColor = color === 'red' ? 'var(--red-alert)' : (color === 'green' ? 'var(--green-success)' : 'var(--primary-color)');
    
    toast.innerHTML = `
        <span class="custom-toast-icon">${color === 'red' ? '❌' : '🔔'}</span>
        <div class="custom-toast-content">${text}</div>
        <button class="custom-toast-close">&times;</button>
    `;
    
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);

    const close = () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    };

    toast.querySelector('.custom-toast-close').addEventListener('click', close);
    setTimeout(close, 4000);
}

// Модальные окна
function showModal(title, text, icon = '🎁') {
    const modal = document.getElementById('custom-modal');
    document.getElementById('modal-title').innerHTML = title;
    document.getElementById('modal-message').innerHTML = text;
    document.getElementById('modal-icon').innerText = icon;

    const actions = document.getElementById('modal-actions');
    actions.innerHTML = `<button class="modal-btn modal-btn-primary" id="modal-ok-btn">Отлично</button>`;

    modal.classList.remove('hidden');

    const closeModal = () => modal.classList.add('hidden');
    document.getElementById('modal-close-btn').onclick = closeModal;
    document.getElementById('modal-ok-btn').onclick = closeModal;
}

// Показ/скрытие прелоадера загрузки
function showLoader(show) {
    if (show) {
        document.getElementById('user-username').innerText = 'Загрузка...';
        document.getElementById('inv-user-username').innerText = 'Загрузка...';
    }
        }
// ... (остальной код функции без изменений)
function renderRewardsGrid() {
    const grid = document.getElementById('rewards-grid');
    grid.innerHTML = '';
    state.rewards.forEach(item => {
        const card = document.createElement('div');
        card.className = 'reward-card';
        card.innerHTML = `
            <div class="reward-price-top">${item.value} GRAM</div>
            <img src="${item.image_url}" alt="${item.name}">
            <div class="reward-name">${item.name}</div>
            <div class="reward-random-badge">RANDOM</div>
        `;
        grid.appendChild(card);
    });
}
// ...

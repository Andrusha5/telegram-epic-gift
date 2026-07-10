document.addEventListener('DOMContentLoaded', async () => {
    let tg = window.Telegram.WebApp;
    tg.expand();

    const API_BASE_URL = window.location.origin;
    let currentUser = {};
    let isNewbieMode = false;

    const GIFT_POOL = [
        { id: 1, name: "Статуя птицы серая", icon: "/Images/Items/rare_bird.jpg", price: "20 GRAM", rawPrice: 20.0, type: "gift" },
        { id: 2, name: "Тыква", icon: "/Images/Items/pumpkin.jpg", price: "8 GRAM", rawPrice: 8.0, type: "gift" },
        { id: 3, name: "Шляпа", icon: "/Images/Items/hat.jpg", price: "7 GRAM", rawPrice: 7.0, type: "gift" },
        { id: 4, name: "Собачка Snoop Dogg", icon: "/Images/Items/snoopdog.jpg", price: "4 GRAM", rawPrice: 4.0, type: "gift" },
        { id: 5, name: "Рюкзак черный", icon: "/Images/Items/pack.jpg", price: "3 GRAM", rawPrice: 3.0, type: "gift" },
        { id: 6, name: "Доширак лапша", icon: "/Images/Items/ramen.jpg", price: "2.7 GRAM", rawPrice: 2.7, type: "gift" },
        { id: 9, name: "Алмазик", icon: "/Images/Items/almaz.jpg", price: "0.9 GRAM", rawPrice: 0.9, type: "gift" },
        { id: 11, name: "Пополнение 0.1 GRAM", icon: "/Images/Items/gram_popolnenie.png", price: "0.1 GRAM", rawPrice: 0.1, type: "balance" }
    ];

    const elements = {
        sections: ['home-section', 'case-section', 'inventory-section', 'rating-section'],
        navTabs: document.querySelectorAll('.nav-tab'),
        balancePill: document.getElementById('user-balance-pill'),
        spinBtn: document.getElementById('spin-case-button'),
        rouletteTrack: document.getElementById('roulette-track'),
        rewardsGrid: document.getElementById('rewards-grid')
    };

    function showNotification(message, icon = '🎁') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'custom-toast';
        toast.innerHTML = `<div>${icon}</div><div>${message}</div>`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function showCustomModal({ title, message, buttons = [] }) {
        const modal = document.getElementById('custom-modal');
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-message').innerText = message;
        const actions = document.getElementById('modal-actions');
        actions.innerHTML = '';
        buttons.forEach(b => {
            const btn = document.createElement('button');
            btn.className = 'modal-btn modal-btn-primary';
            btn.innerText = b.text;
            btn.onclick = () => { modal.classList.add('hidden'); if(b.onClick) b.onClick(); };
            actions.appendChild(btn);
        });
        modal.classList.remove('hidden');
    }

    document.getElementById('modal-close-btn').onclick = () => document.getElementById('custom-modal').classList.add('hidden');

    // Клик по балансу
    document.getElementById('balance-pill').onclick = () => {
        showCustomModal({
            title: 'Баланс',
            message: `На вашем счету: ${currentUser.balance || '0.000'} GRAM`,
            buttons: [{ text: 'Пополнить', onClick: () => showNotification('Пока недоступно', '⚠️') }]
        });
    };

    function navigateTo(target) {
        elements.sections.forEach(s => document.getElementById(s).classList.add('hidden'));
        document.getElementById(target + '-section').classList.remove('hidden');
        elements.navTabs.forEach(t => t.classList.toggle('active', t.dataset.target === target));
    }

    elements.navTabs.forEach(t => t.onclick = () => navigateTo(t.dataset.target));

    function initRoulette() {
        elements.rouletteTrack.style.transition = 'none';
        elements.rouletteTrack.style.transform = 'translateX(0)';
        elements.rouletteTrack.innerHTML = '';
        for (let i = 0; i < 40; i++) {
            const item = GIFT_POOL[Math.floor(Math.random() * GIFT_POOL.length)];
            const div = document.createElement('div');
            div.className = 'roulette-item';
            div.innerHTML = `<img src="${item.icon}"><span>${item.price}</span>`;
            elements.rouletteTrack.appendChild(div);
        }
    }

    // Открытие Кейса Новичка
    document.getElementById('newbie-case-banner').onclick = () => {
        isNewbieMode = true;
        navigateTo('case');
        document.getElementById('case-page-title').innerText = 'Кейс новичка';
        document.getElementById('rewards-section-container').classList.add('hidden');
        initRoulette();
    };

    // Открытие Ежедневного кейса
    document.getElementById('daily-case-banner').onclick = () => {
        isNewbieMode = false;
        navigateTo('case');
        document.getElementById('case-page-title').innerText = 'Ежедневный кейс';
        document.getElementById('rewards-section-container').classList.remove('hidden');
        renderRewards();
        initRoulette();
    };

    document.getElementById('back-to-home-button').onclick = () => navigateTo('home');

    function renderRewards() {
        elements.rewardsGrid.innerHTML = '';
        GIFT_POOL.forEach(g => {
            const div = document.createElement('div');
            div.className = 'reward-card';
            div.innerHTML = `<img src="${g.icon}"><div>${g.name}</div><div style="color:gold">${g.price}</div>`;
            elements.rewardsGrid.appendChild(div);
        });
    }

    elements.spinBtn.onclick = async () => {
        if (isNewbieMode) {
            showNotification('Кейс сейчас недоступен', '🔒');
            return;
        }
        
        elements.spinBtn.disabled = true;
        try {
            const res = await fetch(`${API_BASE_URL}/api/open_daily_case`, {
                method: 'POST',
                headers: { 'X-Telegram-Init-Data': tg.initData || "" }
            });
            const data = await res.json();
            if (res.ok) {
                const win = GIFT_POOL.find(g => g.id === data.wonItem.id) || data.wonItem;
                spinTo(win, () => {
                    showCustomModal({
                        title: 'Победа!',
                        message: `Вы выиграли: ${win.name}`,
                        buttons: [{ text: 'Ура!' }]
                    });
                    fetchUserData();
                });
            } else {
                showNotification(data.error || 'Ошибка', '⚠️');
                elements.spinBtn.disabled = false;
            }
        } catch (e) {
            elements.spinBtn.disabled = false;
        }
    };

    function spinTo(item, callback) {
        const track = elements.rouletteTrack;
        const targetIdx = 30;
        track.children[targetIdx].innerHTML = `<img src="${item.icon}"><span>${item.price || item.value}</span>`;
        const shift = (targetIdx * 88) - (window.innerWidth / 2 - 40);
        track.style.transition = 'transform 5s cubic-bezier(0.15, 0.85, 0.15, 1)';
        track.style.transform = `translateX(-${shift}px)`;
        setTimeout(callback, 5200);
    }

    async function fetchUserData() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/user`, { headers: { 'X-Telegram-Init-Data': tg.initData || "" }});
            currentUser = await res.json();
            elements.balancePill.innerText = `${parseFloat(currentUser.balance).toFixed(3)} GRAM`;
            document.getElementById('user-username').innerText = currentUser.username || currentUser.first_name;
            document.getElementById('user-avatar').src = currentUser.avatar_url;
        } catch (e) {}
    }

    fetchUserData();
});

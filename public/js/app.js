document.addEventListener('DOMContentLoaded', async () => {
    let tg = window.Telegram.WebApp;
    tg.expand();

    const API_BASE_URL = window.location.origin;
    let currentUser = {};

    // ТВОЙ ПРОВЕРЕННЫЙ СПИСОК ССЫЛОК
    const GIFT_POOL = [
        { id: 1, name: "Статуя птицы серая", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/954503c70e7e4d70b330820aa63c3a2664b43859d4fc5932.jpg", price: "20 TON", rawPrice: 20.0, type: "gift" },
        { id: 2, name: "Тыква", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/7da852289f424f4d8dbb74918372a50122e06951b2946cd3.jpg", price: "8 TON", rawPrice: 8.0, type: "gift" },
        { id: 3, name: "Шляпа", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/e8f404864d1b4fbfb591f0d577333bb7104e6b42b7b7aeff.jpg", price: "7 TON", rawPrice: 7.0, type: "gift" },
        { id: 4, name: "Собачка Snoop Dogg", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/c6a7b6471f8c4118aaf9bdc540ae6a00a21971af7fcb4cb6.jpg", price: "4 TON", rawPrice: 4.0, type: "gift" },
        { id: 5, name: "Рюкзак черный", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/b90f1ee2e18f4f45b092c6f1f5ec65f5b3283fdc18f3c876.jpg", price: "3 TON", rawPrice: 3.0, type: "gift" },
        { id: 6, name: "Доширак лапша", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/a4ddba996b304ed48118547363bf124191da7bb40deb532d.jpg", price: "2.7 TON", rawPrice: 2.7, type: "gift" },
        { id: 7, name: "Факел", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/c5e6656920a94373951204199f5834b44e30c33a961865c2.jpg", price: "2.5 TON", rawPrice: 2.5, type: "gift" },
        { id: 8, name: "Мороженое пломбир", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/668ac26d91c343b7972d8d74243b8a21ca21ba758b8f1471.jpg", price: "2.5 TON", rawPrice: 2.5, type: "gift" },
        { id: 9, name: "Алмазик", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/afdc136081d946a48e604a37f3ab43e27bac6e6419778bd1.jpg", price: "0.9 TON", rawPrice: 0.9, type: "gift" },
        { id: 10, name: "Роза", icon: "https://unlimbot.hb.ru-msk.vkcloud-storage.ru/uploads/b595febe2739482d9aa250edb5fce5893e24113d46164d46.jpg", price: "0.27 TON", rawPrice: 0.27, type: "gift" },
        { id: 11, name: "0.1 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.1 TON", rawPrice: 0.1, type: "balance" },
        { id: 12, name: "0.07 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.07 TON", rawPrice: 0.07, type: "balance" },
        { id: 13, name: "0.05 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.05 TON", rawPrice: 0.05, type: "balance" },
        { id: 14, name: "0.03 TON", icon: "https://img.icons8.com/color/96/coins.png", price: "0.03 TON", rawPrice: 0.03, type: "balance" }
    ];

    const elements = {
        homeSection: document.getElementById('home-section'),
        caseSection: document.getElementById('case-section'),
        inventorySection: document.getElementById('inventory-section'),
        rouletteTrack: document.getElementById('roulette-track'),
        spinBtn: document.getElementById('spin-case-button'),
        balanceDisplay: [document.getElementById('user-balance'), document.getElementById('case-user-balance')],
        rewardsGrid: document.getElementById('rewards-grid'),
        inventoryGrid: document.getElementById('inventory-grid'),
        navTabs: document.querySelectorAll('.nav-tab')
    };

    function navigateTo(target) {
        [elements.homeSection, elements.caseSection, elements.inventorySection].forEach(s => {
            if (s) s.classList.add('hidden');
        });
        
        const targetSec = document.getElementById(`${target}-section`);
        if (targetSec) targetSec.classList.remove('hidden');

        elements.navTabs.forEach(t => t.classList.toggle('active', t.dataset.target === target));
        
        if (target === 'inventory') fetchInventory();
        if (target === 'case') initRouletteTrack();
    }

    elements.navTabs.forEach(t => t.addEventListener('click', () => navigateTo(t.dataset.target)));
    
    if (document.getElementById('daily-case-banner')) {
        document.getElementById('daily-case-banner').addEventListener('click', () => navigateTo('case'));
    }
    if (document.getElementById('back-to-home-button')) {
        document.getElementById('back-to-home-button').addEventListener('click', () => navigateTo('home'));
    }

    // --- Безопасная загрузка профиля (Без зависаний) ---
    async function fetchUserData() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/user`, { 
                headers: { 'X-Telegram-Init-Data': tg.initData || "" }
            });
            if (!res.ok) throw new Error();
            currentUser = await res.json();
        } catch (e) {
            console.warn("Сбой сети. Запуск в офлайн/админ-режиме.");
            currentUser = {
                balance: 0.000,
                username: tg.initDataUnsafe?.user?.username || "Admin",
                first_name: tg.initDataUnsafe?.user?.first_name || "Admin",
                avatar_url: "https://img.icons8.com/color/96/user.png",
                is_admin: true
            };
        }

        // Обновляем данные на экране только после успешного прогона логики
        elements.balanceDisplay.forEach(d => {
            if (d) d.innerText = `${parseFloat(currentUser.balance || 0).toFixed(3)} TON`;
        });
        
        const avatarImg = document.getElementById('user-avatar');
        if (avatarImg) {
            avatarImg.src = currentUser.avatar_url || "https://img.icons8.com/color/96/user.png";
            avatarImg.onerror = () => { avatarImg.src = "https://img.icons8.com/color/96/user.png"; };
        }
        
        const usernameSpan = document.getElementById('user-username');
        if (usernameSpan) {
            usernameSpan.innerText = currentUser.username || currentUser.first_name || "Пользователь";
        }

        const caseStatus = document.getElementById('home-case-status');
        if (caseStatus) {
            caseStatus.innerText = "Доступен!";
        }
    }

    // --- Инвентарь ---
    async function fetchInventory() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/inventory`, { 
                headers: { 'X-Telegram-Init-Data': tg.initData || "" }
            });
            const items = await res.json();
            
            elements.inventoryGrid.innerHTML = items.length ? '' : '<div class="empty-inventory">🎒 Ваш инвентарь пуст.</div>';
            
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'reward-card';
                div.innerHTML = `
                    <div class="item-qty">x${item.quantity}</div>
                    <img src="${item.image_url}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                    <div class="reward-name">${item.name}</div>
                    <button class="send-to-tg-button">Отправить в ТГ</button>
                `;
                div.querySelector('.send-to-tg-button').addEventListener('click', () => {
                    tg.showPopup({ title: "Отправка", message: "Отправка в Telegram будет доступна в следующем обновлении!" });
                });
                elements.inventoryGrid.appendChild(div);
            });
        } catch (error) {
            elements.inventoryGrid.innerHTML = '<div class="empty-inventory">Ошибка загрузки инвентаря</div>';
        }
    }

    // --- Рулетка ---
    function initRouletteTrack() {
        elements.rouletteTrack.style.transition = 'none';
        elements.rouletteTrack.style.transform = 'translateX(0px)';
        elements.rouletteTrack.innerHTML = '';
        
        for (let i = 0; i < 60; i++) {
            const item = GIFT_POOL[Math.floor(Math.random() * GIFT_POOL.length)];
            const el = document.createElement('div');
            el.className = 'roulette-item';
            el.innerHTML = `
                <img src="${item.icon}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                <span>${item.price}</span>
            `;
            elements.rouletteTrack.appendChild(el);
        }
    }

    function spinRoulette(winItem, callback) {
        const itemWidth = 92; // 84px + 8px gap
        const targetIdx = 45;
        const track = elements.rouletteTrack;
        
        track.children[targetIdx].innerHTML = `
            <img src="${winItem.icon}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
            <span>${winItem.price}</span>
        `;
        
        const containerWidth = track.parentElement.offsetWidth;
        const centerOffset = (containerWidth / 2) - (84 / 2);
        const finalPosition = (targetIdx * itemWidth) - centerOffset;

        track.style.transition = 'transform 5s cubic-bezier(0.15, 0.85, 0.15, 1)';
        track.style.transform = `translateX(-${finalPosition}px)`;
        setTimeout(callback, 5200);
    }

    elements.spinBtn.addEventListener('click', async () => {
        elements.spinBtn.disabled = true;
        
        try {
            const res = await fetch(`${API_BASE_URL}/api/open_daily_case`, { 
                method: 'POST', 
                headers: { 'X-Telegram-Init-Data': tg.initData || "" }
            });
            const data = await res.json();
            
            if (!res.ok) { 
                tg.showPopup({ title: "Внимание", message: data.error || "Ошибка" }); 
                elements.spinBtn.disabled = false; 
                return; 
            }

            const winItem = GIFT_POOL.find(g => g.id === data.wonItem.id) || GIFT_POOL[13];
            
            spinRoulette(winItem, () => {
                if (winItem.type === 'balance') {
                    tg.showPopup({ title: 'Выигрыш!', message: `Баланс успешно пополнен на +${winItem.price}!` });
                    fetchUserData();
                } else {
                    tg.showPopup({
                        title: 'Подарок!',
                        message: `Вы выиграли "${winItem.name}"! Желаете продать его за ${winItem.price} или оставить себе в инвентарь?`,
                        buttons: [{id: 'sell', text: 'Продать'}, {id: 'keep', text: 'Оставить себе'}]
                    }, async (btn) => {
                        if (btn === 'sell') {
                            await fetch(`${API_BASE_URL}/api/sell_gift`, {
                                method: 'POST',
                                headers: { 
                                    'Content-Type': 'application/json', 
                                    'X-Telegram-Init-Data': tg.initData || "" 
                                },
                                body: JSON.stringify({ itemId: winItem.id, price: winItem.rawPrice })
                            });
                        }
                        fetchUserData();
                    });
                }
                elements.spinBtn.disabled = false;
            });
        } catch (err) {
            tg.showPopup({ title: "Ошибка", message: "Не удалось открыть кейс." });
            elements.spinBtn.disabled = false;
        }
    });

    // Отрисовка наград
    GIFT_POOL.forEach(g => {
        const div = document.createElement('div');
        div.className = 'reward-card';
        const badge = g.type === 'gift' ? '<div class="reward-random-badge">random</div>' : '';
        div.innerHTML = `
            <div class="reward-price-top">${g.price}</div>
            <img src="${g.icon}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
            <div class="reward-name">${g.name}</div>
            ${badge}
        `;
        elements.rewardsGrid.appendChild(div);
    });

    // Запускаем приложение мгновенно
    await fetchUserData();
    navigateTo('home');
});

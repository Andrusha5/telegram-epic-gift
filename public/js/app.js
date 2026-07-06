document.addEventListener('DOMContentLoaded', async () => {
    const tg = window.Telegram.WebApp;
    tg.expand();
    
    // Функция получения инвентаря (без x2)
    const fetchInventory = async () => {
        const res = await fetch(`${window.location.origin}/api/inventory`, { headers: {'X-Telegram-Init-Data': tg.initData}});
        const items = await res.json();
        const grid = document.getElementById('inventory-grid');
        grid.innerHTML = items.map(item => `
            <div class="reward-card">
                <img src="${item.image_url}" onerror="this.src='https://img.icons8.com/color/96/gift.png'">
                <div>${item.name}</div>
                <div class="inv-actions">
                    <button onclick="withdraw(${item.item_id})">Вывести</button>
                    <button onclick="sell(${item.item_id}, ${item.value})">Продать</button>
                </div>
            </div>
        `).join('');
    };

    // Навигация
    document.querySelectorAll('.nav-tab').forEach(t => t.onclick = () => {
        const target = t.dataset.target;
        document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
        document.getElementById(target + '-section')?.classList.remove('hidden');
        if(target === 'inventory') fetchInventory();
    });

    // Инициализация аватара
    const avatar = document.getElementById('user-avatar');
    if(tg.initDataUnsafe?.user?.photo_url) avatar.src = tg.initDataUnsafe.user.photo_url;
    
    fetchInventory();
});

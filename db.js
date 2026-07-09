const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Важно для Neon.tech / Render
    }
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

async function query(text, params) {
    try {
        const res = await pool.query(text, params);
        return res;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

// =========================================================================
// !!! ВНИМАНИЕ: SQL СХЕМА БАЗЫ ДАННЫХ !!!
// ЭТОТ КОД НУЖНО ВЫПОЛНИТЬ В ВАШЕЙ БАЗЕ ДАННЫХ (НАПРИМЕР, В WEB-ИНТЕРФЕЙСЕ NEON.TECH) ОДИН РАЗ!
/*
CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,
    username VARCHAR(255) UNIQUE,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    avatar_url TEXT,
    balance NUMERIC(10, 3) DEFAULT 0.000,
    last_daily_case_open TIMESTAMP WITH TIME ZONE DEFAULT '2000-01-01 00:00:00+00',
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Таблица для возможных призов
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT,
    type VARCHAR(50) NOT NULL, – 'balance' (пополнение баланса TON), 'gift' (подарок в инвентарь)
    value NUMERIC(10, 3) DEFAULT 0.000, – Значение TON для 'balance', или ценность для 'gift' (для будущих функций)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Таблица для настройки содержимого ежедневного кейса
CREATE TABLE IF NOT EXISTS daily_case_drops (
    item_id INT REFERENCES items(id) ON DELETE CASCADE,
    chance NUMERIC(5, 2) NOT NULL, – Шанс выпадения (например, 5.00 для 5%)
    PRIMARY KEY (item_id)
);

-- Таблица для инвентаря пользователя
CREATE TABLE IF NOT EXISTS user_inventory (
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    item_id INT REFERENCES items(id) ON DELETE CASCADE,
    quantity INT DEFAULT 0,
    PRIMARY KEY (user_id, item_id)
);

-- Таблица для логов транзакций (опционально, но рекомендуется для контроля)
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, – 'case_open', 'balance_topup', 'item_received', 'admin_add_balance', 'admin_add_item'
    item_id INT REFERENCES items(id),
    amount NUMERIC(10, 3),
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Добавление начальных тестовых предметов (Примеры. Замените на свои!)
INSERT INTO items (name, description, image_url, type, value) VALUES
('Пополнение на 0.5 TON', 'Получите 0.5 TON на баланс', 'https://via.placeholder.com/80?text=0.5TON', 'balance', 0.5) ON CONFLICT (id) DO NOTHING;

INSERT INTO items (name, description, image_url, type, value) VALUES
('Мишка (15 звезд)', 'Подарок в Telegram, эквивалент 15 звездам', 'https://via.placeholder.com/80?text=Bear', 'gift', 15) ON CONFLICT (id) DO NOTHING;

INSERT INTO items (name, description, image_url, type, value) VALUES
('Кольцо (80 звезд)', 'Подарок в Telegram, эквивалент 80 звездам', 'https://via.placeholder.com/80?text=Ring', 'gift', 80) ON CONFLICT (id) DO NOTHING;

-- Настройка содержимого ежедневного кейса по умолчанию (пример: Мишка 95%, 0.5 TON 5%)
-- УБЕДИТЕСЬ, ЧТО ID ПРЕДМЕТОВ СООТВЕТСТВУЮТ ТЕМ, ЧТО ВЫ ВСТАВИЛИ В ТАБЛИЦУ items!
-- Вам нужно будет узнать ID через SELECT * FROM items;
-- И затем вставить правильные ID сюда
INSERT INTO daily_case_drops (item_id, chance) VALUES
((SELECT id FROM items WHERE name = 'Пополнение на 0.5 TON'), 5.00) ON CONFLICT (item_id) DO UPDATE SET chance = EXCLUDED.chance;

INSERT INTO daily_case_drops (item_id, chance) VALUES
((SELECT id FROM items WHERE name = 'Мишка (15 звезд)'), 95.00) ON CONFLICT (item_id) DO UPDATE SET chance = EXCLUDED.chance;
*/

module.exports = { query, pool };
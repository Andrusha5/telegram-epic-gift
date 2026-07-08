const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Обязательно для Neon.tech и Render
    }
});

pool.on('error', (err) => {
    console.error('Непредвиденная ошибка PostgreSQL:', err);
});

async function query(text, params) {
    try {
        const res = await pool.query(text, params);
        return res;
    } catch (error) {
        console.error('Ошибка в БД при выполнении запроса:', text, error);
        throw error;
    }
}

module.exports = { query, pool };

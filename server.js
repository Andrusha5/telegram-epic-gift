const express = require('express');
const app = express();
const db = require('./db');
app.use(express.json());
app.use(express.static('public'));

app.get('/api/inventory', async (req, res) => {
    const userId = JSON.parse(new URLSearchParams(req.headers['x-telegram-init-data']).get('user')).id;
    const { rows } = await db.query(`SELECT i.id as item_id, i.name, i.image_url, i.value FROM user_inventory ui JOIN items i ON ui.item_id = i.id WHERE ui.user_id = $1`, [userId]);
    res.json(rows);
});

app.listen(process.env.PORT || 3000);

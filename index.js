const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Neon Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ========== GET all products ==========
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error('DB Error:', err);
    res.json([]);
  }
});

// ========== GET single product ==========
app.get('/api/product/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ADD new product (Admin) ==========
app.post('/api/add_product', async (req, res) => {
  const { name, category, price, offer_price, emoji, photo_url, desc, stock } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO products (name, category, price, offer_price, emoji, photo_url, description, stock) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [name, category, price, offer_price || null, emoji, photo_url, desc, stock || 50]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== PLACE ORDER ==========
app.post('/api/place_order', async (req, res) => {
  const { id, name, phone, address, items, total, coins, payment_method } = req.body;
  
  try {
    // Insert order
    await pool.query(
      `INSERT INTO orders (id, customer_name, phone, address, items, total, coins_earned, payment_method, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [id, name, phone, address, JSON.stringify(items), total, coins, payment_method || 'online']
    );
    
    // Update or Insert customer
    await pool.query(
      `INSERT INTO customers (name, phone, total_coins, total_spent, order_count, last_order)
       VALUES ($1, $2, $3, $4, 1, NOW())
       ON CONFLICT (phone) DO UPDATE SET
         total_coins = customers.total_coins + $3,
         total_spent = customers.total_spent + $4,
         order_count = customers.order_count + 1,
         last_order = NOW()`,
      [name, phone, coins, total]
    );
    
    // Add coin transaction record
    await pool.query(
      `INSERT INTO s_coin_transactions (phone, coins, note, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [phone, coins, `Order ${id} - earned ${coins} coins`]
    );
    
    res.json({ success: true, orderId: id });
  } catch (err) {
    console.error('Order Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== GET orders by phone ==========
app.get('/api/orders/:phone', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders WHERE phone = $1 ORDER BY created_at DESC',
      [req.params.phone]
    );
    res.json(result.rows);
  } catch (err) {
    res.json([]);
  }
});

// ========== GET customer by phone ==========
app.get('/api/customer/:phone', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers WHERE phone = $1', [req.params.phone]);
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
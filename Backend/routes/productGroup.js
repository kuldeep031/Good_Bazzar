const express = require('express');
const router = express.Router();
const { query } = require('../initialize-db');

// Create a new product group
router.post('/', async (req, res) => {
  try {
    const { 
      product, 
      quantity, 
      price, 
      actualRate, 
      finalRate, 
      discountPercentage, 
      location, 
      deliveryAddress,
      deliveryCity,
      deliveryState,
      deliveryPincode,
      deadline, 
      created_by, 
      latitude, 
      longitude 
    } = req.body;
    
    console.log('📦 Creating product group with delivery details:', {
      product,
      quantity,
      location,
      deliveryAddress,
      deliveryCity,
      deliveryState,
      deliveryPincode,
      created_by
    });
    
    if (!product || !quantity || !location || !deadline || !created_by) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const result = await query(
      `INSERT INTO product_groups (
        product, quantity, price, actual_rate, final_rate, discount_percentage, 
        location, delivery_address, delivery_city, delivery_state, delivery_pincode,
        deadline, status, created_by, latitude, longitude
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', $13, $14, $15) RETURNING id`,
      [
        product, 
        quantity, 
        price || '', 
        actualRate || '', 
        finalRate || '', 
        discountPercentage || '', 
        location,
        deliveryAddress || '',
        deliveryCity || '',
        deliveryState || '',
        deliveryPincode || '',
        deadline, 
        created_by, 
        latitude || '', 
        longitude || ''
      ]
    );
    
    console.log('✅ Product group created successfully with ID:', result.rows[0].id);
    console.log('💾 Saved delivery details:', {
      deliveryAddress: deliveryAddress || '',
      deliveryCity: deliveryCity || '',
      deliveryState: deliveryState || '',
      deliveryPincode: deliveryPincode || ''
    });
    
    res.status(201).json({ message: 'Product group created', id: result.rows[0].id });
  } catch (err) {
    console.error('❌ Error creating product group:', err);
    res.status(500).json({ error: 'Failed to create product group', details: err.message });
  }
});

// Get all product groups (optionally filter by created_by)
router.get('/', async (req, res) => {
  try {
    const { created_by } = req.query;
    let sql = 'SELECT * FROM product_groups';
    let params = [];
    if (created_by) {
      sql += ' WHERE created_by = $1';
      params.push(created_by);
    }
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product groups', details: err.message });
  }
});

// Update status: accept, decline, deliver
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['accepted', 'declined', 'delivered'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await query('UPDATE product_groups SET status = $1 WHERE id = $2', [status, id]);
    res.json({ message: `Product group marked as ${status}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status', details: err.message });
  }
});

module.exports = router; 
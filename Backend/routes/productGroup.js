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
      minimumQuantity,
      discountPerUnit,
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
        minimum_quantity, discount_per_unit,
        location, delivery_address, delivery_city, delivery_state, delivery_pincode,
        deadline, status, created_by, latitude, longitude
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending', $15, $16, $17) RETURNING id`,
      [
        product, 
        quantity, 
        price || '', 
        actualRate || '', 
        finalRate || '', 
        discountPercentage || '',
        minimumQuantity || '',
        discountPerUnit || '',
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

// Update current_quantity when vendor joins or increases quantity
router.patch('/:id/current-quantity', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantityToAdd } = req.body;
    
    if (!quantityToAdd || quantityToAdd <= 0) {
      return res.status(400).json({ error: 'Invalid quantity to add' });
    }
    
    console.log(`📊 Updating current_quantity for group ${id}, adding ${quantityToAdd}`);
    
    // Get current group data
    const groupResult = await query('SELECT * FROM product_groups WHERE id = $1', [id]);
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product group not found' });
    }
    
    const group = groupResult.rows[0];
    const currentQuantity = parseInt(group.current_quantity) || 0;
    const targetQuantity = parseInt(group.quantity);
    const newCurrentQuantity = currentQuantity + parseInt(quantityToAdd);
    
    console.log(`📊 Current: ${currentQuantity}, Adding: ${quantityToAdd}, New: ${newCurrentQuantity}, Target: ${targetQuantity}`);
    
    // Check if new quantity would exceed target
    if (newCurrentQuantity > targetQuantity) {
      return res.status(400).json({ 
        error: 'Quantity exceeds target',
        details: `Adding ${quantityToAdd} would exceed target quantity. Available: ${targetQuantity - currentQuantity}` 
      });
    }
    
    // Update current_quantity
    const updateResult = await query(
      'UPDATE product_groups SET current_quantity = $1 WHERE id = $2 RETURNING *',
      [newCurrentQuantity, id]
    );
    
    const updatedGroup = updateResult.rows[0];
    const isFull = newCurrentQuantity >= targetQuantity;
    
    console.log(`✅ Updated current_quantity to ${newCurrentQuantity}. Group is ${isFull ? 'FULL' : 'OPEN'}`);
    
    res.json({ 
      message: 'Current quantity updated successfully',
      data: updatedGroup,
      isFull: isFull,
      available: targetQuantity - newCurrentQuantity
    });
    
  } catch (err) {
    console.error('❌ Error updating current_quantity:', err);
    res.status(500).json({ error: 'Failed to update current quantity', details: err.message });
  }
});

module.exports = router; 
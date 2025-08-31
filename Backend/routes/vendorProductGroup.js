const express = require('express');
const router = express.Router();
const { query } = require('../initialize-db');

// Create a new vendor product group entry
router.post('/', async (req, res) => {
  try {
    const { 
      vendor_id, 
      group_id, 
      discount_per_unit,
      maximum_price,
      quantity, 
      final_price 
    } = req.body;
    
    console.log('🔗 Creating vendor product group entry:', {
      vendor_id,
      group_id,
      discount_per_unit,
      maximum_price,
      quantity,
      final_price
    });
    
    if (!vendor_id || !group_id || !quantity || !final_price) {
      return res.status(400).json({ 
        error: 'Missing required fields: vendor_id, group_id, quantity, final_price' 
      });
    }
    
    // Set maximum_price equal to final_price (can be modified later based on discounts)
    const calculated_maximum_price = final_price;
    
    console.log('💰 Setting maximum_price = final_price:', calculated_maximum_price);
    
    const result = await query(
      `INSERT INTO vendor_product_groups (
        vendor_id, group_id, discount_per_unit, maximum_price, quantity, final_price, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
      [
        vendor_id, 
        group_id, 
        discount_per_unit || 0,
        calculated_maximum_price, // Always equal to final_price
        quantity, 
        final_price
      ]
    );
    
    console.log('✅ Vendor product group entry created successfully:', result.rows[0]);
    
    res.status(201).json({ 
      message: 'Vendor product group entry created', 
      data: result.rows[0] 
    });
  } catch (err) {
    console.error('❌ Error creating vendor product group entry:', err);
    if (err.code === '23505') { // Unique constraint violation
      res.status(409).json({ 
        error: 'Vendor already has an entry for this product group',
        details: err.message 
      });
    } else if (err.code === '23503') { // Foreign key constraint violation
      res.status(400).json({ 
        error: 'Invalid vendor_id or group_id',
        details: err.message 
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to create vendor product group entry', 
        details: err.message 
      });
    }
  }
});

// Get all vendor product group entries (with optional filters)
router.get('/', async (req, res) => {
  try {
    const { vendor_id, group_id, status } = req.query;
    
    let sql = `
      SELECT 
        vpg.*,
        v.full_name as vendor_name,
        v.stall_name,
        pg.product,
        pg.location as product_location
      FROM vendor_product_groups vpg
      JOIN vendors v ON vpg.vendor_id = v.id
      JOIN product_groups pg ON vpg.group_id = pg.id
    `;
    
    const conditions = [];
    const params = [];
    let paramIndex = 1;
    
    if (vendor_id) {
      conditions.push(`vpg.vendor_id = $${paramIndex++}`);
      params.push(vendor_id);
    }
    
    if (group_id) {
      conditions.push(`vpg.group_id = $${paramIndex++}`);
      params.push(group_id);
    }
    
    if (status) {
      conditions.push(`vpg.status = $${paramIndex++}`);
      params.push(status);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' ORDER BY vpg.created_at DESC';
    
    const result = await query(sql, params);
    
    console.log(`📋 Retrieved ${result.rows.length} vendor product group entries`);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching vendor product group entries:', err);
    res.status(500).json({ 
      error: 'Failed to fetch vendor product group entries', 
      details: err.message 
    });
  }
});

// Get a specific vendor product group entry
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `SELECT 
        vpg.*,
        v.full_name as vendor_name,
        v.stall_name,
        v.mobile_number as vendor_mobile,
        pg.product,
        pg.location as product_location,
        pg.deadline
      FROM vendor_product_groups vpg
      JOIN vendors v ON vpg.vendor_id = v.id
      JOIN product_groups pg ON vpg.group_id = pg.id
      WHERE vpg.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor product group entry not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error fetching vendor product group entry:', err);
    res.status(500).json({ 
      error: 'Failed to fetch vendor product group entry', 
      details: err.message 
    });
  }
});

// Update a vendor product group entry
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      discount_per_unit,
      maximum_price,
      quantity, 
      final_price,
      status 
    } = req.body;
    
    // Set maximum_price equal to final_price (can be modified later based on discounts)
    const calculated_maximum_price = final_price || maximum_price;
    
    console.log('💰 Update: Setting maximum_price = final_price:', calculated_maximum_price);
    
    const result = await query(
      `UPDATE vendor_product_groups 
       SET discount_per_unit = $1, maximum_price = $2, quantity = $3, 
           final_price = $4, status = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING *`,
      [discount_per_unit, calculated_maximum_price, quantity, final_price, status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor product group entry not found' });
    }
    
    console.log('✅ Vendor product group entry updated successfully:', result.rows[0]);
    res.json({ 
      message: 'Vendor product group entry updated', 
      data: result.rows[0] 
    });
  } catch (err) {
    console.error('❌ Error updating vendor product group entry:', err);
    res.status(500).json({ 
      error: 'Failed to update vendor product group entry', 
      details: err.message 
    });
  }
});

// Delete a vendor product group entry
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      'DELETE FROM vendor_product_groups WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor product group entry not found' });
    }
    
    console.log('✅ Vendor product group entry deleted successfully');
    res.json({ message: 'Vendor product group entry deleted successfully' });
  } catch (err) {
    console.error('❌ Error deleting vendor product group entry:', err);
    res.status(500).json({ 
      error: 'Failed to delete vendor product group entry', 
      details: err.message 
    });
  }
});

module.exports = router;

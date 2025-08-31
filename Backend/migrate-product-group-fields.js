const { pool } = require('./db-config');

// Migration script to add new fields to product_groups table
const migrateProductGroupFields = async () => {
  console.log('Running migration to add minimum_quantity and discount_per_unit fields to product_groups...');
  
  try {
    // Check if the columns already exist
    const checkColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'product_groups' 
      AND column_name IN ('minimum_quantity', 'discount_per_unit')
    `);
    
    console.log('Existing columns in product_groups:', checkColumns.rows);
    
    // Add minimum_quantity column if it doesn't exist
    const hasMinQty = checkColumns.rows.some(row => row.column_name === 'minimum_quantity');
    if (!hasMinQty) {
      await pool.query('ALTER TABLE product_groups ADD COLUMN minimum_quantity TEXT');
      console.log('✅ Added minimum_quantity column to product_groups');
    } else {
      console.log('ℹ️ minimum_quantity column already exists in product_groups');
    }
    
    // Add discount_per_unit column if it doesn't exist  
    const hasDiscount = checkColumns.rows.some(row => row.column_name === 'discount_per_unit');
    if (!hasDiscount) {
      await pool.query('ALTER TABLE product_groups ADD COLUMN discount_per_unit TEXT');
      console.log('✅ Added discount_per_unit column to product_groups');
    } else {
      console.log('ℹ️ discount_per_unit column already exists in product_groups');
    }
    
    // Also remove these columns from suppliers table if they exist
    console.log('Checking if columns exist in suppliers table...');
    const supplierColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'suppliers' 
      AND column_name IN ('minimum_quantity', 'discount_per_unit')
    `);
    
    if (supplierColumns.rows.length > 0) {
      console.log('Removing columns from suppliers table...');
      for (const row of supplierColumns.rows) {
        await pool.query(`ALTER TABLE suppliers DROP COLUMN IF EXISTS ${row.column_name}`);
        console.log(`✅ Removed ${row.column_name} column from suppliers table`);
      }
    }
    
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  migrateProductGroupFields();
}

module.exports = { migrateProductGroupFields };

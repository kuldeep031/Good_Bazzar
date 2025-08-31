const { pool } = require('./db-config');

async function testMigration() {
  try {
    console.log('Testing database connection...');
    
    // Test basic connection
    const result = await pool.query('SELECT NOW()');
    console.log('Database connected successfully:', result.rows[0]);
    
    // Check if the columns already exist
    const checkColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'suppliers' 
      AND column_name IN ('minimum_quantity', 'discount_per_unit')
    `);
    
    console.log('Existing columns:', checkColumns.rows);
    
    if (checkColumns.rows.length < 2) {
      console.log('Adding missing columns...');
      
      // Add minimum_quantity column if it doesn't exist
      const hasMinQty = checkColumns.rows.some(row => row.column_name === 'minimum_quantity');
      if (!hasMinQty) {
        await pool.query('ALTER TABLE suppliers ADD COLUMN minimum_quantity TEXT');
        console.log('✅ Added minimum_quantity column');
      }
      
      // Add discount_per_unit column if it doesn't exist  
      const hasDiscount = checkColumns.rows.some(row => row.column_name === 'discount_per_unit');
      if (!hasDiscount) {
        await pool.query('ALTER TABLE suppliers ADD COLUMN discount_per_unit TEXT');
        console.log('✅ Added discount_per_unit column');
      }
    } else {
      console.log('✅ All columns already exist');
    }
    
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

testMigration();

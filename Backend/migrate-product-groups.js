const pool = require('./db-config');

const addMissingProductGroupFields = async () => {
  try {
    console.log('Adding missing fields to product_groups table...');
    
    // Add minimum_quantity column
    await pool.query(`
      ALTER TABLE product_groups 
      ADD COLUMN IF NOT EXISTS minimum_quantity TEXT
    `);
    console.log('✅ Added minimum_quantity field');
    
    // Add discount_per_unit column
    await pool.query(`
      ALTER TABLE product_groups 
      ADD COLUMN IF NOT EXISTS discount_per_unit TEXT
    `);
    console.log('✅ Added discount_per_unit field');
    
    // Add current_quantity column (if not already added)
    await pool.query(`
      ALTER TABLE product_groups 
      ADD COLUMN IF NOT EXISTS current_quantity INTEGER DEFAULT 0
    `);
    console.log('✅ Added current_quantity field');
    
    console.log('🎉 All missing fields have been added to product_groups table');
    
    // Show current table structure
    const tableInfo = await pool.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'product_groups' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Current product_groups table structure:');
    tableInfo.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}${row.column_default ? ` (default: ${row.column_default})` : ''}`);
    });
    
  } catch (error) {
    console.error('❌ Error adding fields:', error);
    throw error;
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  addMissingProductGroupFields()
    .then(() => {
      console.log('\nMigration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addMissingProductGroupFields };

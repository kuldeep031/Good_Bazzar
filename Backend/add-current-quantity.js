const pool = require('./db-config');

const addCurrentQuantityField = async () => {
  try {
    console.log('Adding current_quantity field to product_groups table...');
    
    // Add current_quantity column with default value 0
    await pool.query(`
      ALTER TABLE product_groups 
      ADD COLUMN IF NOT EXISTS current_quantity INTEGER DEFAULT 0
    `);
    
    console.log('✅ Successfully added current_quantity field to product_groups table');
    console.log('📝 Default value: 0');
    
    // Update any existing records to have current_quantity = 0 if they don't already
    const updateResult = await pool.query(`
      UPDATE product_groups 
      SET current_quantity = 0 
      WHERE current_quantity IS NULL
    `);
    
    console.log(`📊 Updated ${updateResult.rowCount} existing records with current_quantity = 0`);
    
  } catch (error) {
    console.error('❌ Error adding current_quantity field:', error);
    throw error;
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  addCurrentQuantityField()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addCurrentQuantityField };

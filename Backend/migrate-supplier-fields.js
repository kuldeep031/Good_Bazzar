const { pool } = require('./db-config');

// Migration script to add new fields to suppliers table
const migrateSupplierFields = async () => {
  console.log('Running migration to add minimum_quantity and discount_per_unit fields...');
  
  try {
    // Add minimum_quantity column if it doesn't exist
    await pool.query(`
      DO $$ 
      BEGIN 
        BEGIN
          ALTER TABLE suppliers ADD COLUMN minimum_quantity TEXT;
        EXCEPTION
          WHEN duplicate_column THEN 
            RAISE NOTICE 'Column minimum_quantity already exists';
        END;
      END $$;
    `);
    console.log('✅ Added minimum_quantity column (or already exists)');

    // Add discount_per_unit column if it doesn't exist
    await pool.query(`
      DO $$ 
      BEGIN 
        BEGIN
          ALTER TABLE suppliers ADD COLUMN discount_per_unit TEXT;
        EXCEPTION
          WHEN duplicate_column THEN 
            RAISE NOTICE 'Column discount_per_unit already exists';
        END;
      END $$;
    `);
    console.log('✅ Added discount_per_unit column (or already exists)');

    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    // Close the pool connection
    await pool.end();
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  migrateSupplierFields()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateSupplierFields };

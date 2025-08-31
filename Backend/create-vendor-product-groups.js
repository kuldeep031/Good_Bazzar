const pool = require('./db-config');

const createVendorProductGroupsTable = async () => {
  try {
    console.log('Creating vendor_product_groups table...');
    
    // Create vendor_product_groups table
    await pool.query(`CREATE TABLE IF NOT EXISTS vendor_product_groups (
      id SERIAL PRIMARY KEY,
      vendor_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      discount_per_unit REAL DEFAULT 0,
      maximum_price REAL,
      quantity INTEGER NOT NULL,
      final_price REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES product_groups(id) ON DELETE CASCADE,
      UNIQUE(vendor_id, group_id)
    )`);
    console.log('✅ vendor_product_groups table created successfully');
    
    // Create or replace the update trigger function
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);
    
    // Add trigger for vendor_product_groups table
    await pool.query(`
      DROP TRIGGER IF EXISTS vendor_product_groups_updated_at_trigger ON vendor_product_groups;
      CREATE TRIGGER vendor_product_groups_updated_at_trigger 
        BEFORE UPDATE ON vendor_product_groups 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('✅ Trigger for vendor_product_groups table created successfully');
    
    // Show table structure
    const tableInfo = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'vendor_product_groups' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 vendor_product_groups table structure:');
    tableInfo.rows.forEach(row => {
      const nullable = row.is_nullable === 'YES' ? ' (nullable)' : ' (not null)';
      const defaultVal = row.column_default ? ` (default: ${row.column_default})` : '';
      console.log(`  ${row.column_name}: ${row.data_type}${nullable}${defaultVal}`);
    });
    
    console.log('\n🔗 Foreign Key Constraints:');
    console.log('  vendor_id → vendors(id) ON DELETE CASCADE');
    console.log('  group_id → product_groups(id) ON DELETE CASCADE');
    console.log('  UNIQUE constraint on (vendor_id, group_id)');
    
  } catch (error) {
    console.error('❌ Error creating vendor_product_groups table:', error);
    throw error;
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  createVendorProductGroupsTable()
    .then(() => {
      console.log('\n🎉 Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { createVendorProductGroupsTable };

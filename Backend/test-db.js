const pool = require('./db-config');

async function testConnection() {
  try {
    console.log('🔍 Testing PostgreSQL connection...');
    
    // Test basic connection
    const client = await pool.connect();
    console.log('✅ Successfully connected to PostgreSQL');
    
    // Test database exists
    const dbResult = await client.query('SELECT current_database()');
    console.log(`📊 Connected to database: ${dbResult.rows[0].current_database}`);
    
    // Test tables exist
    const tableResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log('📋 Available tables:');
    tableResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    // Test sample insert and select on vendors table
    await client.query(`
      INSERT INTO vendors (
        full_name, mobile_number, language_preference, stall_address,
        city, pincode, state, stall_type, raw_material_needs, preferred_delivery_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT DO NOTHING
    `, [
      'Test Vendor', '1234567890', 'English', 'Test Address',
      'Test City', '123456', 'Test State', 'Grocery', '["vegetables"]', 'morning'
    ]);
    
    const vendorResult = await client.query('SELECT COUNT(*) FROM vendors');
    console.log(`👥 Total vendors in database: ${vendorResult.rows[0].count}`);
    
    client.release();
    console.log('✅ PostgreSQL test completed successfully!');
    
  } catch (error) {
    console.error('❌ PostgreSQL connection test failed:', error);
  } finally {
    process.exit(0);
  }
}

testConnection();

const pool = require('./db-config');

async function checkAndCreateTable() {
  try {
    console.log('Checking if product_groups table exists...');
    
    // Check if table exists
    const checkTable = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'product_groups'
    `);
    
    if (checkTable.rows.length === 0) {
      console.log('❌ product_groups table does not exist. Creating it...');
      
      // Create the table
      await pool.query(`CREATE TABLE product_groups (
        id SERIAL PRIMARY KEY,
        product TEXT NOT NULL,
        quantity TEXT NOT NULL,
        price TEXT,
        actual_rate TEXT,
        final_rate TEXT,
        discount_percentage TEXT,
        location TEXT NOT NULL,
        delivery_address TEXT,
        delivery_city TEXT,
        delivery_state TEXT,
        delivery_pincode TEXT,
        deadline TIMESTAMP NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_by INTEGER NOT NULL,
        latitude TEXT,
        longitude TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      
      console.log('✅ product_groups table created successfully!');
    } else {
      console.log('✅ product_groups table already exists');
      
      // Check if delivery columns exist
      const columns = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'product_groups' 
        AND column_name IN ('delivery_address', 'delivery_city', 'delivery_state', 'delivery_pincode')
      `);
      
      console.log('Existing delivery columns:', columns.rows.map(r => r.column_name));
      
      const missingColumns = ['delivery_address', 'delivery_city', 'delivery_state', 'delivery_pincode']
        .filter(col => !columns.rows.some(r => r.column_name === col));
      
      if (missingColumns.length > 0) {
        console.log('Adding missing columns:', missingColumns);
        for (const col of missingColumns) {
          await pool.query(`ALTER TABLE product_groups ADD COLUMN ${col} TEXT`);
          console.log(`✅ Added column: ${col}`);
        }
      } else {
        console.log('✅ All delivery columns exist');
      }
    }
    
    // Test a simple query
    const testQuery = await pool.query('SELECT COUNT(*) as count FROM product_groups');
    console.log(`✅ Table is accessible. Current record count: ${testQuery.rows[0].count}`);
    
    console.log('Database check completed successfully!');
  } catch (error) {
    console.error('Database check failed:', error);
  } finally {
    process.exit(0);
  }
}

checkAndCreateTable();

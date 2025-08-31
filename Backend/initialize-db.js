const pool = require('./db-config');
require('dotenv').config();

// Initialize database with all tables
const initializeDatabase = async () => {
  console.log('Initializing PostgreSQL database...');
  
  try {
    // Create vendors table
    await pool.query(`CREATE TABLE IF NOT EXISTS vendors (
      id SERIAL PRIMARY KEY,
      firebase_user_id TEXT,
      full_name TEXT NOT NULL,
      mobile_number TEXT NOT NULL,
      language_preference TEXT NOT NULL,
      stall_name TEXT,
      stall_address TEXT NOT NULL,
      city TEXT NOT NULL,
      pincode TEXT NOT NULL,
      state TEXT NOT NULL,
      stall_type TEXT NOT NULL,
      raw_material_needs TEXT NOT NULL,
      preferred_delivery_time TEXT NOT NULL,
      latitude TEXT,
      longitude TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('Vendors table created successfully (or already exists)');

    // Create suppliers table with all required columns
    await pool.query(`CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      firebase_user_id TEXT UNIQUE,
      full_name TEXT NOT NULL,
      mobile_number TEXT NOT NULL,
      language_preference TEXT NOT NULL,
      business_name TEXT,
      business_address TEXT NOT NULL,
      city TEXT NOT NULL,
      pincode TEXT NOT NULL,
      state TEXT NOT NULL,
      business_type TEXT NOT NULL,
      supply_capabilities TEXT NOT NULL,
      preferred_delivery_time TEXT NOT NULL,
      primary_email TEXT,
      whatsapp_business TEXT,
      gst_number TEXT,
      license_number TEXT,
      years_in_business TEXT,
      employee_count TEXT,
      food_safety_license TEXT,
      organic_certification TEXT,
      iso_certification TEXT,
      export_license TEXT,
      website TEXT,
      minimum_order_value TEXT,
      delivery_time TEXT,
      payment_terms TEXT,
      service_areas TEXT,
      latitude TEXT,
      longitude TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('Suppliers table created successfully (or already exists)');

    // Create product_groups table with all required columns
    await pool.query(`CREATE TABLE IF NOT EXISTS product_groups (
      id SERIAL PRIMARY KEY,
      product TEXT NOT NULL,
      quantity TEXT NOT NULL,
      current_quantity INTEGER DEFAULT 0,
      price TEXT,
      actual_rate TEXT,
      final_rate TEXT,
      discount_percentage TEXT,
      minimum_quantity TEXT,
      discount_per_unit TEXT,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES suppliers(id)
    )`);
    console.log('Product groups table created successfully (or already exists)');

    // Create orders table
    await pool.query(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      vendor_id INTEGER NOT NULL,
      supplier_id INTEGER,
      order_type TEXT DEFAULT 'individual',
      items TEXT NOT NULL,
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0.05,
      delivery_charge REAL DEFAULT 0,
      group_discount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      payment_status TEXT DEFAULT 'pending',
      payment_method TEXT DEFAULT 'online',
      payment_id TEXT,
      delivery_address TEXT,
      delivery_date TEXT,
      notes TEXT,
      customer_details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vendor_id) REFERENCES vendors (id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
    )`);
    console.log('Orders table created successfully (or already exists)');

    // Create vendor_product_groups table to link vendors with product groups
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
    console.log('Vendor product groups table created successfully (or already exists)');

    // Create products table for product catalog
    await pool.query(`CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      price REAL,
      image TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('Products table created successfully (or already exists)');

    // Create function to automatically update updated_at timestamps
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create triggers to automatically update the updated_at column
    await pool.query(`
      DROP TRIGGER IF EXISTS vendors_updated_at_trigger ON vendors;
      CREATE TRIGGER vendors_updated_at_trigger 
        BEFORE UPDATE ON vendors 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    `);
    
    await pool.query(`
      DROP TRIGGER IF EXISTS suppliers_updated_at_trigger ON suppliers;
      CREATE TRIGGER suppliers_updated_at_trigger 
        BEFORE UPDATE ON suppliers 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await pool.query(`
      DROP TRIGGER IF EXISTS vendor_product_groups_updated_at_trigger ON vendor_product_groups;
      CREATE TRIGGER vendor_product_groups_updated_at_trigger 
        BEFORE UPDATE ON vendor_product_groups 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('Database tables initialized successfully');
    console.log('Database initialization completed. All tables ready for real data.');
    
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

// Promisify database operations for PostgreSQL
const query = async (sql, params = []) => {
  try {
    // Convert SQLite-style parameter placeholders (?) to PostgreSQL-style ($1, $2, etc.)
    let pgSql = sql;
    let pgParams = [...params];
    
    // Replace ? placeholders with $1, $2, etc.
    let paramIndex = 1;
    pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
    
    // Handle special PostgreSQL differences
    pgSql = pgSql.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
    pgSql = pgSql.replace(/AUTOINCREMENT/gi, '');
    
    console.log('Executing SQL:', pgSql);
    console.log('With parameters:', pgParams);
    
    const result = await pool.query(pgSql, pgParams);
    
    if (sql.toLowerCase().includes('insert') || sql.toLowerCase().includes('update') || sql.toLowerCase().includes('delete')) {
      return {
        lastID: result.rows[0]?.id || null,
        changes: result.rowCount,
        rows: result.rows
      };
    } else {
      return {
        rows: result.rows
      };
    }
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Run initialization if this file is executed directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('Database initialization completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase, query, pool };
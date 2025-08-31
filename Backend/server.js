const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config(); // Load environment variables

const { initializeDatabase } = require('./initialize-db');
const vendorRoutes = require('./routes/vendor');
const supplierRoutes = require('./routes/supplier');
const productGroupRoutes = require('./routes/productGroup');
const vendorProductGroupRoutes = require('./routes/vendorProductGroup');
const productRoutes = require('./routes/product');
const orderRoutes = require('./routes/order');

const app = express();

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://localhost:8080', // Vite dev server
    'http://localhost:8081', // Frontend dev server
    'http://localhost:8082', // Frontend dev server (current)
    'http://localhost:5173', // Alternative Vite port
    'http://127.0.0.1:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:8082',
    'https://web-dev-code-champs-kappa.vercel.app', // Vercel deployment
    'https://web-dev-code-champs-kappa.vercel.app/' // Vercel deployment with trailing slash
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Routes
app.use('/api/vendors', vendorRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/product-groups', productGroupRoutes);
app.use('/api/vendor-product-groups', vendorProductGroupRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5002;

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database tables
    await initializeDatabase();
    console.log('Database initialized successfully');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check available at: http://localhost:${PORT}/api/health`);
      console.log(`Vendors API available at: http://localhost:${PORT}/api/vendors`);
      console.log(`Suppliers API available at: http://localhost:${PORT}/api/suppliers`);
      console.log(`Product Groups API available at: http://localhost:${PORT}/api/product-groups`);
      console.log(`Vendor Product Groups API available at: http://localhost:${PORT}/api/vendor-product-groups`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
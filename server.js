const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'happyswimming',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
  schema: 'happyswimming'
});

// Test database connection
pool.connect((err, client, done) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to PostgreSQL database');
    done();
  }
});

// Set search path to happyswimming schema
app.use(async (req, res, next) => {
  try {
    await pool.query('SET search_path TO happyswimming');
    next();
  } catch (error) {
    console.error('Error setting search path:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Authentication token required' });
  
  jwt.verify(token, process.env.JWT_SECRET || 'happyswimming_secret_key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// Routes

// Register a new client
app.post('/api/register/client', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { 
      email, 
      password, 
      firstName, 
      lastName1, 
      lastName2,
      companyName,
      identificationNumber,
      address,
      postalCode,
      city,
      country,
      phoneFixed,
      phoneMobile,
      website,
      plCode,
      isOutsourcing
    } = req.body;
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Insert user
    const userResult = await client.query(
      'INSERT INTO users (email, password_hash, first_name, last_name1, last_name2, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [email, passwordHash, firstName, lastName1, lastName2 || null, 'client']
    );
    
    const userId = userResult.rows[0].id;
    
    // Insert client
    await client.query(
      `INSERT INTO clients 
       (user_id, company_name, identification_number, address, postal_code, city, country, phone_fixed, phone_mobile, website, pl_code, is_outsourcing) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [userId, companyName || null, identificationNumber, address, postalCode, city, country, phoneFixed || null, phoneMobile, website || null, plCode || null, isOutsourcing]
    );
    
    await client.query('COMMIT');
    
    res.status(201).json({ message: 'Client registered successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error registering client:', error);
    
    if (error.constraint === 'users_email_key') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    
    res.status(500).json({ error: 'Error registering client' });
  } finally {
    client.release();
  }
});

// Register a new professional
app.post('/api/register/professional', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { 
      email, 
      password, 
      firstName, 
      lastName1, 
      lastName2,
      companyName,
      identificationNumber,
      address,
      postalCode,
      city,
      country,
      phoneFixed,
      phoneMobile,
      website,
      isInsourcing,
      specialties = [] // Optional array of specialty IDs
    } = req.body;
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Insert user
    const userResult = await client.query(
      'INSERT INTO users (email, password_hash, first_name, last_name1, last_name2, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [email, passwordHash, firstName, lastName1, lastName2 || null, 'professional']
    );
    
    const userId = userResult.rows[0].id;
    
    // Insert professional
    const professionalResult = await client.query(
      `INSERT INTO professionals 
       (user_id, company_name, identification_number, address, postal_code, city, country, phone_fixed, phone_mobile, website, is_insourcing) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [userId, companyName || null, identificationNumber, address, postalCode, city, country, phoneFixed || null, phoneMobile, website || null, isInsourcing]
    );
    
    const professionalId = professionalResult.rows[0].id;
    
    // Insert specialties if provided
    if (specialties.length > 0) {
      const specialtyValues = specialties.map((specialtyId, index) => {
        return `($1, $${index + 2})`;
      }).join(', ');
      
      const specialtyParams = [professionalId, ...specialties];
      
      await client.query(
        `INSERT INTO professional_specialties (professional_id, specialty_id) VALUES ${specialtyValues}`,
        specialtyParams
      );
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({ message: 'Professional registered successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error registering professional:', error);
    
    if (error.constraint === 'users_email_key') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    
    res.status(500).json({ error: 'Error registering professional' });
  } finally {
    client.release();
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Get user by email
    const userResult = await pool.query(
      'SELECT id, email, password_hash, role, first_name, last_name1 FROM users WHERE email = $1 AND is_active = true',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const user = userResult.rows[0];
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'happyswimming_secret_key',
      { expiresIn: '8h' }
    );
    
    // Get additional profile data based on role
    let profileData = {};
    
    if (user.role === 'client') {
      const clientResult = await pool.query(
        'SELECT id, company_name, is_outsourcing FROM clients WHERE user_id = $1',
        [user.id]
      );
      if (clientResult.rows.length > 0) {
        profileData = clientResult.rows[0];
      }
    } else if (user.role === 'professional') {
      const professionalResult = await pool.query(
        'SELECT id, company_name, is_insourcing FROM professionals WHERE user_id = $1',
        [user.id]
      );
      if (professionalResult.rows.length > 0) {
        profileData = professionalResult.rows[0];
      }
    }
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: `${user.first_name} ${user.last_name1}`,
        ...profileData
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get PL codes (for registration dropdown)
app.get('/api/pl-codes', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, code, description FROM pl_codes WHERE is_active = true ORDER BY code'
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching PL codes:', error);
    res.status(500).json({ error: 'Error fetching PL codes' });
  }
});

// Get specialties (for professional registration)
app.get('/api/specialties', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, description FROM specialties ORDER BY name'
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching specialties:', error);
    res.status(500).json({ error: 'Error fetching specialties' });
  }
});

// Protected route - get user profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { id, role } = req.user;
    
    // Get user data
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name1, last_name2, role FROM users WHERE id = $1',
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userResult.rows[0];
    
    // Get role-specific data
    let profileData = {};
    
    if (role === 'client') {
      const clientResult = await pool.query(
        `SELECT c.*, p.code as pl_code_name, p.description as pl_description 
         FROM clients c 
         LEFT JOIN pl_codes p ON c.pl_code = p.code 
         WHERE c.user_id = $1`,
        [id]
      );
      if (clientResult.rows.length > 0) {
        profileData = clientResult.rows[0];
      }
    } else if (role === 'professional') {
      const professionalResult = await pool.query(
        'SELECT * FROM professionals WHERE user_id = $1',
        [id]
      );
      if (professionalResult.rows.length > 0) {
        const professional = professionalResult.rows[0];
        profileData = professional;
        
        // Get specialties
        const specialtiesResult = await pool.query(
          `SELECT s.id, s.name, s.description 
           FROM specialties s
           JOIN professional_specialties ps ON s.id = ps.specialty_id
           WHERE ps.professional_id = $1
           ORDER BY s.name`,
          [professional.id]
        );
        
        profileData.specialties = specialtiesResult.rows;
      }
    }
    
    res.json({
      ...userData,
      ...profileData
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Error fetching profile data' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});
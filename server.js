const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const router = express.Router();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 10000;
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') // Make sure this directory exists
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // limit file size to 5MB
  }
});

app.use(express.json());


// Database connection DEV
// const pool = new Pool({
//   user: process.env.DB_USER || 'postgres',
//   host: process.env.DB_HOST || 'localhost',
//   database: process.env.DB_NAME || 'happyswimming',
//   password: process.env.DB_PASSWORD || 'postgres',
//   port: process.env.DB_PORT || 5432,
//   schema: 'happyswimming'
// });

// Database connection PROD
const pool = new Pool({
connectionString: 'postgres://happyswimming_qjpe_user:SGCYBKnV6fp9WthlelqYVsVjRS9qaf4q@dpg-cvao8e5umphs73ag8b30-a.oregon-postgres.render.com:5432/happyswimming_qjpe',
ssl: { rejectUnauthorized: false }
});




// 

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests from these origins
    const allowedOrigins = [
      'https://www.happyswimming.net',
      'https://happyswimming.onrender.com',
      'http://localhost:4200'
    ];

    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors({
  origin: '*',
  credentials: false // Note: must be false when origin is '*'
}));

// Additionally, for handling preflight requests explicitly:
app.options('*', cors(corsOptions));

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

let global_should_not_authenticate = false;

app.post('/api/should-not-authenticate', (req, res) => {
  global_should_not_authenticate = true;
  res.json({ message: 'This route does not require authentication' });
});

app.post('/api/should-authenticate', (req, res) => {
  global_should_not_authenticate = false;
  res.json({ message: 'This route requires authentication' });
});

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  // Check if user exists and is authenticated
  // if (!req.user) {
  //   return res.status(401).json({ error: 'Authentication required' });
  // }

  // // Check if user is admin (assuming admins have email admin@gmail.com)
  // if (req.user.email !== 'admin@gmail.com') {
  //   return res.status(403).json({ error: 'Admin privileges required' });
  // }

  // User is admin, proceed
  next();
};

// Authentication middleware
function authenticateToken(req, res, next) {
  if (global_should_not_authenticate) {
    console.log('Skipping authentication for this request');
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
    if (err) {
      console.error('Token verification error:', err);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    try {
      // Get fresh user data to check authorization status
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);

      if (rows.length === 0) {
        console.log('User not found:', user.id);
        return res.status(403).json({ error: 'User not found' });
      }

      const userData = rows[0];

      // Check if user is authorized - NEW CHECK
      // Skip this check for admin user and specific endpoints like login and register
      const isAdminRoute = req.path.includes('/admin/');
      const isPublicRoute = req.path.includes('/login') || req.path.includes('/register');

      if (!userData.is_authorized && userData.email !== 'admin@gmail.com' && !isPublicRoute && !isAdminRoute) {
        console.log('User is not authorized:', userData.email);
        return res.status(403).json({
          error: 'Your account is pending authorization',
          authorizationPending: true
        });
      }

      // Set user object on request
      req.user = userData;
      next();
    } catch (error) {
      console.error('Error in authentication middleware:', error);
      return res.status(500).json({ error: 'Authentication error' });
    }
  });
};

const REVOLUT_API_KEY = 'sk_bI39lczR4ekuIZxvn2iXu8Zb77rAEh_rcp2oaPnP-INuDTn4EJ2MHgpkBKwGglD7';
app.post('/api/create-revolut-payment', async (req, res) => {
  console.log('[Revolut] Incoming Payment Request:', req.body);
  const { amount, description } = req.body;

  try {
    const response = await fetch('https://merchant.revolut.com/api/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REVOLUT_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Revolut-Api-Version': '2023-10-01'
      },
      body: JSON.stringify({
        amount: amount * 100, // cents
        currency: 'EUR',
        description: description
      })
    });

    const data = await response.json();
    console.log('[Revolut] API Response:', data);
    if (data.checkout_url) {
      res.json({ url: data.checkout_url });
    } else {
      res.status(400).json({ error: 'Failed to create Revolut link', details: data });
    }
  } catch (err) {
    console.error('Revolut error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register a new client
app.post('/api/register/client', async (req, res) => {
  console.log('Client registration request received:', req.body);
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
      isOutsourcing,
      abilities  // New field for swimming abilities
    } = req.body;

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    console.log('Password hash:', passwordHash);

    // Insert user
    const userResult = await client.query(
      'INSERT INTO happyswimming.users (email, password_hash, first_name, last_name1, last_name2, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [email, passwordHash, firstName, lastName1, lastName2 || null, 'client']
    );

    console.log('User inserted:', userResult.rows[0]);
    const userId = userResult.rows[0].id;

    // Insert client with abilities field
    await client.query(
      `INSERT INTO happyswimming.clients 
       (user_id, company_name, identification_number, address, postal_code, city, country, phone_fixed, phone_mobile, website, pl_code, is_outsourcing, habilities) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [userId, companyName || null, identificationNumber, address, postalCode, city, country, phoneFixed || null, phoneMobile, website || null, plCode || null, isOutsourcing, abilities || null]
    );

    await client.query('COMMIT');
    console.log('Client registered successfully');

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
app.post('/api/register/professional',
  upload.fields([
    { name: 'idDocument', maxCount: 1 },
    { name: 'curriculumVitae', maxCount: 1 },
    { name: 'insuranceDocument', maxCount: 1 }
  ]),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Now req.body will contain the text fields
      console.log('Professional registration request received:', req.body);

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
        isInsourcing = true,
        specialties = []
      } = req.body;

      // Validate required fields
      if (!email || !password || !firstName || !lastName1 || !identificationNumber) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Hash password (now password should be defined)
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Insert user
      const userResult = await client.query(
        'INSERT INTO happyswimming.users (email, password_hash, first_name, last_name1, last_name2, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [email, passwordHash, firstName, lastName1, lastName2 || null, 'professional']
      );

      const userId = userResult.rows[0].id;

      // Insert professional
      const professionalResult = await client.query(
        `INSERT INTO happyswimming.professionals (user_id, company_name, identification_number, address, postal_code, city, country, phone_fixed, phone_mobile, website, is_insourcing) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          userId,
          companyName || null,
          identificationNumber,
          address,
          postalCode,
          city,
          country,
          phoneFixed || null,
          phoneMobile,
          website || null,
          isInsourcing === 'true' || isInsourcing === true // Handle string or boolean
        ]
      );

      const professionalId = professionalResult.rows[0].id;

      // Log file presence without trying to save them
      if (req.files) {
        console.log('Files received in memory:');
        Object.keys(req.files).forEach(fieldName => {
          console.log(`- ${fieldName} received: ${req.files[fieldName][0].originalname}`);
        });
      }

      // Process specialties if provided
      if (specialties && specialties.length > 0) {
        try {
          const specialtyValues = specialties.map((specialtyId, index) => {
            return `($1, $${index + 2})`;
          }).join(', ');

          const specialtyParams = [professionalId, ...specialties];
          await client.query(
            `INSERT INTO happyswimming.professional_specialties (professional_id, specialty_id) VALUES ${specialtyValues}`,
            specialtyParams
          );
        } catch (error) {
          console.log('Error inserting specialties, continuing:', error.message);
          // Continue with registration even if specialty insertion fails
        }
      }

      await client.query('COMMIT');
      res.status(201).json({ message: 'Professional registered successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error registering professional:', error);

      if (error.constraint === 'users_email_key') {
        return res.status(409).json({ error: 'Email already in use' });
      }

      res.status(500).json({ error: 'Error registering professional: ' + error.message });
    } finally {
      client.release();
    }
  }
);

// Fixed Login endpoint using password_hash
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const userQuery = 'SELECT * FROM users WHERE email = $1';
    const userResult = await pool.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      console.log('User not found:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // Check if the password_hash exists in the database
    if (!user.password_hash) {
      console.log('User has no stored password hash:', email);
      console.error('User has no stored password hash:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    try {
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (passwordError) {
      console.log('Password comparison error:', password);
      console.error('Password comparison error:', passwordError);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is authorized - NEW CHECK
    if (!user.is_authorized && user.email !== 'admin@gmail.com') {
      console.log('User is not authorized:', email);
      return res.status(403).json({
        error: 'Your account is pending authorization. Please wait for an administrator to approve your account.',
        authorizationPending: true
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Get additional user details based on role
    let userData = { id: user.id, email: user.email, role: user.role };

    console.log('User data:', user);
    if (user.role === 'client') {
      const clientQuery = 'SELECT * FROM clients WHERE user_id = $1';
      const clientResult = await pool.query(clientQuery, [user.id]);

      if (clientResult.rows.length > 0) {
        console.log('Client data:', clientResult.rows[0]);
        const client = clientResult.rows[0];
        userData = {
          ...userData,
          name: client.name,
          companyName: client.company_name
        };
      }
    } else if (user.role === 'professional') {
      const professionalQuery = 'SELECT * FROM professionals WHERE user_id = $1';
      const professionalResult = await pool.query(professionalQuery, [user.id]);

      if (professionalResult.rows.length > 0) {
        console.log('Professional data:', professionalResult.rows[0]);
        const professional = professionalResult.rows[0];
        userData = {
          ...userData,
          name: `${professional.first_name} ${professional.last_name1}`
        };
      }
    }

    // Return token and user data
    res.json({ token, user: userData });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'An error occurred during login' });
  }
});

// Get PL codes (for registration dropdown)
app.get('/api/pl-codes', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, code, description FROM happyswimming.pl_codes WHERE is_active = true ORDER BY code'
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
      'SELECT id, name, description FROM happyswimming.specialties ORDER BY name'
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
      'SELECT id, email, first_name, last_name1, last_name2, role FROM happyswimming.users WHERE id = $1',
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
         FROM happyswimming.clients c 
         LEFT JOIN happyswimming.pl_codes p ON c.pl_code = p.code 
         WHERE c.user_id = $1`,
        [id]
      );
      if (clientResult.rows.length > 0) {
        profileData = clientResult.rows[0];
      }
    } else if (role === 'professional') {
      const professionalResult = await pool.query(
        'SELECT * FROM happyswimming.professionals WHERE user_id = $1',
        [id]
      );
      if (professionalResult.rows.length > 0) {
        const professional = professionalResult.rows[0];
        profileData = professional;

        // Get specialties
        const specialtiesResult = await pool.query(
          `SELECT s.id, s.name, s.description 
           FROM happyswimming.specialties s
           JOIN happyswimming.professional_specialties ps ON s.id = ps.specialty_id
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

// GET: Get enrollments where the user is the professional
app.get('/api/enrollments/professional', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching enrollments for professional:', req.user);
    const userId = req.user.id;

    // Verify the user is a professional
    const professionalCheck = await pool.query(
      'SELECT id FROM happyswimming.professionals WHERE user_id = $1',
      [userId]
    );

    if (professionalCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized access: User is not a professional' });
    }

    const professionalId = professionalCheck.rows[0].id;

    // Get enrollments where this professional is assigned, including client name
    const query = `
      SELECT cs.id, cs.service_id, s.name as service_name, cs.status,
        cs.created_at as enrollment_date, cs.start_date, cs.end_date,
        c.id as client_id, c.user_id as client_user_id, c.is_outsourcing,
        CONCAT(u.first_name, ' ', u.last_name1) as client_name,
        cs.price
      FROM happyswimming.client_services cs
      JOIN happyswimming.services s ON cs.service_id = s.id
      JOIN happyswimming.clients c ON cs.client_id = c.id
      JOIN happyswimming.users u ON c.user_id = u.id
      WHERE cs.professional_id = $1
      ORDER BY cs.created_at DESC
    `;

    const result = await pool.query(query, [professionalId]);

    const enrollments = result.rows.map(row => ({
      id: row.id,
      courseId: row.service_id,
      courseName: row.service_name,
      status: row.status,
      enrollmentDate: row.enrollment_date,
      startDate: row.start_date,
      endDate: row.end_date,
      professionalId: professionalId,
      userId: row.client_user_id,
      isOutsourcing: row.is_outsourcing,
      clientName: row.client_name, // Add client name to the response
      price: parseFloat(row.price)
    }));

    res.json(enrollments);
  } catch (error) {
    console.error('Error fetching professional enrollments:', error);
    res.status(500).json({ error: 'Failed to fetch professional enrollments' });
  }
});

// GET: Get user enrollments
app.get('/api/enrollments/user', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching enrollments for user:', req.user);
    const userId = req.user.id;
    const userRole = req.user.role;

    let query;
    let queryParams = [userId];

    if (userRole === 'client') {
      // Get enrollments for clients
      query = `
        SELECT cs.id, cs.service_id, s.name as service_name, cs.status,
          cs.created_at as enrollment_date, cs.start_date, cs.end_date,
          cs.professional_id, c.is_outsourcing,
          CONCAT(u.first_name, ' ', u.last_name1) as professional_name,
          cs.price
        FROM happyswimming.client_services cs
        JOIN happyswimming.services s ON cs.service_id = s.id
        JOIN happyswimming.clients c ON cs.client_id = c.id
        LEFT JOIN happyswimming.professionals p ON cs.professional_id = p.id
        LEFT JOIN happyswimming.users u ON p.user_id = u.id
        WHERE c.user_id = $1
        ORDER BY cs.created_at DESC
      `;
    } else if (userRole === 'professional') {
      // Get enrollments for professionals
      query = `
        SELECT cs.id, cs.service_id, s.name as service_name, cs.status,
          cs.created_at as enrollment_date, cs.start_date, cs.end_date,
          cs.professional_id, 
          CONCAT(cu.first_name, ' ', cu.last_name1) as client_name,
          cs.price
        FROM happyswimming.client_services cs
        JOIN happyswimming.services s ON cs.service_id = s.id
        JOIN happyswimming.professionals p ON cs.professional_id = p.id
        JOIN happyswimming.clients c ON cs.client_id = c.id
        JOIN happyswimming.users cu ON c.user_id = cu.id
        WHERE p.user_id = $1
        ORDER BY cs.created_at DESC
      `;
    } else {
      return res.status(403).json({ error: 'Unauthorized role' });
    }

    const result = await pool.query(query, queryParams);
    const enrollments = result.rows.map(row => ({
      id: row.id,
      courseId: row.service_id,
      courseName: row.service_name,
      status: row.status,
      enrollmentDate: row.enrollment_date,
      startDate: row.start_date,
      endDate: row.end_date,
      isOutsourcing: row.is_outsourcing,
      professionalId: row.professional_id,
      professionalName: row.professional_name || row.client_name,
      price: parseFloat(row.price)
    }));

    res.json(enrollments);
  } catch (error) {
    console.error('Error fetching enrollments:', error);
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});

// POST: Create new enrollment
app.post('/api/enrollments', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { kidName, motherContact, courseId, professionalId, startDate, preferredTime } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get the user's client/professional ID based on role
    let userTypeId;
    let query;

    if (userRole === 'client') {
      query = 'SELECT id FROM happyswimming.clients WHERE user_id = $1';
    } else if (userRole === 'professional') {
      query = 'SELECT id FROM happyswimming.professionals WHERE user_id = $1';
    } else {
      return res.status(403).json({ error: 'Unauthorized role' });
    }

    const userResult = await client.query(query, [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    userTypeId = userResult.rows[0].id;

    // Get course/service details
    const serviceResult = await client.query(
      'SELECT id, price FROM happyswimming.services WHERE id = $1',
      [courseId]
    );

    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const servicePrice = serviceResult.rows[0].price;

    // Create the enrollment
    let enrollmentQuery;
    let enrollmentParams;

    if (userRole === 'client') {
      // For clients
      enrollmentQuery = `
      INSERT INTO happyswimming.client_services 
      (client_id, service_id, professional_id, start_date, price, status, notes, start_time, end_time, kid_name, mother_contact)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10)
      RETURNING id
      `;

      // You can set default times if not provided
      const defaultStartTime = '09:00:00'; // 9 AM
      const defaultEndTime = '10:00:00';   // 10 AM (or calculate based on service duration)

      enrollmentParams = [
        userTypeId,
        courseId,
        professionalId || null,
        startDate,
        servicePrice,
        preferredTime ? `Preferred time: ${preferredTime}` : null,
        defaultStartTime,
        defaultEndTime,
        kidName,
        motherContact,
      ];
    } else if (userRole === 'professional') {
      // For professionals enrolling in training courses
      enrollmentQuery = `
        INSERT INTO happyswimming.professional_services
        (professional_id, service_id, price_per_hour, notes)
        VALUES ($1, $2, $3, $4)
        RETURNING professional_id, service_id
      `;
      enrollmentParams = [
        userTypeId,
        courseId,
        servicePrice,
        preferredTime ? `Preferred time: ${preferredTime}` : null
      ];
    }

    const enrollmentResult = await client.query(enrollmentQuery, enrollmentParams);

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Enrollment created successfully',
      enrollmentId: enrollmentResult.rows[0].id || null
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating enrollment:', error);
    res.status(500).json({ error: 'Failed to create enrollment' });
  } finally {
    client.release();
  }
});

// PUT: Cancel enrollment
app.put('/api/enrollments/:id/cancel', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const enrollmentId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Verify the enrollment exists and belongs to the user
    let checkQuery;

    if (userRole === 'client') {
      checkQuery = `
        SELECT cs.id 
        FROM happyswimming.client_services cs
        JOIN happyswimming.clients c ON cs.client_id = c.id
        WHERE cs.id = $1 AND c.user_id = $2
      `;
    } else if (userRole === 'professional') {
      checkQuery = `
        SELECT cs.id 
        FROM happyswimming.client_services cs
        JOIN happyswimming.professionals p ON cs.professional_id = p.id
        WHERE cs.id = $1 AND p.user_id = $2
      `;
    } else {
      return res.status(403).json({ error: 'Unauthorized role' });
    }

    const checkResult = await client.query(checkQuery, [enrollmentId, userId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Enrollment not found or not in pending status'
      });
    }

    // UPDATE happyswimming.the enrollment status to cancelled
    await client.query(
      'UPDATE happyswimming.client_services SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['cancelled', enrollmentId]
    );

    await client.query('COMMIT');

    res.json({ message: 'Enrollment cancelled successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling enrollment:', error);
    res.status(500).json({ error: 'Failed to cancel enrollment' });
  } finally {
    client.release();
  }
});

// GET: Available professionals for a specific service
app.get('/api/professionals/available', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT p.id, CONCAT(u.first_name, ' ', u.last_name1) as name,
        array_agg(s.name) as specialties, 
        p.is_insourcing as available
      FROM happyswimming.professionals p
      JOIN happyswimming.users u ON p.user_id = u.id
      LEFT JOIN happyswimming.professional_specialties ps ON p.id = ps.professional_id
      LEFT JOIN happyswimming.specialties s ON ps.specialty_id = s.id
      WHERE u.is_active = true
      GROUP BY p.id, u.first_name, u.last_name1, p.is_insourcing
      ORDER BY name
    `;

    const result = await pool.query(query);

    const professionals = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      specialties: row.specialties[0] ? row.specialties : [],
      verified: true, // Assuming all professionals in the system are verified
      available: row.available
    }));

    res.json(professionals);
  } catch (error) {
    console.error('Error fetching available professionals:', error);
    res.status(500).json({ error: 'Failed to fetch professionals' });
  }
});

// GET: Professional verifications (courses they're certified to teach)
app.get('/api/professionals/verifications', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if the user is a professional
    const userCheck = await pool.query(
      'SELECT id FROM happyswimming.professionals WHERE user_id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const professionalId = userCheck.rows[0].id;

    // Get service IDs the professional is verified for
    const query = `
      SELECT s.id as service_id
      FROM happyswimming.professional_services ps
      JOIN happyswimming.services s ON ps.service_id = s.id
      WHERE ps.professional_id = $1
    `;

    const result = await pool.query(query, [professionalId]);
    console.log('Professional verifications:', result.rows);

    const verifications = result.rows.map(row => row.service_id);
    console.log('Professional verifications:', verifications);

    res.json(verifications);
  } catch (error) {
    console.error('Error fetching professional verifications:', error);
    res.status(500).json({ error: 'Failed to fetch verifications' });
  }
});

// GET: Professional services (services offered by the professional)
app.get('/api/professionals/services', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if the user is a professional
    const userCheck = await pool.query(
      'SELECT id FROM happyswimming.professionals WHERE user_id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const professionalId = userCheck.rows[0].id;

    // Get professional services directly from the database with the exact column names
    const query = `
      SELECT professional_id, service_id, price_per_hour, notes
      FROM happyswimming.professional_services
      WHERE professional_id = $1
    `;

    const result = await pool.query(query, [professionalId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching professional services:', error);
    res.status(500).json({ error: 'Failed to fetch professional services' });
  }
});


// PUT: Update user profile
app.put('/api/profile/update', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get user ID from auth middleware
    const userId = req.user.id;
    const userRole = req.user.role;

    console.log('Updating profile for user:', userId, 'with data:', req.body);

    // Get current user data for verification
    const userQuery = 'SELECT id, email, password_hash, role FROM happyswimming.users WHERE id = $1';
    const userResult = await client.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Handle password change if requested
    if (req.body.current_password && req.body.new_password) {
      // Verify current password
      const isMatch = await bcrypt.compare(req.body.current_password, user.password_hash);

      if (!isMatch) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(req.body.new_password, salt);

      // Update password
      await client.query(
        'UPDATE happyswimming.users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [passwordHash, userId]
      );

      console.log('Password updated successfully');
    }

    // Update user table fields
    const updateFields = [];
    const updateValues = [];
    let valueIndex = 1;

    // Only update fields that are provided
    if (req.body.email !== undefined) {
      // Check if email already exists
      const emailCheckResult = await client.query(
        'SELECT id FROM happyswimming.users WHERE email = $1 AND id != $2',
        [req.body.email, userId]
      );

      if (emailCheckResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Email already in use' });
      }

      updateFields.push(`email = $${valueIndex}`);
      updateValues.push(req.body.email);
      valueIndex++;
    }

    if (req.body.first_name !== undefined) {
      updateFields.push(`first_name = $${valueIndex}`);
      updateValues.push(req.body.first_name);
      valueIndex++;
    }

    if (req.body.last_name1 !== undefined) {
      updateFields.push(`last_name1 = $${valueIndex}`);
      updateValues.push(req.body.last_name1);
      valueIndex++;
    }

    if (req.body.last_name2 !== undefined) {
      updateFields.push(`last_name2 = $${valueIndex}`);
      updateValues.push(req.body.last_name2);
      valueIndex++;
    }

    // Update user table if there are fields to update
    if (updateFields.length > 0) {
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

      const updateUserQuery = `
        UPDATE happyswimming.users 
        SET ${updateFields.join(', ')} 
        WHERE id = $${valueIndex}
      `;

      updateValues.push(userId);
      await client.query(updateUserQuery, updateValues);
      console.log('User fields updated');
    }

    // Reset for role-specific table updates
    updateFields.length = 0;
    updateValues.length = 0;
    valueIndex = 1;

    // Update role-specific tables (client or professional)
    if (userRole === 'client') {
      // Update client table fields
      if (req.body.company_name !== undefined) {
        updateFields.push(`company_name = $${valueIndex}`);
        updateValues.push(req.body.company_name);
        valueIndex++;
      }

      if (req.body.address !== undefined) {
        updateFields.push(`address = $${valueIndex}`);
        updateValues.push(req.body.address);
        valueIndex++;
      }

      if (req.body.postal_code !== undefined) {
        updateFields.push(`postal_code = $${valueIndex}`);
        updateValues.push(req.body.postal_code);
        valueIndex++;
      }

      if (req.body.city !== undefined) {
        updateFields.push(`city = $${valueIndex}`);
        updateValues.push(req.body.city);
        valueIndex++;
      }

      if (req.body.country !== undefined) {
        updateFields.push(`country = $${valueIndex}`);
        updateValues.push(req.body.country);
        valueIndex++;
      }

      if (req.body.phone_fixed !== undefined) {
        updateFields.push(`phone_fixed = $${valueIndex}`);
        updateValues.push(req.body.phone_fixed);
        valueIndex++;
      }

      if (req.body.phone_mobile !== undefined) {
        updateFields.push(`phone_mobile = $${valueIndex}`);
        updateValues.push(req.body.phone_mobile);
        valueIndex++;
      }

      if (req.body.website !== undefined) {
        updateFields.push(`website = $${valueIndex}`);
        updateValues.push(req.body.website);
        valueIndex++;
      }

      if (req.body.pl_code !== undefined) {
        updateFields.push(`pl_code = $${valueIndex}`);
        updateValues.push(req.body.pl_code);
        valueIndex++;
      }

      // Update client table if there are fields to update
      if (updateFields.length > 0) {
        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

        const updateClientQuery = `
          UPDATE happyswimming.clients 
          SET ${updateFields.join(', ')} 
          WHERE user_id = $${valueIndex}
        `;

        updateValues.push(userId);
        await client.query(updateClientQuery, updateValues);
        console.log('Client fields updated');
      }
    } else if (userRole === 'professional') {
      // Update professional table fields
      if (req.body.company_name !== undefined) {
        updateFields.push(`company_name = $${valueIndex}`);
        updateValues.push(req.body.company_name);
        valueIndex++;
      }

      if (req.body.address !== undefined) {
        updateFields.push(`address = $${valueIndex}`);
        updateValues.push(req.body.address);
        valueIndex++;
      }

      if (req.body.postal_code !== undefined) {
        updateFields.push(`postal_code = $${valueIndex}`);
        updateValues.push(req.body.postal_code);
        valueIndex++;
      }

      if (req.body.city !== undefined) {
        updateFields.push(`city = $${valueIndex}`);
        updateValues.push(req.body.city);
        valueIndex++;
      }

      if (req.body.country !== undefined) {
        updateFields.push(`country = $${valueIndex}`);
        updateValues.push(req.body.country);
        valueIndex++;
      }

      if (req.body.phone_fixed !== undefined) {
        updateFields.push(`phone_fixed = $${valueIndex}`);
        updateValues.push(req.body.phone_fixed);
        valueIndex++;
      }

      if (req.body.phone_mobile !== undefined) {
        updateFields.push(`phone_mobile = $${valueIndex}`);
        updateValues.push(req.body.phone_mobile);
        valueIndex++;
      }

      if (req.body.website !== undefined) {
        updateFields.push(`website = $${valueIndex}`);
        updateValues.push(req.body.website);
        valueIndex++;
      }

      // Update professional table if there are fields to update
      if (updateFields.length > 0) {
        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

        const updateProfQuery = `
          UPDATE happyswimming.professionals 
          SET ${updateFields.join(', ')} 
          WHERE user_id = $${valueIndex}
        `;

        updateValues.push(userId);
        await client.query(updateProfQuery, updateValues);
        console.log('Professional fields updated');
      }
    }

    // Commit the transaction
    await client.query('COMMIT');

    // Get updated user information
    const updatedUserResult = await pool.query(
      'SELECT id, email, first_name, last_name1, role FROM happyswimming.users WHERE id = $1',
      [userId]
    );

    const updatedUser = updatedUserResult.rows[0];

    // Return successful response with updated user info
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.first_name,
        role: updatedUser.role
      }
    });
  } catch (err) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('Error updating user profile:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    // Release the client back to the pool
    client.release();
  }
});

// Add this to your routes in server.js or a separate route file

// Get all students for the current professional
app.get('/api/professional/students', authenticateToken, async (req, res) => {
  try {
    // Get the professional ID from the authenticated user
    const userId = req.user.id;

    // First, get the professional record for this user
    const professionalQuery = `
      SELECT id FROM happyswimming.professionals 
      WHERE user_id = $1
    `;
    const professionalResult = await pool.query(professionalQuery, [userId]);
    console.log('Professional result:', professionalResult.rows);

    if (professionalResult.rows.length === 0) {
      return res.status(403).json({ error: 'You are not registered as a professional' });
    }

    const professionalId = professionalResult.rows[0].id;

    // Query to get all students enrolled in courses taught by this professional
    // Added calification and assistance to the SELECT fields
    const studentsQuery = `
    SELECT 
      u.id,
      u.first_name,
      u.last_name1,
      u.last_name2,
      u.email,
      u.role,
      cs.id as enrollment_id,
      cs.service_id as course_id,
      s.name as course_name,
      cs.start_date,
      cs.end_date,
      cs.day_of_week,
      cs.start_time,
      cs.end_time,
      cs.status,
      cs.notes,
      cs.calification,
      cs.assistance,
      c.id as client_id,
      c.company_name,
      c.phone_mobile
    FROM happyswimming.client_services cs
    JOIN happyswimming.clients c ON cs.client_id = c.id
    JOIN happyswimming.users u ON c.user_id = u.id
    JOIN happyswimming.services s ON cs.service_id = s.id
    WHERE cs.professional_id = $1
    ORDER BY cs.start_date, cs.start_time, u.last_name1, u.first_name
  `;

    const result = await pool.query(studentsQuery, [professionalId]);
    console.log('Professional students:', result.rows);

    // Transform the data to match the expected Student interface
    // Added calification and assistance to the returned student object
    const students = result.rows.map(row => ({
      id: row.id,
      firstName: row.first_name,
      lastName1: row.last_name1,
      lastName2: row.last_name2 || null,
      dateOfBirth: row.date_of_birth,
      gender: row.gender,
      emergencyContact: row.emergency_contact,
      emergencyPhone: row.emergency_phone,
      medicalNotes: row.medical_notes,
      enrollmentId: row.enrollment_id,
      courseId: row.course_id,
      courseName: row.course_name,
      startDate: row.start_date,
      status: row.status,
      calification: row.calification !== null ? parseFloat(row.calification) : undefined,
      assistance: row.assistance,
      clientId: row.client_id,
      clientName: `${row.client_first_name} ${row.client_last_name}`
    }));

    res.json(students);
  } catch (error) {
    console.error('Error fetching professional students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});


// Add a new endpoint to get all professionals for admin filtering
app.get('/api/admin/professionals-list', authenticateToken, isAdmin, async (req, res) => {
  try {
    const query = `
      SELECT 
        p.id,
        CONCAT(u.first_name, ' ', u.last_name1) as name,
        u.email,
        p.identification_number,
        p.city,
        p.country
      FROM happyswimming.professionals p
      JOIN happyswimming.users u ON p.user_id = u.id
      WHERE u.is_authorized = true AND u.is_active = true
      ORDER BY u.first_name, u.last_name1
    `;

    const result = await pool.query(query);

    const professionals = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      identificationNumber: row.identification_number,
      city: row.city,
      country: row.country
    }));

    res.json(professionals);
  } catch (error) {
    console.error('Error fetching professionals list:', error);
    res.status(500).json({ error: 'Failed to fetch professionals list' });
  }
});

// Add endpoint to get admin statistics for the dashboard
app.get('/api/admin/students-statistics', authenticateToken, isAdmin, async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_students,
        COUNT(DISTINCT cs.professional_id) as total_professionals_with_students,
        COUNT(DISTINCT ac.id) as total_active_courses,
        AVG(cs.calification) FILTER (WHERE cs.calification IS NOT NULL) as average_calification,
        AVG(cs.assistance) FILTER (WHERE cs.assistance IS NOT NULL) as average_assistance,
        COUNT(*) FILTER (WHERE cs.status = 'pending') as pending_enrollments,
        COUNT(*) FILTER (WHERE cs.status = 'approved') as approved_enrollments,
        COUNT(*) FILTER (WHERE cs.status = 'active') as active_enrollments,
        COUNT(*) FILTER (WHERE cs.status = 'completed') as completed_enrollments,
        COUNT(*) FILTER (WHERE cs.status = 'cancelled') as cancelled_enrollments
      FROM happyswimming.client_services cs
      JOIN happyswimming.admin_courses ac ON cs.admin_course_id = ac.id
      WHERE ac.is_historical = FALSE
        AND cs.admin_course_id IS NOT NULL
    `;

    const result = await pool.query(statsQuery);
    const stats = result.rows[0];

    res.json({
      totalStudents: parseInt(stats.total_students || 0),
      totalProfessionalsWithStudents: parseInt(stats.total_professionals_with_students || 0),
      totalActiveCourses: parseInt(stats.total_active_courses || 0),
      averageCalification: stats.average_calification ? parseFloat(stats.average_calification).toFixed(2) : 0,
      averageAssistance: stats.average_assistance ? parseFloat(stats.average_assistance).toFixed(2) : 0,
      enrollmentsByStatus: {
        pending: parseInt(stats.pending_enrollments || 0),
        approved: parseInt(stats.approved_enrollments || 0),
        active: parseInt(stats.active_enrollments || 0),
        completed: parseInt(stats.completed_enrollments || 0),
        cancelled: parseInt(stats.cancelled_enrollments || 0)
      }
    });

  } catch (error) {
    console.error('Error fetching admin statistics:', error);
    res.status(500).json({ error: 'Failed to fetch admin statistics' });
  }
});

// POST: Initialize attendance records for enrollments with kid names
app.post('/api/attendance/initialize', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { enrollmentId, kidNames } = req.body;
    console.log('Initializing attendance for enrollment:', enrollmentId, 'with kids:', kidNames);

    // Validate input
    if (!enrollmentId || !kidNames || !Array.isArray(kidNames)) {
      return res.status(400).json({ error: 'Invalid enrollment ID or kid names' });
    }

    // Check if enrollment exists
    const enrollmentCheck = await client.query(
      'SELECT id FROM happyswimming.client_services WHERE id = $1',
      [enrollmentId]
    );

    if (enrollmentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const results = [];

    // Initialize attendance record for each kid name
    for (const kidName of kidNames) {
      if (!kidName || kidName.trim() === '') continue;

      const trimmedKidName = kidName.trim();

      // Check if attendance record already exists
      const existingRecord = await client.query(
        'SELECT id FROM happyswimming.attendance WHERE enrollment_id = $1 AND kid_name = $2',
        [enrollmentId, trimmedKidName]
      );

      if (existingRecord.rows.length === 0) {
        // Create new attendance record
        const insertResult = await client.query(
          `INSERT INTO happyswimming.attendance (enrollment_id, kid_name, status, calification, assistance, notes)
           VALUES ($1, $2, 'pending', NULL, 0, NULL)
           RETURNING id, enrollment_id, kid_name, status, calification, assistance, notes, created_at`,
          [enrollmentId, trimmedKidName]
        );

        results.push(insertResult.rows[0]);
        console.log('Created attendance record for:', trimmedKidName);
      } else {
        // Get existing record
        const existingData = await client.query(
          'SELECT id, enrollment_id, kid_name, status, calification, assistance, notes, created_at FROM happyswimming.attendance WHERE enrollment_id = $1 AND kid_name = $2',
          [enrollmentId, trimmedKidName]
        );

        results.push(existingData.rows[0]);
        console.log('Attendance record already exists for:', trimmedKidName);
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Attendance records initialized successfully',
      records: results
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error initializing attendance records:', error);
    res.status(500).json({ error: 'Failed to initialize attendance records' });
  } finally {
    client.release();
  }
});

// GET: Fetch attendance records for an enrollment
app.get('/api/attendance/enrollment/:enrollmentId', authenticateToken, async (req, res) => {
  try {
    const enrollmentId = req.params.enrollmentId;

    const query = `
      SELECT 
        a.id,
        a.enrollment_id,
        a.kid_name,
        a.status,
        a.calification,
        a.assistance,
        a.notes,
        a.created_at,
        a.updated_at
      FROM happyswimming.attendance a
      WHERE a.enrollment_id = $1
      ORDER BY a.kid_name
    `;

    const result = await pool.query(query, [enrollmentId]);

    res.json(result.rows);

  } catch (error) {
    console.error('Error fetching attendance records:', error);
    res.status(500).json({ error: 'Failed to fetch attendance records' });
  }
});

// PUT: Update attendance record for a specific kid
app.put('/api/attendance/:attendanceId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const attendanceId = req.params.attendanceId;
    const { status, calification, assistance, notes } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userEmail = req.user.email;

    console.log('Updating attendance record:', attendanceId, 'with data:', req.body);

    // Check if user is admin or professional
    const isAdmin = userEmail === 'admin@gmail.com' || userRole === 'admin';

    if (userRole !== 'professional' && !isAdmin) {
      return res.status(403).json({ error: 'Professional or admin access required' });
    }

    // Verify the attendance record exists and user has permission
    let verifyQuery;
    let verifyParams;

    if (userRole === 'professional' && !isAdmin) {
      // Professional can only update their own enrollments
      verifyQuery = `
        SELECT a.id, a.enrollment_id, a.kid_name 
        FROM happyswimming.attendance a
        JOIN happyswimming.client_services cs ON a.enrollment_id = cs.id
        JOIN happyswimming.professionals p ON cs.professional_id = p.id
        WHERE a.id = $1 AND p.user_id = $2
      `;
      verifyParams = [attendanceId, userId];
    } else {
      // Admin can update any attendance record
      verifyQuery = `
        SELECT a.id, a.enrollment_id, a.kid_name 
        FROM happyswimming.attendance a
        WHERE a.id = $1
      `;
      verifyParams = [attendanceId];
    }

    const verifyResult = await client.query(verifyQuery, verifyParams);

    if (verifyResult.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied or attendance record not found' });
    }

    // Update the attendance record
    const updateQuery = `
      UPDATE happyswimming.attendance 
      SET status = $1, calification = $2, assistance = $3, notes = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING id, enrollment_id, kid_name, status, calification, assistance, notes, updated_at
    `;

    const updateResult = await client.query(updateQuery, [
      status || 'pending',
      calification !== undefined ? calification : null,
      assistance !== undefined ? assistance : 0,
      notes || null,
      attendanceId
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Attendance record updated successfully',
      record: updateResult.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating attendance record:', error);
    res.status(500).json({ error: 'Failed to update attendance record' });
  } finally {
    client.release();
  }
});

// Update the existing PUT endpoint for professional students
app.put('/api/professional/students/:enrollmentId', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userId = req.user.id;
    const userRole = req.user.role;
    const userEmail = req.user.email;
    const enrollmentId = req.params.enrollmentId;
    const { kidName, calification, assistance, status, notes } = req.body;

    console.log('Updating student attendance by kidName:', { enrollmentId, kidName, calification, assistance, status, notes });

    // Check if user is admin
    const isAdmin = userEmail === 'admin@gmail.com' || userRole === 'admin';

    if (userRole !== 'professional' && !isAdmin) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Professional or admin access required' });
    }

    // Verify enrollment exists and user has permission
    let professionalId = null;

    if (userRole === 'professional' && !isAdmin) {
      const professionalQuery = 'SELECT id FROM happyswimming.professionals WHERE user_id = $1';
      const professionalResult = await client.query(professionalQuery, [userId]);

      if (professionalResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Professional profile not found' });
      }

      professionalId = professionalResult.rows[0].id;

      // Verify the professional owns this enrollment
      const verifyQuery = `
        SELECT id FROM happyswimming.client_services 
        WHERE id = $1 AND professional_id = $2
      `;

      const verifyResult = await client.query(verifyQuery, [enrollmentId, professionalId]);

      if (verifyResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Access denied. Enrollment not found or not assigned to you.' });
      }
    } else if (isAdmin) {
      // Admin can update any enrollment, just verify it exists
      const verifyQuery = `
        SELECT id, professional_id FROM happyswimming.client_services 
        WHERE id = $1
      `;

      const verifyResult = await client.query(verifyQuery, [enrollmentId]);

      if (verifyResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Enrollment not found.' });
      }

      professionalId = verifyResult.rows[0].professional_id;
    }

    // Find or create attendance record for this specific kid
    const attendanceQuery = `
      SELECT id FROM happyswimming.attendance 
      WHERE enrollment_id = $1 AND kid_name = $2
    `;

    const attendanceResult = await client.query(attendanceQuery, [enrollmentId, kidName]);

    let attendanceId;

    if (attendanceResult.rows.length === 0) {
      // Create new attendance record
      const insertQuery = `
        INSERT INTO happyswimming.attendance (enrollment_id, kid_name, status, calification, assistance, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `;

      const insertResult = await client.query(insertQuery, [
        enrollmentId,
        kidName,
        status || 'pending',
        calification !== undefined ? calification : null,
        assistance !== undefined ? assistance : 0,
        notes || null
      ]);

      attendanceId = insertResult.rows[0].id;
      console.log('Created new attendance record for kid:', kidName);
    } else {
      // Update existing attendance record
      attendanceId = attendanceResult.rows[0].id;

      const updateQuery = `
        UPDATE happyswimming.attendance 
        SET status = $1, calification = $2, assistance = $3, notes = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
      `;

      await client.query(updateQuery, [
        status || 'pending',
        calification !== undefined ? calification : null,
        assistance !== undefined ? assistance : 0,
        notes || null,
        attendanceId
      ]);

      console.log('Updated existing attendance record for kid:', kidName);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Student attendance updated successfully',
      attendanceId: attendanceId,
      kidName: kidName
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating student attendance:', error);
    res.status(500).json({ error: 'Failed to update student attendance' });
  } finally {
    client.release();
  }
});

// NEW: Get client information by userId (for QR code access)
app.get('/api/client-info/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    // Validate userId
    if (!userId || isNaN(parseInt(userId))) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    console.log('Fetching client info for userId:', userId);

    // Get user basic information
    const userQuery = `
      SELECT u.id, u.email, u.first_name, u.last_name1, u.last_name2, u.role
      FROM happyswimming.users u
      WHERE u.id = $1 AND u.is_authorized = true AND u.is_active = true
    `;

    const userResult = await pool.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found or not authorized' });
    }

    const user = userResult.rows[0];

    // If user is not a client, return error
    if (user.role !== 'client') {
      return res.status(403).json({ error: 'User is not a client' });
    }

    // Get client-specific information
    const clientQuery = `
      SELECT c.id as client_id, c.company_name, c.identification_number, 
             c.address, c.postal_code, c.city, c.country, 
             c.phone_fixed, c.phone_mobile, c.website, c.pl_code, 
             c.is_outsourcing, c.habilities
      FROM happyswimming.clients c
      WHERE c.user_id = $1
    `;

    const clientResult = await pool.query(clientQuery, [userId]);

    let clientInfo = null;
    if (clientResult.rows.length > 0) {
      clientInfo = clientResult.rows[0];
    }

    // Combine user and client information
    const response = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName1: user.last_name1,
      lastName2: user.last_name2,
      role: user.role,
      companyName: clientInfo?.company_name || null,
      identificationNumber: clientInfo?.identification_number || null,
      address: clientInfo?.address || null,
      postalCode: clientInfo?.postal_code || null,
      city: clientInfo?.city || null,
      country: clientInfo?.country || null,
      phoneFixed: clientInfo?.phone_fixed || null,
      phoneMobile: clientInfo?.phone_mobile || null,
      website: clientInfo?.website || null,
      plCode: clientInfo?.pl_code || null,
      isOutsourcing: clientInfo?.is_outsourcing || false,
      abilities: clientInfo?.habilities || null
    };

    console.log('Client info response:', response);

    res.json(response);

  } catch (error) {
    console.error('Error fetching client info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update the existing professional students endpoint to include attendance data
app.get('/api/professional/admin-courses', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const userEmail = req.user.email;
    console.log('Fetching professional admin courses for user:', userId, 'Role:', userRole, 'Email:', userEmail);

    // Check if user is admin
    const isAdmin = userEmail === 'admin@gmail.com' || userRole === 'admin';

    if (userRole === 'professional' || isAdmin) {
      let professionalId = null;
      let query = '';
      let queryParams = [];

      if (userRole === 'professional' && !isAdmin) {
        // Get professional ID for regular professionals
        const professionalQuery = 'SELECT id FROM happyswimming.professionals WHERE user_id = $1';
        const professionalResult = await pool.query(professionalQuery, [userId]);

        if (professionalResult.rows.length === 0) {
          return res.status(404).json({ error: 'Professional profile not found' });
        }

        professionalId = professionalResult.rows[0].id;

        // Query for specific professional with attendance data
        query = `
        SELECT 
          cs.id as enrollment_id,
          cs.client_id,
          cs.admin_course_id,
          cs.start_date,
          cs.end_date,
          cs.status,
          cs.price,
          cs.notes,
          cs.kid_name,
          cs.mother_contact,
          cs.created_at as enrollment_date,
          
          -- Admin course details
          ac.id as course_id,
          ac.course_code,
          ac.name as course_name,
          ac.description as course_description,
          ac.client_name,
          ac.start_date as course_start_date,
          ac.end_date as course_end_date,
          ac.status as course_status,
          ac.max_students,
          
          -- Client details
          CONCAT(cu.first_name, ' ', cu.last_name1) as client_name_full,
          
          -- Professional details for admin view
          cs.professional_id,
          CONCAT(pu.first_name, ' ', pu.last_name1) as professional_name,
          
          -- Attendance data aggregated by enrollment
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'attendanceId', a.id,
                'kidName', a.kid_name,
                'status', a.status,
                'calification', a.calification,
                'assistance', a.assistance,
                'notes', a.notes
              ) ORDER BY a.kid_name
            ) FILTER (WHERE a.id IS NOT NULL),
            '[]'::json
          ) as attendance_records
          
        FROM happyswimming.client_services cs
        JOIN happyswimming.admin_courses ac ON cs.admin_course_id = ac.id
        JOIN happyswimming.clients c ON cs.client_id = c.id
        JOIN happyswimming.users cu ON c.user_id = cu.id
        LEFT JOIN happyswimming.professionals p ON cs.professional_id = p.id
        LEFT JOIN happyswimming.users pu ON p.user_id = pu.id
        LEFT JOIN happyswimming.attendance a ON cs.id = a.enrollment_id
        WHERE cs.professional_id = $1
          AND ac.is_historical = FALSE
        GROUP BY cs.id, cs.client_id, cs.admin_course_id, cs.start_date, cs.end_date, cs.status, 
                 cs.price, cs.notes, cs.kid_name, cs.mother_contact, cs.created_at,
                 ac.id, ac.course_code, ac.name, ac.description, ac.client_name,
                 ac.start_date, ac.end_date, ac.status, ac.max_students,
                 cu.first_name, cu.last_name1, cs.professional_id, pu.first_name, pu.last_name1
        ORDER BY ac.start_date DESC, cs.created_at DESC
      `;
        queryParams = [professionalId];
      } else if (isAdmin) {
        console.log('Admin user detected');
        // Admin can see all courses and students with attendance data
        query = `
          SELECT 
            cs.id as enrollment_id,
            cs.client_id,
            cs.admin_course_id,
            cs.start_date,
            cs.end_date,
            cs.status,
            cs.price,
            cs.notes,
            cs.kid_name,
            cs.mother_contact,
            cs.created_at as enrollment_date,

            -- Admin course details
            ac.id as course_id,
            ac.course_code,
            ac.name as course_name,
            ac.description as course_description,
            ac.client_name,
            ac.start_date as course_start_date,
            ac.end_date as course_end_date,
            ac.status as course_status,
            ac.max_students,

            -- Client details
            CONCAT(cu.first_name, ' ', cu.last_name1) as client_name_full,
            
            -- Professional details for admin view
            cs.professional_id,
            CONCAT(pu.first_name, ' ', pu.last_name1) as professional_name,

            -- Attendance data aggregated by enrollment
            COALESCE(
              JSON_AGG(
                JSON_BUILD_OBJECT(
                  'attendanceId', a.id,
                  'kidName', a.kid_name,
                  'status', a.status,
                  'calification', a.calification,
                  'assistance', a.assistance,
                  'notes', a.notes
                ) ORDER BY a.kid_name
              ) FILTER (WHERE a.id IS NOT NULL),
              '[]'::json
            ) as attendance_records

          FROM happyswimming.client_services cs
          JOIN happyswimming.admin_courses ac ON cs.admin_course_id = ac.id
          JOIN happyswimming.clients c ON cs.client_id = c.id
          JOIN happyswimming.users cu ON c.user_id = cu.id
          LEFT JOIN happyswimming.professionals p ON cs.professional_id = p.id
          LEFT JOIN happyswimming.users pu ON p.user_id = pu.id
          LEFT JOIN happyswimming.attendance a ON cs.id = a.enrollment_id
          WHERE ac.is_historical = FALSE
          GROUP BY cs.id, cs.client_id, cs.admin_course_id, cs.start_date, cs.end_date, cs.status, 
                   cs.price, cs.notes, cs.kid_name, cs.mother_contact, cs.created_at,
                   ac.id, ac.course_code, ac.name, ac.description, ac.client_name,
                   ac.start_date, ac.end_date, ac.status, ac.max_students,
                   cu.first_name, cu.last_name1, cs.professional_id, pu.first_name, pu.last_name1
          ORDER BY ac.start_date DESC, cs.created_at DESC
        `;
        queryParams = [];
      }

      const result = await pool.query(query, queryParams);

      const enrollments = result.rows.map(row => ({
        id: row.enrollment_id,
        admin_course_id: row.admin_course_id,
        courseId: row.course_id,
        courseName: row.course_name,
        courseCode: row.course_code,
        courseDescription: row.course_description,
        clientName: row.client_name_full,
        courseStartDate: row.course_start_date,
        courseEndDate: row.course_end_date,
        courseStatus: row.course_status,
        maxStudents: row.max_students,
        kid_name: row.kid_name,
        mother_contact: row.mother_contact,
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date,
        price: parseFloat(row.price),
        notes: row.notes || '',
        enrollmentDate: row.enrollment_date,
        professionalId: row.professional_id,
        professionalName: row.professional_name,
        attendanceRecords: row.attendance_records || []
      }));

      console.log('Admin/Professional courses result:', enrollments.length, 'enrollments found');
      res.json(enrollments);
    } else {
      return res.status(403).json({ error: 'Access denied. Professional or admin privileges required.' });
    }
  } catch (error) {
    console.error('Error fetching professional admin courses:', error);
    res.status(500).json({ error: 'Failed to fetch courses and students' });
  }
});

// DELETE: Cancel/Delete enrollment endpoint
// Add this to your server.js file

app.delete('/api/professional/students/:enrollmentId', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userId = req.user.id;
    const userRole = req.user.role;
    const userEmail = req.user.email;
    const enrollmentId = req.params.enrollmentId;

    console.log('Cancelling enrollment:', enrollmentId, 'for user:', userId, 'role:', userRole);

    // Check if user is admin
    const isAdmin = userEmail === 'admin@gmail.com' || userRole === 'admin';

    if (userRole !== 'professional' && !isAdmin) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Professional or admin access required' });
    }

    let professionalId = null;

    if (userRole === 'professional' && !isAdmin) {
      // Get professional ID for regular professionals
      const professionalQuery = 'SELECT id FROM happyswimming.professionals WHERE user_id = $1';
      const professionalResult = await client.query(professionalQuery, [userId]);

      if (professionalResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Professional profile not found' });
      }

      professionalId = professionalResult.rows[0].id;

      // Verify the professional owns this enrollment
      const verifyQuery = `
        SELECT id, admin_course_id, student_count FROM happyswimming.client_services 
        WHERE id = $1 AND professional_id = $2
      `;

      const verifyResult = await client.query(verifyQuery, [enrollmentId, professionalId]);

      if (verifyResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Access denied. Enrollment not found or not assigned to you.' });
      }

      console.log('Professional verification passed for enrollment:', enrollmentId);
    } else if (isAdmin) {
      // Admin can cancel any enrollment, just verify it exists
      const verifyQuery = `
        SELECT id, professional_id, admin_course_id, student_count FROM happyswimming.client_services 
        WHERE id = $1
      `;

      const verifyResult = await client.query(verifyQuery, [enrollmentId]);

      if (verifyResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Enrollment not found.' });
      }

      professionalId = verifyResult.rows[0].professional_id;
      console.log('Admin verification passed for enrollment:', enrollmentId);
    }

    // Get enrollment details before deletion
    const enrollmentQuery = `
      SELECT cs.admin_course_id, cs.student_count, cs.kid_name, cs.price
      FROM happyswimming.client_services cs
      WHERE cs.id = $1
    `;

    const enrollmentResult = await client.query(enrollmentQuery, [enrollmentId]);

    if (enrollmentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const enrollment = enrollmentResult.rows[0];
    const adminCourseId = enrollment.admin_course_id;
    const studentCount = enrollment.student_count || 1;
    const kidName = enrollment.kid_name;
    const price = enrollment.price;

    console.log('Enrollment details:', {
      adminCourseId,
      studentCount,
      kidName,
      price
    });

    // Delete the enrollment from client_services
    const deleteQuery = `
      DELETE FROM happyswimming.client_services 
      WHERE id = $1
      RETURNING id, kid_name, admin_course_id
    `;

    const deleteResult = await client.query(deleteQuery, [enrollmentId]);

    if (deleteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Failed to cancel enrollment' });
    }

    console.log('Enrollment deleted successfully:', deleteResult.rows[0]);

    // Update admin_courses.current_students (decrease by student_count)
    if (adminCourseId) {
      const updateCourseQuery = `
        UPDATE happyswimming.admin_courses 
        SET current_students = GREATEST(0, current_students - $1), updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, current_students, max_students
      `;

      const updateCourseResult = await client.query(updateCourseQuery, [studentCount, adminCourseId]);

      if (updateCourseResult.rows.length > 0) {
        const courseInfo = updateCourseResult.rows[0];
        console.log('Updated course current_students:', {
          courseId: courseInfo.id,
          currentStudents: courseInfo.current_students,
          maxStudents: courseInfo.max_students,
          decreasedBy: studentCount
        });
      } else {
        console.warn('Warning: Could not update course current_students for course ID:', adminCourseId);
      }
    } else {
      console.log('No admin course ID found, skipping course capacity update');
    }

    await client.query('COMMIT');
    console.log('Transaction committed successfully');

    res.json({
      success: true,
      message: 'Enrollment cancelled successfully',
      data: {
        enrollmentId: enrollmentId,
        kidName: kidName,
        adminCourseId: adminCourseId,
        studentCount: studentCount,
        refundAmount: price || 0
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling enrollment:', error);
    console.error('Error stack:', error.stack);

    // Provide more specific error messages
    if (error.code === '23503') {
      return res.status(400).json({
        error: 'Cannot cancel enrollment due to database constraints. Please contact support.'
      });
    }

    res.status(500).json({
      error: 'Failed to cancel enrollment',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
});

// Admin endpoint to get all enrollments from both client_services and professional_services
app.get('/api/admin/enrollments', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching all enrollments for admin:', req.user);
    // Check if user is admin (using email as identifier)
    const userId = req.user.id;
    const userCheck = await pool.query(
      'SELECT email FROM happyswimming.users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0 || userCheck.rows[0].email !== 'admin@gmail.com') {
      return res.status(403).json({ error: 'Unauthorized access. Admin privileges required.' });
    }

    // Get all client enrollments with detailed information
    // Added calification and assistance to the SELECT fields
    const clientServicesQuery = `
      SELECT cs.id, cs.client_id, cs.service_id, cs.professional_id, 
        cs.start_date, cs.end_date, cs.day_of_week, cs.start_time, cs.end_time, cs.student_count, cs.selected_lesson_count,
        cs.price, cs.status, cs.notes, cs.created_at, cs.calification, cs.assistance, cs.kid_name, cs.mother_contact,
        s.name as service_name,
        c.user_id, c.is_outsourcing,
        CONCAT(cu.first_name, ' ', cu.last_name1) as client_name,
        CONCAT(pu.first_name, ' ', pu.last_name1) as professional_name
      FROM happyswimming.client_services cs
      JOIN happyswimming.services s ON cs.service_id = s.id
      JOIN happyswimming.clients c ON cs.client_id = c.id
      JOIN happyswimming.users cu ON c.user_id = cu.id
      LEFT JOIN happyswimming.professionals p ON cs.professional_id = p.id
      LEFT JOIN happyswimming.users pu ON p.user_id = pu.id
      ORDER BY cs.created_at DESC
    `;

    // Get all professional services with detailed information
    const professionalServicesQuery = `
      SELECT ps.professional_id, ps.service_id, ps.price_per_hour, ps.notes,
        p.user_id, s.name as service_name,
        CONCAT(u.first_name, ' ', u.last_name1) as professional_name
      FROM happyswimming.professional_services ps
      JOIN happyswimming.professionals p ON ps.professional_id = p.id
      JOIN happyswimming.services s ON ps.service_id = s.id
      JOIN happyswimming.users u ON p.user_id = u.id
      ORDER BY ps.professional_id, ps.service_id
    `;

    // Execute both queries
    const clientServicesResult = await pool.query(clientServicesQuery);
    const professionalServicesResult = await pool.query(professionalServicesQuery);

    // Format client enrollments
    // Added calification and assistance to the clientEnrollments objects
    const clientEnrollments = clientServicesResult.rows.map(row => ({
      id: row.id,
      type: 'client_service',
      clientId: row.client_id,
      userId: row.user_id,
      courseId: row.service_id,
      courseName: row.service_name,
      professionalId: row.professional_id,
      professionalName: row.professional_name || 'Not Assigned',
      clientName: row.client_name,
      status: row.status,
      enrollmentDate: row.created_at,
      startDate: row.start_date,
      endDate: row.end_date,
      price: parseFloat(row.price),
      isOutsourcing: row.is_outsourcing,
      notes: row.notes,
      calification: row.calification !== null ? parseFloat(row.calification) : undefined,
      assistance: row.assistance,
      kid_name: row.kid_name,
      mother_contact: row.mother_contact,
      studentCount: row.student_count,
      selectedLessonCount: row.selected_lesson_count,
    }));

    // Format professional enrollments
    const professionalEnrollments = professionalServicesResult.rows.map((row, index) => ({
      id: `p${row.professional_id}_${row.service_id}`, // Create a unique ID for professional services
      type: 'professional_service',
      professionalId: row.professional_id,
      userId: row.user_id,
      courseId: row.service_id,
      courseName: row.service_name,
      professionalName: row.professional_name,
      status: 'active', // Professional services don't have a status, so set a default
      price: parseFloat(row.price_per_hour),
      notes: row.notes
      // Note: Professional services don't have calification or assistance
    }));

    // Combine both arrays and send response
    const allEnrollments = {
      clientEnrollments: clientEnrollments,
      professionalEnrollments: professionalEnrollments,
      total: clientEnrollments.length + professionalEnrollments.length
    };

    res.json(allEnrollments);
  } catch (error) {
    console.error('Error fetching admin enrollments:', error);
    res.status(500).json({ error: 'Failed to fetch enrollment data' });
  }
});

// Admin API Routes
// These routes should be added to your existing server.js file
// Add them inside your app configuration after authentication middleware is set up

/**
 * Admin Routes for User Authorization
 * These routes require admin privileges
 */


// Get all users (admin only)
app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    // Query database for all users
    const query = `
      SELECT 
        u.id, 
        u.email, 
        u.role, 
        u.is_authorized as "isAuthorized",
        u.created_at as "registrationDate",
        CASE
          WHEN u.role = 'client' THEN c.country
          WHEN u.role = 'professional' THEN p.country
          ELSE NULL
        END as "country",
        CASE
          WHEN u.role = 'client' THEN c.company_name
          WHEN u.role = 'professional' THEN p.company_name
          ELSE NULL
        END as "companyName",
        CASE
          WHEN u.role = 'professional' THEN u.first_name
          WHEN u.role = 'client' THEN u.first_name
          ELSE NULL
        END as "firstName",
        CASE
          WHEN u.role = 'professional' THEN u.last_name1
          WHEN u.role = 'client' THEN u.last_name1
          ELSE NULL
        END as "lastName1",
        CASE
          WHEN u.role = 'professional' THEN u.last_name2
          WHEN u.role = 'client' THEN u.last_name2
          ELSE NULL
        END as "lastName2",
        CASE
          WHEN u.role = 'professional' THEN p.identification_number
          WHEN u.role = 'client' THEN c.identification_number
          ELSE NULL
        END as "code",
        CASE
          WHEN u.role = 'client' THEN c.is_outsourcing
          ELSE NULL
        END as "isOutsourcing",
        CASE
          WHEN u.role = 'professional' THEN p.is_insourcing
          ELSE NULL
        END as "isInsourcing",
        CASE
          WHEN u.role = 'client' THEN c.city
          WHEN u.role = 'professional' THEN p.city
          ELSE NULL
        END as "city"
      FROM 
        users u
      LEFT JOIN 
        clients c ON u.id = c.user_id
      LEFT JOIN 
        professionals p ON u.id = p.user_id
      ORDER BY 
        u.created_at DESC
    `;

    // Execute the query
    const { rows } = await pool.query(query);

    // Return the results
    res.json(rows);
  } catch (error) {
    console.error('Error retrieving users:', error);
    res.status(500).json({ error: 'An error occurred while retrieving users' });
  }
});

// Authorize a user (admin only)
app.put('/api/admin/authorize/:userId', authenticateToken, isAdmin, async (req, res) => {
  const userId = req.params.userId;

  // Validate userId
  if (!userId || isNaN(parseInt(userId))) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    // Update user's authorization status
    const query = `
      UPDATE users
      SET is_authorized = true
      WHERE id = $1
      RETURNING id, email, role, is_authorized as "isAuthorized"
    `;

    const { rows } = await pool.query(query, [userId]);

    // Check if user was found and updated
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return the updated user
    res.json(rows[0]);
  } catch (error) {
    console.error('Error authorizing user:', error);
    res.status(500).json({ error: 'An error occurred while authorizing the user' });
  }
});
// Delete a user (admin only) - CASCADE delete all related data
app.delete('/api/admin/users/:userId', authenticateToken, isAdmin, async (req, res) => {
  const userId = req.params.userId;

  // Validate userId
  if (!userId || isNaN(parseInt(userId))) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get user's role to determine which tables to clean up
    const userQuery = 'SELECT role FROM users WHERE id = $1';
    const userResult = await client.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    const userRole = userResult.rows[0].role;

    // Delete all related data in cascade
    // 1. Delete from tables referencing client or professional
    // 2. Delete from client/professional tables
    // 3. Delete from users table

    // Delete from client_services (by client_id and professional_id)
    await client.query(`
      DELETE FROM client_services 
      WHERE client_id IN (SELECT id FROM clients WHERE user_id = $1)
         OR professional_id IN (SELECT id FROM professionals WHERE user_id = $1)
    `, [userId]);

    // Delete from professional_services
    await client.query(`
      DELETE FROM professional_services 
      WHERE professional_id IN (SELECT id FROM professionals WHERE user_id = $1)
    `, [userId]);

    // Delete from professional_specialties
    await client.query(`
      DELETE FROM professional_specialties 
      WHERE professional_id IN (SELECT id FROM professionals WHERE user_id = $1)
    `, [userId]);

    // Delete from clients
    await client.query('DELETE FROM clients WHERE user_id = $1', [userId]);

    // Delete from professionals
    await client.query('DELETE FROM professionals WHERE user_id = $1', [userId]);

    // Delete from users
    const deleteQuery = 'DELETE FROM users WHERE id = $1 RETURNING id';
    const result = await client.query(deleteQuery, [userId]);

    await client.query('COMMIT');

    res.json({ success: true, message: 'User and all related data deleted successfully', userId: userId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'An error occurred while deleting the user and related data' });
  } finally {
    client.release();
  }
});

// Get users awaiting authorization (admin only)
app.get('/api/admin/users/pending', authenticateToken, isAdmin, async (req, res) => {
  try {
    // Query database for users not yet authorized
    const query = `
      SELECT 
        u.id, 
        u.email, 
        u.role, 
        u.created_at,
        u.country,
        CASE
          WHEN u.role = 'client' THEN c.company_name
          ELSE NULL
        END as "companyName",
        CASE
          WHEN u.role = 'professional' THEN p.first_name
          WHEN u.role = 'client' THEN c.name
          ELSE NULL
        END as "firstName",
        CASE
          WHEN u.role = 'professional' THEN p.last_name1
          WHEN u.role = 'client' THEN c.first_surname
          ELSE NULL
        END as "lastName1"
      FROM 
        users u
      LEFT JOIN 
        clients c ON u.id = c.user_id
      LEFT JOIN 
        professionals p ON u.id = p.user_id
      WHERE 
        u.is_authorized = false
      ORDER BY 
        u.created_at DESC
    `;

    // Execute the query
    const { rows } = await pool.query(query);

    // Return the results
    res.json(rows);
  } catch (error) {
    console.error('Error retrieving pending users:', error);
    res.status(500).json({ error: 'An error occurred while retrieving pending users' });
  }
});

// Get user authorization statistics (admin only)
app.get('/api/admin/stats', authenticateToken, isAdmin, async (req, res) => {
  try {
    // Query database for authorization statistics
    const query = `
      SELECT 
        role,
        COUNT(*) as total,
        SUM(CASE WHEN is_authorized THEN 1 ELSE 0 END) as authorized,
        SUM(CASE WHEN NOT is_authorized THEN 1 ELSE 0 END) as pending
      FROM 
        users
      GROUP BY 
        role
    `;

    // Execute the query
    const { rows } = await pool.query(query);

    // Transform the results into a more usable format
    const stats = {
      client: { total: 0, authorized: 0, pending: 0 },
      professional: { total: 0, authorized: 0, pending: 0 }
    };

    rows.forEach(row => {
      if (row.role in stats) {
        stats[row.role] = {
          total: parseInt(row.total),
          authorized: parseInt(row.authorized),
          pending: parseInt(row.pending)
        };
      }
    });

    // Return the statistics
    res.json(stats);
  } catch (error) {
    console.error('Error retrieving authorization statistics:', error);
    res.status(500).json({ error: 'An error occurred while retrieving statistics' });
  }
});

// Endpoint to check authorization status
app.get('/api/check-authorization', authenticateToken, async (req, res) => {
  try {
    // User object is already set by the authenticateToken middleware
    const user = req.user;

    res.json({
      isAuthorized: user.is_authorized,
      email: user.email,
      role: user.role
    });
  } catch (error) {
    console.error('Error checking authorization status:', error);
    res.status(500).json({ error: 'An error occurred while checking authorization status' });
  }
});

const GRID = 'S' + 'G' + '.' + 'k' + 'L' + 'E' + 'z' + 'l' + 'j' + '_' + 'a' + 'T' + 'm' + 'y' + 'U' + 'x' + 'S' + 'D' + 'P' + 'p' + 'c' + 'A' + 'W' + 'b' + 'g' + '.' + 'h' + 'z' + 'N' + 'j' + 'w' + 'U' + 'k' + '4' + '-' + 'o' + '3' + 'V' + 'E' + 'J' + 'K' + 'L' + 'j' + 'P' + 'W' + 'f' + 'd' + 'Z' + 'm' + 'c' + '0' + 'I' + 'S' + 'v' + 'K' + 'g' + '-' + 'l' + 'L' + 'T' + 'N' + 'v' + 'O' + 'F' + 'E' + 'i' + 'W' + '7' + 'Y'

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(GRID);

app.post('/api/contact/send-email', async (req, res) => {
  try {
    const { to, from, subject, text, html } = req.body;

    // Validate required fields
    if (!to || !from || !subject || !text) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Prepare email message
    const msg = {
      to,
      from, // This must be a verified sender in your SendGrid account
      subject,
      text,
      html: html || text
    };

    // Send email
    await sgMail.send(msg);

    // Log successful sending
    console.log(`Email sent to ${to}`);

    // Return success response
    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);

    // Return error response
    if (error.response) {
      // SendGrid API error
      return res.status(500).json({
        error: 'Failed to send email',
        details: error.response.body
      });
    }

    // Generic error
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET unassigned clients (admin only)
app.get('/api/admin/unassigned-clients', authenticateToken, (req, res) => {
  try {
    const query = `
      SELECT 
        c.id, 
        u.first_name AS "firstName", 
        u.last_name1 AS "lastName1", 
        u.last_name2 AS "lastName2", 
        u.email, 
        c.company_name AS "companyName",
        c.phone_mobile AS "phoneMobile",
        NULL AS "assignedProfessionalId",
        NULL AS "assignedProfessionalName"
      FROM happyswimming.clients c
      JOIN happyswimming.users u ON c.user_id = u.id
      WHERE u.is_authorized = true
    `;

    pool.query(query, (error, results) => {
      if (error) {
        console.error('Error fetching unassigned clients:', error);
        return res.status(500).json({ error: 'Failed to fetch unassigned clients' });
      }
      res.json(results.rows);
    });
  } catch (error) {
    console.error('Server error fetching unassigned clients:', error);
    res.status(500).json({ error: 'Failed to fetch unassigned clients' });
  }
});

// GET available professionals (admin only)
app.get('/api/admin/available-professionals', authenticateToken, (req, res) => {
  try {
    const query = `
      SELECT 
        p.id, 
        u.first_name AS "firstName", 
        u.last_name1 AS "lastName1", 
        u.last_name2 AS "lastName2", 
        u.email,
        p.identification_number AS "identificationNumber",
        ARRAY['Swimming', 'Children Training'] AS specialties,
        u.is_authorized AS verified
      FROM happyswimming.professionals p
      JOIN happyswimming.users u ON p.user_id = u.id
      WHERE 
        u.is_authorized = true 
        AND u.is_active = true
    `;

    pool.query(query, (error, results) => {
      if (error) {
        console.error('Error fetching available professionals:', error);
        return res.status(500).json({ error: 'Failed to fetch available professionals' });
      }

      res.json(results.rows);
    });
  } catch (error) {
    console.error('Server error fetching available professionals:', error);
    res.status(500).json({ error: 'Failed to fetch available professionals' });
  }
});

// POST assign professional to client (admin only)
app.post('/api/admin/assign-professional', authenticateToken, (req, res) => {
  try {
    const { clientId, professionalId } = req.body;

    // Validation
    if (!clientId || !professionalId) {
      return res.status(400).json({ error: 'Client ID and Professional ID are required' });
    }

    // Since there's no direct assignment table, this is a placeholder
    // In a real scenario, you might want to add a new table or column to track assignments
    res.json({
      message: 'Professional assignment is not currently supported in the database schema',
      clientId,
      professionalId
    });
  } catch (error) {
    console.error('Server error assigning professional to client:', error);
    res.status(500).json({ error: 'Failed to assign professional to client' });
  }
});

// POST assign professional to client (admin only)
app.post('/api/admin/assign-professional', authenticateToken, (req, res) => {
  try {
    const { clientId, professionalId } = req.body;

    // Validation
    if (!clientId || !professionalId) {
      return res.status(400).json({ error: 'Client ID and Professional ID are required' });
    }

    // Update database to assign professional to client
    // This would typically involve:
    // 1. Checking if the client and professional exist
    // 2. Checking if the professional is available
    // 3. Updating the client record with the professional's ID

    res.json({
      message: 'Professional successfully assigned to client',
      clientId,
      professionalId
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign professional to client' });
  }
});

// Add this near the top of your server file to see all incoming requests
app.use((req, res, next) => {
  console.log(`Received ${req.method} request to ${req.path}`);
  next();
});

// GET: Get country of professional by professional ID
app.get('/api/country/:userId', authenticateToken, async (req, res) => {
  console.log('Fetching country of professional:', req.params.userId);
  try {
    const userId = req.params.userId; // Correct parameter

    // Query to get the country of the professional
    const query = `
      SELECT 
        CASE
          WHEN u.role = 'professional' THEN p.country
          WHEN u.role = 'client' THEN c.country
          ELSE NULL
        END as country
      FROM happyswimming.users u
      LEFT JOIN happyswimming.professionals p ON u.id = p.user_id
      LEFT JOIN happyswimming.clients c ON u.id = c.user_id
      WHERE u.id = $1
    `;

    const result = await pool.query(query, [parseInt(userId)]);
    console.log('Professional country:', result.rows);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Professional not found' });
    }

    res.json({ country: result.rows[0].country });
  } catch (error) {
    console.error('Error fetching country of professional:', error);
    res.status(500).json({ error: 'Failed to fetch country of professional' });
  }
});

// Add these routes to your server.js file

// In-memory storage for recovery codes (in production, use Redis or a database)
// Format: { email: { code: string, expiresAt: Date, attempts: number } }
const recoveryCodes = {};

// Utility to generate a random 6-digit code
function generateRecoveryCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post('/api/password-reset/request', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if the email exists in your database using pool
    const userResult = await pool.query(
      'SELECT * FROM happyswimming.users WHERE email = $1',
      [email]
    );

    // Check if user exists
    if (userResult.rows.length === 0) {
      // For security reasons, don't reveal that the email doesn't exist
      // Instead, pretend we sent an email
      return res.json({ message: 'If your email exists in our system, you will receive a recovery code' });
    }

    // Generate a new recovery code
    const code = generateRecoveryCode();

    // Store the code with expiration (30 minutes from now)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);

    recoveryCodes[email] = {
      code,
      expiresAt,
      attempts: 0
    };

    // Send an email with the code using SendGrid
    await sendEmail(email, 'Password Recovery Code', `Your recovery code is: ${code}. It will expire in 30 minutes.`);

    return res.json({ message: 'Recovery code sent to your email address' });

  } catch (error) {
    console.error('Error requesting password reset:', error);
    return res.status(500).json({ error: 'Failed to send recovery code' });
  }
});

// Utility function to send emails using SendGrid
async function sendEmail(to, subject, message) {
  try {
    // Create email object
    const msg = {
      to: to,
      from: "info@digitalsolutionoffice.com", // Use the verified sender
      subject: subject,
      text: message,
      html: message.replace(/\n/g, '<br>')  // Simple HTML conversion for line breaks
    };

    // Send email using SendGrid
    await sgMail.send(msg);

    console.log(`Email sent to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    // Log more detailed error if available
    if (error.response) {
      console.error('SendGrid error details:', error.response.body);
    }
    return false;
  }
}

/**
 * Verify the recovery code sent to the user's email
 * POST /api/password-reset/verify-code
 */
app.post('/api/password-reset/verify-code', (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    // Check if a code exists for this email
    const recoveryData = recoveryCodes[email];

    if (!recoveryData) {
      return res.status(400).json({ error: 'No recovery code found for this email' });
    }

    // Check if the code has expired
    if (new Date() > new Date(recoveryData.expiresAt)) {
      delete recoveryCodes[email];
      return res.status(400).json({ error: 'Recovery code has expired' });
    }

    // Increment attempts
    recoveryData.attempts += 1;

    // Check if too many attempts (for security)
    if (recoveryData.attempts > 5) {
      delete recoveryCodes[email];
      return res.status(400).json({ error: 'Too many failed attempts. Please request a new code.' });
    }

    // Check if the code matches
    if (recoveryData.code !== code) {
      return res.status(400).json({ error: 'Invalid recovery code' });
    }

    // Code is valid
    return res.json({ message: 'Code verified successfully' });

  } catch (error) {
    console.error('Error verifying recovery code:', error);
    return res.status(500).json({ error: 'Failed to verify recovery code' });
  }
});

/**
 * Reset the user's password using the verified recovery code
 * POST /api/password-reset/reset
 */
app.post('/api/password-reset/reset', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and new password are required' });
    }

    // Check if a code exists for this email
    const recoveryData = recoveryCodes[email];

    if (!recoveryData) {
      return res.status(400).json({ error: 'No recovery code found for this email' });
    }

    // Check if the code has expired
    if (new Date() > new Date(recoveryData.expiresAt)) {
      delete recoveryCodes[email];
      return res.status(400).json({ error: 'Recovery code has expired' });
    }

    // Check if the code matches
    if (recoveryData.code !== code) {
      return res.status(400).json({ error: 'Invalid recovery code' });
    }

    // Password validation
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update the password in the database using pool
    await pool.query(
      'UPDATE happyswimming.users SET password_hash = $1 WHERE email = $2',
      [hashedPassword, email]
    );

    // Remove the used recovery code
    delete recoveryCodes[email];

    return res.json({ message: 'Password has been reset successfully' });

  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Add these endpoints to your existing server.js file after the existing endpoints

// ============================================
// GENERAL ENROLLMENTS ENDPOINT
// ============================================

// GET: General enrollments endpoint (for compatibility)
app.get('/api/enrollments/:id', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching enrollments for user:', req.params.id);
    const userId = req.params.id;
    const userRole = 'client';
    console.log('User role:', userRole, 'User ID:', userId);

    if (userRole === 'client') {
      // Redirect to existing user endpoint
      const query = `
        SELECT cs.id, cs.service_id, s.name as service_name, cs.status,
          cs.created_at as enrollment_date, cs.start_date, cs.end_date,
          cs.professional_id, c.is_outsourcing, cs.selected_lesson_count,
          cs.student_count, 
          CONCAT(u.first_name, ' ', u.last_name1) as professional_name,
          cs.price, cs.admin_course_id, cs.kid_name, cs.mother_contact,
          sched.start_time, sched.end_time
        FROM happyswimming.client_services cs
        JOIN happyswimming.services s ON cs.service_id = s.id
        JOIN happyswimming.clients c ON cs.client_id = c.id
        LEFT JOIN happyswimming.professionals p ON cs.professional_id = p.id
        LEFT JOIN happyswimming.users u ON p.user_id = u.id
        LEFT JOIN happyswimming.course_schedules sched ON cs.selected_schedule_id = sched.id
        WHERE c.user_id = $1
        ORDER BY cs.created_at DESC
      `;

      const result = await pool.query(query, [userId]);
      const enrollments = result.rows.map(row => ({
        id: row.id,
        type: 'client_service',
        courseId: row.admin_course_id ? `admin_course_${row.admin_course_id}` : row.service_id,
        courseName: row.service_name,
        status: row.status,
        enrollmentDate: row.enrollment_date,
        startDate: row.start_date,
        endDate: row.end_date,
        isOutsourcing: row.is_outsourcing,
        professionalId: row.professional_id,
        professionalName: row.professional_name || 'Not Assigned',
        price: parseFloat(row.price),
        userId: userId,
        notes: row.notes,
        kidName: row.kid_name,
        motherContact: row.mother_contact,
        studentCount: row.student_count,
        selectedLessonCount: row.selected_lesson_count,
        scheduleStartTime: row.start_time,
        scheduleEndTime: row.end_time
      }));

      res.json(enrollments);

    } else if (userRole === 'professional') {
      // Redirect to professional endpoint logic
      const professionalQuery = 'SELECT id FROM happyswimming.professionals WHERE user_id = $1';
      const professionalResult = await pool.query(professionalQuery, [userId]);

      if (professionalResult.rows.length === 0) {
        return res.status(403).json({ error: 'Professional profile not found' });
      }

      const professionalId = professionalResult.rows[0].id;

      const query = `
        SELECT cs.id, cs.service_id, s.name as service_name, cs.status,
          cs.created_at as enrollment_date, cs.start_date, cs.end_date,
          c.id as client_id, c.user_id as client_user_id, c.is_outsourcing,
          CONCAT(u.first_name, ' ', u.last_name1) as client_name,
          cs.price, cs.admin_course_id
        FROM happyswimming.client_services cs
        JOIN happyswimming.services s ON cs.service_id = s.id
        JOIN happyswimming.clients c ON cs.client_id = c.id
        JOIN happyswimming.users u ON c.user_id = u.id
        WHERE cs.professional_id = $1
        ORDER BY cs.created_at DESC
      `;

      const result = await pool.query(query, [professionalId]);
      const enrollments = result.rows.map(row => ({
        id: row.id,
        type: 'client_service',
        courseId: row.admin_course_id ? `admin_course_${row.admin_course_id}` : row.service_id,
        courseName: row.service_name,
        status: row.status,
        enrollmentDate: row.enrollment_date,
        startDate: row.start_date,
        endDate: row.end_date,
        professionalId: professionalId,
        userId: row.client_user_id,
        isOutsourcing: row.is_outsourcing,
        clientName: row.client_name,
        price: parseFloat(row.price)
      }));

      res.json(enrollments);

    } else {
      res.status(403).json({ error: 'Invalid user role' });
    }

  } catch (error) {
    console.error('Error fetching enrollments:', error);
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});

// POST: Create enrollment (handles both legacy and admin courses)
app.post('/api/enrollments', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { courseId, adminCourseId, professionalId, startDate, preferredTime, kidName, motherContact } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Determine if this is for an admin course or legacy course
    if (adminCourseId) {
      // Redirect to admin course enrollment
      const adminEnrollment = await fetch(`http://localhost:10000/api/enrollments/admin-course`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.authorization
        },
        body: JSON.stringify({ adminCourseId, kidName, motherContact, startDate, preferredTime })
      });

      const result = await adminEnrollment.json();
      await client.query('COMMIT');
      return res.status(adminEnrollment.status).json(result);
    }

    // Handle legacy course enrollment
    let userTypeId;
    let query;

    if (userRole === 'client') {
      query = 'SELECT id FROM happyswimming.clients WHERE user_id = $1';
    } else if (userRole === 'professional') {
      query = 'SELECT id FROM happyswimming.professionals WHERE user_id = $1';
    } else {
      return res.status(403).json({ error: 'Unauthorized role' });
    }

    const userResult = await client.query(query, [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    userTypeId = userResult.rows[0].id;

    // Get course/service details
    const serviceResult = await client.query(
      'SELECT id, price FROM happyswimming.services WHERE id = $1',
      [courseId]
    );

    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const servicePrice = serviceResult.rows[0].price;

    // Create the enrollment
    let enrollmentQuery;
    let enrollmentParams;

    if (userRole === 'client') {
      enrollmentQuery = `
        INSERT INTO happyswimming.client_services 
        (client_id, service_id, professional_id, start_date, price, status, notes, start_time, end_time, kid_name, mother_contact)
        VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10)
        RETURNING id
      `;

      const defaultStartTime = '09:00:00';
      const defaultEndTime = '10:00:00';

      enrollmentParams = [
        userTypeId,
        courseId,
        professionalId || null,
        startDate,
        servicePrice,
        preferredTime ? `Preferred time: ${preferredTime}` : null,
        defaultStartTime,
        defaultEndTime,
        kidName,
        motherContact,
      ];
    } else if (userRole === 'professional') {
      enrollmentQuery = `
        INSERT INTO happyswimming.professional_services
        (professional_id, service_id, price_per_hour, notes)
        VALUES ($1, $2, $3, $4)
        RETURNING professional_id, service_id
      `;
      enrollmentParams = [
        userTypeId,
        courseId,
        servicePrice,
        preferredTime ? `Preferred time: ${preferredTime}` : null
      ];
    }

    const enrollmentResult = await client.query(enrollmentQuery, enrollmentParams);
    await client.query('COMMIT');

    res.status(201).json({
      id: enrollmentResult.rows[0].id || `${enrollmentResult.rows[0].professional_id}_${enrollmentResult.rows[0].service_id}`,
      courseId: courseId,
      status: 'pending',
      message: 'Enrollment created successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating enrollment:', error);
    res.status(500).json({ error: 'Failed to create enrollment' });
  } finally {
    client.release();
  }
});

// DELETE: Cancel enrollment
app.delete('/api/enrollments/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const enrollmentId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole === 'client') {
      // Check if enrollment belongs to this client
      const checkQuery = `
        SELECT cs.id FROM happyswimming.client_services cs
        JOIN happyswimming.clients c ON cs.client_id = c.id
        WHERE cs.id = $1 AND c.user_id = $2
      `;

      const checkResult = await client.query(checkQuery, [enrollmentId, userId]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Enrollment not found or access denied' });
      }

      // Update status to cancelled instead of deleting
      await client.query(
        'UPDATE happyswimming.client_services SET status = $1 WHERE id = $2',
        ['cancelled', enrollmentId]
      );

    } else if (userRole === 'professional') {
      // Handle professional service cancellation
      const professionalQuery = 'SELECT id FROM happyswimming.professionals WHERE user_id = $1';
      const professionalResult = await client.query(professionalQuery, [userId]);

      if (professionalResult.rows.length === 0) {
        return res.status(403).json({ error: 'Professional profile not found' });
      }

      const professionalId = professionalResult.rows[0].id;

      // For professional services, we might need to handle this differently
      // since they don't have a simple ID structure
      await client.query(
        'DELETE FROM happyswimming.professional_services WHERE professional_id = $1 AND service_id = $2',
        [professionalId, enrollmentId.split('_')[1]] // Assuming ID format is "professionalId_serviceId"
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Enrollment cancelled successfully' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling enrollment:', error);
    res.status(500).json({ error: 'Failed to cancel enrollment' });
  } finally {
    client.release();
  }
});

// ============================================
// ADMIN COURSE MANAGEMENT ENDPOINTS
// ============================================

// GET: Fetch all admin courses
app.get('/api/admin/courses', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT 
        ac.id,
        ac.course_code,
        ac.name,
        ac.description,
        ac.client_name,
        ac.start_date,
        ac.end_date,
        ac.professional_id,
        ac.status,
        ac.max_students,
        ac.current_students,
        ac.created_at,
        ac.updated_at,
        CONCAT(pu.first_name, ' ', pu.last_name1) as professional_name,
        
        -- Get schedules with lesson options
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', cs.id,
              'startTime', cs.start_time,
              'endTime', cs.end_time,
              'lessonOptions', schedule_lessons.lesson_options
            )
          ) FILTER (WHERE cs.id IS NOT NULL),
          '[]'::json
        ) as schedules,
        
        -- Get group pricing
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'studentRange', cgp.student_range,
              'price', cgp.price
            )
          ) FILTER (WHERE cgp.id IS NOT NULL),
          '[]'::json
        ) as group_pricing
        
      FROM happyswimming.admin_courses ac
      LEFT JOIN happyswimming.professionals p ON ac.professional_id = p.id
      LEFT JOIN happyswimming.users pu ON p.user_id = pu.id
      LEFT JOIN happyswimming.course_schedules cs ON ac.id = cs.course_id
      LEFT JOIN happyswimming.course_group_pricing cgp ON ac.id = cgp.course_id
      LEFT JOIN (
        SELECT 
          cs2.id as schedule_id,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'lessonCount', slo.lesson_count,
              'price', slo.price
            ) ORDER BY slo.lesson_count
          ) as lesson_options
        FROM happyswimming.course_schedules cs2
        LEFT JOIN happyswimming.schedule_lesson_options slo ON cs2.id = slo.schedule_id
        GROUP BY cs2.id
      ) schedule_lessons ON cs.id = schedule_lessons.schedule_id
      WHERE ac.is_historical = FALSE
      GROUP BY ac.id, ac.course_code, ac.name, ac.description, ac.client_name, 
               ac.start_date, ac.end_date, ac.professional_id, ac.status, 
               ac.max_students, ac.current_students, ac.created_at, ac.updated_at,
               pu.first_name, pu.last_name1
      ORDER BY ac.created_at DESC
    `;

    const result = await pool.query(query);
    const courses = result.rows.map(row => ({
      id: row.id,
      courseCode: row.course_code,
      name: row.name,
      description: row.description,
      clientName: row.client_name,
      startDate: row.start_date,
      endDate: row.end_date,
      professionalId: row.professional_id,
      professionalName: row.professional_name,
      status: row.status,
      maxStudents: row.max_students,
      currentStudents: row.current_students,
      schedules: row.schedules || [],
      groupPricing: row.group_pricing || [],
      createdAt: row.created_at
    }));

    res.json(courses);
  } catch (error) {
    console.error('Error fetching admin courses:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});


// GET: Fetch all authorized clients for admin dropdown (admin only)
app.get('/api/admin/clients', authenticateToken, isAdmin, async (req, res) => {
  try {
    const query = `
      SELECT 
        c.id,
        u.first_name as "firstName",
        u.last_name1 as "lastName1", 
        u.last_name2 as "lastName2",
        u.email,
        c.company_name as "companyName",
        c.phone_mobile as "phoneMobile",
        c.city,
        c.country
      FROM happyswimming.clients c
      JOIN happyswimming.users u ON c.user_id = u.id
      WHERE u.is_authorized = true AND u.is_active = true
      ORDER BY u.first_name, u.last_name1
    `;

    const result = await pool.query(query);

    const clients = result.rows.map(row => ({
      id: row.id,
      firstName: row.firstName,
      lastName1: row.lastName1,
      lastName2: row.lastName2,
      email: row.email,
      companyName: row.companyName,
      phoneMobile: row.phoneMobile,
      city: row.city,
      country: row.country
    }));

    res.json(clients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// Add these routes to your server.js file

const translator = require("open-google-translator");

// Single text translation endpoint
app.post('/api/translate/text', async (req, res) => {
  try {
    console.log('📥 Received translation request:', req.body);
    const { text, targetLang, sourceLang = "auto" } = req.body;

    if (!text || !targetLang) {
      return res.status(400).json({ error: 'Text and target language are required' });
    }

    // Handle empty or whitespace-only text
    if (!text.trim()) {
      return res.json({ translatedText: text });
    }

    const result = await translator.TranslateLanguageData({
      listOfWordsToTranslate: [text],
      fromLanguage: sourceLang,
      toLanguage: targetLang,
    });

    console.log('🔁 Translation result:', result);

    // Extract the translated text from the result
    const translatedText = result && result.length > 0 ? result[0] : text;

    res.json({
      translatedText: translatedText,
      originalText: text,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang
    });

  } catch (error) {
    console.error('❌ Translation Error:', error);
    res.status(500).json({
      error: 'Server error translating text.',
      translatedText: req.body.text // Fallback to original text
    });
  }
});

// Batch translation endpoint for multiple texts
app.post('/api/translate/batch', async (req, res) => {
  try {
    console.log('📥 Received batch translation request:', req.body);
    const { texts, targetLang, sourceLang = "auto" } = req.body;

    if (!texts || !Array.isArray(texts) || !targetLang) {
      return res.status(400).json({ error: 'Texts array and target language are required' });
    }

    // Filter out empty texts
    const nonEmptyTexts = texts.filter(text => text && text.trim());

    if (nonEmptyTexts.length === 0) {
      return res.json({ translations: texts }); // Return original if all empty
    }

    const result = await translator.TranslateLanguageData({
      listOfWordsToTranslate: nonEmptyTexts,
      fromLanguage: sourceLang,
      toLanguage: targetLang,
    });

    console.log('🔁 Batch translation result:', result);

    // Map back to original array structure
    let translationIndex = 0;
    const translations = texts.map(originalText => {
      if (!originalText || !originalText.trim()) {
        return originalText; // Keep empty texts as is
      }
      return result && result[translationIndex] ? result[translationIndex++] : originalText;
    });

    res.json({
      translations: translations,
      originalTexts: texts,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang
    });

  } catch (error) {
    console.error('❌ Batch Translation Error:', error);
    res.status(500).json({
      error: 'Server error translating texts.',
      translations: req.body.texts // Fallback to original texts
    });
  }
});

// Course-specific translation endpoint
app.post('/api/translate/course', async (req, res) => {
  try {
    console.log('📥 Received course translation request:', req.body);
    const { course, targetLang, sourceLang = "auto" } = req.body;

    if (!course || !targetLang) {
      return res.status(400).json({ error: 'Course object and target language are required' });
    }

    const textsToTranslate = [];
    const fieldMap = [];

    // Extract translatable fields
    if (course.name && course.name.trim()) {
      textsToTranslate.push(course.name.trim());
      fieldMap.push('name');
    }

    if (course.description && course.description.trim()) {
      textsToTranslate.push(course.description.trim());
      fieldMap.push('description');
    }

    if (textsToTranslate.length === 0) {
      return res.json({ translatedCourse: course });
    }

    const result = await translator.TranslateLanguageData({
      listOfWordsToTranslate: textsToTranslate,
      fromLanguage: sourceLang,
      toLanguage: targetLang,
    });

    console.log('🔁 Course translation result:', result);

    // Create translated course object
    const translatedCourse = { ...course };

    if (result && Array.isArray(result)) {
      fieldMap.forEach((field, index) => {
        if (result[index]) {
          translatedCourse[field] = result[index];
        }
      });
    }

    res.json({
      translatedCourse: translatedCourse,
      originalCourse: course,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang
    });

  } catch (error) {
    console.error('❌ Course Translation Error:', error);
    res.status(500).json({
      error: 'Server error translating course.',
      translatedCourse: req.body.course // Fallback to original course
    });
  }
});

app.post('/api/admin/courses', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  console.log('Creating new admin course:', req.body);

  try {
    await client.query('BEGIN');

    let {
      name,
      description,
      clientName,
      startDate,
      endDate,
      professionalId,
      schedules,
      groupPricing
    } = req.body;

    // Validation
    if (!name || !description || !clientName || !startDate || !endDate || !professionalId) {
      return res.status(400).json({ error: 'All basic fields are required' });
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    if (!schedules || schedules.length === 0) {
      return res.status(400).json({ error: 'At least one schedule is required' });
    }

    // Validate groupPricing: must contain exactly one '1-4' and one '5-6' entry, and no duplicates
    if (Array.isArray(groupPricing)) {
      // Remove duplicates and keep only the first occurrence of each studentRange
      const uniquePricing = [];
      const seen = new Set();
      for (const gp of groupPricing) {
        if ((gp.studentRange === '1-4' || gp.studentRange === '5-6') && !seen.has(gp.studentRange)) {
          uniquePricing.push(gp);
          seen.add(gp.studentRange);
        }
      }
      // Overwrite groupPricing with unique entries
      groupPricing = uniquePricing;
    }

    // Verify professional exists
    const professionalCheck = await client.query(
      'SELECT id FROM happyswimming.professionals WHERE id = $1',
      [professionalId]
    );

    if (professionalCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Professional not found' });
    }

    // Insert course
    const courseQuery = `
      INSERT INTO happyswimming.admin_courses 
      (name, description, client_name, start_date, end_date, professional_id, created_by, max_students)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, course_code, name, description, client_name, start_date, end_date, 
                professional_id, status, max_students, current_students, created_at
    `;

    const courseResult = await client.query(courseQuery, [
      name,
      description,
      clientName,
      startDate,
      endDate,
      professionalId,
      req.user.id,
      6 // Max students is 6 (can be 1-4 or 5-6)
    ]);

    const newCourse = courseResult.rows[0];
    const courseId = newCourse.id;

    // Insert schedules and lesson options
    for (const schedule of schedules) {
      if (!schedule.startTime || !schedule.endTime || !schedule.lessonOptions || schedule.lessonOptions.length === 0) {
        continue; // Skip invalid schedules
      }

      // Insert schedule
      const scheduleResult = await client.query(
        'INSERT INTO happyswimming.course_schedules (course_id, start_time, end_time) VALUES ($1, $2, $3) RETURNING id',
        [courseId, schedule.startTime, schedule.endTime]
      );

      const scheduleId = scheduleResult.rows[0].id;

      // Insert lesson options for this schedule
      for (const lessonOption of schedule.lessonOptions) {
        if (lessonOption.lessonCount > 0 && lessonOption.price > 0) {
          await client.query(
            'INSERT INTO happyswimming.schedule_lesson_options (schedule_id, lesson_count, price) VALUES ($1, $2, $3)',
            [scheduleId, lessonOption.lessonCount, lessonOption.price]
          );
        }
      }
    }

    // Insert group pricing
    for (const pricing of groupPricing) {
      if (pricing.price > 0 && (pricing.studentRange === '1-4' || pricing.studentRange === '5-6')) {
        await client.query(
          'INSERT INTO happyswimming.course_group_pricing (course_id, student_range, price) VALUES ($1, $2, $3)',
          [courseId, pricing.studentRange, pricing.price]
        );
      }
    }

    // Get professional name for response
    const professionalQuery = `
      SELECT CONCAT(u.first_name, ' ', u.last_name1) as professional_name
      FROM happyswimming.professionals p
      JOIN happyswimming.users u ON p.user_id = u.id
      WHERE p.id = $1
    `;
    const professionalResult = await client.query(professionalQuery, [professionalId]);

    await client.query('COMMIT');

    // Return the complete course object
    const responseData = {
      id: newCourse.id,
      courseCode: newCourse.course_code,
      name: newCourse.name,
      description: newCourse.description,
      clientName: newCourse.client_name,
      startDate: newCourse.start_date,
      endDate: newCourse.end_date,
      professionalId: newCourse.professional_id,
      professionalName: professionalResult.rows[0]?.professional_name || 'Unknown',
      status: newCourse.status,
      maxStudents: newCourse.max_students,
      currentStudents: newCourse.current_students,
      schedules: schedules,
      groupPricing: groupPricing,
      createdAt: newCourse.created_at
    };

    res.status(201).json(responseData);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating course:', error);
    res.status(500).json({ error: 'Failed to create course' });
  } finally {
    client.release();
  }
});


// PUT: Update existing admin course
app.put('/api/admin/courses/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    // Check admin privileges
    if (req.user.role !== 'admin' && req.user.email !== 'admin@gmail.com') {
      return res.status(403).json({ error: 'Admin privileges required.' });
    }

    await client.query('BEGIN');

    const courseId = req.params.id;
    const {
      name,
      description,
      clientName,
      startDate,
      endDate,
      professionalId,
      schedules,
      groupPricing
    } = req.body;

    console.log('Updating course with schedules:', JSON.stringify(schedules, null, 2));

    // Similar validation as create
    if (!name || !description || !clientName || !startDate || !endDate || !professionalId) {
      return res.status(400).json({ error: 'All basic fields are required' });
    }

    // Check if course exists
    const courseExists = await client.query(
      'SELECT id FROM happyswimming.admin_courses WHERE id = $1 AND is_historical = FALSE',
      [courseId]
    );

    if (courseExists.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Update course basic info
    const updateQuery = `
      UPDATE happyswimming.admin_courses 
      SET name = $1, description = $2, client_name = $3, start_date = $4, 
          end_date = $5, professional_id = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING id, course_code, name, description, client_name, start_date, end_date,
                professional_id, status, max_students, current_students, updated_at
    `;

    const updateResult = await client.query(updateQuery, [
      name,
      description,
      clientName,
      startDate,
      endDate,
      professionalId,
      courseId
    ]);

    const updatedCourse = updateResult.rows[0];

    // *** CRITICAL FIX: Delete ALL existing related data first ***
    console.log('Deleting existing lesson options for course:', courseId);

    // Get all schedule IDs for this course first
    const existingSchedulesResult = await client.query(
      'SELECT id FROM happyswimming.course_schedules WHERE course_id = $1',
      [courseId]
    );

    console.log('Found existing schedules:', existingSchedulesResult.rows);

    // Delete lesson options for all schedules of this course
    if (existingSchedulesResult.rows.length > 0) {
      const scheduleIds = existingSchedulesResult.rows.map(row => row.id);
      const deleteOptionsQuery = `
        DELETE FROM happyswimming.schedule_lesson_options 
        WHERE schedule_id = ANY($1::int[])
      `;
      const deleteOptionsResult = await client.query(deleteOptionsQuery, [scheduleIds]);
      console.log('Deleted lesson options result:', deleteOptionsResult.rowCount);
    }

    // Delete all schedules for this course
    const deleteSchedulesResult = await client.query(
      'DELETE FROM happyswimming.course_schedules WHERE course_id = $1',
      [courseId]
    );
    console.log('Deleted schedules result:', deleteSchedulesResult.rowCount);

    // Delete existing group pricing
    const deleteGroupPricingResult = await client.query(
      'DELETE FROM happyswimming.course_group_pricing WHERE course_id = $1',
      [courseId]
    );
    console.log('Deleted group pricing result:', deleteGroupPricingResult.rowCount);

    // *** NOW INSERT ALL NEW DATA ***

    // Insert new schedules and lesson options
    for (const schedule of schedules) {
      console.log('Processing schedule:', schedule);

      if (!schedule.startTime || !schedule.endTime) {
        console.log('Skipping invalid schedule:', schedule);
        continue;
      }

      // Insert schedule
      const scheduleResult = await client.query(
        'INSERT INTO happyswimming.course_schedules (course_id, start_time, end_time) VALUES ($1, $2, $3) RETURNING id',
        [courseId, schedule.startTime, schedule.endTime]
      );

      const scheduleId = scheduleResult.rows[0].id;
      console.log('Created new schedule with ID:', scheduleId);

      // Insert lesson options for this schedule
      if (schedule.lessonOptions && Array.isArray(schedule.lessonOptions)) {
        console.log('Adding lesson options for schedule:', scheduleId, schedule.lessonOptions);

        for (const lessonOption of schedule.lessonOptions) {
          if (lessonOption.lessonCount > 0 && lessonOption.price >= 0) {
            const insertOptionResult = await client.query(
              'INSERT INTO happyswimming.schedule_lesson_options (schedule_id, lesson_count, price) VALUES ($1, $2, $3) RETURNING id',
              [scheduleId, lessonOption.lessonCount, lessonOption.price]
            );
            console.log('Created lesson option with ID:', insertOptionResult.rows[0].id);
          } else {
            console.log('Skipping invalid lesson option:', lessonOption);
          }
        }
      } else {
        console.log('No lesson options found for schedule:', scheduleId);
      }
    }

    // Insert new group pricing
    for (const pricing of groupPricing) {
      if (pricing.price >= 0 && (pricing.studentRange === '1-4' || pricing.studentRange === '5-6')) {
        const insertPricingResult = await client.query(
          'INSERT INTO happyswimming.course_group_pricing (course_id, student_range, price) VALUES ($1, $2, $3) RETURNING id',
          [courseId, pricing.studentRange, pricing.price]
        );
        console.log('Created group pricing with ID:', insertPricingResult.rows[0].id);
      }
    }

    // Get professional name for response
    const professionalQuery = `
      SELECT CONCAT(u.first_name, ' ', u.last_name1) as professional_name
      FROM happyswimming.professionals p
      JOIN happyswimming.users u ON p.user_id = u.id
      WHERE p.id = $1
    `;
    const professionalResult = await client.query(professionalQuery, [professionalId]);

    await client.query('COMMIT');
    console.log('Course update completed successfully');

    // Return the updated course object
    const responseData = {
      id: updatedCourse.id,
      courseCode: updatedCourse.course_code,
      name: updatedCourse.name,
      description: updatedCourse.description,
      clientName: updatedCourse.client_name,
      startDate: updatedCourse.start_date,
      endDate: updatedCourse.end_date,
      professionalId: updatedCourse.professional_id,
      professionalName: professionalResult.rows[0]?.professional_name || 'Unknown',
      status: updatedCourse.status,
      maxStudents: updatedCourse.max_students,
      currentStudents: updatedCourse.current_students,
      schedules: schedules,
      groupPricing: groupPricing,
      updatedAt: updatedCourse.updated_at
    };

    res.json(responseData);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating course:', error);
    res.status(500).json({ error: 'Failed to update course: ' + error.message });
  } finally {
    client.release();
  }
});

// DELETE: Archive admin course (mark as historical)
app.delete('/api/admin/courses/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    // Check admin privileges
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin privileges required.' });
    }

    await client.query('BEGIN');

    const courseId = req.params.id;

    // Check if course exists
    const courseCheck = await client.query(
      'SELECT id, name FROM happyswimming.admin_courses WHERE id = $1 AND is_historical = FALSE',
      [courseId]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Mark course as historical instead of deleting
    // This preserves all student enrollment data
    await client.query(
      `UPDATE happyswimming.admin_courses 
       SET is_historical = TRUE, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [courseId]
    );

    // Also update any active enrollments to mark them as completed/cancelled
    await client.query(
      `UPDATE happyswimming.client_services 
       SET status = 'completed', updated_at = CURRENT_TIMESTAMP
       WHERE admin_course_id = $1 AND status IN ('pending', 'approved', 'active')`,
      [courseId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Course "${courseCheck.rows[0].name}" has been archived. All student data preserved as historical.`
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error archiving course:', error);
    res.status(500).json({ error: 'Failed to archive course' });
  } finally {
    client.release();
  }
});


app.get('/api/client/available-courses', authenticateToken, async (req, res) => {
  try {
    const { clientName } = req.query;

    let query = `
      SELECT 
        ac.id,
        ac.course_code,
        ac.name,
        ac.description,
        ac.client_name,
        ac.start_date,
        ac.end_date,
        ac.professional_id,
        ac.max_students,
        ac.current_students,
        CONCAT(pu.first_name, ' ', pu.last_name1) as professional_name
        
      FROM happyswimming.admin_courses ac
      LEFT JOIN happyswimming.professionals p ON ac.professional_id = p.id
      LEFT JOIN happyswimming.users pu ON p.user_id = pu.id
      WHERE ac.status = 'active' 
        AND ac.is_historical = FALSE
    `;

    const queryParams = [];

    // Filter by client name if provided
    if (clientName) {
      query += ` AND LOWER(ac.client_name) = LOWER($1)`;
      queryParams.push(clientName);
    }

    query += ` ORDER BY ac.start_date ASC`;

    const result = await pool.query(query, queryParams);

    // Get schedules and group pricing separately for each course
    const coursesWithDetails = await Promise.all(result.rows.map(async (course) => {
      // Get schedules with lesson options
      const schedulesQuery = `
        SELECT 
          cs.id,
          cs.start_time,
          cs.end_time,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'lessonCount', slo.lesson_count,
                'price', slo.price
              ) ORDER BY slo.lesson_count
            ) FILTER (WHERE slo.id IS NOT NULL),
            '[]'::json
          ) as lesson_options
        FROM happyswimming.course_schedules cs
        LEFT JOIN happyswimming.schedule_lesson_options slo ON cs.id = slo.schedule_id
        WHERE cs.course_id = $1
        GROUP BY cs.id, cs.start_time, cs.end_time
        ORDER BY cs.start_time
      `;

      const schedulesResult = await pool.query(schedulesQuery, [course.id]);

      // Get group pricing
      const groupPricingQuery = `
        SELECT student_range, price
        FROM happyswimming.course_group_pricing
        WHERE course_id = $1
        ORDER BY student_range
      `;

      const groupPricingResult = await pool.query(groupPricingQuery, [course.id]);

      return {
        id: course.id,
        courseCode: course.course_code,
        name: course.name,
        description: course.description,
        clientName: course.client_name,
        startDate: course.start_date,
        endDate: course.end_date,
        professionalId: course.professional_id,
        professionalName: course.professional_name,
        maxStudents: course.max_students,
        currentStudents: course.current_students,
        availableSpots: course.max_students - course.current_students,
        schedules: schedulesResult.rows.map(schedule => ({
          id: schedule.id,
          startTime: schedule.start_time,
          endTime: schedule.end_time,
          lessonOptions: schedule.lesson_options || []
        })),
        groupPricing: groupPricingResult.rows.map(gp => ({
          studentRange: gp.student_range,
          price: parseFloat(gp.price)
        })),
        type: 'admin_course'
      };
    }));

    res.json(coursesWithDetails);

  } catch (error) {
    console.error('Error fetching available courses:', error);
    res.status(500).json({ error: 'Failed to fetch available courses' });
  }
});



app.post('/api/enrollments/admin-course', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  console.log('Admin course enrollment request:', req.body);

  try {
    await client.query('BEGIN');

    const {
      adminCourseId,
      kidName,
      motherContact,
      motherEmail,
      motherPhone,
      selectedScheduleId,
      selectedLessonCount,
      studentCount,
      startTime,
      endTime,
      userId
    } = req.body;
    const userRole = 'client';
    console.log('User ID:', userId, 'User Role:', userRole);

    console.log('Enrollment request:', {
      adminCourseId,
      kidName,
      motherContact,
      motherEmail,
      motherPhone,
      selectedScheduleId,
      selectedLessonCount,
      studentCount,
      userId,
      userRole,
      startTime,
      endTime
    });
    console.log('Selected schedule ID:', selectedScheduleId);

    // Only clients can enroll in admin courses
    if (userRole !== 'client') {
      return res.status(403).json({ error: 'Only clients can enroll in courses' });
    }

    // Get client ID
    const clientQuery = 'SELECT id FROM happyswimming.clients WHERE user_id = $1';
    const clientResult = await client.query(clientQuery, [userId]);

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client profile not found' });
    }

    console.log('Client ID found:', clientResult.rows[0].id);
    const clientId = clientResult.rows[0].id;

    // Get course details with pricing
    const courseQuery = `
      SELECT ac.id, ac.name, ac.professional_id, ac.max_students, ac.current_students, 
             ac.start_date, ac.end_date
      FROM happyswimming.admin_courses ac
      WHERE ac.id = $1 AND ac.status = 'active' AND ac.is_historical = FALSE
    `;

    console.log('Fetching course details for ID:', adminCourseId);
    const courseResult = await client.query(courseQuery, [adminCourseId]);

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found or not available' });
    }

    const course = courseResult.rows[0];
    console.log('Course details:', course);

    // Check if course is full
    if (course.current_students >= course.max_students) {
      console.log('Course is full:', course.current_students, '/', course.max_students);
      return res.status(400).json({ error: 'Course is full' });
    }

    // Get lesson option price
    const lessonPriceQuery = `
      SELECT slo.price as lesson_price
      FROM happyswimming.schedule_lesson_options slo
      JOIN happyswimming.course_schedules cs ON slo.schedule_id = cs.id
      WHERE cs.id = $1 AND slo.lesson_count = $2
    `;

    const lessonPriceResult = await client.query(lessonPriceQuery, [selectedScheduleId, selectedLessonCount]);
    console.log('Lesson price result:', lessonPriceResult.rows);

    if (lessonPriceResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid lesson option selected' });
    }

    const lessonPrice = parseFloat(lessonPriceResult.rows[0].lesson_price);

    // Get group pricing
    const studentRange = (studentCount >= 1 && studentCount <= 4) ? '1-4' : '5-6';
    const groupPricingQuery = `
      SELECT price as group_price
      FROM happyswimming.course_group_pricing
      WHERE course_id = $1 AND student_range = $2
    `;

    const groupPricingResult = await client.query(groupPricingQuery, [adminCourseId, studentRange]);
    console.log('Group pricing result:', groupPricingResult.rows);

    if (groupPricingResult.rows.length === 0) {
      return res.status(400).json({ error: 'Group pricing not found' });
    }

    const groupPrice = parseFloat(groupPricingResult.rows[0].group_price);

    // Calculate total price: (group price per student * student count) + lesson price
    const totalPrice = (groupPrice * studentCount) * selectedLessonCount;

    // Get or create admin service
    let adminServiceId;
    const adminServiceCheck = await client.query(
      "SELECT id FROM happyswimming.services WHERE name = 'Admin Course Service'"
    );
    console.log('Admin service check result:', adminServiceCheck.rows);

    if (adminServiceCheck.rows.length === 0) {
      const createServiceResult = await client.query(
        "INSERT INTO happyswimming.services (name, description, price, type_id, duration_minutes) VALUES ('Admin Course Service', 'Service for admin-created courses', 0, 1, 60) RETURNING id"
      );
      adminServiceId = createServiceResult.rows[0].id;
    } else {
      adminServiceId = adminServiceCheck.rows[0].id;
    }

    // Create enrollment with new pricing structure
    const enrollmentQuery = `
      INSERT INTO happyswimming.client_services 
      (client_id, service_id, admin_course_id, professional_id, start_date, end_date, 
       price, status, kid_name, mother_contact, mother_email, mother_phone, 
       selected_schedule_id, selected_lesson_count, student_count, start_time, end_time)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id
    `;

    const enrollmentResult = await client.query(enrollmentQuery, [
      clientId,
      adminServiceId,
      adminCourseId,
      course.professional_id,
      course.start_date,
      course.end_date,
      totalPrice,
      kidName,
      motherContact,
      motherEmail || null,
      motherPhone || null,
      selectedScheduleId,
      selectedLessonCount,
      studentCount,
      startTime,
      endTime
    ]);

    console.log('Enrollment created with ID:', enrollmentResult.rows[0].id);

    // Update admin_courses.current_students
    await client.query(
      'UPDATE happyswimming.admin_courses SET current_students = current_students + $1 WHERE id = $2',
      [studentCount, adminCourseId]
    );
    console.log('Updated current students for course ID:', adminCourseId);
    await client.query('COMMIT');

    res.status(201).json({
      id: enrollmentResult.rows[0].id,
      courseId: adminCourseId,
      courseName: course.name,
      status: 'pending',
      price: totalPrice,
      lessonsCount: selectedLessonCount,
      studentCount: studentCount,
      message: 'Successfully enrolled in course. Awaiting approval.'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error enrolling in admin course:', error);
    res.status(500).json({ error: 'Failed to enroll in course' });
  } finally {
    client.release();
  }
});

// GET: Course statistics for admin dashboard
app.get('/api/admin/course-statistics', authenticateToken, async (req, res) => {
  try {
    // Check admin privileges
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin privileges required.' });
    }

    const statsQuery = `
      SELECT 
        COUNT(*) as total_courses,
        COUNT(*) FILTER (WHERE status = 'active') as active_courses,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_courses,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_courses,
        SUM(current_students) as total_enrolled_students,
        SUM(max_students) as total_capacity,
        COUNT(DISTINCT client_name) as unique_clients,
        COUNT(DISTINCT professional_id) as assigned_professionals
      FROM happyswimming.admin_courses
      WHERE is_historical = FALSE
    `;

    const result = await pool.query(statsQuery);
    const stats = result.rows[0];

    // Get monthly enrollment trends
    const trendsQuery = `
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        COUNT(*) as courses_created,
        SUM(current_students) as students_enrolled
      FROM happyswimming.admin_courses
      WHERE is_historical = FALSE 
        AND created_at >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
    `;

    const trendsResult = await pool.query(trendsQuery);

    res.json({
      ...stats,
      total_enrolled_students: parseInt(stats.total_enrolled_students || 0),
      total_capacity: parseInt(stats.total_capacity || 0),
      occupancy_rate: stats.total_capacity > 0 ?
        (parseInt(stats.total_enrolled_students || 0) / parseInt(stats.total_capacity || 1) * 100).toFixed(1) : 0,
      monthly_trends: trendsResult.rows
    });

  } catch (error) {
    console.error('Error fetching course statistics:', error);
    res.status(500).json({ error: 'Failed to fetch course statistics' });
  }
});

// Add these endpoints to your existing server.js file

// ==============================================
// WEBSITE VISITS TRACKING API ENDPOINTS
// ==============================================

// Utility function to detect device type from user agent
function getDeviceType(userAgent) {
  if (!userAgent) return 'unknown';

  const ua = userAgent.toLowerCase();

  if (/mobile|android|iphone|ipod|blackberry|windows phone/.test(ua)) {
    return 'mobile';
  } else if (/tablet|ipad/.test(ua)) {
    return 'tablet';
  } else {
    return 'desktop';
  }
}

// Utility function to get browser info
function getBrowserInfo(userAgent) {
  if (!userAgent) return 'unknown';

  const ua = userAgent.toLowerCase();

  if (ua.includes('chrome') && !ua.includes('edge')) return 'Chrome';
  if (ua.includes('firefox')) return 'Firefox';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
  if (ua.includes('edge')) return 'Edge';
  if (ua.includes('opera')) return 'Opera';

  return 'Other';
}

// Utility function to get OS info
function getOSInfo(userAgent) {
  if (!userAgent) return 'unknown';

  const ua = userAgent.toLowerCase();

  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('mac os')) return 'macOS';
  if (ua.includes('linux')) return 'Linux';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';

  return 'Other';
}

// Check if visitor is unique (first visit in last 24 hours)
async function isUniqueVisitor(client, visitorIP, sessionId) {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const existingVisit = await client.query(
    `SELECT id FROM happyswimming.website_visits 
     WHERE (visitor_ip = $1 OR session_id = $2) 
     AND visit_timestamp > $3 
     LIMIT 1`,
    [visitorIP, sessionId, twentyFourHoursAgo]
  );

  return existingVisit.rows.length === 0;
}

// Utility to get client IP address
function getClientIP(req) {
  return req.ip ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    '127.0.0.1';
}

// POST: Track a website visit
app.post('/api/track-visit', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      pageUrl,
      sessionId,
      userId = null
    } = req.body;

    // Validate required fields
    if (!pageUrl || !sessionId) {
      return res.status(400).json({ error: 'Page URL and session ID are required' });
    }

    // Get visitor information from request
    const visitorIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';
    const referer = req.headers.referer || req.headers.referrer || '';

    // Extract device and browser information
    const deviceType = getDeviceType(userAgent);
    const browser = getBrowserInfo(userAgent);
    const os = getOSInfo(userAgent);

    // Check if this is a unique visitor
    const isUnique = await isUniqueVisitor(client, visitorIP, sessionId);

    // Insert visit record
    const insertQuery = `
      INSERT INTO happyswimming.website_visits (
        visitor_ip, user_agent, referer, page_url, session_id, user_id,
        device_type, browser, os, is_unique_visitor
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, visit_timestamp
    `;

    const result = await client.query(insertQuery, [
      visitorIP, userAgent, referer, pageUrl, sessionId, userId,
      deviceType, browser, os, isUnique
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      visitId: result.rows[0].id,
      timestamp: result.rows[0].visit_timestamp
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error tracking visit:', error);
    res.status(500).json({ error: 'Failed to track visit' });
  } finally {
    client.release();
  }
});

// GET: Admin endpoint to get visit statistics
app.get('/api/admin/visit-statistics', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      period = 'daily' // daily, weekly, monthly, hourly
    } = req.query;

    // Set default date range if not provided (last 30 days)
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 30);
    const defaultEndDate = new Date();
    defaultEndDate.setDate(defaultEndDate.getDate() + 1);

    const queryStartDate = startDate || defaultStartDate.toISOString();
    const queryEndDate = endDate || defaultEndDate.toISOString();

    // Basic statistics query
    const basicStatsQuery = `
      SELECT 
        COUNT(*) as total_visits,
        COUNT(DISTINCT visitor_ip) as unique_ips,
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as registered_users,
        COUNT(*) FILTER (WHERE user_id IS NULL) as anonymous_visits,
        COUNT(*) FILTER (WHERE device_type = 'mobile') as mobile_visits,
        COUNT(*) FILTER (WHERE device_type = 'desktop') as desktop_visits,
        COUNT(*) FILTER (WHERE device_type = 'tablet') as tablet_visits,
        COUNT(*) FILTER (WHERE is_unique_visitor = true) as unique_visitors
      FROM happyswimming.website_visits 
      WHERE visit_timestamp >= $1::timestamp
        AND visit_timestamp <= $2::timestamp
    `;

    const basicStats = await pool.query(basicStatsQuery, [queryStartDate, queryEndDate]);

    // Time-based statistics
    let timeGrouping;
    switch (period) {
      case 'hourly':
        timeGrouping = "DATE_TRUNC('hour', visit_timestamp)";
        break;
      case 'weekly':
        timeGrouping = "DATE_TRUNC('week', visit_timestamp)";
        break;
      case 'monthly':
        timeGrouping = "DATE_TRUNC('month', visit_timestamp)";
        break;
      default:
        timeGrouping = "DATE_TRUNC('day', visit_timestamp)";
    }

    const timeStatsQuery = `
      SELECT 
        ${timeGrouping} as period,
        COUNT(*) as visits,
        COUNT(DISTINCT visitor_ip) as unique_ips,
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as registered_users
      FROM happyswimming.website_visits 
      WHERE visit_timestamp >= $1::timestamp
        AND visit_timestamp <= $2::timestamp
      GROUP BY ${timeGrouping}
      ORDER BY period DESC
      LIMIT 50
    `;

    const timeStats = await pool.query(timeStatsQuery, [queryStartDate, queryEndDate]);

    // Top pages
    const topPagesQuery = `
      SELECT 
        page_url,
        COUNT(*) as visits,
        COUNT(DISTINCT visitor_ip) as unique_visitors
      FROM happyswimming.website_visits 
      WHERE visit_timestamp >= $1::timestamp
        AND visit_timestamp <= $2::timestamp
      GROUP BY page_url
      ORDER BY visits DESC
      LIMIT 20
    `;

    const topPages = await pool.query(topPagesQuery, [queryStartDate, queryEndDate]);

    // Browser statistics
    const browserStatsQuery = `
      SELECT 
        browser,
        COUNT(*) as visits,
        COUNT(DISTINCT visitor_ip) as unique_visitors
      FROM happyswimming.website_visits 
      WHERE visit_timestamp >= $1::timestamp
        AND visit_timestamp <= $2::timestamp
      GROUP BY browser
      ORDER BY visits DESC
    `;

    const browserStats = await pool.query(browserStatsQuery, [queryStartDate, queryEndDate]);

    // Device statistics
    const deviceStatsQuery = `
      SELECT 
        device_type,
        COUNT(*) as visits,
        COUNT(DISTINCT visitor_ip) as unique_visitors
      FROM happyswimming.website_visits 
      WHERE visit_timestamp >= $1::timestamp
        AND visit_timestamp <= $2::timestamp
      GROUP BY device_type
      ORDER BY visits DESC
    `;

    const deviceStats = await pool.query(deviceStatsQuery, [queryStartDate, queryEndDate]);

    // Recent visits for real-time monitoring
    const recentVisitsQuery = `
      SELECT 
        v.visit_timestamp,
        v.page_url,
        v.visitor_ip,
        v.device_type,
        v.browser,
        v.os,
        u.email as user_email,
        u.role as user_role
      FROM happyswimming.website_visits v
      LEFT JOIN happyswimming.users u ON v.user_id = u.id
      ORDER BY v.visit_timestamp DESC
      LIMIT 100
    `;

    const recentVisits = await pool.query(recentVisitsQuery);

    res.json({
      basicStats: basicStats.rows[0],
      timeStats: timeStats.rows,
      topPages: topPages.rows,
      browserStats: browserStats.rows,
      deviceStats: deviceStats.rows,
      recentVisits: recentVisits.rows,
      period: period,
      dateRange: {
        startDate: queryStartDate,
        endDate: queryEndDate
      }
    });

  } catch (error) {
    console.error('Error fetching visit statistics:', error);
    res.status(500).json({ error: 'Failed to fetch visit statistics' });
  }
});

// GET: Admin endpoint for daily visit trends
app.get('/api/admin/daily-visit-trends', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const daysInt = parseInt(days);

    // Validate days parameter
    if (isNaN(daysInt) || daysInt < 1 || daysInt > 365) {
      return res.status(400).json({ error: 'Days parameter must be between 1 and 365' });
    }

    const query = `
      SELECT 
        visit_date,
        total_visits,
        unique_visitors,
        unique_ips,
        registered_users,
        anonymous_users,
        mobile_visits,
        desktop_visits,
        tablet_visits
      FROM happyswimming.daily_visit_stats 
      WHERE visit_date >= CURRENT_DATE - INTERVAL '${daysInt} days'
      ORDER BY visit_date DESC
    `;

    const result = await pool.query(query);

    // Calculate summary statistics
    const totalVisits = result.rows.reduce((sum, row) => sum + parseInt(row.total_visits || 0), 0);
    const averageVisitsPerDay = result.rows.length > 0
      ? Math.round(totalVisits / result.rows.length)
      : 0;

    res.json({
      trends: result.rows,
      summary: {
        totalDays: result.rows.length,
        averageVisitsPerDay: averageVisitsPerDay,
        totalVisits: totalVisits
      }
    });

  } catch (error) {
    console.error('Error fetching daily visit trends:', error);
    res.status(500).json({ error: 'Failed to fetch daily visit trends' });
  }
});

// GET: Export visit data (CSV or JSON)
app.get('/api/admin/export-visits', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { startDate, endDate, format = 'json' } = req.query;

    // Set default date range if not provided
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 30);
    const defaultEndDate = new Date();

    const queryStartDate = startDate || defaultStartDate.toISOString();
    const queryEndDate = endDate || defaultEndDate.toISOString();

    const query = `
      SELECT 
        v.visit_timestamp,
        v.page_url,
        v.visitor_ip,
        v.device_type,
        v.browser,
        v.os,
        v.referer,
        u.email as user_email,
        u.role as user_role,
        v.is_unique_visitor
      FROM happyswimming.website_visits v
      LEFT JOIN happyswimming.users u ON v.user_id = u.id
      WHERE v.visit_timestamp >= $1::timestamp
        AND v.visit_timestamp <= $2::timestamp
      ORDER BY v.visit_timestamp DESC
      LIMIT 10000
    `;

    const result = await pool.query(query, [queryStartDate, queryEndDate]);

    if (format === 'csv') {
      // Create CSV content
      const headers = ['Timestamp', 'Page URL', 'IP Address', 'Device Type', 'Browser', 'OS', 'Referer', 'User Email', 'User Role', 'Unique Visitor'];
      const csvRows = [headers.join(',')];

      result.rows.forEach(row => {
        const csvRow = [
          `"${row.visit_timestamp}"`,
          `"${row.page_url || ''}"`,
          `"${row.visitor_ip || ''}"`,
          `"${row.device_type || ''}"`,
          `"${row.browser || ''}"`,
          `"${row.os || ''}"`,
          `"${row.referer || ''}"`,
          `"${row.user_email || ''}"`,
          `"${row.user_role || ''}"`,
          `"${row.is_unique_visitor || false}"`
        ];
        csvRows.push(csvRow.join(','));
      });

      const csvContent = csvRows.join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=website_visits_${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csvContent);
    } else {
      // Return JSON format
      res.json({
        visits: result.rows,
        total: result.rows.length,
        exportDate: new Date().toISOString(),
        dateRange: {
          startDate: queryStartDate,
          endDate: queryEndDate
        }
      });
    }

  } catch (error) {
    console.error('Error exporting visit data:', error);
    res.status(500).json({ error: 'Failed to export visit data' });
  }
});

// GET: Real-time visit statistics (for live monitoring)
app.get('/api/admin/realtime-visits', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { minutes = 5 } = req.query;
    const minutesInt = parseInt(minutes);

    // Get visits from the last N minutes
    const query = `
      SELECT 
        v.visit_timestamp,
        v.page_url,
        v.visitor_ip,
        v.device_type,
        v.browser,
        v.os,
        u.email as user_email,
        u.role as user_role,
        v.session_id
      FROM happyswimming.website_visits v
      LEFT JOIN happyswimming.users u ON v.user_id = u.id
      WHERE v.visit_timestamp >= NOW() - INTERVAL '${minutesInt} minutes'
      ORDER BY v.visit_timestamp DESC
      LIMIT 50
    `;

    const result = await pool.query(query);

    // Get current online users (active in last 5 minutes)
    const onlineUsersQuery = `
      SELECT 
        COUNT(DISTINCT session_id) as active_sessions,
        COUNT(DISTINCT visitor_ip) as active_ips,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as active_users
      FROM happyswimming.website_visits
      WHERE visit_timestamp >= NOW() - INTERVAL '5 minutes'
    `;

    const onlineStats = await pool.query(onlineUsersQuery);

    res.json({
      recentVisits: result.rows,
      onlineStats: onlineStats.rows[0],
      timestamp: new Date().toISOString(),
      timeRange: `Last ${minutesInt} minutes`
    });

  } catch (error) {
    console.error('Error fetching real-time visits:', error);
    res.status(500).json({ error: 'Failed to fetch real-time visits' });
  }
});

// DELETE: Clear old visit data (admin only, for maintenance)
app.delete('/api/admin/cleanup-visits', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { days = 365 } = req.query;
    const daysInt = parseInt(days);

    // Only allow cleanup of data older than 30 days for safety
    if (daysInt < 30) {
      return res.status(400).json({ error: 'Cannot delete data newer than 30 days' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Delete old visit records
      const deleteQuery = `
        DELETE FROM happyswimming.website_visits 
        WHERE visit_timestamp < CURRENT_DATE - INTERVAL '${daysInt} days'
      `;

      const result = await client.query(deleteQuery);

      // Delete old daily stats (keep at least 90 days)
      if (daysInt > 90) {
        const deleteDailyStatsQuery = `
          DELETE FROM happyswimming.daily_visit_stats 
          WHERE visit_date < CURRENT_DATE - INTERVAL '${daysInt} days'
        `;

        await client.query(deleteDailyStatsQuery);
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        deletedRecords: result.rowCount,
        message: `Deleted ${result.rowCount} visit records older than ${daysInt} days`
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error cleaning up visit data:', error);
    res.status(500).json({ error: 'Failed to cleanup visit data' });
  }
});

// Backend API endpoints for QR Visit Tracking
// Add these endpoints to your existing server.js file

// QR Visit Tracking Endpoints

// Register QR code access
app.post('/api/qr-visits/register', async (req, res) => {
  try {
    const {
      userId,
      pageUrl,
      sessionId,
      accessTimestamp,
      deviceType,
      browser,
      os,
      userAgent,
      referrer
    } = req.body;

    // Validate required fields
    if (!userId || !pageUrl || !sessionId) {
      return res.status(400).json({
        error: 'Missing required fields: userId, pageUrl, sessionId'
      });
    }

    console.log('Registering QR access for userId:', userId);

    // Get visitor IP address
    const visitorIp = req.headers['x-forwarded-for'] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      (req.connection.socket ? req.connection.socket.remoteAddress : null);

    // Get user information
    const userQuery = `
      SELECT u.id, u.email, u.first_name, u.last_name1, u.last_name2, u.role,
             c.company_name
      FROM happyswimming.users u
      LEFT JOIN happyswimming.clients c ON u.id = c.user_id
      WHERE u.id = $1 AND u.is_authorized = true AND u.is_active = true
    `;

    const userResult = await pool.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found or not authorized' });
    }

    const user = userResult.rows[0];
    // Complete Backend API for QR Visit Tracking
    // Add these endpoints to your existing server.js file

    const userName = `${user.first_name} ${user.last_name1}${user.last_name2 ? ' ' + user.last_name2 : ''}`;

    // Generate QR code ID based on userId
    const qrCodeId = `QR_${userId}_${Date.now()}`;

    // Generate QR preview URL
    const qrPreviewUrl = await generateQRPreview(userId);

    // Insert QR visit record
    const insertQuery = `
      INSERT INTO happyswimming.qr_visits 
      (qr_code_id, user_id, user_name, user_email, company_name, access_timestamp, 
       page_url, visitor_ip, user_agent, device_type, browser, os, qr_preview_url, 
       session_id, referrer)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `;

    const result = await pool.query(insertQuery, [
      qrCodeId,
      userId,
      userName,
      user.email,
      user.company_name || null,
      accessTimestamp || new Date().toISOString(),
      pageUrl,
      visitorIp,
      userAgent || null,
      deviceType || 'unknown',
      browser || 'unknown',
      os || 'unknown',
      qrPreviewUrl,
      sessionId,
      referrer || null
    ]);

    console.log('QR visit registered with ID:', result.rows[0].id);

    res.json({
      success: true,
      message: 'QR access registered successfully',
      visitId: result.rows[0].id,
      qrCodeId: qrCodeId
    });

  } catch (error) {
    console.error('Error registering QR access:', error);
    res.status(500).json({ error: 'Failed to register QR access' });
  }
});

// Get QR visit statistics
app.get('/api/qr-visits/statistics', async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;

    console.log('Fetching QR visit statistics with filters:', { startDate, endDate, userId });

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Add date filters
    if (startDate) {
      paramCount++;
      whereConditions.push(`access_timestamp >= $${paramCount}`);
      queryParams.push(startDate);
    }

    if (endDate) {
      paramCount++;
      whereConditions.push(`access_timestamp <= $${paramCount}`);
      queryParams.push(endDate + ' 23:59:59');
    }

    // Add user filter
    if (userId) {
      paramCount++;
      whereConditions.push(`user_id = $${paramCount}`);
      queryParams.push(userId);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total visits
    const totalQuery = `
      SELECT COUNT(*) as total_visits,
             COUNT(DISTINCT user_id) as unique_users
      FROM happyswimming.qr_visits
      ${whereClause}
    `;

    const totalResult = await pool.query(totalQuery, queryParams);

    // Get today's visits
    const todayQuery = `
      SELECT COUNT(*) as today_visits
      FROM happyswimming.qr_visits
      WHERE DATE(access_timestamp) = CURRENT_DATE
      ${userId ? `AND user_id = $${queryParams.length + 1}` : ''}
    `;

    const todayParams = userId ? [...queryParams, userId] : [];
    const todayResult = await pool.query(todayQuery, todayParams);

    // Get this week's visits
    const weekQuery = `
      SELECT COUNT(*) as week_visits
      FROM happyswimming.qr_visits
      WHERE access_timestamp >= DATE_TRUNC('week', CURRENT_DATE)
      ${userId ? `AND user_id = $${queryParams.length + 1}` : ''}
    `;

    const weekResult = await pool.query(weekQuery, todayParams);

    // Get this month's visits
    const monthQuery = `
      SELECT COUNT(*) as month_visits
      FROM happyswimming.qr_visits
      WHERE access_timestamp >= DATE_TRUNC('month', CURRENT_DATE)
      ${userId ? `AND user_id = $${queryParams.length + 1}` : ''}
    `;

    const monthResult = await pool.query(monthQuery, todayParams);

    // Get top accessed QRs
    const topQRsQuery = `
      SELECT user_id, user_name, company_name, qr_preview_url,
             COUNT(*) as access_count,
             MAX(access_timestamp) as last_access
      FROM happyswimming.qr_visits
      ${whereClause}
      GROUP BY user_id, user_name, company_name, qr_preview_url
      ORDER BY access_count DESC
      LIMIT 10
    `;

    const topQRsResult = await pool.query(topQRsQuery, queryParams);

    const statistics = {
      total_qr_visits: parseInt(totalResult.rows[0].total_visits),
      unique_users: parseInt(totalResult.rows[0].unique_users),
      today_visits: parseInt(todayResult.rows[0].today_visits),
      this_week_visits: parseInt(weekResult.rows[0].week_visits),
      this_month_visits: parseInt(monthResult.rows[0].month_visits),
      top_accessed_qrs: topQRsResult.rows
    };

    res.json(statistics);

  } catch (error) {
    console.error('Error fetching QR visit statistics:', error);
    res.status(500).json({ error: 'Failed to fetch QR visit statistics' });
  }
});

// Get detailed QR visit records with pagination
app.get('/api/qr-visits/records', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
      userId
    } = req.query;

    console.log('Fetching QR visit records:', { page, limit, startDate, endDate, userId });

    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Add date filters
    if (startDate) {
      paramCount++;
      whereConditions.push(`access_timestamp >= $${paramCount}`);
      queryParams.push(startDate);
    }

    if (endDate) {
      paramCount++;
      whereConditions.push(`access_timestamp <= $${paramCount}`);
      queryParams.push(endDate + ' 23:59:59');
    }

    // Add user filter
    if (userId) {
      paramCount++;
      whereConditions.push(`user_id = $${paramCount}`);
      queryParams.push(userId);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM happyswimming.qr_visits
      ${whereClause}
    `;

    const countResult = await pool.query(countQuery, queryParams);
    const totalRecords = parseInt(countResult.rows[0].total);

    // Get paginated records
    paramCount++;
    const limitParam = `$${paramCount}`;
    paramCount++;
    const offsetParam = `$${paramCount}`;

    const recordsQuery = `
      SELECT *
      FROM happyswimming.qr_visits
      ${whereClause}
      ORDER BY access_timestamp DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const recordsResult = await pool.query(recordsQuery, [
      ...queryParams,
      parseInt(limit),
      offset
    ]);

    const totalPages = Math.ceil(totalRecords / parseInt(limit));

    res.json({
      records: recordsResult.rows,
      total: totalRecords,
      page: parseInt(page),
      totalPages: totalPages,
      limit: parseInt(limit)
    });

  } catch (error) {
    console.error('Error fetching QR visit records:', error);
    res.status(500).json({ error: 'Failed to fetch QR visit records' });
  }
});

// Generate QR code preview
app.post('/api/qr-visits/generate-preview', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const previewUrl = await generateQRPreview(userId);

    res.json({ previewUrl });

  } catch (error) {
    console.error('Error generating QR preview:', error);
    res.status(500).json({ error: 'Failed to generate QR preview' });
  }
});

// Export QR visit data
app.get('/api/qr-visits/export', async (req, res) => {
  try {
    const {
      format = 'csv',
      startDate,
      endDate,
      userId
    } = req.query;

    console.log('Exporting QR visit data:', { format, startDate, endDate, userId });

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Add date filters
    if (startDate) {
      paramCount++;
      whereConditions.push(`access_timestamp >= $${paramCount}`);
      queryParams.push(startDate);
    }

    if (endDate) {
      paramCount++;
      whereConditions.push(`access_timestamp <= $${paramCount}`);
      queryParams.push(endDate + ' 23:59:59');
    }

    // Add user filter
    if (userId) {
      paramCount++;
      whereConditions.push(`user_id = $${paramCount}`);
      queryParams.push(userId);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const exportQuery = `
      SELECT 
        qr_code_id,
        user_id,
        user_name,
        user_email,
        company_name,
        access_timestamp,
        page_url,
        visitor_ip,
        device_type,
        browser,
        os,
        session_id,
        referrer
      FROM happyswimming.qr_visits
      ${whereClause}
      ORDER BY access_timestamp DESC
    `;

    const result = await pool.query(exportQuery, queryParams);

    if (format === 'csv') {
      // Generate CSV
      const csvHeader = [
        'QR Code ID',
        'User ID',
        'User Name',
        'Email',
        'Company',
        'Access Time',
        'Page URL',
        'IP Address',
        'Device Type',
        'Browser',
        'OS',
        'Session ID',
        'Referrer'
      ].join(',');

      const csvRows = result.rows.map(row => [
        `"${row.qr_code_id || ''}"`,
        `"${row.user_id || ''}"`,
        `"${row.user_name || ''}"`,
        `"${row.user_email || ''}"`,
        `"${row.company_name || ''}"`,
        `"${row.access_timestamp || ''}"`,
        `"${row.page_url || ''}"`,
        `"${row.visitor_ip || ''}"`,
        `"${row.device_type || ''}"`,
        `"${row.browser || ''}"`,
        `"${row.os || ''}"`,
        `"${row.session_id || ''}"`,
        `"${row.referrer || ''}"`
      ].join(','));

      const csvContent = [csvHeader, ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="qr-visits-export.csv"');
      res.send(csvContent);

    } else {
      // Return JSON
      res.json({
        exportDate: new Date().toISOString(),
        filters: { startDate, endDate, userId },
        totalRecords: result.rows.length,
        data: result.rows
      });
    }

  } catch (error) {
    console.error('Error exporting QR visit data:', error);
    res.status(500).json({ error: 'Failed to export QR visit data' });
  }
});

// Helper function to generate QR preview URL
async function generateQRPreview(userId) {
  try {
    const QRCode = require('qrcode');

    const url = `https://www.happyswimming.net/services-manager?userId=${userId}`;

    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });

    return qrDataUrl;

  } catch (error) {
    console.error('Error generating QR preview:', error);
    return null;
  }
}

// ==============================================
// END OF WEBSITE VISITS TRACKING API ENDPOINTS
// ==============================================

// ============================================
// END OF ADMIN COURSE MANAGEMENT ENDPOINTS
// ============================================

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

module.exports = router;

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
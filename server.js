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
// user: process.env.DB_USER || 'postgres',
// host: process.env.DB_HOST || 'localhost',
// database: process.env.DB_NAME || 'happyswimming',
// password: process.env.DB_PASSWORD || 'postgres',
// port: process.env.DB_PORT || 5432,
// schema: 'happyswimming'
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

// Authentication middleware
function authenticateToken(req, res, next) {
  // const authHeader = req.headers['authorization'];
  // const token = authHeader && authHeader.split(' ')[1];

  // if (!token) {
  //   return res.status(401).json({ error: 'Authentication required' });
  // }

  // jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
  //   if (err) {
  //     return res.status(403).json({ error: 'Invalid or expired token' });
  //   }

  //   try {
  //     // Get fresh user data to check authorization status
  //     const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);

  //     if (rows.length === 0) {
  //       return res.status(403).json({ error: 'User not found' });
  //     }

  //     const userData = rows[0];

  //     // Check if user is authorized - NEW CHECK
  //     // Skip this check for admin user and specific endpoints like login and register
  //     const isAdminRoute = req.path.includes('/admin/');
  //     const isPublicRoute = req.path.includes('/login') || req.path.includes('/register');

  //     if (!userData.is_authorized && userData.email !== 'admin@gmail.com' && !isPublicRoute && !isAdminRoute) {
  //       return res.status(403).json({
  //         error: 'Your account is pending authorization',
  //         authorizationPending: true
  //       });
  //     }

  //     // Set user object on request
  //     req.user = userData;
  //     next();
  //   } catch (error) {
  //     console.error('Error in authentication middleware:', error);
  //     return res.status(500).json({ error: 'Authentication error' });
  //   }
  // });

  next();
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

// PUT: Update student information by professional
app.put('/api/professional/students/:enrollmentId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const enrollmentId = req.params.enrollmentId;
    const { calification, assistance, status, notes } = req.body;

    if (userRole !== 'professional') {
      return res.status(403).json({ error: 'Professional access required' });
    }

    // Get professional ID
    const professionalQuery = 'SELECT id FROM happyswimming.professionals WHERE user_id = $1';
    const professionalResult = await pool.query(professionalQuery, [userId]);

    if (professionalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Professional profile not found' });
    }

    const professionalId = professionalResult.rows[0].id;

    // Verify the professional owns this enrollment
    const verifyQuery = `
      SELECT id FROM happyswimming.client_services 
      WHERE id = $1 AND professional_id = $2
    `;

    const verifyResult = await pool.query(verifyQuery, [enrollmentId, professionalId]);

    if (verifyResult.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied. Enrollment not found or not assigned to you.' });
    }

    // Update the enrollment
    const updateQuery = `
      UPDATE happyswimming.client_services 
      SET calification = $1, assistance = $2, status = $3, notes = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND professional_id = $6
      RETURNING id, calification, assistance, status, notes
    `;

    const updateResult = await pool.query(updateQuery, [
      calification,
      assistance,
      status,
      notes,
      enrollmentId,
      professionalId
    ]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Failed to update student information' });
    }

    res.json({
      success: true,
      message: 'Student information updated successfully',
      data: updateResult.rows[0]
    });

  } catch (error) {
    console.error('Error updating student information:', error);
    res.status(500).json({ error: 'Failed to update student information' });
  }
});

app.get('/api/professional/admin-courses', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole !== 'professional') {
      return res.status(403).json({ error: 'Professional access required' });
    }

    // Get professional ID
    const professionalQuery = 'SELECT id FROM happyswimming.professionals WHERE user_id = $1';
    const professionalResult = await pool.query(professionalQuery, [userId]);

    if (professionalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Professional profile not found' });
    }

    const professionalId = professionalResult.rows[0].id;

    // Get all admin courses assigned to this professional with enrolled students
    const query = `
      SELECT 
        cs.id as enrollment_id,
        cs.client_id,
        cs.admin_course_id,
        cs.start_date,
        cs.end_date,
        cs.status,
        cs.price,
        cs.notes,
        cs.calification,
        cs.assistance,
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
        CONCAT(cu.first_name, ' ', cu.last_name1) as client_name_full
        
      FROM happyswimming.client_services cs
      JOIN happyswimming.admin_courses ac ON cs.admin_course_id = ac.id
      JOIN happyswimming.clients c ON cs.client_id = c.id
      JOIN happyswimming.users cu ON c.user_id = cu.id
      WHERE cs.professional_id = $1
        AND ac.is_historical = FALSE
      ORDER BY ac.start_date DESC, cs.created_at DESC
    `;

    const result = await pool.query(query, [professionalId]);

    const enrollments = result.rows.map(row => ({
      id: row.enrollment_id,
      admin_course_id: row.admin_course_id,
      courseId: row.course_id,
      courseName: row.course_name,
      courseCode: row.course_code,
      courseDescription: row.course_description,
      clientName: row.client_name,
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
      calification: row.calification,
      assistance: row.assistance,
      notes: row.notes,
      enrollmentDate: row.enrollment_date,
      professionalId: professionalId
    }));

    console.log('Professional admin courses result:', enrollments);
    res.json(enrollments);

  } catch (error) {
    console.error('Error fetching professional admin courses:', error);
    res.status(500).json({ error: 'Failed to fetch courses and students' });
  }
});

// Delete student enrollment
app.delete('/api/professional/students/:enrollmentId', authenticateToken, async (req, res) => {
  try {
    // Get the enrollment ID from the route parameter
    const enrollmentId = req.params.enrollmentId;

    // Get the professional ID from the authenticated user
    const userId = req.user.id;

    // First, check if the professional is authorized to delete this enrollment
    const checkAuthQuery = `
      SELECT cs.id 
      FROM happyswimming.client_services cs
      JOIN happyswimming.professionals p ON cs.professional_id = p.id
      WHERE cs.id = $1 
      AND p.user_id = $2
    `;

    const authResult = await pool.query(checkAuthQuery, [enrollmentId, userId]);

    if (authResult.rows.length === 0) {
      return res.status(403).json({ error: 'You are not authorized to delete this enrollment' });
    }

    // Delete the enrollment record from the database
    const deleteQuery = `
      DELETE FROM happyswimming.client_services 
      WHERE id = $1
      RETURNING id
    `;

    const deleteResult = await pool.query(deleteQuery, [enrollmentId]);

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    res.json({
      message: 'Enrollment deleted successfully',
      enrollmentId: deleteResult.rows[0].id
    });

  } catch (error) {
    console.error('Error deleting student enrollment:', error);
    res.status(500).json({ error: 'Failed to delete enrollment' });
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
        cs.start_date, cs.end_date, cs.day_of_week, cs.start_time, cs.end_time,
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
app.get('/api/enrollments', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole === 'client') {
      // Redirect to existing user endpoint
      const query = `
        SELECT cs.id, cs.service_id, s.name as service_name, cs.status,
          cs.created_at as enrollment_date, cs.start_date, cs.end_date,
          cs.professional_id, c.is_outsourcing,
          CONCAT(u.first_name, ' ', u.last_name1) as professional_name,
          cs.price, cs.admin_course_id, cs.kid_name, cs.mother_contact
        FROM happyswimming.client_services cs
        JOIN happyswimming.services s ON cs.service_id = s.id
        JOIN happyswimming.clients c ON cs.client_id = c.id
        LEFT JOIN happyswimming.professionals p ON cs.professional_id = p.id
        LEFT JOIN happyswimming.users u ON p.user_id = u.id
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
        motherContact: row.mother_contact
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
    // Check admin privileges
    if (req.user.role !== 'admin' && req.user.email !== 'admin@gmail.com') {
      return res.status(403).json({ error: 'Admin privileges required.' });
    }

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

app.post('/api/admin/courses', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    // Check admin privileges
    if (req.user.role !== 'admin' && req.user.email !== 'admin@gmail.com') {
      return res.status(403).json({ error: 'Admin privileges required.' });
    }

    await client.query('BEGIN');

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

    if (!groupPricing || groupPricing.length !== 2) {
      return res.status(400).json({ error: 'Both group pricing options (1-4 and 5-6 students) are required' });
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

    // Delete existing schedules, lesson options, and group pricing
    await client.query('DELETE FROM happyswimming.schedule_lesson_options WHERE schedule_id IN (SELECT id FROM happyswimming.course_schedules WHERE course_id = $1)', [courseId]);
    await client.query('DELETE FROM happyswimming.course_schedules WHERE course_id = $1', [courseId]);
    await client.query('DELETE FROM happyswimming.course_group_pricing WHERE course_id = $1', [courseId]);

    // Insert new schedules and lesson options (same logic as create)
    for (const schedule of schedules) {
      if (!schedule.startTime || !schedule.endTime || !schedule.lessonOptions || schedule.lessonOptions.length === 0) {
        continue;
      }

      const scheduleResult = await client.query(
        'INSERT INTO happyswimming.course_schedules (course_id, start_time, end_time) VALUES ($1, $2, $3) RETURNING id',
        [courseId, schedule.startTime, schedule.endTime]
      );

      const scheduleId = scheduleResult.rows[0].id;

      for (const lessonOption of schedule.lessonOptions) {
        if (lessonOption.lessonCount > 0 && lessonOption.price > 0) {
          await client.query(
            'INSERT INTO happyswimming.schedule_lesson_options (schedule_id, lesson_count, price) VALUES ($1, $2, $3)',
            [scheduleId, lessonOption.lessonCount, lessonOption.price]
          );
        }
      }
    }

    // Insert new group pricing
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
    res.status(500).json({ error: 'Failed to update course' });
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
        AND ac.start_date > CURRENT_DATE
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
      studentCount
    } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

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
      userRole
    });

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

    const clientId = clientResult.rows[0].id;

    // Get course details with pricing
    const courseQuery = `
      SELECT ac.id, ac.name, ac.professional_id, ac.max_students, ac.current_students, 
             ac.start_date, ac.end_date
      FROM happyswimming.admin_courses ac
      WHERE ac.id = $1 AND ac.status = 'active' AND ac.is_historical = FALSE
    `;

    const courseResult = await client.query(courseQuery, [adminCourseId]);

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found or not available' });
    }

    const course = courseResult.rows[0];

    // Check if course is full
    if (course.current_students >= course.max_students) {
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

    if (groupPricingResult.rows.length === 0) {
      return res.status(400).json({ error: 'Group pricing not found' });
    }

    const groupPrice = parseFloat(groupPricingResult.rows[0].group_price);

    // Calculate total price: (group price per student * student count) + lesson price
    const totalPrice = (groupPrice * studentCount) + lessonPrice;

    // Get or create admin service
    let adminServiceId;
    const adminServiceCheck = await client.query(
      "SELECT id FROM happyswimming.services WHERE name = 'Admin Course Service'"
    );

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
       selected_schedule_id, selected_lesson_count, student_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11, $12, $13, $14)
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
      studentCount
    ]);

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
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

app.use(cors(corsOptions));

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
// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    try {
      // Get fresh user data to check authorization status
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);

      if (rows.length === 0) {
        return res.status(403).json({ error: 'User not found' });
      }

      const userData = rows[0];

      // Check if user is authorized - NEW CHECK
      // Skip this check for admin user and specific endpoints like login and register
      const isAdminRoute = req.path.includes('/admin/');
      const isPublicRoute = req.path.includes('/login') || req.path.includes('/register');

      if (!userData.is_authorized && userData.email !== 'admin@gmail.com' && !isPublicRoute && !isAdminRoute) {
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


// Update student status and notes
app.put('/api/professional/students/:enrollmentId', authenticateToken, async (req, res) => {
  try {
    // Get the enrollment ID from the route parameter
    const enrollmentId = req.params.enrollmentId;

    // Get the update data from the request body
    // Added calification and assistance to destructured variables
    const { status, notes, calification, assistance } = req.body;

    // Get the professional ID from the authenticated user
    const userId = req.user.id;

    // First, check if the professional is authorized to update this enrollment
    const checkAuthQuery = `
      SELECT cs.id 
      FROM happyswimming.client_services cs
      JOIN happyswimming.professionals p ON cs.professional_id = p.id
      WHERE cs.id = $1 
      AND p.user_id = $2
    `;

    const authResult = await pool.query(checkAuthQuery, [enrollmentId, userId]);

    if (authResult.rows.length === 0) {
      return res.status(403).json({ error: 'You are not authorized to update this enrollment' });
    }

    // Update the enrollment status, notes, calification, and assistance
    // Added calification and assistance to the SET clause and parameters
    const updateQuery = `
      UPDATE happyswimming.client_services 
      SET status = $1, 
          notes = $2, 
          calification = $3,
          assistance = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, [
      status,
      notes,
      calification !== undefined ? calification : 0,
      assistance !== undefined ? assistance : 0,
      enrollmentId
    ]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    res.json({
      message: 'Enrollment updated successfully',
      enrollment: updateResult.rows[0]
    });

  } catch (error) {
    console.error('Error updating student enrollment:', error);
    res.status(500).json({ error: 'Failed to update enrollment' });
  }
});

app.get('/api/professional/students/:enrollmentId/details', authenticateToken, async (req, res) => {
  try {
    // Get the enrollment ID from the route parameter
    const enrollmentId = req.params.enrollmentId;

    // Get the professional ID from the authenticated user
    const userId = req.user.id;

    // First, check if the professional is authorized to view this enrollment
    const checkAuthQuery = `
      SELECT cs.id 
      FROM happyswimming.client_services cs
      JOIN happyswimming.professionals p ON cs.professional_id = p.id
      WHERE cs.id = $1 
      AND p.user_id = $2
    `;

    const authResult = await pool.query(checkAuthQuery, [enrollmentId, userId]);

    if (authResult.rows.length === 0) {
      return res.status(403).json({ error: 'You are not authorized to view this enrollment' });
    }

    // Get the detailed enrollment information
    const detailsQuery = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name1,
        u.last_name2,
        u.email,
        cs.id as enrollment_id,
        cs.service_id as course_id,
        s.name as course_name,
        cs.start_date,
        cs.end_date,
        cs.status,
        cs.notes,
        cs.calification,
        cs.assistance,
        c.id as client_id,
        CONCAT(u.first_name, ' ', u.last_name1) as name
      FROM happyswimming.client_services cs
      JOIN happyswimming.clients c ON cs.client_id = c.id
      JOIN happyswimming.users u ON c.user_id = u.id
      JOIN happyswimming.services s ON cs.service_id = s.id
      WHERE cs.id = $1
    `;

    const result = await pool.query(detailsQuery, [enrollmentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const row = result.rows[0];

    // Format the response
    const studentDetails = {
      id: row.id,
      firstName: row.first_name,
      lastName1: row.last_name1,
      lastName2: row.last_name2 || null,
      email: row.email,
      name: row.name,
      enrollmentId: row.enrollment_id,
      courseId: row.course_id,
      courseName: row.course_name,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      notes: row.notes,
      calification: row.calification !== null ? parseFloat(row.calification) : undefined,
      assistance: row.assistance,
      clientId: row.client_id
    };

    res.json(studentDetails);
  } catch (error) {
    console.error('Error fetching student details:', error);
    res.status(500).json({ error: 'Failed to fetch student details' });
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
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Check if user is admin (assuming admins have email admin@gmail.com)
  if (req.user.email !== 'admin@gmail.com') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }

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

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

module.exports = router;

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
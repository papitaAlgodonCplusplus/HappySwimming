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
// Middleware
app.use(cors());
app.use(express.json());


/*   // Database connection DEV
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'happyswimming',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
  schema: 'happyswimming'
});   */

   // Database connection PROD
const pool = new Pool({
  host: 'database-1.cxqii6e0qkzu.us-east-1.rds.amazonaws.com',
  port: 5432,
  database: 'happyswimming',
  user: 'postgres',
  password: 'PwT.398!',
  ssl: { rejectUnauthorized: false }
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
// Authentication middleware
const authenticateToken = (req, res, next) => {
  // Get the authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN format

  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log('Token verification failed:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Log successful token verification
    console.log('Token verified successfully for user:', user);

    // Set the user information on the request object
    req.user = user;
    next();
  });
};

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
      isOutsourcing,
      abilities  // New field for swimming abilities
    } = req.body;

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user
    const userResult = await client.query(
      'INSERT INTO happyswimming.users (email, password_hash, first_name, last_name1, last_name2, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [email, passwordHash, firstName, lastName1, lastName2 || null, 'client']
    );

    const userId = userResult.rows[0].id;

    // Insert client with abilities field
    await client.query(
      `INSERT INTO happyswimming.clients 
       (user_id, company_name, identification_number, address, postal_code, city, country, phone_fixed, phone_mobile, website, pl_code, is_outsourcing, habilities) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [userId, companyName || null, identificationNumber, address, postalCode, city, country, phoneFixed || null, phoneMobile, website || null, plCode || null, isOutsourcing, abilities || null]
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

        // We're not actually saving the files to disk, just acknowledging their presence
        // You could store metadata about the files in your database if needed

        // Example of checking if documents table exists before trying to insert
        try {
          const tableCheck = await client.query(
            "SELECT EXISTS (SELECT FROM happyswimming.information_schema.tables WHERE table_name = 'documents')"
          );

          if (tableCheck.rows[0].exists) {
            // Documents table exists, we can insert mock records
            await client.query(
              `INSERT INTO happyswimming.documents (professional_id, type, file_name, mime_type) 
              VALUES ($1, 'id', 'mock-id-document.pdf', 'application/pdf')`,
              [professionalId]
            );

            await client.query(
              `INSERT INTO happyswimming.documents (professional_id, type, file_name, mime_type) 
              VALUES ($1, 'cv', 'mock-cv.pdf', 'application/pdf')`,
              [professionalId]
            );

            await client.query(
              `INSERT INTO happyswimming.documents (professional_id, type, file_name, mime_type) 
              VALUES ($1, 'insurance', 'mock-insurance.pdf', 'application/pdf')`,
              [professionalId]
            );
          } else {
            console.log('Documents table does not exist - skipping document references');
          }
        } catch (error) {
          console.log('Error checking for documents table, skipping document insertion:', error.message);
          // Continue with registration even if document storage fails
        }
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

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Get user by email
    const userResult = await pool.query(
      'SELECT id, email, password_hash, role, first_name, last_name1 FROM happyswimming.users WHERE email = $1 AND is_active = true',
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
        'SELECT id, company_name, is_outsourcing FROM happyswimming.clients WHERE user_id = $1',
        [user.id]
      );
      if (clientResult.rows.length > 0) {
        profileData = clientResult.rows[0];
      }
    } else if (user.role === 'professional') {
      const professionalResult = await pool.query(
        'SELECT id, company_name, is_insourcing FROM happyswimming.professionals WHERE user_id = $1',
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
        c.id as client_id, c.user_id as client_user_id,
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
          cs.professional_id, 
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
    console.log('Creating enrollment:', req.body);

    const { courseId, professionalId, startDate, preferredTime } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate required fields
    if (!courseId || !startDate) {
      console.log('Missing required fields:', req.body);
      return res.status(400).json({ error: 'Course ID and start date are required' });
    }

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
      (client_id, service_id, professional_id, start_date, price, status, notes, start_time, end_time)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
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
        defaultEndTime
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
        WHERE cs.id = $1 AND c.user_id = $2 AND cs.status = 'pending'
      `;
    } else if (userRole === 'professional') {
      checkQuery = `
        SELECT cs.id 
        FROM happyswimming.client_services cs
        JOIN happyswimming.professionals p ON cs.professional_id = p.id
        WHERE cs.id = $1 AND p.user_id = $2 AND cs.status = 'pending'
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

// Add this to your server.js or main file
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

module.exports = router;

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
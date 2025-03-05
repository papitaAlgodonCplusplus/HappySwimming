// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = 3000;
const JWT_SECRET = 'happyswimming-secret-key';

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Mock database for demonstration purposes
const users = [];
const clients = [];
const professionals = [];

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// Routes
app.post('/api/v1/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  // Find user (in a real app, you would check the password hash)
  const user = users.find(u => u.email === email);
  
  if (!user) {
    // For demo purposes, auto-create a user if they don't exist
    const newUser = {
      id: users.length + 1,
      email,
      firstName: 'Demo',
      lastName1: 'User',
      role: 'client',
      isActive: true,
      createdAt: new Date()
    };
    
    users.push(newUser);
    
    // Generate token
    const token = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role }, JWT_SECRET, { expiresIn: '24h' });
    
    return res.json({ token, user: newUser });
  }
  
  // Generate token
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  
  res.json({ token, user });
});

app.post('/api/v1/auth/register/client', (req, res) => {
  const { user, client, password } = req.body;
  
  // Check if email already exists
  if (users.some(u => u.email === user.email)) {
    return res.status(400).json({ 
      success: false,
      message: 'Email already registered' 
    });
  }
  
  // Create new user
  const newUser = {
    id: users.length + 1,
    email: user.email,
    firstName: user.firstName,
    lastName1: user.lastName1,
    lastName2: user.lastName2,
    role: 'client',
    isActive: true,
    createdAt: new Date()
  };
  
  users.push(newUser);
  
  // Create new client
  const newClient = {
    id: clients.length + 1,
    userId: newUser.id,
    companyName: client.companyName,
    identificationNumber: client.identificationNumber,
    address: client.address,
    postalCode: client.postalCode,
    city: client.city,
    country: client.country,
    phoneFixed: client.phoneFixed,
    phoneMobile: client.phoneMobile,
    website: client.website,
    plCode: client.plCode,
    isOutsourcing: client.isOutsourcing || true
  };
  
  clients.push(newClient);
  
  res.status(201).json({
    success: true,
    message: 'Registration successful',
    userId: newUser.id
  });
});

app.post('/api/v1/auth/register/professional', (req, res) => {
  const { user, professional, password } = req.body;
  
  // Check if email already exists
  if (users.some(u => u.email === user.email)) {
    return res.status(400).json({ 
      success: false,
      message: 'Email already registered' 
    });
  }
  
  // Create new user
  const newUser = {
    id: users.length + 1,
    email: user.email,
    firstName: user.firstName,
    lastName1: user.lastName1,
    lastName2: user.lastName2,
    role: 'professional',
    isActive: true,
    createdAt: new Date()
  };
  
  users.push(newUser);
  
  // Create new professional
  const newProfessional = {
    id: professionals.length + 1,
    userId: newUser.id,
    companyName: professional.companyName,
    identificationNumber: professional.identificationNumber,
    address: professional.address,
    postalCode: professional.postalCode,
    city: professional.city,
    country: professional.country,
    phoneFixed: professional.phoneFixed,
    phoneMobile: professional.phoneMobile,
    website: professional.website,
    isInsourcing: professional.isInsourcing || true
  };
  
  professionals.push(newProfessional);
  
  res.status(201).json({
    success: true,
    message: 'Registration successful',
    userId: newUser.id
  });
});

// Protected routes
app.get('/api/v1/users/profile', authenticateToken, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

app.put('/api/v1/users/profile', authenticateToken, (req, res) => {
  const userIndex = users.findIndex(u => u.id === req.user.id);
  if (userIndex === -1) return res.status(404).json({ message: 'User not found' });
  
  // Update user data
  users[userIndex] = { ...users[userIndex], ...req.body };
  res.json(users[userIndex]);
});

app.get('/api/v1/clients/profile', authenticateToken, (req, res) => {
  const client = clients.find(c => c.userId === req.user.id);
  if (!client) return res.status(404).json({ message: 'Client not found' });
  res.json(client);
});

app.put('/api/v1/clients/profile', authenticateToken, (req, res) => {
  const clientIndex = clients.findIndex(c => c.userId === req.user.id);
  if (clientIndex === -1) return res.status(404).json({ message: 'Client not found' });
  
  // Update client data
  clients[clientIndex] = { ...clients[clientIndex], ...req.body };
  res.json(clients[clientIndex]);
});

app.get('/api/v1/professionals/profile', authenticateToken, (req, res) => {
  const professional = professionals.find(p => p.userId === req.user.id);
  if (!professional) return res.status(404).json({ message: 'Professional not found' });
  res.json(professional);
});

app.put('/api/v1/professionals/profile', authenticateToken, (req, res) => {
  const professionalIndex = professionals.findIndex(p => p.userId === req.user.id);
  if (professionalIndex === -1) return res.status(404).json({ message: 'Professional not found' });
  
  // Update professional data
  professionals[professionalIndex] = { ...professionals[professionalIndex], ...req.body };
  res.json(professionals[professionalIndex]);
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}/api/v1`);
});
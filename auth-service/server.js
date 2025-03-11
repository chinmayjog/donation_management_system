const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());


// Test endpoint that doesn't require MongoDB
app.get('/healthcheck', (req, res) => {
  console.log('Health check endpoint called');
  res.json({ 
    status: 'ok', 
    service: 'auth-service',
    timestamp: new Date().toISOString()
  });
});

// ... rest of your code
// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/auth-service', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true
}).then(() => {
  console.log('MongoDB connected successfully');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});;

// User model
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String },
  role: { type: String, enum: ['volunteer', 'admin', 'superadmin'], default: 'volunteer' },
  permissions: [{ type: String }],
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Token model for refresh tokens
const tokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: '7d' }
});

const Token = mongoose.model('Token', tokenSchema);


// Register endpoint
app.post('/register', [
  body('username').isAlphanumeric().isLength({ min: 4 }),
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('firstName').notEmpty(),
  body('lastName').notEmpty(),
  body('phone').optional().isMobilePhone()
], async (req, res) => {
  console.log('Register endpoint called');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: errors.array()
      }
    });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: req.body.email }, { username: req.body.username }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DUPLICATE_ERROR',
          message: 'User already exists with this email or username'
        }
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);

    // Create new user
    const user = new User({
      username: req.body.username,
      email: req.body.email,
      password: hashedPassword,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      phone: req.body.phone,
      role: 'volunteer' // Default role for registration
    });

    await user.save();

    // Generate tokens
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

    // Store refresh token
    await Token.create({ userId: user._id, token: refreshToken });

    // Return user and tokens
    res.status(201).json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  try {
    // Find user by email
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid email or password'
        }
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Account is disabled'
        }
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(req.body.password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid email or password'
        }
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate tokens
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

    // Store refresh token
    await Token.create({ userId: user._id, token: refreshToken });

    // Return user and tokens
    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
});

// Refresh token endpoint
app.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Refresh token is required'
        }
      });
    }

    // Verify token in database
    const tokenDoc = await Token.findOne({ token: refreshToken });
    if (!tokenDoc) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid refresh token'
        }
      });
    }

    // Verify and decode the JWT
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'User not found or inactive'
        }
      });
    }

    // Generate new tokens
    const newToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const newRefreshToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

    // Replace old refresh token
    await Token.findByIdAndDelete(tokenDoc._id);
    await Token.create({ userId: user._id, token: newRefreshToken });

    res.json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error(error);
    res.status(401).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'Invalid refresh token'
      }
    });
  }
});

// Logout endpoint
app.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Remove refresh token from database
      await Token.findOneAndDelete({ token: refreshToken });
    }

    res.json({
      success: true,
      message: 'Successfully logged out'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
});

// Get current user endpoint
app.get('/me', async (req, res) => {
  try {
    // In a real implementation, the user ID would come from the JWT verification middleware
    // For this example, we'll extract it from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Authentication token required'
        }
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        permissions: user.permissions,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(401).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'Invalid or expired token'
      }
    });
  }
});

app.listen(PORT, () => {
  console.log(`Auth Service running on port ${PORT}`);
});
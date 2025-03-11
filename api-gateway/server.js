const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();
const PORT = process.env.PORT || 3000;

// Common middleware
app.use(cors());
app.use(helmet());

// Logging middleware - keep this before any body parsing
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.'
    }
  }
});

app.use(limiter);

// JWT verification middleware
const jwt = require('jsonwebtoken');

/**
 * Middleware to verify JWT tokens and authenticate requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const verifyToken = (req, res, next) => {
  // Check if Authorization header exists and has the correct format
  const authHeader = req.headers.authorization;
  console.log('Authorization header:', authHeader);
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'Authentication token required'
      }
    });
  }

  // Extract the token from the Authorization header
  const token = authHeader.split(' ')[1];
  
  try {
    // Verify the token using the secret key
    // In production, store this secret in environment variables
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Add the decoded user information to the request object
    req.user = decoded;
    
    // Proceed to the next middleware or route handler
    next();
  } catch (error) {
    // Handle different types of JWT errors
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Authentication token has expired'
        }
      });
    } else if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid authentication token'
        }
      });
    } else {
      // Handle any other unexpected errors
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Internal server error'
        }
      });
    }
  }
};

/**
 * Role-based authorization middleware
 * @param {Array} allowedRoles - Array of roles allowed to access the resource
 * @returns {Function} Middleware function
 */
const authorizeRoles = (allowedRoles) => {
  return (req, res, next) => {
    // Check if user exists and has a role property
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'AUTHORIZATION_ERROR',
          message: 'You do not have permission to access this resource'
        }
      });
    }
    
    // Check if the user's role is in the allowed roles array
    if (allowedRoles.includes(req.user.role)) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        error: {
          code: 'AUTHORIZATION_ERROR',
          message: 'You do not have permission to access this resource'
        }
      });
    }
  };
};

// Example of how to create a token (for reference)
const generateToken = (user) => {
  // Create a payload with essential user information
  // Avoid including sensitive data in tokens
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role
  };
  
  // Sign the token with a secret key and set expiration
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: '1h' } // Token expires in 1 hour
  );
};

module.exports = {
  verifyToken,
  authorizeRoles,
  generateToken
};

// Common proxy options for all services
const createProxyOptions = (targetUrl, pathRewrite) => ({
  target: targetUrl,
  changeOrigin: true,
  pathRewrite,
  onProxyReq: (proxyReq, req, res) => {
    // If the body was parsed by Express
    if (req.body && Object.keys(req.body).length > 0) {
      const bodyData = JSON.stringify(req.body);
      
      // Update headers
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      
      // Write body to request
      proxyReq.write(bodyData);
    }
  }
});

// Routes mapping to microservices
// Authentication service - no authentication required
app.use('/api/v1/auth', 
  express.json(), // Parse JSON only for this route
  createProxyMiddleware(
    createProxyOptions(
      process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
      { '^/api/v1/auth': '/' }
    )
  )
);

// Donor service
app.use('/api/v1/donors', 
  express.json(),
  verifyToken, 
  createProxyMiddleware(
    createProxyOptions(
      process.env.DONOR_SERVICE_URL || 'http://localhost:3002',
      { '^/api/v1/donors': '/' }
    )
  )
);

// Donation service
app.use('/api/v1/donations', 
  express.json(),
  verifyToken, 
  createProxyMiddleware(
    createProxyOptions(
      process.env.DONATION_SERVICE_URL || 'http://localhost:3003',
      { '^/api/v1/donations': '/' }
    )
  )
);

// Receipt service
app.use('/api/v1/receipts', 
  express.json(),
  verifyToken, 
  createProxyMiddleware(
    createProxyOptions(
      process.env.RECEIPT_SERVICE_URL || 'http://localhost:3004',
      { '^/api/v1/receipts': '/' }
    )
  )
);

// Event service
app.use('/api/v1/events', 
  express.json(),
  verifyToken, 
  createProxyMiddleware(
    createProxyOptions(
      process.env.EVENT_SERVICE_URL || 'http://localhost:3005',
      { '^/api/v1/events': '/' }
    )
  )
);

// QR code service
app.use('/api/v1/qr-codes', 
  express.json(),
  verifyToken, 
  createProxyMiddleware(
    createProxyOptions(
      process.env.QR_SERVICE_URL || 'http://localhost:3006',
      { '^/api/v1/qr-codes': '/' }
    )
  )
);

// Admin service
app.use('/api/v1/admin', 
  express.json(),
  verifyToken, 
  createProxyMiddleware(
    createProxyOptions(
      process.env.ADMIN_SERVICE_URL || 'http://localhost:3007',
      { '^/api/v1/admin': '/' }
    )
  )
);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: {
      code: 'SERVER_ERROR',
      message: 'Internal server error'
    }
  });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
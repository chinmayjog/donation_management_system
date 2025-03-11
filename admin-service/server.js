const express = require('express');
const mongoose = require('mongoose');
const { body, param, query, validationResult } = require('express-validator');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3007;

app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/admin-service', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true
});

// System Config model
const systemConfigSchema = new mongoose.Schema({
  receiptSettings: {
    receiptPrefix: { type: String, default: 'REC' },
    receiptNumberFormat: { type: String, default: 'YYMMxxxx' },
    organizationName: { type: String, default: 'Donor Management System' },
    organizationAddress: { type: String, default: '123 Main Street, Mumbai, India' },
    organizationLogo: { type: String, default: '/assets/logo.png' },
    signatoryName: { type: String, default: 'John Smith' },
    signatoryPosition: { type: String, default: 'Treasurer' }
  },
  notificationSettings: {
    defaultWhatsAppTemplate: { type: String, default: 'donation_receipt' },
    defaultEmailSubject: { type: String, default: 'Thank You for Your Donation' },
    emailSenderName: { type: String, default: 'Donor Management System' },
    emailSenderAddress: { type: String, default: 'receipts@donormanagementsystem.com' }
  },
  eventSettings: {
    monsoonMonths: [{ type: Number }],
    defaultSeatingLayout: { type: String, default: 'theater' },
    defaultSectionNames: [{ type: String }]
  },
  updatedAt: { type: Date, default: Date.now }
});

const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);

// Audit Log model
const auditLogSchema = new mongoose.Schema({
  user: {
    id: { type: String, required: true },
    username: { type: String, required: true }
  },
  action: { 
    type: String, 
    enum: ['CREATE', 'READ', 'UPDATE', 'DELETE'], 
    required: true 
  },
  entity: { 
    type: String, 
    enum: ['DONOR', 'DONATION', 'RECEIPT', 'EVENT', 'USER', 'SYSTEM_CONFIG'], 
    required: true 
  },
  entityId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  ipAddress: { type: String },
  userAgent: { type: String },
  details: { type: mongoose.Schema.Types.Mixed }
});

// Index for faster queries
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ 'user.id': 1 });
auditLogSchema.index({ entity: 1, entityId: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// Permission middleware
const checkAdminPermission = (req, res, next) => {
  // In a real implementation, this would verify that the user has admin permissions
  // For this example, we'll just check for the presence of an admin role header
  const role = req.headers['x-user-role'];
  if (role !== 'admin' && role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'AUTHORIZATION_ERROR',
        message: 'Admin permission required'
      }
    });
  }
  next();
};

// Pagination middleware
const paginate = (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  
  req.pagination = {
    page,
    limit,
    skip: (page - 1) * limit
  };
  
  next();
};

// Apply middleware for all routes
app.use(checkAdminPermission);

// Get all users route
app.get('/users', paginate, async (req, res) => {
  try {
    // In a real microservice architecture, this would be a call to the auth service
    // For this example, we'll return mock data
    
    const mockUsers = [
      {
        id: '60d4a32e1f3d2c001f9a4ed8',
        username: 'johndoe',
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'admin',
        isActive: true,
        lastLogin: '2023-06-24T14:30:00.000Z',
        createdAt: '2023-06-24T14:30:45.123Z',
        updatedAt: '2023-06-24T14:30:45.123Z'
      },
      {
        id: '60d4a6601f3d2c001f9a4eed',
        username: 'janedoe',
        email: 'jane.doe@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'volunteer',
        isActive: true,
        lastLogin: '2023-06-24T15:20:00.000Z',
        createdAt: '2023-06-24T15:20:00.000Z',
        updatedAt: '2023-06-24T15:20:00.000Z'
      }
    ];
    
    // Log the action
    await logAction(req, 'READ', 'USER', 'all', { filters: req.query });
    
    res.json({
      success: true,
      count: mockUsers.length,
      pagination: {
        page: req.pagination.page,
        limit: req.pagination.limit,
        totalPages: 1,
        totalResults: mockUsers.length
      },
      data: mockUsers
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

// Create user route
app.post('/users', [
  body('username').isAlphanumeric().isLength({ min: 4 }),
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('firstName').notEmpty(),
  body('lastName').notEmpty(),
  body('phone').optional().isMobilePhone(),
  body('role').isIn(['volunteer', 'admin', 'superadmin']),
  body('permissions').optional().isArray()
], async (req, res) => {
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
    // In a real microservice architecture, this would be a call to the auth service
    // For this example, we'll return mock data with the input values
    
    const newUser = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      username: req.body.username,
      email: req.body.email,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      phone: req.body.phone,
      role: req.body.role,
      permissions: req.body.permissions || [],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Log the action
    await logAction(req, 'CREATE', 'USER', newUser.id, {
      username: newUser.username,
      email: newUser.email,
      role: newUser.role
    });
    
    res.status(201).json({
      success: true,
      data: newUser
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

// Update user route
app.put('/users/:userId', [
  param('userId').isMongoId(),
  body('role').optional().isIn(['volunteer', 'admin', 'superadmin']),
  body('permissions').optional().isArray(),
  body('isActive').optional().isBoolean()
], async (req, res) => {
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
    // In a real microservice architecture, this would be a call to the auth service
    // For this example, we'll return mock data
    
    const originalUser = {
      id: req.params.userId,
      username: 'sanjay',
      email: 'sanjay.gupta@example.com',
      firstName: 'Sanjay',
      lastName: 'Gupta',
      role: 'volunteer',
      permissions: ['manage-donors', 'manage-receipts'],
      isActive: true,
      createdAt: '2023-06-24T15:25:00.000Z',
      updatedAt: '2023-06-24T15:25:00.000Z'
    };
    
    // Update user with the provided fields
    const updatedUser = { ...originalUser };
    
    if (req.body.role) updatedUser.role = req.body.role;
    if (req.body.permissions) updatedUser.permissions = req.body.permissions;
    if (req.body.isActive !== undefined) updatedUser.isActive = req.body.isActive;
    
    updatedUser.updatedAt = new Date().toISOString();
    
    // Log the changes for audit
    const changes = {};
    if (req.body.role && req.body.role !== originalUser.role) {
      changes.role = {
        old: originalUser.role,
        new: req.body.role
      };
    }
    
    if (req.body.permissions) {
      changes.permissions = {
        old: originalUser.permissions,
        new: req.body.permissions
      };
    }
    
    if (req.body.isActive !== undefined && req.body.isActive !== originalUser.isActive) {
      changes.isActive = {
        old: originalUser.isActive,
        new: req.body.isActive
      };
    }
    
    // Log the action
    await logAction(req, 'UPDATE', 'USER', req.params.userId, changes);
    
    res.json({
      success: true,
      data: updatedUser
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

// Get system config route
app.get('/system-config', async (req, res) => {
  try {
    // Get the current system config or create a default one if not exists
    let config = await SystemConfig.findOne();
    
    if (!config) {
      config = new SystemConfig({
        receiptSettings: {
          receiptPrefix: 'REC',
          receiptNumberFormat: 'YYMMxxxx',
          organizationName: 'Donor Management System',
          organizationAddress: '123 Main Street, Mumbai, India',
          organizationLogo: '/assets/logo.png',
          signatoryName: 'John Smith',
          signatoryPosition: 'Treasurer'
        },
        notificationSettings: {
          defaultWhatsAppTemplate: 'donation_receipt',
          defaultEmailSubject: 'Thank You for Your Donation',
          emailSenderName: 'Donor Management System',
          emailSenderAddress: 'receipts@donormanagementsystem.com'
        },
        eventSettings: {
          monsoonMonths: [6, 7, 8, 9],
          defaultSeatingLayout: 'theater',
          defaultSectionNames: ['A', 'B', 'C']
        }
      });
      
      await config.save();
    }
    
    // Log the action
    await logAction(req, 'READ', 'SYSTEM_CONFIG', config._id);
    
    res.json({
      success: true,
      data: {
        receiptSettings: config.receiptSettings,
        notificationSettings: config.notificationSettings,
        eventSettings: config.eventSettings
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

// Update system config route
app.put('/system-config', [
  body('receiptSettings').optional(),
  body('notificationSettings').optional(),
  body('eventSettings').optional()
], async (req, res) => {
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
    // Get the current system config or create a default one if not exists
    let config = await SystemConfig.findOne();
    
    if (!config) {
      config = new SystemConfig();
    }
    
    // Keep track of changes for audit
    const changes = {};
    
    // Update receipt settings if provided
    if (req.body.receiptSettings) {
      const oldReceiptSettings = { ...config.receiptSettings.toObject() };
      
      Object.keys(req.body.receiptSettings).forEach(key => {
        if (config.receiptSettings[key] !== undefined) {
          if (config.receiptSettings[key] !== req.body.receiptSettings[key]) {
            // Only record changed fields
            if (!changes.receiptSettings) changes.receiptSettings = {};
            changes.receiptSettings[key] = {
              old: config.receiptSettings[key],
              new: req.body.receiptSettings[key]
            };
          }
          config.receiptSettings[key] = req.body.receiptSettings[key];
        }
      });
    }
    
    // Update notification settings if provided
    if (req.body.notificationSettings) {
      const oldNotificationSettings = { ...config.notificationSettings.toObject() };
      
      Object.keys(req.body.notificationSettings).forEach(key => {
        if (config.notificationSettings[key] !== undefined) {
          if (config.notificationSettings[key] !== req.body.notificationSettings[key]) {
            // Only record changed fields
            if (!changes.notificationSettings) changes.notificationSettings = {};
            changes.notificationSettings[key] = {
              old: config.notificationSettings[key],
              new: req.body.notificationSettings[key]
            };
          }
          config.notificationSettings[key] = req.body.notificationSettings[key];
        }
      });
    }
    
    // Update event settings if provided
    if (req.body.eventSettings) {
      const oldEventSettings = { ...config.eventSettings.toObject() };
      
      Object.keys(req.body.eventSettings).forEach(key => {
        if (config.eventSettings[key] !== undefined) {
          // Special handling for arrays (e.g. monsoonMonths)
          if (Array.isArray(config.eventSettings[key])) {
            if (JSON.stringify(config.eventSettings[key]) !== JSON.stringify(req.body.eventSettings[key])) {
              // Only record changed fields
              if (!changes.eventSettings) changes.eventSettings = {};
              changes.eventSettings[key] = {
                old: config.eventSettings[key],
                new: req.body.eventSettings[key]
              };
            }
          } else if (config.eventSettings[key] !== req.body.eventSettings[key]) {
            // Only record changed fields
            if (!changes.eventSettings) changes.eventSettings = {};
            changes.eventSettings[key] = {
              old: config.eventSettings[key],
              new: req.body.eventSettings[key]
            };
          }
          config.eventSettings[key] = req.body.eventSettings[key];
        }
      });
    }
    
    config.updatedAt = new Date();
    await config.save();
    
    // Log the action
    await logAction(req, 'UPDATE', 'SYSTEM_CONFIG', config._id, changes);
    
    res.json({
      success: true,
      data: {
        receiptSettings: config.receiptSettings,
        notificationSettings: config.notificationSettings,
        eventSettings: config.eventSettings
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

// Get audit logs route
app.get('/audit-logs', paginate, [
  query('user').optional(),
  query('action').optional().isIn(['CREATE', 'READ', 'UPDATE', 'DELETE']),
  query('entity').optional().isIn(['DONOR', 'DONATION', 'RECEIPT', 'EVENT', 'USER', 'SYSTEM_CONFIG']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('sort').optional()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: errors.array()
      }
    });
  }

  try {
    const { page, limit, skip } = req.pagination;
    
    // Build query based on filters
    const query = {};
    
    if (req.query.user) query['user.id'] = req.query.user;
    if (req.query.action) query.action = req.query.action;
    if (req.query.entity) query.entity = req.query.entity;
    
    // Date range filters
    if (req.query.startDate || req.query.endDate) {
      query.timestamp = {};
      if (req.query.startDate) {
        query.timestamp.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        query.timestamp.$lte = new Date(req.query.endDate);
      }
    }
    
    // Count total results
    const total = await AuditLog.countDocuments(query);
    
    // Build sort options
    let sort = { timestamp: -1 }; // Default sort by timestamp desc
    if (req.query.sort) {
      sort = {};
      const sortField = req.query.sort;
      if (sortField.startsWith('-')) {
        sort[sortField.substr(1)] = -1;
      } else {
        sort[sortField] = 1;
      }
    }
    
    // Execute query
    const logs = await AuditLog.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit);
    
    // Calculate pagination details
    const totalPages = Math.ceil(total / limit);
    
    res.json({
      success: true,
      count: logs.length,
      pagination: {
        page,
        limit,
        totalPages,
        totalResults: total
      },
      data: logs
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

// Helper function to log audit events
async function logAction(req, action, entity, entityId, details = {}) {
  try {
    // In a real implementation, we would get the user ID and username from the JWT
    // For now, we'll use placeholder or headers
    const userId = req.headers['x-user-id'] || 'system';
    const username = req.headers['x-username'] || 'system';
    
    const log = new AuditLog({
      user: {
        id: userId,
        username: username
      },
      action,
      entity,
      entityId: entityId.toString(),
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details
    });
    
    await log.save();
  } catch (error) {
    console.error('Error logging action:', error);
    // Don't throw the error to avoid disrupting the main request
  }
}

app.listen(PORT, () => {
  console.log(`Admin Service running on port ${PORT}`);
});
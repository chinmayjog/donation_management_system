const express = require('express');
const mongoose = require('mongoose');
const { body, param, query, validationResult } = require('express-validator');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const receiptServiceClient = require('../shared/receiptServiceClient').default;
const donorServiceClient = require('../shared/donorServiceClient').default;
const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

// JWT verification middleware
const verifyToken = (req, res, next) => {
  // Check if Authorization header exists and has the correct format
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

  // Extract the token from the Authorization header
  const token = authHeader.split(' ')[1];
  
  try {
    // Verify the token using the secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
    
    // Add the decoded user information to the request object
    req.user = decoded;
    
    // Add user ID and role to headers for service-to-service communication
    req.headers['x-user-id'] = decoded.id;
    req.headers['x-user-role'] = decoded.role;
    
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
      console.error('JWT verification error:', error);
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

// Role-based authorization middleware
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

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/donation-service', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true
});

// Donation model
const donationSchema = new mongoose.Schema({
  donorId: { type: String, required: true },
  amount: { type: Number, required: true },
  donationDate: { type: Date, required: true, default: Date.now },
  paymentMethod: { 
    type: String, 
    enum: ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_CARD', 'UPI', 'OTHER'],
    required: true 
  },
  transactionReference: { type: String },
  notes: { type: String },
  receiptStatus: { type: String, enum: ['PENDING', 'GENERATED', 'DELIVERED'], default: 'PENDING' },
  receiptId: { type: String },
  recordedBy: { type: String, required: true }, // User ID who recorded this donation
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Create indexes for frequent queries
donationSchema.index({ donorId: 1 });
donationSchema.index({ donationDate: -1 });
donationSchema.index({ paymentMethod: 1 });
donationSchema.index({ receiptStatus: 1 });

// Add error handling for database connection
mongoose.connection.on('connected', () => {
  console.log('Connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error(`MongoDB connection error: ${err}`);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

const Donation = mongoose.model('Donation', donationSchema);

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

// Apply JWT verification to all routes
app.use(verifyToken);

// Get all donations
app.get('/', paginate, async (req, res) => {
  try {
    const { page, limit, skip } = req.pagination;
    
    // Build query based on filters
    const query = {};
    
    if (req.query.donorId) query.donorId = req.query.donorId;
    if (req.query.paymentMethod) query.paymentMethod = req.query.paymentMethod;
    if (req.query.receiptStatus) query.receiptStatus = req.query.receiptStatus;
    
    // Amount range filters
    if (req.query.minAmount) query.amount = { $gte: parseFloat(req.query.minAmount) };
    if (req.query.maxAmount) {
      if (query.amount) {
        query.amount.$lte = parseFloat(req.query.maxAmount);
      } else {
        query.amount = { $lte: parseFloat(req.query.maxAmount) };
      }
    }
    
    // Date range filters
    if (req.query.startDate || req.query.endDate) {
      query.donationDate = {};
      if (req.query.startDate) {
        query.donationDate.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        query.donationDate.$lte = new Date(req.query.endDate);
      }
    }
    
    // Count total results
    const total = await Donation.countDocuments(query);
    
    // Build sort options
    let sort = {};
    if (req.query.sort) {
      const sortFields = req.query.sort.split(',');
      sortFields.forEach(field => {
        if (field.startsWith('-')) {
          sort[field.substr(1)] = -1;
        } else {
          sort[field] = 1;
        }
      });
    } else {
      // Default sort by donationDate desc
      sort = { donationDate: -1 };
    }
    
    // Execute query
    const donations = await Donation.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit);
      
    // In a microservice architecture, we fetch the donor information
    // from the donor service for each donation to enrich the response
    
    // Get all unique donor IDs
    const donorIds = [...new Set(donations.map(donation => donation.donorId))];
      
    // Batch fetch all donor information
    const donorMap = await donorServiceClient.getDonors(donorIds, req.headers);
    
    // For donations with receipts, collect receipt IDs
    const receiptIds = donations
      .filter(donation => donation.receiptId)
      .map(donation => donation.receiptId);
    
    // Create map to store receipt data - we won't batch fetch receipts for now
    // since the receipt service might not support it, but in a real implementation
    // you'd want to add batch support to the receipt service too
    const receiptMap = {};
    
    // Process donations with donor and receipt info
    const donationsWithInfo = await Promise.all(donations.map(async donation => {
      const { _id, donorId, amount, donationDate, paymentMethod, 
              transactionReference, notes, receiptStatus, receiptId, 
              createdAt, updatedAt } = donation;
      
      // Get donor info from the map
      const donor = donorMap[donorId] || {
        id: donorId,
        firstName: 'Unknown',
        lastName: 'Donor',
        email: 'unknown@example.com'
      };
      
      // Process receipt if it exists
      let receipt = null;
      if (receiptId) {
        // Check if we already got this receipt
        if (receiptMap[receiptId]) {
          receipt = receiptMap[receiptId];
        } else {
          // Individual fetch for now - could be optimized with batch fetch
          const fetchedReceipt = await receiptServiceClient.getReceiptById(receiptId, req.headers);
          
          if (fetchedReceipt) {
            receipt = fetchedReceipt;
            receiptMap[receiptId] = fetchedReceipt;
          } else {
            // Create minimal receipt data if service is unavailable
            receipt = {
              id: receiptId,
              receiptNumber: 'Unavailable',
              deliveryStatus: receiptStatus,
              _serviceUnavailable: true
            };
          }
        }
      }
      
      return {
        id: _id,
        donor,
        amount,
        donationDate,
        paymentMethod,
        transactionReference,
        notes,
        receipt,
        createdAt,
        updatedAt
      };
    }));
    
    // Calculate pagination details
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    
    res.json({
      success: true,
      count: donations.length,
      pagination: {
        page,
        limit,
        totalPages,
        totalResults: total,
        next: hasNextPage ? `/api/v1/donations?page=${page+1}&limit=${limit}` : null,
        prev: hasPrevPage ? `/api/v1/donations?page=${page-1}&limit=${limit}` : null
      },
      data: donationsWithInfo
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

// Get single donation
app.get('/:donationId', [
  param('donationId').isMongoId()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid donation ID format',
        details: errors.array()
      }
    });
  }

  try {
    const donation = await Donation.findById(req.params.donationId);
    
    if (!donation) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Donation not found'
        }
      });
    }
    
    // Fetch donor data from donor service
    const donor = await donorServiceClient.getDonor(donation.donorId, req.headers);
    
    // Simulated recorded-by user data
    const recordedBy = {
      id: donation.recordedBy,
      username: 'johndoe'
    };
    
    // Fetch receipt data if receipt exists
    let receipt = null;
    if (donation.receiptId) {
      // Try to fetch from receipt service
      receipt = await receiptServiceClient.getReceiptById(donation.receiptId, req.headers);
      
      if (!receipt) {
        // If receipt service is down, create a minimal receipt object
        receipt = {
          id: donation.receiptId,
          receiptNumber: 'Unavailable',
          deliveryStatus: donation.receiptStatus === 'DELIVERED' ? 'DELIVERED' : 'PENDING',
          deliveryMethod: 'Unknown',
          _serviceUnavailable: true
        };
      }
    }
    
    const response = {
      success: true,
      data: {
        id: donation._id,
        donor,
        amount: donation.amount,
        donationDate: donation.donationDate,
        paymentMethod: donation.paymentMethod,
        transactionReference: donation.transactionReference,
        notes: donation.notes,
        recordedBy,
        receipt,
        createdAt: donation.createdAt,
        updatedAt: donation.updatedAt
      }
    };
    
    res.json(response);
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

// Create donation
app.post('/', [
  body('donorId').isMongoId(),
  body('amount').isNumeric().custom(value => value > 0),
  body('paymentMethod').isIn(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_CARD', 'UPI', 'OTHER']),
  body('transactionReference').optional(),
  body('donationDate').optional().isISO8601(),
  body('notes').optional()
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
    // Verify that the donor exists by making a request to the donor service
    try {
      const donor = await donorServiceClient.getDonor(req.body.donorId, req.headers);
      
      // If we received default data, it means the donor wasn't found
      if (donor._defaultData) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'Donor not found'
          }
        });
      }
    } catch (error) {
      // For errors we couldn't handle in the client
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to verify donor existence'
        }
      });
    }
    
    // Get user ID from JWT (which is already verified)
    const userId = req.user.id;
    
    // Create new donation
    const donation = new Donation({
      donorId: req.body.donorId,
      amount: req.body.amount,
      paymentMethod: req.body.paymentMethod,
      transactionReference: req.body.transactionReference,
      donationDate: req.body.donationDate || new Date(),
      notes: req.body.notes,
      recordedBy: userId
    });
    
    await donation.save();
    
    // Update the donor's totalDonations through the donor service
    try {
      const donorServiceUrl = process.env.DONOR_SERVICE_URL || 'http://donor-service:3002';
      // This would be a PATCH request in a real implementation to update just the totalDonations field
      // For simplicity, we're just logging the intent here
      console.log(`Would update totalDonations for donor ${req.body.donorId} with amount ${req.body.amount}`);
      
      // Example of what the real implementation might look like:
      /*
      await axios.patch(
        `${donorServiceUrl}/${req.body.donorId}/update-donation-total`, 
        { amount: req.body.amount },
        {
          headers: {
            'Authorization': req.headers.authorization,
            'x-user-id': req.headers['x-user-id'],
            'x-user-role': req.headers['x-user-role']
          }
        }
      );
      */
    } catch (error) {
      // Log but don't fail the transaction
      console.error(`Error updating donor totalDonations: ${error.message}`);
    }
    
    // In a production environment with message broker (RabbitMQ, Kafka), 
    // we would publish an event for receipt generation
    // For now, we'll just log the intent
    console.log(`Donation created. Receipt generation should be triggered for donation ${donation._id}`);
    
    // Fetch donor data from donor service
    const donor = await donorServiceClient.getDonor(req.body.donorId, req.headers);
    
    const response = {
      success: true,
      data: {
        id: donation._id,
        donor,
        amount: donation.amount,
        donationDate: donation.donationDate,
        paymentMethod: donation.paymentMethod,
        transactionReference: donation.transactionReference,
        notes: donation.notes,
        createdAt: donation.createdAt,
        updatedAt: donation.updatedAt
      }
    };
    
    res.status(201).json(response);
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

// Update donation
app.put('/:donationId', [
  param('donationId').isMongoId(),
  body('amount').optional().isNumeric().custom(value => value > 0),
  body('paymentMethod').optional().isIn(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_CARD', 'UPI', 'OTHER']),
  body('transactionReference').optional(),
  body('donationDate').optional().isISO8601(),
  body('notes').optional()
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
    // Check if donation exists
    const donation = await Donation.findById(req.params.donationId);
    if (!donation) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Donation not found'
        }
      });
    }
    
    // Check if donation has a receipt already
    // In a real implementation, we might prevent certain changes if receipt is generated
    if (donation.receiptStatus !== 'PENDING' && 
        (req.body.amount !== undefined || req.body.donationDate !== undefined)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot modify amount or date after receipt has been generated'
        }
      });
    }
    
    // Update fields if provided
    if (req.body.amount !== undefined) donation.amount = req.body.amount;
    if (req.body.paymentMethod) donation.paymentMethod = req.body.paymentMethod;
    if (req.body.transactionReference !== undefined) donation.transactionReference = req.body.transactionReference;
    if (req.body.donationDate) donation.donationDate = new Date(req.body.donationDate);
    if (req.body.notes !== undefined) donation.notes = req.body.notes;
    
    donation.updatedAt = new Date();
    await donation.save();
    
    // If receipt already exists and we changed amount or date, we might need to update it
    // This would involve publishing an event or making a request to the receipt service
    
    // Fetch donor data from donor service
    const donor = await donorServiceClient.getDonor(donation.donorId, req.headers);
    
    const response = {
      success: true,
      data: {
        id: donation._id,
        donor,
        amount: donation.amount,
        donationDate: donation.donationDate,
        paymentMethod: donation.paymentMethod,
        transactionReference: donation.transactionReference,
        notes: donation.notes,
        createdAt: donation.createdAt,
        updatedAt: donation.updatedAt
      }
    };
    
    res.json(response);
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

// Generate receipt for donation (available to admins and volunteers)
app.post('/:donationId/receipt', authorizeRoles(['admin', 'superadmin', 'volunteer']), [
  param('donationId').isMongoId(),
  body('deliveryMethod').isIn(['EMAIL', 'WHATSAPP', 'SMS', 'PRINT'])
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
    // Check if donation exists
    const donation = await Donation.findById(req.params.donationId);
    if (!donation) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Donation not found'
        }
      });
    }
    
    // Check if receipt already exists
    if (donation.receiptStatus !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DUPLICATE_ERROR',
          message: 'Receipt already generated for this donation'
        }
      });
    }
    
    // Call receipt service to generate a receipt using our client
    const receipt = await receiptServiceClient.generateReceipt(
      donation._id.toString(),
      req.body.deliveryMethod,
      req.headers
    );
    
    // Check if we got a proper receipt or a default one due to service failure
    if (receipt._defaultData) {
      // Service failed but we can still update our local status
      donation.receiptStatus = 'GENERATED';
      donation.updatedAt = new Date();
      await donation.save();
      
      // Return a partial success response
      return res.status(202).json({
        success: true,
        warning: 'Receipt service temporarily unavailable, receipt will be generated asynchronously',
        data: {
          donationId: donation._id,
          status: 'PROCESSING'
        }
      });
    }
    
    // Got a real receipt, update the donation with receipt info
    donation.receiptId = receipt.id;
    donation.receiptStatus = 'GENERATED';
    donation.updatedAt = new Date();
    await donation.save();
    
    // Return the receipt data from the receipt service
    res.status(201).json({
      success: true,
      data: receipt
    });
  } catch (error) {
    console.error('Error generating receipt:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to generate receipt'
      }
    });
  }
});


// Get monthly donation statistics (available to admins and volunteers)
app.get('/statistics/monthly', authorizeRoles(['admin', 'superadmin', 'volunteer']), async (req, res) => {
  try {
    // Parse date range from query params
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    
    // Aggregation pipeline to get monthly statistics
    const monthlyStats = await Donation.aggregate([
      {
        $match: {
          donationDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$donationDate" },
            month: { $month: "$donationDate" }
          },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
          avgAmount: { $avg: "$amount" },
          minAmount: { $min: "$amount" },
          maxAmount: { $max: "$amount" }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      }
    ]);
    
    // Transform the data for easier consumption
    const formattedStats = monthlyStats.map(stat => {
      const year = stat._id.year;
      const month = stat._id.month;
      const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });
      
      return {
        period: `${monthName} ${year}`,
        year,
        month,
        totalAmount: stat.totalAmount,
        count: stat.count,
        avgAmount: parseFloat(stat.avgAmount.toFixed(2)),
        minAmount: stat.minAmount,
        maxAmount: stat.maxAmount
      };
    });
    
    res.json({
      success: true,
      count: formattedStats.length,
      data: formattedStats
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

// Get payment method statistics (available to admins and volunteers)
app.get('/statistics/payment-methods', authorizeRoles(['admin', 'superadmin', 'volunteer']), async (req, res) => {
  try {
    // Parse date range from query params
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    
    // Aggregation pipeline to get payment method statistics
    const paymentStats = await Donation.aggregate([
      {
        $match: {
          donationDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$paymentMethod",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
          avgAmount: { $avg: "$amount" }
        }
      },
      {
        $sort: { totalAmount: -1 }
      }
    ]);
    
    // Transform the data for easier consumption
    const formattedStats = paymentStats.map(stat => {
      return {
        paymentMethod: stat._id,
        totalAmount: stat.totalAmount,
        count: stat.count,
        avgAmount: parseFloat(stat.avgAmount.toFixed(2)),
        percentage: 0 // Will be calculated below
      };
    });
    
    // Calculate percentage of total
    const totalAmount = formattedStats.reduce((sum, item) => sum + item.totalAmount, 0);
    formattedStats.forEach(item => {
      item.percentage = parseFloat(((item.totalAmount / totalAmount) * 100).toFixed(2));
    });
    
    res.json({
      success: true,
      count: formattedStats.length,
      data: formattedStats
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

// Delete donation (only available for admins)
app.delete('/:donationId', authorizeRoles(['admin', 'superadmin']), [
  param('donationId').isMongoId()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid donation ID format',
        details: errors.array()
      }
    });
  }

  try {
    // User permissions are already checked by the authorizeRoles middleware
    
    // Check if donation exists
    const donation = await Donation.findById(req.params.donationId);
    if (!donation) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Donation not found'
        }
      });
    }
    
    // Check if receipt has been generated
    if (donation.receiptStatus !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot delete donation after receipt has been generated'
        }
      });
    }
    
    // Delete the donation
    await Donation.findByIdAndDelete(req.params.donationId);
    
    res.json({
      success: true,
      data: {
        message: 'Donation deleted successfully'
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'donation-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    connections: {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      donorService: 'available' // This would be dynamically determined in a real implementation
    }
  });
});

app.listen(PORT, () => {
  console.log(`Donation Service running on port ${PORT}`);
});
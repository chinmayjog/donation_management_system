const express = require('express');
const mongoose = require('mongoose');
const { body, param, query, validationResult } = require('express-validator');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/donor-service', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true
});

// Donor model
const donorSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  panNumber: { type: String, required: false },
  panVerified: { type: Boolean, default: false },
  address: { type: String },
  city: { type: String },
  state: { type: String },
  postalCode: { type: String },
  preferredCommunication: { type: String, enum: ['email', 'sms', 'whatsapp', 'call'], default: 'email' },
  totalDonations: { type: Number, default: 0 },
  createdBy: { type: String, required: true }, // User ID who created this donor
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index for text search
donorSchema.index({ 
  firstName: 'text', 
  lastName: 'text', 
  email: 'text', 
  phone: 'text', 
  city: 'text' 
});

const Donor = mongoose.model('Donor', donorSchema);

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

// Get all donors
app.get('/', paginate, async (req, res) => {
  try {
    const { page, limit, skip } = req.pagination;
    
    // Build query based on filters
    const query = {};
    
    if (req.query.city) query.city = req.query.city;
    if (req.query.state) query.state = req.query.state;
    
    // Text search
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }
    
    // Count total results
    const total = await Donor.countDocuments(query);
    
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
      // Default sort by createdAt desc
      sort = { createdAt: -1 };
    }
    
    // Execute query
    const donors = await Donor.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit);
    
    // Calculate pagination details
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    
    res.json({
      success: true,
      count: donors.length,
      pagination: {
        page,
        limit,
        totalPages,
        totalResults: total,
        next: hasNextPage ? `/api/v1/donors?page=${page+1}&limit=${limit}` : null,
        prev: hasPrevPage ? `/api/v1/donors?page=${page-1}&limit=${limit}` : null
      },
      data: donors
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

// Get single donor
app.get('/:donorId', [
  param('donorId').isMongoId()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid donor ID format',
        details: errors.array()
      }
    });
  }

  try {
    const donor = await Donor.findById(req.params.donorId);
    
    if (!donor) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Donor not found'
        }
      });
    }
    
    res.json({
      success: true,
      data: donor
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

// Create donor
app.post('/', [
  body('firstName').notEmpty(),
  body('lastName').notEmpty(),
  body('email').isEmail(),
  body('phone').isMobilePhone(),
  body('panNumber').optional(),
  body('address').optional(),
  body('city').optional(),
  body('state').optional(),
  body('postalCode').optional(),
  body('preferredCommunication').optional().isIn(['email', 'sms', 'whatsapp', 'call'])
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
    // Check if donor with this email already exists
    const existingDonor = await Donor.findOne({ email: req.body.email });
    if (existingDonor) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DUPLICATE_ERROR',
          message: 'Donor with this email already exists'
        }
      });
    }
    
    // Get user ID from JWT (in a real implementation)
    // For now, we'll use a placeholder
    const userId = req.headers['x-user-id'] || 'system';
    
    // Create new donor
    const donor = new Donor({
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      phone: req.body.phone,
      panNumber: req.body.panNumber,
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      postalCode: req.body.postalCode,
      preferredCommunication: req.body.preferredCommunication || 'email',
      createdBy: userId
    });
    
    await donor.save();
    
    // Publish event to message broker (in a real implementation)
    // For now, just log
    console.log('Donor created:', donor._id);
    
    res.status(201).json({
      success: true,
      data: donor
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

// Update donor
app.put('/:donorId', [
  param('donorId').isMongoId(),
  body('firstName').optional(),
  body('lastName').optional(),
  body('email').optional().isEmail(),
  body('phone').optional().isMobilePhone(),
  body('address').optional(),
  body('city').optional(),
  body('state').optional(),
  body('postalCode').optional(),
  body('preferredCommunication').optional().isIn(['email', 'sms', 'whatsapp', 'call'])
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
    // Check if donor exists
    const donor = await Donor.findById(req.params.donorId);
    if (!donor) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Donor not found'
        }
      });
    }
    
    // Update fields if provided
    if (req.body.firstName) donor.firstName = req.body.firstName;
    if (req.body.lastName) donor.lastName = req.body.lastName;
    if (req.body.email) donor.email = req.body.email;
    if (req.body.phone) donor.phone = req.body.phone;
    if (req.body.address) donor.address = req.body.address;
    if (req.body.city) donor.city = req.body.city;
    if (req.body.state) donor.state = req.body.state;
    if (req.body.postalCode) donor.postalCode = req.body.postalCode;
    if (req.body.preferredCommunication) donor.preferredCommunication = req.body.preferredCommunication;
    
    donor.updatedAt = new Date();
    await donor.save();
    
    res.json({
      success: true,
      data: donor
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

// Verify donor PAN
app.post('/:donorId/verify-pan', [
  param('donorId').isMongoId(),
  body('panNumber').notEmpty()
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
    // Check if donor exists
    const donor = await Donor.findById(req.params.donorId);
    if (!donor) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Donor not found'
        }
      });
    }
    
    // In a real implementation, this would call a PAN verification service
    // For this example, we'll simulate a successful verification
    const panNumber = req.body.panNumber;
    const isValid = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber);
    
    if (isValid) {
      donor.panNumber = panNumber;
      donor.panVerified = true;
      donor.updatedAt = new Date();
      await donor.save();
      
      res.json({
        success: true,
        data: {
          verified: true,
          message: 'PAN verification successful'
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid PAN format'
        }
      });
    }
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

// Get donor donations
// This would typically call the donation service
app.get('/:donorId/donations', [
  param('donorId').isMongoId()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid donor ID format',
        details: errors.array()
      }
    });
  }

  try {
    // Check if donor exists
    const donor = await Donor.findById(req.params.donorId);
    if (!donor) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Donor not found'
        }
      });
    }
    
    // In a real implementation, this would call the donation service
    // For this example, we'll return mock data
    res.json({
      success: true,
      count: 2,
      data: [
        {
          id: '60d4a4801f3d2c001f9a4edc',
          amount: 5000.00,
          donationDate: '2023-06-24T14:42:24.789Z',
          paymentMethod: 'BANK_TRANSFER',
          transactionReference: 'TXN123456',
          notes: 'Annual donation',
          createdAt: '2023-06-24T14:42:24.789Z',
          updatedAt: '2023-06-24T14:42:24.789Z'
        },
        {
          id: '60d4a4a51f3d2c001f9a4edd',
          amount: 2500.00,
          donationDate: '2023-06-25T10:10:24.789Z',
          paymentMethod: 'UPI',
          transactionReference: 'UPI789012',
          notes: 'Special event contribution',
          createdAt: '2023-06-25T10:10:24.789Z',
          updatedAt: '2023-06-25T10:10:24.789Z'
        }
      ]
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

// Get donor events
app.get('/:donorId/events', [
  param('donorId').isMongoId()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid donor ID format',
        details: errors.array()
      }
    });
  }

  try {
    // Check if donor exists
    const donor = await Donor.findById(req.params.donorId);
    if (!donor) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Donor not found'
        }
      });
    }
    
    // In a real implementation, this would call the event service
    // For this example, we'll return mock data
    res.json({
      success: true,
      count: 1,
      data: [
        {
          id: '60d4a4d51f3d2c001f9a4ede',
          event: {
            id: '60d4a4f01f3d2c001f9a4edf',
            title: 'Annual Donor Appreciation Dinner',
            eventDate: '2023-07-15T18:00:00.000Z',
            location: 'Grand Hotel, Mumbai'
          },
          status: 'REGISTERED',
          seat: {
            section: 'A',
            row: '3',
            number: '12'
          },
          qrCode: {
            id: '60d4a5101f3d2c001f9a4ee0',
            url: '/api/qr-codes/60d4a5101f3d2c001f9a4ee0'
          },
          createdAt: '2023-06-24T14:44:21.789Z',
          updatedAt: '2023-06-24T14:44:21.789Z'
        }
      ]
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

app.listen(PORT, () => {
  console.log(`Donor Service running on port ${PORT}`);
});
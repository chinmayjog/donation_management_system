const express = require('express');
const mongoose = require('mongoose');
const { body, param, query, validationResult } = require('express-validator');
const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

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

// Get all donations
app.get('/', paginate, async (req, res) => {
  try {
    const { page, limit, skip } = req.pagination;
    
    // Build query based on filters
    const query = {};
    
    if (req.query.paymentMethod) query.paymentMethod = req.query.paymentMethod;
    
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
      
    // In a real microservice architecture, we'd need to fetch the donor information
    // from the donor service for each donation. Here we'll simulate that with
    // mock donor data
    
    const donationsWithDonorInfo = donations.map(donation => {
      const { _id, donorId, amount, donationDate, paymentMethod, transactionReference, 
              receiptStatus, receiptId, createdAt, updatedAt } = donation;
      
      // This is where we'd typically make a request to the donor service
      // For this example, we'll use mock data
      let donor;
      if (donorId === '60d4a3a91f3d2c001f9a4ed9') {
        donor = {
          id: donorId,
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com'
        };
      } else {
        donor = {
          id: donorId,
          firstName: 'Unknown',
          lastName: 'Donor',
          email: 'unknown@example.com'
        };
      }
      
      // Mock receipt data
      let receipt = null;
      if (receiptId) {
        receipt = {
          id: receiptId,
          receiptNumber: `REC${new Date(createdAt).getFullYear()}${String(new Date(createdAt).getMonth() + 1).padStart(2, '0')}0001`
        };
      }
      
      return {
        id: _id,
        donor,
        amount,
        donationDate,
        paymentMethod,
        transactionReference,
        receipt,
        createdAt,
        updatedAt
      };
    });
    
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
      data: donationsWithDonorInfo
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
    
    // In a real implementation, these would be API calls to the respective services
    // Simulated donor data
    const donor = {
      id: donation.donorId,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@example.com',
      phone: '+919876543211'
    };
    
    // Simulated recorded-by user data
    const recordedBy = {
      id: donation.recordedBy,
      username: 'johndoe'
    };
    
    // Simulated receipt data
    let receipt = null;
    if (donation.receiptId) {
      receipt = {
        id: donation.receiptId,
        receiptNumber: `REC${new Date(donation.createdAt).getFullYear()}${String(new Date(donation.createdAt).getMonth() + 1).padStart(2, '0')}0001`,
        deliveryStatus: 'DELIVERED',
        deliveryMethod: 'WHATSAPP'
      };
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
    // In a real implementation, we would verify that the donor exists by making a request to the donor service
    // For this example, we'll assume the donor exists
    
    // Get user ID from JWT (in a real implementation)
    // For now, we'll use a placeholder
    const userId = req.headers['x-user-id'] || 'system';
    
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
    
    // In a real implementation, we would update the donor's totalDonations
    // by making a request to the donor service or by publishing an event
    
    // We would also trigger receipt generation by publishing an event
    // or making a request to the receipt service
    
    // Simulated donor data
    const donor = {
      id: donation.donorId,
      firstName: 'Jane',
      lastName: 'Smith'
    };
    
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
    
    // Update fields if provided
    if (req.body.amount) donation.amount = req.body.amount;
    if (req.body.paymentMethod) donation.paymentMethod = req.body.paymentMethod;
    if (req.body.transactionReference) donation.transactionReference = req.body.transactionReference;
    if (req.body.donationDate) donation.donationDate = new Date(req.body.donationDate);
    if (req.body.notes) donation.notes = req.body.notes;
    
    donation.updatedAt = new Date();
    await donation.save();
    
    // If receipt already exists, we might need to update it
    // This would involve publishing an event or making a request to the receipt service
    
    // Simulated donor data
    const donor = {
      id: donation.donorId,
      firstName: 'Jane',
      lastName: 'Smith'
    };
    
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

app.listen(PORT, () => {
  console.log(`Donation Service running on port ${PORT}`);
});
const express = require('express');
const mongoose = require('mongoose');
const { body, param, query, validationResult } = require('express-validator');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const path = require('path');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.json());

// Create receipts directory if it doesn't exist
const receiptsDir = path.join(__dirname, 'receipts');
if (!fs.existsSync(receiptsDir)) {
  fs.mkdirSync(receiptsDir, { recursive: true });
}

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/receipt-service', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true
});

// Receipt model
const receiptSchema = new mongoose.Schema({
  receiptNumber: { type: String, required: true, unique: true },
  donationId: { type: String, required: true, unique: true },
  donorId: { type: String, required: true },
  pdfPath: { type: String },
  deliveryStatus: { 
    type: String, 
    enum: ['PENDING', 'SENT', 'DELIVERED', 'FAILED'], 
    default: 'PENDING' 
  },
  deliveryMethod: { 
    type: String, 
    enum: ['EMAIL', 'WHATSAPP', 'SMS', 'PRINT'], 
    default: 'EMAIL' 
  },
  sentAt: { type: Date },
  deliveredAt: { type: Date },
  createdBy: { type: String, required: true }, // User ID who created this receipt
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Receipt = mongoose.model('Receipt', receiptSchema);

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

// Get all receipts
app.get('/', paginate, async (req, res) => {
  try {
    const { page, limit, skip } = req.pagination;
    
    // Build query based on filters
    const query = {};
    
    if (req.query.deliveryStatus) query.deliveryStatus = req.query.deliveryStatus;
    if (req.query.deliveryMethod) query.deliveryMethod = req.query.deliveryMethod;
    
    // Date range filters
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) {
        query.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        query.createdAt.$lte = new Date(req.query.endDate);
      }
    }
    
    // Count total results
    const total = await Receipt.countDocuments(query);
    
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
    const receipts = await Receipt.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit);
      
    // In a real implementation, we'd need to fetch donor and donation information
    // from their respective services. Here we'll simulate that with mock data.
    
    const receiptsWithDetails = await Promise.all(receipts.map(async receipt => {
      // This is where we'd typically make requests to other services
      // For this example, we'll use mock data
      
      // Mock donation data
      const donation = {
        id: receipt.donationId,
        amount: 5000.00,
        donationDate: receipt.createdAt
      };
      
      // Mock donor data
      const donor = {
        id: receipt.donorId,
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com'
      };
      
      return {
        id: receipt._id,
        receiptNumber: receipt.receiptNumber,
        donation,
        donor,
        deliveryStatus: receipt.deliveryStatus,
        deliveryMethod: receipt.deliveryMethod,
        sentAt: receipt.sentAt,
        deliveredAt: receipt.deliveredAt,
        createdAt: receipt.createdAt,
        updatedAt: receipt.updatedAt
      };
    }));
    
    // Calculate pagination details
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    
    res.json({
      success: true,
      count: receipts.length,
      pagination: {
        page,
        limit,
        totalPages,
        totalResults: total,
        next: hasNextPage ? `/api/v1/receipts?page=${page+1}&limit=${limit}` : null,
        prev: hasPrevPage ? `/api/v1/receipts?page=${page-1}&limit=${limit}` : null
      },
      data: receiptsWithDetails
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

// Get single receipt
app.get('/:receiptId', [
  param('receiptId').isMongoId()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid receipt ID format',
        details: errors.array()
      }
    });
  }

  try {
    const receipt = await Receipt.findById(req.params.receiptId);
    
    if (!receipt) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Receipt not found'
        }
      });
    }
    
    // In a real implementation, these would be API calls to other services
    // Simulated donation data
    const donation = {
      id: receipt.donationId,
      amount: 5000.00,
      donationDate: receipt.createdAt,
      paymentMethod: 'BANK_TRANSFER',
      transactionReference: 'TXN123456'
    };
    
    // Simulated donor data
    const donor = {
      id: receipt.donorId,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@example.com',
      phone: '+919876543211'
    };
    
    const response = {
      success: true,
      data: {
        id: receipt._id,
        receiptNumber: receipt.receiptNumber,
        donation,
        donor,
        pdfPath: receipt.pdfPath,
        deliveryStatus: receipt.deliveryStatus,
        deliveryMethod: receipt.deliveryMethod,
        sentAt: receipt.sentAt,
        deliveredAt: receipt.deliveredAt,
        createdAt: receipt.createdAt,
        updatedAt: receipt.updatedAt
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

// Create receipt
app.post('/', [
  body('donationId').isMongoId(),
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
    // Check if receipt already exists for this donation
    const existingReceipt = await Receipt.findOne({ donationId: req.body.donationId });
    if (existingReceipt) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DUPLICATE_ERROR',
          message: 'Receipt already exists for this donation'
        }
      });
    }
    
    // In a real implementation, we would fetch the donation and donor details from their services
    // For this example, we'll use mock data
    const donationId = req.body.donationId;
    const donorId = '60d4a3a91f3d2c001f9a4ed9'; // In reality, this would come from the donation service
    
    // Generate receipt number
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    
    // Get the last receipt number and increment
    const lastReceipt = await Receipt.findOne().sort({ receiptNumber: -1 });
    let sequence = '0001';
    
    if (lastReceipt && lastReceipt.receiptNumber) {
      const lastSequence = lastReceipt.receiptNumber.slice(-4);
      sequence = (parseInt(lastSequence) + 1).toString().padStart(4, '0');
    }
    
    const receiptNumber = `REC${year}${month}${sequence}`;
    
    // Get user ID from JWT (in a real implementation)
    // For now, we'll use a placeholder
    const userId = req.headers['x-user-id'] || 'system';
    
    // Create receipt in DB first
    const receipt = new Receipt({
      receiptNumber,
      donationId,
      donorId,
      deliveryMethod: req.body.deliveryMethod,
      createdBy: userId
    });
    
    await receipt.save();
    
    // Generate PDF (in a real implementation)
    // This would typically involve creating an actual PDF with all the donation details
    // For this example, we'll just create a placeholder path
    const pdfPath = `/receipts/${receipt._id}.pdf`;
    receipt.pdfPath = pdfPath;
    await receipt.save();
    
    // In a real implementation, we would now queue the receipt for delivery
    // based on the requested delivery method
    
    const response = {
      success: true,
      data: {
        id: receipt._id,
        receiptNumber,
        donation: {
          id: donationId,
          amount: 2500.00 // Mock data
        },
        deliveryStatus: receipt.deliveryStatus,
        deliveryMethod: receipt.deliveryMethod,
        createdAt: receipt.createdAt,
        updatedAt: receipt.updatedAt
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

// Download receipt
app.get('/:receiptId/download', [
  param('receiptId').isMongoId()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid receipt ID format',
        details: errors.array()
      }
    });
  }

  try {
    const receipt = await Receipt.findById(req.params.receiptId);
    
    if (!receipt) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Receipt not found'
        }
      });
    }
    
    // In a real implementation, we would return the actual PDF file
    // For this example, we'll create a simple PDF on the fly
    
    const doc = new PDFDocument();
    const filename = `receipt-${receipt.receiptNumber}.pdf`;
    
    // Set response headers for PDF download
    res.setHeader('Content-disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-type', 'application/pdf');
    
    // Pipe the PDF to the response
    doc.pipe(res);
    
    // Add content to the PDF
    doc.fontSize(25).text('Donor Management System', 100, 80);
    doc.fontSize(15).text(`Receipt #${receipt.receiptNumber}`, 100, 160);
    doc.fontSize(12).text(`Date: ${new Date(receipt.createdAt).toLocaleDateString()}`, 100, 200);
    doc.text(`Donation ID: ${receipt.donationId}`, 100, 220);
    doc.text(`Donor ID: ${receipt.donorId}`, 100, 240);
    doc.text(`Amount: ₹5,000.00`, 100, 260); // Mock amount
    doc.text(`Payment Method: Bank Transfer`, 100, 280); // Mock payment method
    
    doc.text('Thank you for your generous donation!', 100, 340);
    
    // Finalize the PDF
    doc.end();
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

// Send receipt
app.post('/:receiptId/send', [
  param('receiptId').isMongoId(),
  body('deliveryMethod').optional().isIn(['EMAIL', 'WHATSAPP', 'SMS', 'PRINT'])
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
    const receipt = await Receipt.findById(req.params.receiptId);
    
    if (!receipt) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Receipt not found'
        }
      });
    }
    
    // Update delivery method if provided
    if (req.body.deliveryMethod) {
      receipt.deliveryMethod = req.body.deliveryMethod;
    }
    // Update delivery method if provided
    if (req.body.deliveryMethod) {
        receipt.deliveryMethod = req.body.deliveryMethod;
      }
      
      // Mark receipt as sent
      receipt.deliveryStatus = 'SENT';
      receipt.sentAt = new Date();
      receipt.updatedAt = new Date();
      await receipt.save();
      
      // In a real implementation, we would now queue the receipt for delivery
      // based on the requested delivery method and integrate with email/WhatsApp/SMS services
      
      // For this example, we'll simulate a successful message delivery
      let deliveryResult = {};
      
      if (receipt.deliveryMethod === 'WHATSAPP') {
        deliveryResult = {
          messageId: `wamid.${Math.random().toString(36).substring(7)}`,
          status: 'sent'
        };
      } else if (receipt.deliveryMethod === 'EMAIL') {
        deliveryResult = {
          messageId: `mid.${Math.random().toString(36).substring(7)}`,
          status: 'sent'
        };
      } else if (receipt.deliveryMethod === 'SMS') {
        deliveryResult = {
          messageId: `sms.${Math.random().toString(36).substring(7)}`,
          status: 'sent'
        };
      }
      
      const response = {
        success: true,
        data: {
          receipt: {
            id: receipt._id,
            receiptNumber: receipt.receiptNumber,
            deliveryStatus: receipt.deliveryStatus,
            deliveryMethod: receipt.deliveryMethod,
            sentAt: receipt.sentAt
          },
          deliveryResult
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
    console.log(`Receipt Service running on port ${PORT}`);
  });
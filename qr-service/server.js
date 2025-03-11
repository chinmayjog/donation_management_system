const express = require('express');
const mongoose = require('mongoose');
const { body, param, validationResult } = require('express-validator');
const QRCode = require('qrcode');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3006;

app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/qr-service', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true
});

// QR Code model
const qrCodeSchema = new mongoose.Schema({
  event: { 
    id: { type: String, required: true },
    title: { type: String, required: true }
  },
  donor: {
    id: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true }
  },
  seat: {
    id: { type: String },
    section: { type: String },
    row: { type: String },
    number: { type: String }
  },
  data: { type: String, required: true }, // Encoded QR data
  signature: { type: String, required: true }, // Signature for verification
  expiresAt: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['ACTIVE', 'USED', 'EXPIRED', 'CANCELLED'], 
    default: 'ACTIVE' 
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const QRCodeModel = mongoose.model('QRCode', qrCodeSchema);

// Get QR Code
app.get('/:qrCodeId', [
  param('qrCodeId').isMongoId()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid QR code ID format',
        details: errors.array()
      }
    });
  }

  try {
    const qrCode = await QRCodeModel.findById(req.params.qrCodeId);
    
    if (!qrCode) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'QR code not found'
        }
      });
    }
    
    // Check if expired
    if (qrCode.expiresAt < new Date()) {
      qrCode.status = 'EXPIRED';
      await qrCode.save();
    }
    
    res.json({
      success: true,
      data: {
        id: qrCode._id,
        event: qrCode.event,
        donor: qrCode.donor,
        expiresAt: qrCode.expiresAt,
        status: qrCode.status,
        qrImageUrl: `/api/qr-codes/${qrCode._id}/image`,
        createdAt: qrCode.createdAt,
        updatedAt: qrCode.updatedAt
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

// Get QR Code image
app.get('/:qrCodeId/image', [
  param('qrCodeId').isMongoId()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid QR code ID format',
        details: errors.array()
      }
    });
  }

  try {
    const qrCode = await QRCodeModel.findById(req.params.qrCodeId);
    
    if (!qrCode) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'QR code not found'
        }
      });
    }
    
    // Generate QR code image
    const qrCodeDataUrl = await QRCode.toDataURL(qrCode.data, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 300
    });
    
    // Extract base64 data
    const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // Send the image
    res.set('Content-Type', 'image/png');
    res.send(imageBuffer);
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

// Verify QR Code
app.post('/verify', [
  body('qrData').notEmpty(),
  body('verifiedBy').isMongoId()
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
    // Parse QR data
    let qrData;
    try {
      qrData = JSON.parse(req.body.qrData);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid QR code data format'
        }
      });
    }
    
    // Check if QR code data has required fields
    if (!qrData.donorId || !qrData.eventId || !qrData.signature) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'QR code data is missing required fields'
        }
      });
    }
    
    // In a real implementation, we would verify the signature here
    // For this example, we'll assume the signature is valid
    
    // Find the QR code
    const qrCode = await QRCodeModel.findOne({
      'donor.id': qrData.donorId,
      'event.id': qrData.eventId,
      signature: qrData.signature
    });
    
    if (!qrCode) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'QR code not found'
        }
      });
    }
    
    // Check if expired
    if (qrCode.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        data: {
          valid: false,
          reason: 'QR code has expired'
        }
      });
    }
    
    // Check if already used
    if (qrCode.status === 'USED') {
      return res.status(400).json({
        success: false,
        data: {
          valid: false,
          reason: 'QR code has already been used'
        }
      });
    }
    
    // Check if cancelled
    if (qrCode.status === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        data: {
          valid: false,
          reason: 'QR code has been cancelled'
        }
      });
    }
    
    // Mark QR code as used
    qrCode.status = 'USED';
    qrCode.updatedAt = new Date();
    await qrCode.save();
    
    // In a real implementation, we would now update the attendance record
    // in the event service to mark the donor as checked in
    
    // Mock attendance data
    const checkInTime = new Date();
    const attendance = {
      id: `60d4a6101f3d2c001f9a4ee${Math.floor(Math.random() * 9)}`,
      status: 'CHECKED_IN',
      checkInTime,
      donor: {
        id: qrCode.donor.id,
        firstName: qrCode.donor.firstName,
        lastName: qrCode.donor.lastName
      },
      event: {
        id: qrCode.event.id,
        title: qrCode.event.title
      },
      seat: qrCode.seat
    };
    
    res.json({
      success: true,
      data: {
        valid: true,
        attendance
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

app.listen(PORT, () => {
  console.log(`QR Code Service running on port ${PORT}`);
});
const express = require('express');
const mongoose = require('mongoose');
const { body, param, query, validationResult } = require('express-validator');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3002;
const amqp = require('amqplib');

app.use(express.json());

// RabbitMQ connection and channel
let rabbitChannel;
let rabbitConnection;

// Initialize RabbitMQ connection
async function connectToRabbitMQ() {
  try {
    // Get RabbitMQ URL from environment variables or use default
    const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
    
    console.log(`Connecting to RabbitMQ at ${rabbitmqUrl}...`);
    rabbitConnection = await amqp.connect(rabbitmqUrl);
    
    // Handle connection close and errors
    rabbitConnection.on('close', () => {
      console.log('RabbitMQ connection closed, attempting to reconnect...');
      setTimeout(connectToRabbitMQ, 5000); // Try to reconnect after 5 seconds
    });
    
    rabbitConnection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err);
      // Connection errors will trigger the 'close' event
    });
    
    // Create channel
    rabbitChannel = await rabbitConnection.createChannel();
    
    // Define exchanges and queues
    await rabbitChannel.assertExchange('donor-events', 'topic', { durable: true });
    
    // Define common queues that services might use
    await rabbitChannel.assertQueue('donor-created', { durable: true });
    await rabbitChannel.assertQueue('donor-updated', { durable: true });
    await rabbitChannel.assertQueue('donor-verified', { durable: true });
    
    // Bind queues to exchange with routing keys
    await rabbitChannel.bindQueue('donor-created', 'donor-events', 'donor.created');
    await rabbitChannel.bindQueue('donor-updated', 'donor-events', 'donor.updated');
    await rabbitChannel.bindQueue('donor-verified', 'donor-events', 'donor.verified');
    
    console.log('Connected to RabbitMQ and configured exchanges/queues');
  } catch (error) {
    console.error('Error connecting to RabbitMQ:', error);
    setTimeout(connectToRabbitMQ, 5000); // Try to reconnect after 5 seconds
  }
}

// Helper function to publish event to RabbitMQ
async function publishEvent(routingKey, data) {
  try {
    if (!rabbitChannel) {
      console.warn('RabbitMQ channel not available, event not published');
      return false;
    }
    
    // Add timestamp and metadata
    const event = {
      ...data,
      metadata: {
        timestamp: new Date().toISOString(),
        service: 'donor-service',
        eventType: routingKey
      }
    };
    
    // Publish to the exchange with the specified routing key
    const published = rabbitChannel.publish(
      'donor-events',
      routingKey,
      Buffer.from(JSON.stringify(event)),
      { 
        persistent: true,
        contentType: 'application/json'
      }
    );
    
    if (published) {
      console.log(`Event published: ${routingKey}`);
    } else {
      console.warn(`Event could not be published immediately: ${routingKey}`);
      // Channel buffer is full, consider implementing a retry mechanism here
    }
    
    return published;
  } catch (error) {
    console.error(`Error publishing event to RabbitMQ (${routingKey}):`, error);
    return false;
  }
}


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
        
    // Publish event to message broker
    const eventData = {
      id: donor._id,
      firstName: donor.firstName,
      lastName: donor.lastName,
      email: donor.email,
      city: donor.city,
      state: donor.state,
      preferredCommunication: donor.preferredCommunication,
      createdBy: userId,
      createdAt: donor.createdAt
    };

    await publishEvent('donor.created', eventData);
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

    // Publish event to message broker
    const updateEventData = {
      id: donor._id,
      changes: {}, // Populate with changed fields only
      updatedBy: req.headers['x-user-id'] || 'system',
      updatedAt: donor.updatedAt
    };
        // Add changed fields to the event data
    if (req.body.firstName !== undefined) updateEventData.changes.firstName = req.body.firstName;
    if (req.body.lastName !== undefined) updateEventData.changes.lastName = req.body.lastName;
    if (req.body.email !== undefined) updateEventData.changes.email = req.body.email;
    if (req.body.phone !== undefined) updateEventData.changes.phone = req.body.phone;
    if (req.body.address !== undefined) updateEventData.changes.address = req.body.address;
    if (req.body.city !== undefined) updateEventData.changes.city = req.body.city;
    if (req.body.state !== undefined) updateEventData.changes.state = req.body.state;
    if (req.body.postalCode !== undefined) updateEventData.changes.postalCode = req.body.postalCode;
    if (req.body.preferredCommunication !== undefined) updateEventData.changes.preferredCommunication = req.body.preferredCommunication;

    await publishEvent('donor.updated', updateEventData);

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
// Get donor donations from the donation service
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
    
    // Define donation service URL - from environment variable or default
    const donationServiceUrl = process.env.DONATION_SERVICE_URL || 'http://donation-service:3003';
    
    try {
      // Forward necessary headers for authentication
      const headers = {
        'Authorization': req.headers.authorization,
        'x-user-id': req.headers['x-user-id'],
        'x-user-role': req.headers['x-user-role']
      };
      
      // Call donation service to get donations for this donor
      const response = await axios.get(`${donationServiceUrl}/donor/${req.params.donorId}`, {
        headers,
        timeout: 5000 // 5 second timeout
      });
      
      // Check if response is valid
      if (response.data && response.data.success) {
        return res.json(response.data);
      } else {
        throw new Error('Invalid response format from donation service');
      }
    } catch (error) {
      // Enhanced error handling with fallback
      if (error.response) {
        // The donation service responded with an error
        console.error(`Error from donation service: ${error.response.status}`, error.response.data);
        
        if (error.response.status === 404) {
          // No donations found - this is not an error, just return empty array
          return res.json({
            success: true,
            count: 0,
            data: []
          });
        }
        
        // Forward the error from the donation service
        return res.status(error.response.status).json(error.response.data);
      } else if (error.request) {
        // No response received - service might be down
        console.error(`Donation service timeout or no response: ${error.message}`);
        
        // Log the incident for monitoring
        console.error({
          type: 'SERVICE_UNAVAILABLE',
          service: 'donation-service',
          donorId: req.params.donorId,
          timestamp: new Date().toISOString()
        });
        
        // Decide: Either fail gracefully with empty data or return an error
        // Option 1: Fail gracefully (probably better for user experience)
        return res.json({
          success: true,
          count: 0,
          message: "Donation service temporarily unavailable",
          data: []
        });
        
        // Option 2: Return an error (uncomment if preferred)
        /*
        return res.status(503).json({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Donation service temporarily unavailable'
          }
        });
        */
      } else {
        // Something else went wrong
        console.error(`Error preparing donation service request: ${error.message}`);
      }
      
      // Fallback to in-memory cache or basic response if everything fails
      return res.json({
        success: true,
        count: 0,
        message: "Could not retrieve donations at this time",
        data: []
      });
    }
  } catch (error) {
    console.error(`Donor donations error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
});

// Get donor events from the event service
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
    
    // Define event service URL from environment variable or default
    const eventServiceUrl = process.env.EVENT_SERVICE_URL || 'http://event-service:3005';
    
    try {
      // Forward necessary headers for authentication
      const headers = {
        'Authorization': req.headers.authorization,
        'x-user-id': req.headers['x-user-id'],
        'x-user-role': req.headers['x-user-role'],
        'x-request-id': req.headers['x-request-id'] || `req_${Date.now()}`
      };
      
      // Build query parameters
      const queryParams = new URLSearchParams();
      // Add any query parameters from the original request that should be forwarded
      if (req.query.status) queryParams.append('status', req.query.status);
      if (req.query.upcoming) queryParams.append('upcoming', req.query.upcoming);
      
      // Include pagination parameters if present
      if (req.query.page) queryParams.append('page', req.query.page);
      if (req.query.limit) queryParams.append('limit', req.query.limit);
      
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
      
      // Call event service to get events for this donor
      const response = await axios.get(`${eventServiceUrl}/donors/${req.params.donorId}/attendances${queryString}`, {
        headers,
        timeout: 5000 // 5 second timeout
      });
      
      // Check if response is valid
      if (response.data && response.data.success) {
        return res.json(response.data);
      } else {
        throw new Error('Invalid response format from event service');
      }
    } catch (error) {
      // Enhanced error handling with fallback
      if (error.response) {
        // The event service responded with an error
        console.error(`Error from event service: ${error.response.status}`, error.response.data);
        
        if (error.response.status === 404) {
          // No events found - this is not an error, just return empty array
          return res.json({
            success: true,
            count: 0,
            data: []
          });
        }
        
        // Forward the error from the event service
        return res.status(error.response.status).json(error.response.data);
      } else if (error.request) {
        // No response received - service might be down
        console.error(`Event service timeout or no response: ${error.message}`);
        
        // Log the incident for monitoring
        console.error({
          type: 'SERVICE_UNAVAILABLE',
          service: 'event-service',
          donorId: req.params.donorId,
          timestamp: new Date().toISOString()
        });
        
        // Decide: Either fail gracefully with empty data or return an error
        // Option 1: Fail gracefully (better for user experience)
        return res.json({
          success: true,
          count: 0,
          message: "Event service temporarily unavailable",
          data: []
        });
      } else {
        // Something else went wrong
        console.error(`Error preparing event service request: ${error.message}`);
      }
      
      // Fallback to in-memory cache or basic response if everything fails
      return res.json({
        success: true,
        count: 0,
        message: "Could not retrieve events at this time",
        data: []
      });
    }
  } catch (error) {
    console.error(`Donor events error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
});

// Add this endpoint to donor-service/server.js after the other routes

// Get multiple donors by batch
app.get('/batch', async (req, res) => {
  try {
    // Extract donor IDs from query parameter
    const donorIds = req.query.ids ? req.query.ids.split(',') : [];
    
    if (!donorIds.length) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No donor IDs provided',
          details: [{ param: 'ids', message: 'At least one donor ID is required' }]
        }
      });
    }
    
    // Check if all IDs are valid MongoDB ObjectIDs
    const invalidIds = donorIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid donor ID format',
          details: invalidIds.map(id => ({ param: 'ids', value: id, message: 'Invalid MongoDB ObjectID format' }))
        }
      });
    }
    
    // Convert string IDs to ObjectIDs for the query
    const objectIds = donorIds.map(id => mongoose.Types.ObjectId(id));
    
    // Fetch donors
    const donors = await Donor.find({ _id: { $in: objectIds } });
    
    // Create a Map for O(1) lookups
    const donorMap = new Map();
    donors.forEach(donor => donorMap.set(donor._id.toString(), donor));
    
    // Maintain the order of the requested IDs and handle missing donors
    const orderedDonors = donorIds.map(id => {
      const donor = donorMap.get(id);
      if (donor) {
        return donor;
      }
      return null;
    }).filter(Boolean); // Remove nulls for donors that weren't found
    
    res.json({
      success: true,
      count: orderedDonors.length,
      data: orderedDonors
    });
  } catch (error) {
    console.error('Error in batch donors endpoint:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
});

// Initialize RabbitMQ connection when server starts
connectToRabbitMQ();

process.on('SIGINT', async () => {
  console.log('Gracefully shutting down...');
  try {
    if (rabbitChannel) await rabbitChannel.close();
    if (rabbitConnection) await rabbitConnection.close();
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Gracefully shutting down...');
  try {
    if (rabbitChannel) await rabbitChannel.close();
    if (rabbitConnection) await rabbitConnection.close();
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Donor Service running on port ${PORT}`);
});
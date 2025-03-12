const express = require('express');
const mongoose = require('mongoose');
const { body, param, query, validationResult } = require('express-validator');
const axios = require('axios');
const jwt = require('jsonwebtoken');
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

// Enhanced donor service client
// Enhanced donor service client with circuit breaker pattern
const DonorServiceClient = {
  baseUrl: process.env.DONOR_SERVICE_URL || 'http://donor-service:3002',
  timeout: 5000,
  maxRetries: 2,
  retryDelay: 300, // milliseconds
  
  // Circuit breaker state
  _circuitState: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
  _failureCount: 0,
  _failureThreshold: 5,
  _resetTimeout: 30000, // 30 seconds
  _lastFailureTime: null,
  
  /**
   * Check circuit breaker state and handle accordingly
   * @private
   * @returns {boolean} - True if request should proceed, false if circuit is open
   */
  _checkCircuit() {
    // If circuit is closed, allow request
    if (this._circuitState === 'CLOSED') {
      return true;
    }
    
    // If circuit is open, check if reset timeout has elapsed
    if (this._circuitState === 'OPEN') {
      const now = Date.now();
      if (now - this._lastFailureTime >= this._resetTimeout) {
        console.log('Circuit breaker moving to HALF_OPEN state');
        this._circuitState = 'HALF_OPEN';
        return true;
      }
      console.log('Circuit breaker is OPEN, denying request');
      return false;
    }
    
    // If circuit is half-open, allow request (next request will test the service)
    console.log('Circuit breaker is HALF_OPEN, allowing test request');
    return true;
  },
  
  /**
   * Record a successful request and reset circuit if needed
   * @private
   */
  _recordSuccess() {
    if (this._circuitState === 'HALF_OPEN') {
      console.log('Success in HALF_OPEN state, resetting circuit breaker');
      this._circuitState = 'CLOSED';
      this._failureCount = 0;
    } else if (this._failureCount > 0) {
      // Also reset failure count on success in CLOSED state
      this._failureCount = 0;
    }
  },
  
  /**
   * Record a failed request and potentially trip the circuit
   * @private
   */
  _recordFailure() {
    this._failureCount++;
    this._lastFailureTime = Date.now();
    
    if (this._circuitState === 'HALF_OPEN' || this._failureCount >= this._failureThreshold) {
      console.log(`Circuit breaker tripped (${this._failureCount} failures)`);
      this._circuitState = 'OPEN';
    }
  },
  
  /**
   * Retry a function with exponential backoff
   * @private
   * @param {Function} fn - The function to retry
   * @param {number} retries - Number of retries left
   * @param {number} delay - Current delay in milliseconds
   * @returns {Promise<any>} - Result of the function
   */
  async _retryWithBackoff(fn, retries = this.maxRetries, delay = this.retryDelay) {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 0) {
        throw error;
      }
      
      console.log(`Retrying after ${delay}ms, ${retries} retries left`);
      
      // Wait for the delay
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Retry with exponential backoff
      return this._retryWithBackoff(fn, retries - 1, delay * 2);
    }
  },
  
  /**
   * Log request metrics for monitoring and debugging
   * @private
   * @param {string} operation - The operation being performed
   * @param {number} startTime - Start time of the request
   * @param {boolean} success - Whether the request was successful
   * @param {string} error - Error message if request failed
   */
  _logMetrics(operation, startTime, success, error = null) {
    const duration = Date.now() - startTime;
    const status = success ? 'SUCCESS' : 'FAILURE';
    
    console.log(`METRICS | Service: donor-service | Operation: ${operation} | Status: ${status} | Duration: ${duration}ms`);
    
    if (error) {
      console.log(`METRICS | Error: ${error}`);
    }
  },
  
  /**
   * Fetch donor details from the donor service
   * @param {string} donorId - The ID of the donor to fetch
   * @param {object} headers - Headers to forward for authentication
   * @returns {Promise<object>} - Donor details or default donor object if fetch fails
   */
  async getDonor(donorId, headers) {
    // Check circuit breaker first
    if (!this._checkCircuit()) {
      console.log(`Circuit open, returning default data for donor ${donorId}`);
      return this._createDefaultDonor(donorId);
    }
    
    const startTime = Date.now();
    let success = false;
    
    try {
      console.log(`Fetching donor ${donorId} from donor service at ${this.baseUrl}`);
      
      // Forward necessary authentication headers
      const requestHeaders = this._prepareHeaders(headers);
      
      // Use retry mechanism for resilience
      const response = await this._retryWithBackoff(async () => {
        return axios.get(`${this.baseUrl}/${donorId}`, {
          headers: requestHeaders,
          timeout: this.timeout
        });
      });
      
      if (response.data && response.data.success && response.data.data) {
        console.log(`Successfully fetched donor ${donorId}`);
        
        // Record success for circuit breaker
        this._recordSuccess();
        success = true;
        
        // Cache could be added here for performance
        
        return response.data.data;
      }
      
      throw new Error('Invalid donor service response format');
    } catch (error) {
      // Record failure for circuit breaker
      this._recordFailure();
      
      // Enhanced error logging with differentiation between network and service errors
      if (error.response) {
        // The request was made and the server responded with a status code outside the 2xx range
        console.error(`Donor service error for donor ${donorId}: Status ${error.response.status}`, 
                      error.response.data);
                      
        // Special handling for specific status codes
        if (error.response.status === 404) {
          console.log(`Donor ${donorId} not found in donor service`);
        } else if (error.response.status >= 500) {
          console.error(`Donor service server error when fetching donor ${donorId}`);
        }
      } else if (error.request) {
        // The request was made but no response was received
        console.error(`Donor service timeout or no response for donor ${donorId}:`, error.message);
      } else {
        // Something happened in setting up the request
        console.error(`Error preparing donor service request for donor ${donorId}:`, error.message);
      }
      
      // Return default donor object with more comprehensive fields
      return this._createDefaultDonor(donorId);
    } finally {
      // Log metrics for monitoring
      this._logMetrics(`getDonor:${donorId}`, startTime, success, success ? null : 'Failed to fetch donor');
    }
  },
  
  /**
   * Prepare headers for service-to-service communication
   * @private
   * @param {object} headers - Original headers
   * @returns {object} - Prepared headers
   */
  _prepareHeaders(headers) {
    return {
      'Authorization': headers.authorization,
      'x-user-id': headers['x-user-id'],
      'x-user-role': headers['x-user-role'],
      'x-request-id': headers['x-request-id'] || `req_${Date.now()}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-source-service': 'donation-service'
    };
  },
  
  /**
   * Create a default donor object when actual data can't be retrieved
   * @private
   * @param {string} donorId - The donor ID
   * @returns {object} - Default donor object
   */
  _createDefaultDonor(donorId) {
    return {
      id: donorId,
      firstName: 'Unknown',
      lastName: 'Donor',
      email: 'unknown@example.com',
      phone: '+919999999999',
      _defaultData: true,  // Flag to indicate this is default data
      _createdAt: new Date().toISOString()
    };
  },
  
  /**
   * Batch fetch multiple donors
   * @param {string[]} donorIds - Array of donor IDs to fetch
   * @param {object} headers - Headers to forward for authentication
   * @returns {Promise<object>} - Map of donor IDs to donor objects
   */
  async getDonors(donorIds, headers) {
    if (!donorIds || !donorIds.length) return {};
    
    // Deduplicate donor IDs
    const uniqueDonorIds = [...new Set(donorIds)];
    console.log(`Batch fetching ${uniqueDonorIds.length} donors from donor service`);
    
    // Check circuit breaker
    if (!this._checkCircuit()) {
      console.log('Circuit open, returning default data for all donors');
      return this._createDefaultDonorMap(uniqueDonorIds);
    }
    
    const startTime = Date.now();
    let success = false;
    
    try {
      // Forward necessary authentication headers
      const requestHeaders = this._prepareHeaders(headers);
      
      // Split into chunks if the list is very large
      const donorIdChunks = this._chunkArray(uniqueDonorIds, 20); // Max 20 IDs per request
      let donorMap = {};
      
      // Process each chunk
      for (const chunk of donorIdChunks) {
        // Make a batch request to donor service
        const queryParams = new URLSearchParams();
        queryParams.append('ids', chunk.join(','));
        
        try {
          // Use retry with backoff for resilience
          const response = await this._retryWithBackoff(async () => {
            return axios.get(`${this.baseUrl}/batch`, {
              headers: requestHeaders,
              params: queryParams,
              timeout: this.timeout
            });
          });
          
          if (response.data && response.data.success && response.data.data) {
            // Convert the response array to a map of id -> donor and add to result
            response.data.data.forEach(donor => {
              donorMap[donor.id] = donor;
            });
          } else {
            throw new Error('Invalid donor service batch response format');
          }
        } catch (error) {
          console.error(`Error processing donor chunk: ${chunk}`, error.message);
          // For this chunk, fall back to individual requests
          await this._processDonorChunkIndividually(chunk, headers, donorMap);
        }
      }
      
      console.log(`Successfully fetched ${Object.keys(donorMap).length} donors`);
      
      // Record success for circuit breaker if we got at least some donors
      if (Object.keys(donorMap).length > 0) {
        this._recordSuccess();
        success = true;
      } else {
        this._recordFailure();
      }
      
      // Fill in any missing donors with default data
      uniqueDonorIds.forEach(id => {
        if (!donorMap[id]) {
          donorMap[id] = this._createDefaultDonor(id);
        }
      });
      
      return donorMap;
    } catch (error) {
      console.error('Error batch fetching donors:', error.message);
      this._recordFailure();
      
      // Fall back to individual requests if batch request completely fails
      return this._fallbackToIndividualRequests(uniqueDonorIds, headers);
    } finally {
      // Log metrics for monitoring
      this._logMetrics('getDonors:batch', startTime, success, success ? null : 'Failed to fetch donors batch');
    }
  },
  
  /**
   * Split array into chunks of specified size
   * @private
   * @param {Array} array - Array to chunk
   * @param {number} size - Maximum chunk size
   * @returns {Array} - Array of chunks
   */
  _chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  },
  
  /**
   * Process a chunk of donor IDs individually when batch request fails
   * @private
   * @param {string[]} donorIds - Array of donor IDs to fetch
   * @param {object} headers - Headers to forward for authentication
   * @param {object} donorMap - Map to store results
   * @returns {Promise<void>}
   */
  async _processDonorChunkIndividually(donorIds, headers, donorMap) {
    console.log(`Processing ${donorIds.length} donors individually`);
    
    // Use Promise.allSettled to handle individual failures gracefully
    const promises = donorIds.map(id => 
      this.getDonor(id, headers)
        .then(donor => {
          donorMap[id] = donor;
        })
        .catch(err => {
          console.error(`Error fetching donor ${id}:`, err.message);
          donorMap[id] = this._createDefaultDonor(id);
        })
    );
    
    // Wait for all requests to complete
    await Promise.allSettled(promises);
  },
  
  /**
   * Fall back to individual requests when batch request fails
   * @private
   * @param {string[]} donorIds - Array of donor IDs to fetch
   * @param {object} headers - Headers to forward for authentication
   * @returns {Promise<object>} - Map of donor IDs to donor objects
   */
  async _fallbackToIndividualRequests(donorIds, headers) {
    console.log('Falling back to individual donor requests');
    
    // Create a map to store results
    const donorMap = {};
    
    // Use a queue with concurrency limit to avoid overwhelming the service
    const concurrencyLimit = 3;
    const queue = [];
    
    for (let i = 0; i < donorIds.length; i += concurrencyLimit) {
      const batch = donorIds.slice(i, i + concurrencyLimit);
      queue.push(batch);
    }
    
    // Process queue sequentially
    for (const batch of queue) {
      const batchPromises = batch.map(id => 
        this.getDonor(id, headers)
          .then(donor => {
            donorMap[id] = donor;
          })
          .catch(err => {
            console.error(`Error fetching donor ${id} in fallback:`, err.message);
            donorMap[id] = this._createDefaultDonor(id);
          })
      );
      
      // Wait for current batch to complete before moving to next
      await Promise.allSettled(batchPromises);
      
      // Small delay between batches to avoid overwhelming the service
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`Fetched ${Object.keys(donorMap).length} donors via fallback method`);
    return donorMap;
  },
  
  /**
   * Create default donor map when batch fetching fails completely
   * @private
   * @param {string[]} donorIds - Array of donor IDs
   * @returns {object} - Map of donor IDs to default donor objects
   */
  _createDefaultDonorMap(donorIds) {
    const donorMap = {};
    
    donorIds.forEach(id => {
      donorMap[id] = this._createDefaultDonor(id);
    });
    
    return donorMap;
  }
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
    const donorMap = await DonorServiceClient.getDonors(donorIds, req.headers);
    
    const donationsWithDonorInfo = donations.map(donation => {
      const { _id, donorId, amount, donationDate, paymentMethod, transactionReference, 
              notes, receiptStatus, receiptId, createdAt, updatedAt } = donation;
      
      // Get donor info from the map
      const donor = donorMap[donorId] || {
        id: donorId,
        firstName: 'Unknown',
        lastName: 'Donor',
        email: 'unknown@example.com'
      };
      
      // Mock receipt data if receipt exists
      let receipt = null;
      if (receiptId) {
        try {
          // Mock call to receipt service - in production this would be a real API call
          // const receiptResponse = await axios.get(`${process.env.RECEIPT_SERVICE_URL}/receipts/${receiptId}`);
          // receipt = receiptResponse.data.data;
          
          // For now, we'll simulate receipt data
          receipt = {
            id: receiptId,
            receiptNumber: `REC${new Date(createdAt).getFullYear()}${String(new Date(createdAt).getMonth() + 1).padStart(2, '0')}0001`,
            deliveryStatus: 'DELIVERED'
          };
        } catch (error) {
          console.error(`Error fetching receipt with ID ${receiptId}:`, error);
          // Continue with null receipt
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
    
    // Fetch donor data from donor service
    const donor = await DonorServiceClient.getDonor(donation.donorId, req.headers);
    
    // Simulated recorded-by user data
    const recordedBy = {
      id: donation.recordedBy,
      username: 'johndoe'
    };
    
    // Simulated receipt data if receipt exists
    let receipt = null;
    if (donation.receiptId) {
      receipt = {
        id: donation.receiptId,
        receiptNumber: `REC${new Date(donation.createdAt).getFullYear()}${String(new Date(donation.createdAt).getMonth() + 1).padStart(2, '0')}0001`,
        deliveryStatus: donation.receiptStatus === 'DELIVERED' ? 'DELIVERED' : 'PENDING',
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
    // Verify that the donor exists by making a request to the donor service
    try {
      const donor = await DonorServiceClient.getDonor(req.body.donorId, req.headers);
      
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
    const donor = await DonorServiceClient.getDonor(req.body.donorId, req.headers);
    
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
    const donor = await DonorServiceClient.getDonor(donation.donorId, req.headers);
    
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
    
    // In a real implementation, we would call the receipt service to generate a receipt
    // For now, we'll simulate receipt generation
    const receiptId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Update donation with receipt info
    donation.receiptId = receiptId;
    donation.receiptStatus = 'GENERATED';
    donation.updatedAt = new Date();
    await donation.save();
    
    // In a production environment, we'd have the receipt service return the actual receipt details
    // For now, simulate a response
    const receiptData = {
      id: receiptId,
      receiptNumber: `REC${new Date().getFullYear().toString().slice(-2)}${(new Date().getMonth() + 1).toString().padStart(2, '0')}0001`,
      donationId: donation._id,
      amount: donation.amount,
      donationDate: donation.donationDate,
      deliveryMethod: req.body.deliveryMethod,
      deliveryStatus: 'PENDING',
      createdAt: new Date()
    };
    
    res.status(201).json({
      success: true,
      data: receiptData
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
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

 // Create a singleton instance
 const donorServiceClient = new DonorServiceClient();
  
 // Export the instance
 module.exports = donorServiceClient;
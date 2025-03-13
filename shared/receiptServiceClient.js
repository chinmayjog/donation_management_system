/**
 * Receipt service client with circuit breaker pattern and retry mechanisms
 */
class ReceiptServiceClient {
    constructor() {
      this.baseUrl = process.env.RECEIPT_SERVICE_URL || 'http://receipt-service:3004';
      this.timeout = 5000;
      this.maxRetries = 3;
      this.retryDelay = 300; // milliseconds
      
      // Circuit breaker state
      this._circuitState = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
      this._failureCount = 0;
      this._failureThreshold = 5;
      this._resetTimeout = 30000; // 30 seconds
      this._lastFailureTime = null;
      
      console.log(`Receipt service client initialized with baseUrl: ${this.baseUrl}`);
    }
    
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
          console.log('Receipt service circuit breaker moving to HALF_OPEN state');
          this._circuitState = 'HALF_OPEN';
          return true;
        }
        console.log('Receipt service circuit breaker is OPEN, denying request');
        return false;
      }
      
      // If circuit is half-open, allow request (next request will test the service)
      console.log('Receipt service circuit breaker is HALF_OPEN, allowing test request');
      return true;
    }
    
    /**
     * Record a successful request and reset circuit if needed
     * @private
     */
    _recordSuccess() {
      if (this._circuitState === 'HALF_OPEN') {
        console.log('Success in HALF_OPEN state, resetting receipt service circuit breaker');
        this._circuitState = 'CLOSED';
        this._failureCount = 0;
      } else if (this._failureCount > 0) {
        // Also reset failure count on success in CLOSED state
        this._failureCount = 0;
      }
    }
    
    /**
     * Record a failed request and potentially trip the circuit
     * @private
     */
    _recordFailure() {
      this._failureCount++;
      this._lastFailureTime = Date.now();
      
      if (this._circuitState === 'HALF_OPEN' || this._failureCount >= this._failureThreshold) {
        console.log(`Receipt service circuit breaker tripped (${this._failureCount} failures)`);
        this._circuitState = 'OPEN';
      }
    }
    
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
        
        console.log(`Retrying receipt service after ${delay}ms, ${retries} retries left`);
        
        // Wait for the delay
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Retry with exponential backoff
        return this._retryWithBackoff(fn, retries - 1, delay * 2);
      }
    }
    
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
      
      console.log(`METRICS | Service: receipt-service | Operation: ${operation} | Status: ${status} | Duration: ${duration}ms`);
      
      if (error) {
        console.log(`METRICS | Error: ${error}`);
      }
    }
    
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
    }
    
    /**
     * Create a default receipt object when actual data can't be retrieved
     * @private
     * @param {string} donationId - The donation ID
     * @returns {object} - Default receipt object
     */
    _createDefaultReceipt(donationId) {
      return {
        donationId,
        status: 'PENDING',
        _defaultData: true,  // Flag to indicate this is default data
        _createdAt: new Date().toISOString()
      };
    }
    
    /**
     * Generate a receipt for a donation
     * @param {string} donationId - The donation ID
     * @param {string} deliveryMethod - The delivery method (EMAIL, WHATSAPP, SMS, PRINT)
     * @param {object} headers - Headers to forward for authentication
     * @returns {Promise<object>} - Receipt details or default receipt object if generation fails
     */
    async generateReceipt(donationId, deliveryMethod, headers) {
      // Check circuit breaker first
      if (!this._checkCircuit()) {
        console.log(`Circuit open, returning default receipt data for donation ${donationId}`);
        return this._createDefaultReceipt(donationId);
      }
      
      const startTime = Date.now();
      let success = false;
      
      try {
        console.log(`Generating receipt for donation ${donationId} via receipt service at ${this.baseUrl}`);
        
        // Forward necessary authentication headers
        const requestHeaders = this._prepareHeaders(headers);
        
        // Use retry mechanism for resilience
        const response = await this._retryWithBackoff(async () => {
          return axios.post(`${this.baseUrl}`, {
            donationId,
            deliveryMethod
          }, {
            headers: requestHeaders,
            timeout: this.timeout
          });
        });
        
        if (response.data && response.data.success && response.data.data) {
          console.log(`Successfully generated receipt for donation ${donationId}`);
          
          // Record success for circuit breaker
          this._recordSuccess();
          success = true;
          
          return response.data.data;
        }
        
        throw new Error('Invalid receipt service response format');
      } catch (error) {
        // Record failure for circuit breaker
        this._recordFailure();
        
        // Enhanced error logging with differentiation between network and service errors
        if (error.response) {
          // The request was made and the server responded with a status code outside the 2xx range
          console.error(`Receipt service error for donation ${donationId}: Status ${error.response.status}`, 
                        error.response.data);
                        
          // Special handling for specific status codes
          if (error.response.status === 404) {
            console.log(`Donation ${donationId} not found in receipt service`);
          } else if (error.response.status === 409) {
            console.log(`Receipt already exists for donation ${donationId}`);
          } else if (error.response.status >= 500) {
            console.error(`Receipt service server error when generating receipt for donation ${donationId}`);
          }
        } else if (error.request) {
          // The request was made but no response was received
          console.error(`Receipt service timeout or no response for donation ${donationId}:`, error.message);
        } else {
          // Something happened in setting up the request
          console.error(`Error preparing receipt service request for donation ${donationId}:`, error.message);
        }
        
        // Return default receipt object with basic fallback info
        return this._createDefaultReceipt(donationId);
      } finally {
        // Log metrics for monitoring
        this._logMetrics(`generateReceipt:${donationId}`, startTime, success, success ? null : 'Failed to generate receipt');
      }
    }
    
    /**
     * Get receipt details by ID
     * @param {string} receiptId - The receipt ID
     * @param {object} headers - Headers to forward for authentication
     * @returns {Promise<object>} - Receipt details or null if fetch fails
     */
    async getReceiptById(receiptId, headers) {
      // Check circuit breaker first
      if (!this._checkCircuit()) {
        console.log(`Circuit open, cannot retrieve receipt ${receiptId}`);
        return null;
      }
      
      const startTime = Date.now();
      let success = false;
      
      try {
        console.log(`Fetching receipt ${receiptId} from receipt service at ${this.baseUrl}`);
        
        // Forward necessary authentication headers
        const requestHeaders = this._prepareHeaders(headers);
        
        // Use retry mechanism for resilience
        const response = await this._retryWithBackoff(async () => {
          return axios.get(`${this.baseUrl}/${receiptId}`, {
            headers: requestHeaders,
            timeout: this.timeout
          });
        });
        
        if (response.data && response.data.success && response.data.data) {
          console.log(`Successfully fetched receipt ${receiptId}`);
          
          // Record success for circuit breaker
          this._recordSuccess();
          success = true;
          
          return response.data.data;
        }
        
        throw new Error('Invalid receipt service response format');
      } catch (error) {
        // Record failure for circuit breaker
        this._recordFailure();
        
        // Enhanced error logging
        if (error.response) {
          console.error(`Receipt service error for receipt ${receiptId}: Status ${error.response.status}`, 
                        error.response.data);
        } else if (error.request) {
          console.error(`Receipt service timeout or no response for receipt ${receiptId}:`, error.message);
        } else {
          console.error(`Error preparing receipt service request for receipt ${receiptId}:`, error.message);
        }
        
        // Return null to indicate failure
        return null;
      } finally {
        // Log metrics for monitoring
        this._logMetrics(`getReceiptById:${receiptId}`, startTime, success, success ? null : 'Failed to fetch receipt');
      }
    }
    
    /**
     * Send a receipt to a donor
     * @param {string} receiptId - The receipt ID
     * @param {string} deliveryMethod - The delivery method (EMAIL, WHATSAPP, SMS, PRINT)
     * @param {object} headers - Headers to forward for authentication
     * @returns {Promise<object>} - Delivery result or null if sending fails
     */
    async sendReceipt(receiptId, deliveryMethod, headers) {
      // Check circuit breaker first
      if (!this._checkCircuit()) {
        console.log(`Circuit open, cannot send receipt ${receiptId}`);
        return null;
      }
      
      const startTime = Date.now();
      let success = false;
      
      try {
        console.log(`Sending receipt ${receiptId} via ${deliveryMethod} through receipt service at ${this.baseUrl}`);
        
        // Forward necessary authentication headers
        const requestHeaders = this._prepareHeaders(headers);
        
        // Use retry mechanism for resilience
        const response = await this._retryWithBackoff(async () => {
          return axios.post(`${this.baseUrl}/${receiptId}/send`, {
            deliveryMethod
          }, {
            headers: requestHeaders,
            timeout: this.timeout
          });
        });
        
        if (response.data && response.data.success && response.data.data) {
          console.log(`Successfully sent receipt ${receiptId} via ${deliveryMethod}`);
          
          // Record success for circuit breaker
          this._recordSuccess();
          success = true;
          
          return response.data.data;
        }
        
        throw new Error('Invalid receipt service response format');
      } catch (error) {
        // Record failure for circuit breaker
        this._recordFailure();
        
        // Enhanced error logging
        if (error.response) {
          console.error(`Receipt service error sending receipt ${receiptId}: Status ${error.response.status}`, 
                        error.response.data);
        } else if (error.request) {
          console.error(`Receipt service timeout or no response for sending receipt ${receiptId}:`, error.message);
        } else {
          console.error(`Error preparing receipt service request for sending receipt ${receiptId}:`, error.message);
        }
        
        // Return null to indicate failure
        return null;
      } finally {
        // Log metrics for monitoring
        this._logMetrics(`sendReceipt:${receiptId}:${deliveryMethod}`, startTime, success, 
                         success ? null : `Failed to send receipt via ${deliveryMethod}`);
      }
    }
  }
  
  // Create a singleton instance
  const receiptServiceClient = new ReceiptServiceClient();
  
  // Export the instance
  export default receiptServiceClient;
  
  
      
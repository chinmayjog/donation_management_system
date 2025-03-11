const express = require('express');
const mongoose = require('mongoose');
const { body, param, query, validationResult } = require('express-validator');
const app = express();
const PORT = process.env.PORT || 3005;

app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/event-service', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true
});

// Event model
const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  eventDate: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  location: { type: String, required: true },
  maxCapacity: { type: Number, required: true },
  registeredCount: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['DRAFT', 'SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED'], 
    default: 'SCHEDULED' 
  },
  isMonsoonRisk: { type: Boolean, default: false },
  createdBy: { type: String, required: true }, // User ID who created this event
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Event = mongoose.model('Event', eventSchema);

// Event attendee model
const attendeeSchema = new mongoose.Schema({
  eventId: { type: String, required: true },
  donorId: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['REGISTERED', 'CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'], 
    default: 'REGISTERED' 
  },
  seatId: { type: String },
  qrCodeId: { type: String },
  checkInTime: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Compound index to ensure unique event-donor pairs
attendeeSchema.index({ eventId: 1, donorId: 1 }, { unique: true });

const Attendee = mongoose.model('Attendee', attendeeSchema);

// Seat model
const seatSchema = new mongoose.Schema({
  eventId: { type: String, required: true },
  section: { type: String, required: true },
  row: { type: String, required: true },
  number: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['AVAILABLE', 'RESERVED', 'OCCUPIED'], 
    default: 'AVAILABLE' 
  },
  assignedTo: { type: String }, // Donor ID
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Compound index to ensure unique seats within an event
seatSchema.index({ eventId: 1, section: 1, row: 1, number: 1 }, { unique: true });

const Seat = mongoose.model('Seat', seatSchema);

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

// Get all events
app.get('/', paginate, async (req, res) => {
  try {
    const { page, limit, skip } = req.pagination;
    
    // Build query based on filters
    const query = {};
    
    if (req.query.status) query.status = req.query.status;
    if (req.query.location) query.location = new RegExp(req.query.location, 'i');
    
    // Date range filters
    if (req.query.startDate || req.query.endDate) {
      query.eventDate = {};
      if (req.query.startDate) {
        query.eventDate.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        query.eventDate.$lte = new Date(req.query.endDate);
      }
    }
    
    // Count total results
    const total = await Event.countDocuments(query);
    
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
      // Default sort by eventDate asc
      sort = { eventDate: 1 };
    }
    
    // Execute query
    const events = await Event.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit);
    
    // Check for monsoon risk (in a more sophisticated implementation, this
    // would involve checking weather forecasts, etc.)
    const eventsWithWarnings = events.map(event => {
      // Check if the event is in monsoon season (Jun-Sep)
      const eventMonth = new Date(event.eventDate).getMonth();
      const isMonsoonMonth = eventMonth >= 5 && eventMonth <= 8; // 0-indexed months (5=Jun, 8=Sep)
      
      // Monsoon warning message, if applicable
      let monsoonWarning = null;
      if (event.isMonsoonRisk && isMonsoonMonth) {
        monsoonWarning = "This event is scheduled during monsoon season. Please check weather updates before attending.";
      }
      
      return {
        id: event._id,
        title: event.title,
        description: event.description,
        eventDate: event.eventDate,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        maxCapacity: event.maxCapacity,
        registeredCount: event.registeredCount,
        status: event.status,
        isMonsoonRisk: event.isMonsoonRisk,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        monsoonWarning
      };
    });
    
    // Calculate pagination details
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    
    res.json({
      success: true,
      count: events.length,
      pagination: {
        page,
        limit,
        totalPages,
        totalResults: total,
        next: hasNextPage ? `/api/v1/events?page=${page+1}&limit=${limit}` : null,
        prev: hasPrevPage ? `/api/v1/events?page=${page-1}&limit=${limit}` : null
      },
      data: eventsWithWarnings
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

// Get single event
app.get('/:eventId', [
  param('eventId').isMongoId()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid event ID format',
        details: errors.array()
      }
    });
  }

  try {
    const event = await Event.findById(req.params.eventId);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Event not found'
        }
      });
    }
    
    // In a real implementation, we would get the createdBy user details
    // from the auth service. Here we'll use mock data.
    const createdBy = {
      id: event.createdBy,
      username: 'johndoe'
    };
    
    // Check if the event is in monsoon season
    const eventMonth = new Date(event.eventDate).getMonth();
    const isMonsoonMonth = eventMonth >= 5 && eventMonth <= 8; // 0-indexed months (5=Jun, 8=Sep)
    
    // Monsoon warning message, if applicable
    let monsoonWarning = null;
    if (event.isMonsoonRisk && isMonsoonMonth) {
      monsoonWarning = "This event is scheduled during monsoon season. Please check weather updates before attending.";
    }
    
    const response = {
      success: true,
      data: {
        id: event._id,
        title: event.title,
        description: event.description,
        eventDate: event.eventDate,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        maxCapacity: event.maxCapacity,
        registeredCount: event.registeredCount,
        status: event.status,
        isMonsoonRisk: event.isMonsoonRisk,
        createdBy,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        monsoonWarning
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

// Create event
app.post('/', [
  body('title').notEmpty(),
  body('description').optional(),
  body('eventDate').isISO8601(),
  body('startTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/), // 24-hour format (HH:MM)
  body('endTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
  body('location').notEmpty(),
  body('maxCapacity').isInt({ min: 1 })
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
    // Get user ID from JWT (in a real implementation)
    // For now, we'll use a placeholder
    const userId = req.headers['x-user-id'] || 'system';
    
    // Check if the event date is in monsoon season (Jun-Sep)
    const eventDate = new Date(req.body.eventDate);
    const eventMonth = eventDate.getMonth();
    const isMonsoonMonth = eventMonth >= 5 && eventMonth <= 8; // 0-indexed months (5=Jun, 8=Sep)
    
    // Create new event
    const event = new Event({
      title: req.body.title,
      description: req.body.description,
      eventDate,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      location: req.body.location,
      maxCapacity: req.body.maxCapacity,
      isMonsoonRisk: isMonsoonMonth, // Automatically set based on date
      createdBy: userId
    });
    
    await event.save();
    
    // Generate seats for the event
    // This is a simplified version - a real implementation would be more sophisticated
    const defaultSections = ['A', 'B', 'C'];
    const rowsPerSection = 5;
    const seatsPerRow = 10;
    
    // Create a batch of seat documents
    const seats = [];
    
    for (const section of defaultSections) {
      for (let row = 1; row <= rowsPerSection; row++) {
        for (let seat = 1; seat <= seatsPerRow; seat++) {
          seats.push({
            eventId: event._id,
            section,
            row: row.toString(),
            number: seat.toString(),
            status: 'AVAILABLE',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }
    
    // Insert seats in a batch operation
    await Seat.insertMany(seats);
    
    // Return response with monsoon warning if applicable
    let monsoonWarning = null;
    if (event.isMonsoonRisk) {
      monsoonWarning = "This event is scheduled during monsoon season. Please check weather updates before attending.";
    }
    
    res.status(201).json({
      success: true,
      data: {
        id: event._id,
        title: event.title,
        description: event.description,
        eventDate: event.eventDate,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        maxCapacity: event.maxCapacity,
        registeredCount: event.registeredCount,
        status: event.status,
        isMonsoonRisk: event.isMonsoonRisk,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        monsoonWarning
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

// Update event
app.put('/:eventId', [
  param('eventId').isMongoId(),
  body('title').optional().notEmpty(),
  body('description').optional(),
  body('eventDate').optional().isISO8601(),
  body('startTime').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
  body('endTime').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
  body('location').optional().notEmpty(),
  body('maxCapacity').optional().isInt({ min: 1 }),
  body('status').optional().isIn(['DRAFT', 'SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED'])
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
    // Check if event exists
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Event not found'
        }
      });
    }
    
    // Update fields if provided
    if (req.body.title) event.title = req.body.title;
    if (req.body.description !== undefined) event.description = req.body.description;
    if (req.body.eventDate) {
      event.eventDate = new Date(req.body.eventDate);
      
      // Update monsoon risk if event date changed
      const eventMonth = event.eventDate.getMonth();
      event.isMonsoonRisk = eventMonth >= 5 && eventMonth <= 8;
    }
    if (req.body.startTime) event.startTime = req.body.startTime;
    if (req.body.endTime) event.endTime = req.body.endTime;
    if (req.body.location) event.location = req.body.location;
    if (req.body.maxCapacity) {
      // Check if we can reduce capacity (need to check registrations)
      if (req.body.maxCapacity < event.maxCapacity && req.body.maxCapacity < event.registeredCount) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Cannot reduce capacity below registeredCount',
            details: [{
              field: 'maxCapacity',
              message: `Already have ${event.registeredCount} registrations`
            }]
          }
        });
      }
      event.maxCapacity = req.body.maxCapacity;
    }
    if (req.body.status) event.status = req.body.status;
    
    event.updatedAt = new Date();
    await event.save();
    
    // Check monsoon warning
    let monsoonWarning = null;
    if (event.isMonsoonRisk) {
      const eventMonth = event.eventDate.getMonth();
      const isMonsoonMonth = eventMonth >= 5 && eventMonth <= 8;
      if (isMonsoonMonth) {
        monsoonWarning = "This event is scheduled during monsoon season. Please check weather updates before attending.";
      }
    }
    
    res.json({
      success: true,
      data: {
        id: event._id,
        title: event.title,
        description: event.description,
        eventDate: event.eventDate,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        maxCapacity: event.maxCapacity,
        registeredCount: event.registeredCount,
        status: event.status,
        isMonsoonRisk: event.isMonsoonRisk,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        monsoonWarning
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

// Delete event
app.delete('/:eventId', [
  param('eventId').isMongoId()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid event ID format',
        details: errors.array()
      }
    });
  }

  try {
    // Check if event exists
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Event not found'
        }
      });
    }
    
    // Check if there are any attendees
    const attendeeCount = await Attendee.countDocuments({ eventId: req.params.eventId });
    if (attendeeCount > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot delete event with registered attendees'
        }
      });
    }
    
    // Delete event
    await Event.findByIdAndDelete(req.params.eventId);
    
    // Delete all seats for this event
    await Seat.deleteMany({ eventId: req.params.eventId });
    
    res.json({
      success: true,
      data: {}
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

// Get event attendees
app.get('/:eventId/attendees', [
  param('eventId').isMongoId()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid event ID format',
        details: errors.array()
      }
    });
  }

  try {
    // Check if event exists
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Event not found'
        }
      });
    }
    
    // Get attendees
    const attendees = await Attendee.find({ eventId: req.params.eventId });
    
    // In a real implementation, we would get the donor details from the donor service
    // and the seat details from the seat collection. Here we'll use mock and in-memory data.
    
    // Get seats for all attendees
    const seatIds = attendees.map(a => a.seatId).filter(Boolean);
    const seats = await Seat.find({ _id: { $in: seatIds } });
    
    // Create a map of seat IDs to seat details
    const seatMap = seats.reduce((map, seat) => {
      map[seat._id.toString()] = {
        section: seat.section,
        row: seat.row,
        number: seat.number
      };
      return map;
    }, {});
    
    // Map attendees with donor and seat info
    const attendeesWithDetails = attendees.map(attendee => {
      // Mock donor data - in a real implementation, this would come from the donor service
      let donor;
      if (attendee.donorId === '60d4a3a91f3d2c001f9a4ed9') {
        donor = {
          id: attendee.donorId,
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
          phone: '+919876543211'
        };
      } else if (attendee.donorId === '60d4a3d41f3d2c001f9a4eda') {
        donor = {
          id: attendee.donorId,
          firstName: 'Amit',
          lastName: 'Patel',
          email: 'amit.patel@example.com',
          phone: '+919876543212'
        };
      } else {
        donor = {
          id: attendee.donorId,
          firstName: 'Unknown',
          lastName: 'Donor',
          email: 'unknown@example.com',
          phone: '+919999999999'
        };
      }
      
      // Get seat details if available
      const seat = attendee.seatId ? seatMap[attendee.seatId] : null;
      
      return {
        id: attendee._id,
        donor,
        status: attendee.status,
        seat,
        createdAt: attendee.createdAt,
        updatedAt: attendee.updatedAt
      };
    });
    
    res.json({
      success: true,
      count: attendeesWithDetails.length,
      data: attendeesWithDetails
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

// Register donor for event
app.post('/:eventId/register', [
  param('eventId').isMongoId(),
  body('donorId').isMongoId(),
  body('seatId').optional().isMongoId()
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
    // Check if event exists and has capacity
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Event not found'
        }
      });
    }
    
    // Check event status
    if (event.status !== 'SCHEDULED') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Cannot register for event with status ${event.status}`
        }
      });
    }
    
    // Check capacity
    if (event.registeredCount >= event.maxCapacity) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Event has reached maximum capacity'
        }
      });
    }
    
    // Check if donor is already registered
    const existingAttendee = await Attendee.findOne({
      eventId: req.params.eventId,
      donorId: req.body.donorId
    });
    
    if (existingAttendee) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DUPLICATE_ERROR',
          message: 'Donor is already registered for this event'
        }
      });
    }
    
    // Check seat if provided
    let seat = null;
    if (req.body.seatId) {
      seat = await Seat.findOne({
        _id: req.body.seatId,
        eventId: req.params.eventId
      });
      
      if (!seat) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'Seat not found for this event'
          }
        });
      }
      
      if (seat.status !== 'AVAILABLE') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Seat is not available'
          }
        });
      }
    } else {
      // Find an available seat automatically
      seat = await Seat.findOne({
        eventId: req.params.eventId,
        status: 'AVAILABLE'
      });
      
      if (!seat) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'No available seats for this event'
          }
        });
      }
    }
    
    // Reserve the seat
    seat.status = 'RESERVED';
    seat.assignedTo = req.body.donorId;
    seat.updatedAt = new Date();
    await seat.save();
    
    // Create QR code (in a real implementation, this would be handled by the QR service)
    // For now, we'll just generate a mock QR code ID
    const qrCodeId = `qr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Create attendee
    const attendee = new Attendee({
      eventId: req.params.eventId,
      donorId: req.body.donorId,
      seatId: seat._id,
      qrCodeId,
      status: 'REGISTERED'
    });
    
    await attendee.save();
    
    // Update event registered count
    event.registeredCount += 1;
    await event.save();
    
    // In a real implementation, we would now trigger notifications to the donor
    
    res.status(201).json({
      success: true,
      data: {
        attendance: {
          id: attendee._id,
          event: req.params.eventId,
          donor: req.body.donorId,
          seat: seat._id,
          status: attendee.status,
          createdAt: attendee.createdAt,
          updatedAt: attendee.updatedAt
        },
        seat: {
          section: seat.section,
          row: seat.row,
          number: seat.number,
          status: seat.status
        },
        qrCode: {
          id: qrCodeId,
          url: `/api/qr-codes/${qrCodeId}`
        }
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

// Get event seats
app.get('/:eventId/seats', [
  param('eventId').isMongoId(),
  query('status').optional().isIn(['AVAILABLE', 'RESERVED', 'OCCUPIED']),
  query('section').optional()
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
        // Check if event exists
        const event = await Event.findById(req.params.eventId);
        if (!event) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'RESOURCE_NOT_FOUND',
              message: 'Event not found'
            }
          });
        }
        
        // Build query for seats
        const query = { eventId: req.params.eventId };
        if (req.query.status) query.status = req.query.status;
        if (req.query.section) query.section = req.query.section;
        
        // Get seats
        const seats = await Seat.find(query);
        
        // For seats with assignedTo, get donor details
        const seatWithDonorDetails = await Promise.all(seats.map(async seat => {
          const { _id, section, row, number, status, assignedTo, createdAt, updatedAt } = seat;
          
          let assignedToDetails = null;
          if (assignedTo) {
            // In a real implementation, we would get the donor details from the donor service
            // For now, we'll use mock data
            if (assignedTo === '60d4a3a91f3d2c001f9a4ed9') {
              assignedToDetails = {
                id: assignedTo,
                firstName: 'Jane',
                lastName: 'Smith'
              };
            } else if (assignedTo === '60d4a3d41f3d2c001f9a4eda') {
              assignedToDetails = {
                id: assignedTo,
                firstName: 'Amit',
                lastName: 'Patel'
              };
            } else {
              assignedToDetails = {
                id: assignedTo,
                firstName: 'Unknown',
                lastName: 'Donor'
              };
            }
          }
          
          return {
            id: _id,
            section,
            row,
            number,
            status,
            assignedTo: assignedToDetails,
            createdAt,
            updatedAt
          };
        }));
        
        res.json({
          success: true,
          count: seats.length,
          data: seatWithDonorDetails
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
      console.log(`Event Service running on port ${PORT}`);
    });
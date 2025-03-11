const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const amqp = require('amqplib');
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 3008;

app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/notification-service', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true
});

// Notification model
const notificationSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['EMAIL', 'WHATSAPP', 'SMS'], 
    required: true 
  },
  recipient: {
    id: { type: String, required: true },
    email: { type: String },
    phone: { type: String }
  },
  content: {
    subject: { type: String },
    message: { type: String, required: true },
    templateId: { type: String },
    variables: { type: Map, of: String }
  },
  status: { 
    type: String, 
    enum: ['PENDING', 'SENT', 'DELIVERED', 'FAILED'], 
    default: 'PENDING' 
  },
  sentAt: { type: Date },
  deliveredAt: { type: Date },
  failedAt: { type: Date },
  failureReason: { type: String },
  externalId: { type: String }, // Reference to external messaging service
  createdAt: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', notificationSchema);

// Template model
const templateSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  type: { 
    type: String, 
    enum: ['EMAIL', 'WHATSAPP', 'SMS'], 
    required: true 
  },
  subject: { type: String }, // For email
  content: { type: String, required: true },
  variables: [{ type: String }], // List of variable placeholders in the template
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Template = mongoose.model('Template', templateSchema);

// RabbitMQ connection
let channel;
async function connectToRabbitMQ() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    channel = await connection.createChannel();
    
    // Define queues
    await channel.assertQueue('email_notifications', { durable: true });
    await channel.assertQueue('whatsapp_notifications', { durable: true });
    await channel.assertQueue('sms_notifications', { durable: true });
    
    console.log('Connected to RabbitMQ');
    
    // Start consumers
    startConsumers();
  } catch (error) {
    console.error('Error connecting to RabbitMQ:', error);
    setTimeout(connectToRabbitMQ, 5000); // Retry after 5 seconds
  }
}

// Email service setup (using Nodemailer with Ethereal for testing)
let emailTransporter;
async function setupEmailTransporter() {
  try {
    // In a real implementation, you would use your actual SMTP settings
    // For testing, we use Ethereal which is a fake SMTP service
    const testAccount = await nodemailer.createTestAccount();
    
    emailTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    
    console.log('Email transporter configured');
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl);
  } catch (error) {
    console.error('Error setting up email transporter:', error);
  }
}

// Start notification consumers
function startConsumers() {
  // Email consumer
  channel.consume('email_notifications', async (msg) => {
    if (msg !== null) {
      try {
        const notification = JSON.parse(msg.content.toString());
        console.log('Processing email notification:', notification.id);
        
        await processEmailNotification(notification);
        
        channel.ack(msg);
      } catch (error) {
        console.error('Error processing email notification:', error);
        // Requeue with delay for retry (in a real implementation)
        channel.nack(msg, false, true);
      }
    }
  });
  
  // WhatsApp consumer
  channel.consume('whatsapp_notifications', async (msg) => {
    if (msg !== null) {
      try {
        const notification = JSON.parse(msg.content.toString());
        console.log('Processing WhatsApp notification:', notification.id);
        
        await processWhatsAppNotification(notification);
        
        channel.ack(msg);
      } catch (error) {
        console.error('Error processing WhatsApp notification:', error);
        // Requeue with delay for retry (in a real implementation)
        channel.nack(msg, false, true);
      }
    }
  });
  
  // SMS consumer
  channel.consume('sms_notifications', async (msg) => {
    if (msg !== null) {
      try {
        const notification = JSON.parse(msg.content.toString());
        console.log('Processing SMS notification:', notification.id);
        
        await processSMSNotification(notification);
        
        channel.ack(msg);
      } catch (error) {
        console.error('Error processing SMS notification:', error);
        // Requeue with delay for retry (in a real implementation)
        channel.nack(msg, false, true);
      }
    }
  });
}

// Process email notification
async function processEmailNotification(notificationData) {
  try {
    // Get the notification from database
    const notification = await Notification.findById(notificationData.id);
    if (!notification || notification.status !== 'PENDING') {
      return;
    }
    
    // Prepare email content
    const mailOptions = {
      from: `"${process.env.EMAIL_SENDER_NAME || 'Donor Management System'}" <${process.env.EMAIL_SENDER_EMAIL || 'noreply@donormanagementsystem.com'}>`,
      to: notification.recipient.email,
      subject: notification.content.subject,
      html: notification.content.message
    };
    
    // Send email
    const info = await emailTransporter.sendMail(mailOptions);
    
    // Update notification status
    notification.status = 'SENT';
    notification.sentAt = new Date();
    notification.externalId = info.messageId;
    await notification.save();
    
    console.log('Email sent:', info.messageId);
    console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
  } catch (error) {
    // Update notification status
    const notification = await Notification.findById(notificationData.id);
    if (notification) {
      notification.status = 'FAILED';
      notification.failedAt = new Date();
      notification.failureReason = error.message;
      await notification.save();
    }
    
    throw error;
  }
}

// Process WhatsApp notification (simulated)
async function processWhatsAppNotification(notificationData) {
  try {
    // Get the notification from database
    const notification = await Notification.findById(notificationData.id);
    if (!notification || notification.status !== 'PENDING') {
      return;
    }
    
    // Simulate WhatsApp API call
    console.log(`[WhatsApp] Sending message to ${notification.recipient.phone}`);
    console.log(`[WhatsApp] Content: ${notification.content.message}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Simulate success
    const messageId = `wamid.${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Update notification status
    notification.status = 'SENT';
    notification.sentAt = new Date();
    notification.externalId = messageId;
    await notification.save();
    
    console.log('WhatsApp message sent:', messageId);
  } catch (error) {
    // Update notification status
    const notification = await Notification.findById(notificationData.id);
    if (notification) {
      notification.status = 'FAILED';
      notification.failedAt = new Date();
      notification.failureReason = error.message;
      await notification.save();
    }
    
    throw error;
  }
}

// Process SMS notification (simulated)
async function processSMSNotification(notificationData) {
  try {
    // Get the notification from database
    const notification = await Notification.findById(notificationData.id);
    if (!notification || notification.status !== 'PENDING') {
      return;
    }
    
    // Simulate SMS API call
    console.log(`[SMS] Sending message to ${notification.recipient.phone}`);
    console.log(`[SMS] Content: ${notification.content.message}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Simulate success
    const messageId = `smsid.${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Update notification status
    notification.status = 'SENT';
    notification.sentAt = new Date();
    notification.externalId = messageId;
    await notification.save();
    
    console.log('SMS message sent:', messageId);
  } catch (error) {
    // Update notification status
    const notification = await Notification.findById(notificationData.id);
    if (notification) {
      notification.status = 'FAILED';
      notification.failedAt = new Date();
      notification.failureReason = error.message;
      await notification.save();
    }
    
    throw error;
  }
}

// Send notification endpoint
app.post('/send', [
  body('type').isIn(['EMAIL', 'WHATSAPP', 'SMS']),
  body('recipientId').notEmpty(),
  body('recipientEmail').optional().isEmail(),
  body('recipientPhone').optional(),
  body('subject').optional(),
  body('message').notEmpty(),
  body('templateId').optional(),
  body('templateVariables').optional().isObject()
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
    const { type, recipientId, recipientEmail, recipientPhone, subject, message, templateId, templateVariables } = req.body;
    
    // Validate recipient info based on type
    if (type === 'EMAIL' && !recipientEmail) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Recipient email is required for EMAIL notifications'
        }
      });
    }
    
    if ((type === 'WHATSAPP' || type === 'SMS') && !recipientPhone) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Recipient phone is required for ${type} notifications`
        }
      });
    }
    
    let finalMessage = message;
    let finalSubject = subject;
    
    // Process template if templateId is provided
    if (templateId) {
      const template = await Template.findById(templateId);
      if (!template) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'Template not found'
          }
        });
      }
      
      // Check template type
      if (template.type !== type) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Template type (${template.type}) does not match notification type (${type})`
          }
        });
      }
      
      // Apply template variables
      finalMessage = template.content;
      finalSubject = template.subject;
      
      if (templateVariables) {
        for (const [key, value] of Object.entries(templateVariables)) {
          const placeholder = `{{${key}}}`;
          finalMessage = finalMessage.replace(new RegExp(placeholder, 'g'), value);
          if (finalSubject) {
            finalSubject = finalSubject.replace(new RegExp(placeholder, 'g'), value);
          }
        }
      }
    }
    
    // Create notification record
    const notification = new Notification({
      type,
      recipient: {
        id: recipientId,
        email: recipientEmail,
        phone: recipientPhone
      },
      content: {
        subject: finalSubject,
        message: finalMessage,
        templateId: templateId,
        variables: templateVariables
      }
    });
    
    await notification.save();
    
    // Queue notification for processing
    const queueName = `${type.toLowerCase()}_notifications`;
    
    if (channel) {
      channel.sendToQueue(
        queueName,
        Buffer.from(JSON.stringify({ id: notification._id })),
        { persistent: true }
      );
    } else {
      // If RabbitMQ is not connected, process directly (not recommended for production)
      if (type === 'EMAIL') {
        processEmailNotification({ id: notification._id }).catch(console.error);
      } else if (type === 'WHATSAPP') {
        processWhatsAppNotification({ id: notification._id }).catch(console.error);
      } else if (type === 'SMS') {
        processSMSNotification({ id: notification._id }).catch(console.error);
      }
    }
    
    res.status(201).json({
      success: true,
      data: {
        id: notification._id,
        status: notification.status
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

// Get notification status endpoint
app.get('/:notificationId', async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.notificationId);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Notification not found'
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        id: notification._id,
        type: notification.type,
        status: notification.status,
        sentAt: notification.sentAt,
        deliveredAt: notification.deliveredAt,
        failedAt: notification.failedAt,
        failureReason: notification.failureReason,
        createdAt: notification.createdAt
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

// Create template endpoint
app.post('/templates', [
  body('name').notEmpty(),
  body('type').isIn(['EMAIL', 'WHATSAPP', 'SMS']),
  body('subject').optional(),
  body('content').notEmpty(),
  body('variables').optional().isArray()
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
    // Check if template with this name already exists
    const existingTemplate = await Template.findOne({ name: req.body.name });
    if (existingTemplate) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DUPLICATE_ERROR',
          message: 'Template with this name already exists'
        }
      });
    }
    
    // Create template
    const template = new Template({
      name: req.body.name,
      type: req.body.type,
      subject: req.body.subject,
      content: req.body.content,
      variables: req.body.variables || []
    });
    
    await template.save();
    
    res.status(201).json({
      success: true,
      data: template
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

// Initialize services
async function initializeServices() {
  try {
    await connectToRabbitMQ();
    await setupEmailTransporter();
  } catch (error) {
    console.error('Error initializing services:', error);
  }
}

// Start the server
app.listen(PORT, () => {
  console.log(`Notification Service running on port ${PORT}`);
  initializeServices();
});
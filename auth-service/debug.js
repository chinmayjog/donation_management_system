// debug.js
console.log('Debug script running');
console.log('Environment variables:');
console.log(JSON.stringify(process.env, null, 2));

const mongoose = require('mongoose');
console.log('Attempting to connect to MongoDB...');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/auth-service', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB connected successfully');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});
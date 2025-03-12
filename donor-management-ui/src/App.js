import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import Dashboard from './components/Dashboard';
import DonorList from './components/donors/DonorList';
import DonorForm from './components/donors/DonorForm';
import ProtectedRoute from './components/ProtectedRoute';
import EventList from './components/events/EventList';
import EventForm from './components/events/EventForm';
import EventDetail from './components/events/EventDetail';
import DonorEventRegistration from './components/events/DonorEventRegistration';
import EventCheckIn from './components/events/EventCheckIn';
// Make sure the path is correct
import DonationList from './components/donations/DonationList';
import DonationForm from './components/donations/DonationForm';
import DonationDetail from './components/donations/DonationDetail';

const App = () => {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        
        <Route path="/donors" element={<ProtectedRoute><DonorList /></ProtectedRoute>} />
        <Route path="/donors/new" element={<ProtectedRoute><DonorForm /></ProtectedRoute>} />
        <Route path="/donors/:id" element={<ProtectedRoute><DonorForm /></ProtectedRoute>} />
        <Route path="/donors/:id/edit" element={<ProtectedRoute><DonorForm /></ProtectedRoute>} />

        <Route path="/events" element={<ProtectedRoute><EventList /></ProtectedRoute>} />
        <Route path="/events/new" element={<ProtectedRoute><EventForm /></ProtectedRoute>} />
        <Route path="/events/:id" element={<ProtectedRoute><EventDetail /></ProtectedRoute>} />
        <Route path="/events/:id/edit" element={<ProtectedRoute><EventForm /></ProtectedRoute>} />
        <Route path="/events/:id/register" element={<ProtectedRoute><DonorEventRegistration /></ProtectedRoute>} />
        <Route path="/events/:id/check-in" element={<ProtectedRoute><EventCheckIn /></ProtectedRoute>} />
        
        <Route path="/donations" element={<ProtectedRoute><DonationList /></ProtectedRoute>} />
        <Route path="/donations/new" element={<ProtectedRoute><DonationForm /></ProtectedRoute>} />
        <Route path="/donations/:id" element={<ProtectedRoute><DonationDetail /></ProtectedRoute>} />
        <Route path="/donations/:id/edit" element={<ProtectedRoute><DonationForm /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
};

export default App;

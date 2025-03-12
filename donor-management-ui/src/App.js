import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import Dashboard from './components/Dashboard';
import DonorList from './components/donors/DonorList';
import DonorForm from './components/donors/DonorForm';
import ProtectedRoute from './components/ProtectedRoute';

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
        
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
};

export default App;

import React, { createContext, useState, useEffect } from 'react';
import { isAuthenticated, removeTokens } from '../utils/tokenUtils';
import { jwtDecode } from 'jwt-decode'; // Changed from jwt_decode to jwtDecode
import { getToken } from '../utils/tokenUtils';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    if (isAuthenticated()) {
      try {
        const token = getToken();
        const decoded = jwtDecode(token);
        setUser(decoded);
      } catch (error) {
        console.error('Error decoding token:', error);
        logout();
      }
    }
    setLoading(false);
  }, []);

  const logout = () => {
    removeTokens();
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, setUser, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

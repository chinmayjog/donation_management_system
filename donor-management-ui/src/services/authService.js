import api from '../utils/axiosConfig';
import { setTokens } from '../utils/tokenUtils';

export const login = async (credentials) => {
  try {
    const response = await api.post('/auth/login', credentials);
    if (response.data.success) {
      setTokens(response.data.token, response.data.refreshToken);
      return response.data;
    }
    throw new Error('Login failed');
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const register = async (userData) => {
  try {
    const response = await api.post('/auth/register', userData);
    if (response.data.success) {
      setTokens(response.data.token, response.data.refreshToken);
      return response.data;
    }
    throw new Error('Registration failed');
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const getCurrentUser = async () => {
  try {
    const response = await api.get('/auth/me');
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

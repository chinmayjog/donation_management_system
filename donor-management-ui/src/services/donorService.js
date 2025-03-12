import api from '../utils/axiosConfig';

export const getAllDonors = async (params = {}) => {
  try {
    const response = await api.get('/donors', { params });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const getDonorById = async (id) => {
  try {
    const response = await api.get(`/donors/${id}`);
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const createDonor = async (donorData) => {
  try {
    const response = await api.post('/donors', donorData);
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const updateDonor = async (id, donorData) => {
  try {
    const response = await api.put(`/donors/${id}`, donorData);
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const getDonorDonations = async (id) => {
  try {
    const response = await api.get(`/donors/${id}/donations`);
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const verifyPan = async (id, panData) => {
  try {
    const response = await api.post(`/donors/${id}/verify-pan`, panData);
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

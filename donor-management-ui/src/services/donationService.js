import api from '../utils/axiosConfig';

export const getAllDonations = async (params = {}) => {
  try {
    const response = await api.get('/donations', { params });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const getDonationById = async (id) => {
  try {
    const response = await api.get(`/donations/${id}`);
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const createDonation = async (donationData) => {
  try {
    const response = await api.post('/donations', donationData);
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const updateDonation = async (id, donationData) => {
  try {
    const response = await api.put(`/donations/${id}`, donationData);
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

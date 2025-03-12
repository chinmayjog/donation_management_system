import api from '../utils/axiosConfig';

export const getAllReceipts = async (params = {}) => {
  try {
    const response = await api.get('/receipts', { params });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const getReceiptById = async (id) => {
  try {
    const response = await api.get(`/receipts/${id}`);
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const createReceipt = async (receiptData) => {
  try {
    const response = await api.post('/receipts', receiptData);
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const sendReceipt = async (id, deliveryMethod) => {
  try {
    const response = await api.post(`/receipts/${id}/send`, { deliveryMethod });
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const getReceiptDownloadUrl = (id) => {
  return `${process.env.REACT_APP_API_URL}/receipts/${id}/download`;
};

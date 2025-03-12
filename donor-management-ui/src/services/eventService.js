import api from '../utils/axiosConfig';

export const getAllEvents = async (params = {}) => {
  try {
    const response = await api.get('/events', { params });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const getEventById = async (id) => {
  try {
    const response = await api.get(`/events/${id}`);
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const createEvent = async (eventData) => {
  try {
    const response = await api.post('/events', eventData);
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const updateEvent = async (id, eventData) => {
  try {
    const response = await api.put(`/events/${id}`, eventData);
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const deleteEvent = async (id) => {
  try {
    const response = await api.delete(`/events/${id}`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const getEventAttendees = async (id) => {
  try {
    const response = await api.get(`/events/${id}/attendees`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

export const registerDonorForEvent = async (eventId, registrationData) => {
  try {
    const response = await api.post(`/events/${eventId}/register`, registrationData);
    return response.data.data;
  } catch (error) {
    throw error.response ? error.response.data : error;
  }
};

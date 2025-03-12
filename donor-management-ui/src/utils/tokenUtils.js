export const getToken = () => {
  return localStorage.getItem('token');
};

export const setTokens = (token, refreshToken) => {
  localStorage.setItem('token', token);
  localStorage.setItem('refreshToken', refreshToken);
};

export const removeTokens = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
};

export const isAuthenticated = () => {
  return !!getToken();
};

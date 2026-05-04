import axios from 'axios';

const BASE = 'http://localhost:8000';

// ── V1 instance (existing — unchanged)
const api = axios.create({
  baseURL: `${BASE}/api/v1`,
});

// ── V2 instance (new — for logistic v2 endpoints)
export const apiV2 = axios.create({
  baseURL: `${BASE}/api/v2`,
});

// Attach auth token to BOTH instances
const authInterceptor = (config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
};

api.interceptors.request.use(authInterceptor, Promise.reject);
apiV2.interceptors.request.use(authInterceptor, Promise.reject);

export default api;
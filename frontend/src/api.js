import axios from 'axios';

const TOKEN_KEY = 'nanban.token';

// localStorage can throw (private mode, blocked storage); the app must still work without it.
export const tokenStore = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* session-only login */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* nothing to clear */ }
  },
};

const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 30000 });

let unauthorizedHandler = () => {};
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
}

http.interceptors.request.use((cfg) => {
  const token = tokenStore.get();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

http.interceptors.response.use(
  (r) => r,
  (error) => {
    const url = error?.config?.url || '';
    const hadToken = Boolean(error?.config?.headers?.Authorization);
    // An expired/invalid token on a protected call logs the user out; failed logins are just errors.
    if (error?.response?.status === 401 && hadToken && !url.startsWith('/auth/login')) unauthorizedHandler();
    return Promise.reject(error);
  }
);

export function errorMessage(e) {
  if (e?.response?.data?.error) return e.response.data.error;
  if (e?.code === 'ECONNABORTED') return 'The server took too long to respond';
  if (e?.response) return 'Something went wrong';
  return 'Cannot reach the server';
}

const data = (p) => p.then((r) => r.data);

export const api = {
  register: (body) => data(http.post('/auth/register', body)),
  login: (body) => data(http.post('/auth/login', body)),
  me: () => data(http.get('/auth/me')),

  searchCities: (q) => data(http.get('/locations/search', { params: { q } })),
  listLocations: () => data(http.get('/locations')),
  saveLocation: (body) => data(http.post('/locations', body)),
  deleteLocation: (id) => http.delete(`/locations/${id}`),

  weather: (lat, lon) => data(http.get('/weather', { params: { lat, lon } })),
  air: (lat, lon) => data(http.get('/air', { params: { lat, lon } })),
  forecastForCoords: (lat, lon, city) => data(http.get('/forecast', { params: { lat, lon, city } })),
  forecastForLocation: (id) => data(http.get(`/forecast/${id}`)),

  chat: (body) => data(http.post('/chat', body)),
  chatHistory: () => data(http.get('/chat/history', { params: { limit: 30 } })),

  adminStats: () => data(http.get('/admin/stats')),
};

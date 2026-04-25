import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data, config } = error.response;
      const message = data?.error || data?.message || 'Network error — please check your connection.';
      const devDetails = data?.details || '';
      
      // Enhance error object
      error.status = status;
      error.niceMessage = `${message}${devDetails ? ' (' + devDetails + ')' : ''}`;
      
      let payload = null;
      try {
        payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      } catch (e) {
        payload = config.data;
      }

      error.devDetails = {
        code: status,
        method: config.method?.toUpperCase(),
        url: config.url,
        message: data.error || data.message || 'Unknown Server Error',
        payload
      };
      // Create a nice human-readable string for quick toasts
      error.niceMessage = `[${status}] ${config.method?.toUpperCase()} ${config.url.split('/').pop()}: ${error.devDetails.message}`;
    } else {
      error.niceMessage = error.message;
    }

    return Promise.reject(error);
  }
);

export const authService = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  register: (data) => api.post('/auth/register', data),
  getProfile: () => api.get('/auth/profile')
};

export const scenarioService = {
  getAll: () => api.get('/scenarios'),
  getById: (id) => api.get(`/scenarios/${id}`),
  create: (data) => api.post('/scenarios', data),
  update: (id, data) => api.put(`/scenarios/${id}`, data),
  delete: (id) => api.delete(`/scenarios/${id}`),
  calculate: (id) => api.post(`/scenarios/${id}/calculate`),
  getPnL: (id) => api.get(`/scenarios/${id}/pnl`),
  exportExcel: (id) => api.get(`/scenarios/${id}/export`, { responseType: 'blob' }),
  getParameters: (id) => api.get(`/scenarios/${id}/parameters`),
  updateParameters: (id, data) => api.put(`/scenarios/${id}/parameters`, data),
  getFinancialMetrics: (id) => api.get(`/scenarios/${id}/financial-metrics`)
};

export const fleetService = {
  getAll: (scenarioId) => api.get(`/scenarios/${scenarioId}/fleet`),
  create: (scenarioId, data) => api.post(`/scenarios/${scenarioId}/fleet`, data),
  update: (id, data) => api.put(`/fleet/${id}`, data),
  delete: (id) => api.delete(`/fleet/${id}`),
  getInitialMaintenance: (id) => api.get(`/fleet/${id}/initial-maintenance`),
  setInitialMaintenance: (id, data) => api.post(`/fleet/${id}/initial-maintenance`, data)
};

export const aircraftTypeService = {
  getAll: () => api.get('/aircraft-types'),
  getById: (id) => api.get(`/aircraft-types/${id}`),
  create: (data) => api.post('/aircraft-types', data),
  update: (id, data) => api.put(`/aircraft-types/${id}`, data),
  delete: (id) => api.delete(`/aircraft-types/${id}`)
};

export const airportService = {
  getAll: () => api.get('/airports'),
  create: (data) => api.post('/airports', data),
  update: (id, data) => api.put(`/airports/${id}`, data),
  delete: (id) => api.delete(`/airports/${id}`)
};

export const importService = {
  importData: (endpoint, formData) => api.post(endpoint, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
};

export const maintenanceService = {
  getEventTypes: (acTypeId) => api.get(`/aircraft-types/${acTypeId}/maintenance-events`),
  createEventType: (data) => api.post('/maintenance-events', data),
  updateEventType: (id, data) => api.put(`/maintenance-events/${id}`, data),
  deleteEventType: (id) => api.delete(`/maintenance-events/${id}`),
  deleteAllEventTypes: () => api.delete('/maintenance-events'),
  getLog: (fleetPlanId) => api.get(`/fleet/${fleetPlanId}/maintenance`),
  schedule: (fleetPlanId) => api.post(`/fleet/${fleetPlanId}/maintenance/schedule`),
  updateStatus: (id, data) => api.put(`/maintenance/${id}`, data),
  getUpcoming: (scenarioId, days) => api.get(`/scenarios/${scenarioId}/maintenance/upcoming${days ? `?days=${days}` : ''}`)
};

export const scheduleService = {
  getByScenario: (scenarioId) => api.get(`/scenarios/${scenarioId}/schedules`),
  create: (scenarioId, data) => api.post(`/scenarios/${scenarioId}/schedules`, data),
  bulkCreateRotation: (scenarioId, data) => api.post(`/scenarios/${scenarioId}/schedules/bulk-rotation`, data),
  update: (id, data) => api.put(`/schedules/${id}`, data),
  updateRotation: (rotationGroupId, data) => api.put(`/schedules/rotation/${rotationGroupId}`, data),
  delete: (id) => api.delete(`/schedules/${id}`),
  deleteRotation: (rotationGroupId) => api.delete(`/schedules/rotation/${rotationGroupId}`),
  deleteWeek: (id, dayField) => api.delete(`/schedules/${id}/week`, { data: { dayField } }),
  deleteMonth: (id, asOfDate) => api.delete(`/schedules/${id}/month`, { data: { asOfDate } })
};

export const pricingService = {
  getByScenario: (scenarioId) => api.get(`/scenarios/${scenarioId}/pricing`),
  create: (scenarioId, data) => api.post(`/scenarios/${scenarioId}/pricing`, data),
  bulkCreate: (scenarioId, data) => api.post(`/scenarios/${scenarioId}/pricing/bulk`, data),
  update: (id, data) => api.put(`/pricing/${id}`, data),
  delete: (id) => api.delete(`/pricing/${id}`),
  getAllMaster: () => api.get('/master-pricing'),
  createMaster: (data) => api.post('/master-pricing', data),
  updateMaster: (id, data) => api.put(`/master-pricing/${id}`, data),
  deleteMaster: (id) => api.delete(`/master-pricing/${id}`),
  deleteAllMaster: () => api.delete('/master-pricing')
};

export const routeService = {
  getFeasible: (fleetPlanId) => api.get(`/routes/feasible/${fleetPlanId}`),
  suggest: (aircraftTypeId, data) => api.post(`/routes/suggest/${aircraftTypeId}`, data)
};

export const dailyPnLService = {
  getDailyPnL: (scenarioId) => api.get(`/scenarios/${scenarioId}/daily-pnl`),
  getDailyAnalysis: (scenarioId, date) => api.get(`/scenarios/${scenarioId}/daily-analysis?date=${date}`)
};

export const holidayService = {
  getByScenario: (scenarioId) => api.get(`/scenarios/${scenarioId}/holidays`),
  create: (scenarioId, data) => api.post(`/scenarios/${scenarioId}/holidays`, data),
  bulkCreate: (scenarioId, data) => api.post(`/scenarios/${scenarioId}/holidays/bulk`, data),
  update: (id, data) => api.put(`/holidays/${id}`, data),
  delete: (id) => api.delete(`/holidays/${id}`),
  getAllMaster: () => api.get('/master-holidays'),
  createMaster: (data) => api.post('/master-holidays', data),
  updateMaster: (id, data) => api.put(`/master-holidays/${id}`, data),
  deleteMaster: (id) => api.delete(`/master-holidays/${id}`)
};

export const crewService = {
  getByScenario: (scenarioId) => api.get(`/scenarios/${scenarioId}/crew`),
  getAll: () => api.get('/crew'),
  create: (data) => api.post('/crew', data),
  bulkCreate: (data) => api.post('/crew/bulk', data),
  update: (id, data) => api.put(`/crew/${id}`, data),
  delete: (id) => api.delete(`/crew/${id}`)
};

export const airportFeesService = {
  getByScenario: (scenarioId) => api.get(`/scenarios/${scenarioId}/airport-fees`),
  upsertOverride: (scenarioId, data) => api.post(`/scenarios/${scenarioId}/airport-fees`, data),
  deleteOverride: (id) => api.delete(`/airport-fees-override/${id}`)
};

export const monteCarloService = {
  simulate: (id, data) => api.post(`/scenarios/${id}/montecarlo/simulate`, data),
  getHistogram: (id, data) => api.post(`/scenarios/${id}/montecarlo/histogram`, data),
  getRisk: (id, data) => api.post(`/scenarios/${id}/montecarlo/risk`, data)
};

export const masterSettingsService = {
  getParameters: () => api.get('/master-parameters'),
  updateParameters: (data) => api.put('/master-parameters', data)
};

export default api;


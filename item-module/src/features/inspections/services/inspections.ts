import api from '@/lib/api';

export const inspectionsAPI = {
  getAll: (params?: { search?: string;[key: string]: any }) =>
    api.get('/api/inventory/inspections/', { params })
      .then(res => res.data.results || res.data),
  get: (id: number) => api.get(`/api/inventory/inspections/${id}/`).then(res => res.data),
  create: (data: any) => api.post('/api/inventory/inspections/', data).then(res => res.data),
  update: (id: number, data: any) => api.patch(`/api/inventory/inspections/${id}/`, data).then(res => res.data),
  delete: (id: number) => api.delete(`/api/inventory/inspections/${id}/`).then(res => res.data),

  // Transitions
  initiate: (id: number) => api.post(`/api/inventory/inspections/${id}/initiate/`).then(res => res.data),
  submitToStockDetails: (id: number) => api.post(`/api/inventory/inspections/${id}/submit_to_stock_details/`).then(res => res.data),
  submitToCentralRegister: (id: number) => api.post(`/api/inventory/inspections/${id}/submit_to_central_register/`).then(res => res.data),
  submitToFinanceReview: (id: number) => api.post(`/api/inventory/inspections/${id}/submit_to_finance_review/`).then(res => res.data),
  complete: (id: number) => api.post(`/api/inventory/inspections/${id}/complete/`).then(res => res.data),
  reject: (id: number, reason: string) => api.post(`/api/inventory/inspections/${id}/reject/`, { reason }).then(res => res.data),
  viewPDF: (id: number) => api.get(`/api/inventory/inspections/${id}/view_pdf/`, { responseType: 'blob' }),
};

export default inspectionsAPI;

import { api } from './api';

export const notificationService = {
  async getNotifications(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.resolved !== undefined && params.resolved !== 'all') {
      query.set('resolved', params.resolved);
    }

    const res = await api.get(`/notifications?${query.toString()}`);
    return res.data;
  },

  async resolveNotification(id) {
    const res = await api.patch(`/notifications/${id}/resolve`, {});
    return res.data.notification;
  },
};

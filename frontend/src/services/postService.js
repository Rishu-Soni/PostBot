import { api } from './api';
import { mockStore } from './mockData';

export const postService = {
  async getPost(postId) {
    if (mockStore.isDemoMode()) {
      const posts = JSON.parse(localStorage.getItem('postbot_mock_posts') || '[]');
      return posts.find((p) => p._id === postId);
    }
    try {
      const res = await api.get(`/posts/${postId}`);
      return res.data.post;
    } catch (err) {
      if (err.status === 0) {
        const posts = JSON.parse(localStorage.getItem('postbot_mock_posts') || '[]');
        return posts.find((p) => p._id === postId);
      }
      throw err;
    }
  },

  async updatePost(postId, updates) {
    if (mockStore.isDemoMode()) {
      return mockStore.updatePost(postId, updates);
    }
    try {
      const res = await api.patch(`/posts/${postId}`, updates);
      return res.data.post;
    } catch (err) {
      if (err.status === 0) return mockStore.updatePost(postId, updates);
      throw err;
    }
  },

  async regeneratePost(postId, part) {
    if (mockStore.isDemoMode()) {
      return mockStore.regeneratePost(postId, part);
    }
    try {
      const res = await api.post(`/posts/${postId}/regenerate`, { part });
      return res.data.post;
    } catch (err) {
      if (err.status === 0) return mockStore.regeneratePost(postId, part);
      throw err;
    }
  },

  async uploadImage(postId, file) {
    if (mockStore.isDemoMode()) {
      return mockStore.uploadImage(postId, file);
    }
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await api.post(`/posts/${postId}/image`, formData);
      return res.data.post;
    } catch (err) {
      if (err.status === 0) return mockStore.uploadImage(postId, file);
      throw err;
    }
  },

  async postNow(postId) {
    if (mockStore.isDemoMode()) {
      return mockStore.postNow(postId);
    }
    try {
      const res = await api.post(`/posts/${postId}/post-now`, {});
      return res.data.post;
    } catch (err) {
      if (err.status === 0) return mockStore.postNow(postId);
      throw err;
    }
  },
};

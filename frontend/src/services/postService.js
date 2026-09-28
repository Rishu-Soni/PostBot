import { api } from './api';

export const postService = {
  async getPost(postId) {
    const res = await api.get(`/posts/${postId}`);
    return res.data.post;
  },

  async updatePost(postId, updates) {
    const res = await api.patch(`/posts/${postId}`, updates);
    return res.data.post;
  },

  async regeneratePost(postId, part, source) {
    const body = { part };
    if (source) body.source = source;
    const res = await api.post(`/posts/${postId}/regenerate`, body);
    return res.data.post;
  },

  async uploadImage(postId, file) {
    const formData = new FormData();
    formData.append('image', file);
    const res = await api.post(`/posts/${postId}/image`, formData);
    return res.data.post;
  },

  async postNow(postId) {
    const res = await api.post(`/posts/${postId}/post-now`, {});
    return res.data.post;
  },
};

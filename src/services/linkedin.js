'use strict';

const axios = require('axios');

const AUTH_BASE = 'https://www.linkedin.com/oauth/v2';
const API_BASE  = 'https://api.linkedin.com/v2';
const SCOPES    = ['openid', 'profile', 'email', 'w_member_social'];

function buildAuthUrl(stateParam) {
  return `${AUTH_BASE}/authorization?` + new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.LINKEDIN_CLIENT_ID,
    redirect_uri:  process.env.LINKEDIN_REDIRECT_URI,
    state:         stateParam,
    scope:         SCOPES.join(' '),
  }).toString();
}

async function exchangeCodeForToken(code) {
  const res = await axios.post(
    `${AUTH_BASE}/accessToken`,
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: process.env.LINKEDIN_REDIRECT_URI, client_id: process.env.LINKEDIN_CLIENT_ID, client_secret: process.env.LINKEDIN_CLIENT_SECRET }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000 }
  );
  if (!res.data.access_token) throw new Error('[LinkedIn] Token exchange succeeded but no access_token in response');
  return { accessToken: res.data.access_token, refreshToken: res.data.refresh_token ?? null, expiresIn: res.data.expires_in };
}

async function refreshAccessToken(refreshToken) {
  const res = await axios.post(
    `${AUTH_BASE}/accessToken`,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: process.env.LINKEDIN_CLIENT_ID, client_secret: process.env.LINKEDIN_CLIENT_SECRET }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000 }
  );
  return { accessToken: res.data.access_token, expiresIn: res.data.expires_in };
}

async function getPersonUrn(accessToken) {
  const res = await axios.get(`${API_BASE}/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10_000 });
  if (!res.data.sub) throw new Error('[LinkedIn] Could not retrieve member ID from userinfo endpoint');
  return `urn:li:person:${res.data.sub}`;
}

async function postToLinkedIn(accessToken, postText) {
  const authorUrn = await getPersonUrn(accessToken);
  const res = await axios.post(
    `${API_BASE}/ugcPosts`,
    {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text: postText }, shareMediaCategory: 'NONE' } },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' }, timeout: 15_000 }
  );
  const postId = res.data.id ?? res.headers['x-restli-id'];
  return { postUrl: postId ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}/` : 'https://www.linkedin.com/feed/' };
}

async function getValidAccessToken(userDoc) {
  if (!userDoc?.linkedinAccessToken) throw new Error('NOT_CONNECTED');

  const expiry = userDoc.linkedinTokenExpiry ? new Date(userDoc.linkedinTokenExpiry).getTime() : 0;
  const now    = Date.now();

  if (expiry > 0 && now >= expiry) {
    if (!userDoc.linkedinRefreshToken) throw new Error('TOKEN_EXPIRED');
    try {
      const { accessToken, expiresIn } = await refreshAccessToken(userDoc.linkedinRefreshToken);
      userDoc.linkedinAccessToken = accessToken;
      userDoc.linkedinTokenExpiry = new Date(now + expiresIn * 1000);
      await userDoc.save();
      return accessToken;
    } catch {
      throw new Error('TOKEN_EXPIRED');
    }
  }

  // Pro-actively refresh in background if expiring within 7 days
  if (expiry > 0 && (expiry - now) < 7 * 24 * 60 * 60 * 1000 && userDoc.linkedinRefreshToken) {
    refreshAccessToken(userDoc.linkedinRefreshToken)
      .then(async ({ accessToken, expiresIn }) => {
        userDoc.linkedinAccessToken = accessToken;
        userDoc.linkedinTokenExpiry = new Date(Date.now() + expiresIn * 1000);
        await userDoc.save();
      })
      .catch(err => console.warn('[LinkedIn] Background token refresh failed:', err.message));
  }

  return userDoc.linkedinAccessToken;
}

module.exports = { buildAuthUrl, exchangeCodeForToken, postToLinkedIn, getValidAccessToken };

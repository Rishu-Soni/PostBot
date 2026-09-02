import { http, HttpResponse } from 'msw';

// Base URL for our API calls
const API_URL = '/api';

export const handlers = [
  // Auth endpoints
  http.post(`${API_URL}/auth/login`, () => {
    return HttpResponse.json({
      token: 'fake_jwt_token',
      user: { _id: '123', name: 'Test User', email: 'test@example.com' },
    });
  }),
  http.get(`${API_URL}/auth/me`, () => {
    return HttpResponse.json({
      user: { _id: '123', name: 'Test User', email: 'test@example.com' },
    });
  }),
  http.post(`${API_URL}/auth/signup`, () => {
    return HttpResponse.json({
      token: 'fake_jwt_token',
      user: { _id: '123', name: 'Test User', email: 'test@example.com' },
    });
  }),

  // LinkedIn endpoints
  http.get(`${API_URL}/linkedin/status`, () => {
    return HttpResponse.json({
      connected: true,
      profile: { localizedFirstName: 'Test', localizedLastName: 'User' },
    });
  }),
  http.post(`${API_URL}/linkedin/disconnect`, () => {
    return HttpResponse.json({ message: 'Disconnected successfully' });
  }),

  // Journeys endpoints
  http.get(`${API_URL}/journeys`, () => {
    return HttpResponse.json({
      journeys: [
        {
          _id: 'j1',
          title: 'My First Journey',
          template: 'Day {{dayNumber}}: {{topic}}',
          startDate: new Date().toISOString(),
          isActive: true,
        },
      ],
    });
  }),
  http.post(`${API_URL}/journeys`, () => {
    return HttpResponse.json({
      journey: {
        _id: 'new_j',
        title: 'New Journey',
        template: 'Test Template',
        startDate: new Date().toISOString(),
        isActive: true,
      },
    });
  }),
  http.delete(`${API_URL}/journeys/:id`, () => {
    return HttpResponse.json({ message: 'Journey deleted' });
  }),

  // Daily entries endpoints
  http.get(`${API_URL}/journeys/:id/entries`, () => {
    return HttpResponse.json({
      entries: [
        {
          _id: 'e1',
          dayNumber: 1,
          topic: 'Initial setup',
          status: 'planned',
          scheduledDate: new Date().toISOString(),
        },
      ],
    });
  }),
  http.post(`${API_URL}/journeys/:id/entries/bulk`, () => {
    return HttpResponse.json({
      entries: [
        {
          _id: 'e2',
          dayNumber: 2,
          topic: 'Bulk added',
          status: 'planned',
          scheduledDate: new Date().toISOString(),
        },
      ],
    }, { status: 201 });
  }),
  http.patch(`${API_URL}/journeys/:journeyId/entries/:entryId`, () => {
    return HttpResponse.json({
      entry: {
        _id: 'e1',
        topic: 'Updated topic',
        status: 'planned',
      }
    });
  })
];

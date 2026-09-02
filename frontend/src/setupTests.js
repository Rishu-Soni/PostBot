import '@testing-library/jest-dom/vitest';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './mocks/server.js';

// Node 18's global fetch doesn't support relative URLs, which are common in React apps.
// We intercept relative URLs and make them absolute so MSW can intercept them.
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (typeof url === 'string' && url.startsWith('/')) {
    url = `http://localhost${url}`;
  }
  return originalFetch(url, options);
};

// Establish API mocking before all tests.
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests.
afterEach(() => server.resetHandlers());

// Clean up after the tests are finished.
afterAll(() => server.close());

const config = require('../../config/env');
const { ApiResponse } = require('../ApiResponse');

/**
 * Base client for every resource client. It:
 *  - prefixes paths with the API version (/api/v1)
 *  - injects the Bearer token when one is set
 *  - never throws on 4xx/5xx (negative tests need to assert on them)
 *  - returns an ApiResponse with parsed body + timing
 */
class BaseApiClient {
  /**
   * @param {import('@playwright/test').APIRequestContext} request
   * @param {{ token?: string|null }} [options]
   */
  constructor(request, { token = null } = {}) {
    this.request = request;
    this.token = token;
  }

  buildHeaders(extra = {}) {
    const headers = { Accept: 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return { ...headers, ...extra };
  }

  async send(method, path, { data, params, headers } = {}) {
    const url = `${config.apiPrefix}${path}`;
    const started = Date.now();
    const response = await this.request.fetch(url, {
      method,
      data,
      params,
      headers: this.buildHeaders(headers),
      failOnStatusCode: false,
    });
    const durationMs = Date.now() - started;
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return new ApiResponse({ response, body, durationMs, method, url, requestBody: data });
  }

  get(path, options) { return this.send('GET', path, options); }

  post(path, data, options = {}) { return this.send('POST', path, { ...options, data }); }
}

module.exports = { BaseApiClient };

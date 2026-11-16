/**
 * Thin wrapper around Playwright's APIResponse.
 * The body is parsed once, and timing and request metadata are kept for assertions and debugging.
 */
class ApiResponse {
  constructor({ response, body, durationMs, method, url, requestBody }) {
    this.raw = response;
    this.status = response.status();
    this.headers = response.headers();
    this.body = body;
    this.durationMs = durationMs;
    this.method = method;
    this.url = url;
    this.requestBody = requestBody;
  }

  get ok() {
    return this.status >= 200 && this.status < 300;
  }

  header(name) {
    return this.headers[name.toLowerCase()];
  }

  /** Human-readable summary used in assertion failure messages. */
  describe() {
    return [
      `${this.method} ${this.url} -> ${this.status} (${this.durationMs} ms)`,
      this.requestBody !== undefined ? `Request:  ${JSON.stringify(this.requestBody)}` : null,
      `Response: ${JSON.stringify(this.body, null, 2)}`,
    ].filter(Boolean).join('\n');
  }
}

module.exports = { ApiResponse };

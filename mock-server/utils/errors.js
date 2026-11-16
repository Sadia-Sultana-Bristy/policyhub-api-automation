class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const validationError = (details) =>
  new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', details);

function errorBody(req, code, message, details) {
  const error = { code, message };
  if (details && details.length) error.details = details;
  return { error, requestId: req.id };
}

function notFoundHandler(req, res) {
  res.status(404).json(errorBody(req, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    if (err.status === 401) res.set('WWW-Authenticate', 'Bearer realm="policyhub"');
    return res.status(err.status).json(errorBody(req, err.code, err.message, err.details));
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(errorBody(req, 'MALFORMED_JSON', 'Request body is not valid JSON'));
  }
  console.error(err);
  return res.status(500).json(errorBody(req, 'INTERNAL_ERROR', 'An unexpected error occurred'));
}

module.exports = { ApiError, validationError, errorBody, notFoundHandler, errorHandler };

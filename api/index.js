const { AuthClient } = require('./clients/AuthClient');
const { CustomerClient } = require('./clients/CustomerClient');
const { QuoteClient } = require('./clients/QuoteClient');
const { PolicyClient } = require('./clients/PolicyClient');

/** Build a bundle of resource clients that share one request context and one token. */
function createApiClients(request, token = null) {
  return {
    token,
    auth: new AuthClient(request),
    customers: new CustomerClient(request, { token }),
    quotes: new QuoteClient(request, { token }),
    policies: new PolicyClient(request, { token }),
  };
}

module.exports = { createApiClients, AuthClient, CustomerClient, QuoteClient, PolicyClient };

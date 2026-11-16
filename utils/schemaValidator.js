const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const SCHEMA_DIR = path.resolve(__dirname, '..', 'api', 'schemas');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

for (const file of fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.schema.json'))) {
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, file), 'utf8')));
}

/**
 * Validate a payload against a named JSON schema (api/schemas/<name>.schema.json).
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateSchema(schemaName, payload) {
  const validate = ajv.getSchema(schemaName);
  if (!validate) throw new Error(`Unknown schema "${schemaName}"`);
  const valid = validate(payload);
  const errors = (validate.errors || []).map((e) => `${e.instancePath || '(root)'} ${e.message}`);
  return { valid, errors };
}

module.exports = { validateSchema };

// Assertion-level transform: pull the JSON object out of the ```json fence.
const { extractJson } = require('./lib');
module.exports = (output) => extractJson(output);

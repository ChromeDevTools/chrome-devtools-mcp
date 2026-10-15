"use strict";
const { createAPIFromDataset } = require('../create-entity-finder-api.js');
const entities = require('../../dist/entities-httparchive.json');
module.exports = createAPIFromDataset(entities);
//# sourceMappingURL=httparchive.js.map
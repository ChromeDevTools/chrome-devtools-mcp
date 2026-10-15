"use strict";
const { createAPIFromDataset } = require('../create-entity-finder-api.js');
const entities = require('../../dist/entities-nostats.json');
module.exports = createAPIFromDataset(entities);
//# sourceMappingURL=nostats.js.map
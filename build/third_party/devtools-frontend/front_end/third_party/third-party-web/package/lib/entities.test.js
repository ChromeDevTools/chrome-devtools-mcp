"use strict";
const _ = require('lodash');
const { entities, getRootDomain, getEntity } = require('./index.js');
describe('Entities', () => {
    it('should not have duplicate names', () => {
        for (let i = 0; i < entities.length; i++) {
            for (let j = i + 1; j < entities.length; j++) {
                const nameA = entities[i].name.replace(/\s+/, '').toLowerCase();
                const nameB = entities[j].name.replace(/\s+/, '').toLowerCase();
                if (nameA !== nameB)
                    continue;
                expect(entities[i]).toBe(entities[j]);
            }
        }
    });
    it('should not have non-supported wilcards', () => {
        for (const entity of entities) {
            for (const domain of entity.domains) {
                // Wildcards must be like `*.blah.com`
                // Wildcards cannot be `*blah.com` or `blah*.com`
                expect(domain).toEqual(expect.not.stringMatching(/\w\*/));
                expect(domain).toEqual(expect.not.stringMatching(/\*\w/));
            }
        }
    });
    it('should not have commas within a domain', () => {
        for (const entity of entities) {
            for (const domain of entity.domains) {
                // A domain can be `*.maxymiser.net` or `maxymiser.hs.llnwd.net`
                // A domain can't be `*.maxymiser.net, maxymiser.hs.llnwd.net`
                expect(domain).toEqual(expect.not.stringContaining(','));
            }
        }
    });
});
//# sourceMappingURL=entities.test.js.map
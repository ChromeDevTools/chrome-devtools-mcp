"use strict";
const fs = require('fs');
const path = require('path');
const { createAPIFromDataset } = require('./create-entity-finder-api.js');
describe('getEntity', () => {
    let api;
    beforeEach(() => {
        api = createAPIFromDataset([
            {
                name: 'Domain',
                domains: ['*.example.com', '*.example.co.uk'],
            },
            {
                name: 'Subdomain',
                domains: ['*.sub.example.com', '*.sub.example.co.uk'],
            },
            {
                name: 'Subsubdomain',
                domains: ['very.specific.example.com'],
            },
        ]);
    });
    it('should find direct domains', () => {
        expect(api.getEntity('https://very.specific.example.com/path').name).toEqual('Subsubdomain');
    });
    it('should find wildcard subdomains', () => {
        expect(api.getEntity('https://foo.sub.example.com/path').name).toEqual('Subdomain');
        expect(api.getEntity('https://bar.sub.example.com/path').name).toEqual('Subdomain');
        expect(api.getEntity('https://baz.bar.sub.example.com/path').name).toEqual('Subdomain');
        expect(api.getEntity('https://foo.sub.example.co.uk/path').name).toEqual('Subdomain');
        expect(api.getEntity('https://bar.sub.example.co.uk/path').name).toEqual('Subdomain');
        expect(api.getEntity('https://baz.bar.sub.example.co.uk/path').name).toEqual('Subdomain');
    });
    it('should find wildcard domains', () => {
        expect(api.getEntity('https://foo.example.com/path').name).toEqual('Domain');
        expect(api.getEntity('https://bar.example.com/path').name).toEqual('Domain');
        expect(api.getEntity('https://baz.bar.example.com/path').name).toEqual('Domain');
        expect(api.getEntity('https://foo.example.co.uk/path').name).toEqual('Domain');
        expect(api.getEntity('https://bar.example.co.uk/path').name).toEqual('Domain');
        expect(api.getEntity('https://baz.bar.example.co.uk/path').name).toEqual('Domain');
    });
    it.skip('stress test', () => {
        const urls = fs
            .readFileSync(path.join(__dirname, '../data/random-urls.txt'), 'utf8')
            .split('\n')
            .filter(Boolean);
        console.time('getEntity');
        for (let i = 0; i < 1_000_000; i++) {
            api.getEntity(urls[i % urls.length]);
        }
        console.timeEnd('getEntity');
    });
});
//# sourceMappingURL=create-entity-finder-api.test.js.map
"use strict";
const fs = require('fs');
const path = require('path');
const { entities, getRootDomain, getEntity, getProduct } = require('./index.js');
describe('getRootDomain', () => {
    it('works for IP addresses', () => {
        expect(getRootDomain('8.8.8.8')).toEqual('8.8.8.8');
        expect(getRootDomain('192.168.0.1')).toEqual('192.168.0.1');
    });
    it('works for basic domains', () => {
        expect(getRootDomain('cdn.cnn.com')).toEqual('cnn.com');
        expect(getRootDomain('www.hulce.photography')).toEqual('hulce.photography');
        expect(getRootDomain('api.supercool.io')).toEqual('supercool.io');
    });
    it('works for country-tlds', () => {
        expect(getRootDomain('content.yahoo.co.jp')).toEqual('yahoo.co.jp');
        expect(getRootDomain('go.visit.gov.in')).toEqual('visit.gov.in');
    });
    it('works for URLs', () => {
        expect(getRootDomain('https://content.yahoo.co.jp/path/?query=param')).toEqual('yahoo.co.jp');
        expect(getRootDomain('https://a.b.c.it/path/?query=param&two=2')).toEqual('c.it');
        expect(getRootDomain('https://foo.bar:433/path/?query=param&two=2')).toEqual('foo.bar');
    });
    it('works for localhost', () => {
        expect(getRootDomain('https://localhost:8080/path/?query=param')).toEqual('localhost');
        expect(getRootDomain('https://localhost/path/?query=param&two=2')).toEqual('localhost');
        expect(getRootDomain('localhost:9000/path/?query=param&two=2')).toEqual('localhost');
        expect(getRootDomain('localhost:1200')).toEqual('localhost');
    });
    it('works for wildcard domains', () => {
        expect(getRootDomain('*.google.com')).toEqual('google.com');
        expect(getRootDomain('*.yahoo.co.jp')).toEqual('yahoo.co.jp');
        expect(getRootDomain('*.hulce.photography')).toEqual('hulce.photography');
    });
    it('runs on *massive* inputs', () => {
        const massiveInput = '123456789'.repeat(100e3);
        expect(getRootDomain(massiveInput)).toEqual(null);
    });
    it('runs on data URIs', () => {
        const dataUri = 'data:image/gif;base64,R0lGODlhAQABAIAAAP8AADAAACwAAAAAAQABAAACAkQBADs=';
        expect(getRootDomain(dataUri)).toEqual(null);
    });
    it('returns null on invalid inputs', () => {
        expect(getRootDomain('this is not a domain')).toEqual(null);
        expect(getRootDomain('neither-is-this')).toEqual(null);
        expect(getRootDomain('http://nor this')).toEqual(null);
    });
});
describe('getEntity', () => {
    it('works for direct domain usage', () => {
        expect(getEntity('https://js.connect.facebook.net/lib.js')).toMatchInlineSnapshot(`
      Object {
        "averageExecutionTime": 513.7506757503379,
        "categories": Array [
          "social",
        ],
        "category": "social",
        "company": "Facebook",
        "domains": Array [
          "*.facebook.com",
          "*.atlassbx.com",
          "*.fbsbx.com",
          "fbcdn-photos-e-a.akamaihd.net",
          "*.facebook.net",
          "*.fbcdn.net",
        ],
        "examples": Array [
          "www.facebook.com",
          "connect.facebook.net",
          "staticxx.facebook.com",
          "static.xx.fbcdn.net",
          "m.facebook.com",
          "an.facebook.com",
          "platform-lookaside.fbsbx.com",
        ],
        "homepage": "https://www.facebook.com",
        "name": "Facebook",
        "products": Array [
          Object {
            "categories": Array [
              "social",
            ],
            "category": "social",
            "company": "Facebook",
            "facades": Array [
              Object {
                "name": "React Live Chat Loader",
                "repo": "https://github.com/calibreapp/react-live-chat-loader",
              },
            ],
            "name": "Facebook Messenger Customer Chat",
            "urlPatterns": Array [
              /connect\\\\\\.facebook\\\\\\.net\\\\/\\.\\*\\\\/sdk\\\\/xfbml\\\\\\.customerchat\\\\\\.js/,
            ],
          },
        ],
        "totalExecutionTime": 2901178836,
        "totalOccurrences": 5647056,
      }
    `);
    });
    it('works for inferred domain usage', () => {
        expect(getEntity('https://unknown.typekit.net/fonts.css')).toMatchInlineSnapshot(`
      Object {
        "averageExecutionTime": 691.2697157512289,
        "categories": Array [
          "cdn",
        ],
        "category": "cdn",
        "company": "Adobe",
        "domains": Array [
          "*.typekit.com",
          "*.typekit.net",
        ],
        "examples": Array [
          "use.typekit.net",
          "p.typekit.net",
        ],
        "homepage": "https://fonts.adobe.com/",
        "name": "Adobe TypeKit",
        "products": Array [],
        "totalExecutionTime": 142315844,
        "totalOccurrences": 205876,
      }
    `);
    });
    it('does not over-infer', () => {
        expect(getEntity('https://unknown.gstatic.com/what')).toEqual(undefined);
    });
    it('only infers as a fallback', () => {
        expect(getEntity('http://fbcdn-photos-e-a.akamaihd.net/1234.jpg').name).toEqual('Facebook');
        expect(getEntity('http://unknown.akamaihd.net/1234.jpg').name).toEqual('Akamai');
    });
    it('runs on *massive* inputs', () => {
        const massiveInput = '123456789'.repeat(100e3);
        expect(getEntity(massiveInput)).toEqual(undefined);
    });
    it('runs on data URIs', () => {
        const dataUri = 'data:image/gif;base64,R0lGODlhAQABAIAAAP8AADAAACwAAAAAAQABAAACAkQBADs=';
        expect(getEntity(dataUri)).toEqual(undefined);
    });
    it('supports multi-tennant domains', () => {
        expect(getEntity('https://gemius.mgr.consensu.org/cmp/v2/stub.js').name).toEqual('Gemius CMP');
        expect(getEntity('https://quantcast.mgr.consensu.org/choice/KygWsHah2_7Qa/rssing.com/choice.js').name).toEqual('Quantcast Choice');
        expect(getEntity('https://static.quantcast.mgr.consensu.org/v50/cmpui-popup.js').name).toEqual('Quantcast Choice');
    });
});
describe('getProduct', () => {
    it('works on basic url', () => {
        expect(getProduct('https://www.youtube.com/embed/alGcULGtiv8')).toMatchObject({
            name: 'YouTube Embedded Player',
            company: 'YouTube',
            category: 'video',
            categories: ['video'],
            facades: [
                {
                    name: 'Lite YouTube',
                    repo: 'https://github.com/paulirish/lite-youtube-embed',
                },
                {
                    name: 'Ngx Lite Video',
                    repo: 'https://github.com/karim-mamdouh/ngx-lite-video',
                },
            ],
        });
    });
    it('works on regex based', () => {
        expect(getProduct('https://connect.facebook.net/en_US/sdk/xfbml.customerchat.js')).toMatchObject({
            name: 'Facebook Messenger Customer Chat',
            facades: [
                {
                    name: 'React Live Chat Loader',
                    repo: 'https://github.com/calibreapp/react-live-chat-loader',
                },
            ],
        });
    });
    it('returns undefined when product does not match', () => {
        expect(getProduct('https://js.connect.facebook.net/lib.js')).toEqual(undefined);
    });
    it('returns undefined with no products', () => {
        expect(getProduct('https://unknown.typekit.net/fonts.css')).toEqual(undefined);
    });
});
describe('build state', () => {
    it('should use the complete entities set', () => {
        const sourceOfTruthEntities = require('../data/entities.js');
        expect(entities).toHaveLength(sourceOfTruthEntities.length);
    });
    it('should have all the same subsets in root as lib', () => {
        const srcSizes = fs.readdirSync(path.join(__dirname, 'subsets'));
        const dstSizes = fs.readdirSync(path.join(__dirname, '../')).filter(f => f.includes('-subset'));
        expect(dstSizes).toHaveLength(srcSizes.length); // run `yarn build` if this fails
        for (const file of dstSizes) {
            if (file.endsWith('.js'))
                require(path.join(__dirname, '../', file));
        }
    });
});
it('should work on real web data', () => {
    const urls = fs
        .readFileSync(path.join(__dirname, '../data/random-urls.txt'), 'utf8')
        .split('\n')
        .filter(Boolean);
    for (const url of urls) {
        getEntity(url); // ensure it doesn't throw
    }
    const top1000 = urls.slice(0, 1000).map(url => {
        const cleanedUrl = url.split('?')[0];
        const entity = getEntity(url);
        return `${entity && entity.name} - ${cleanedUrl}`;
    });
    // It's expected that this snapshot will change as coverage changes.
    expect(top1000).toMatchSnapshot();
});
//# sourceMappingURL=index.test.js.map
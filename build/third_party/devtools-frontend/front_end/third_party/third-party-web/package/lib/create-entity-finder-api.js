"use strict";
const DOMAIN_IN_URL_REGEX = /:\/\/(\S*?)(:\d+)?(\/|$)/;
const DOMAIN_CHARACTERS = /(?:[a-z0-9.-]+\.[a-z0-9]+|localhost)/i;
const IP_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const ROOT_DOMAIN_REGEX = /[^.]+\.([^.]+|(gov|com|co|ne)\.\w{2})$/i;
/**
 * @param {string} originOrURL
 * @return {[string|null, string|null]} - The first item is the root domain, the second item is the domain.
 */
function parseDomains(originOrURL) {
    if (typeof originOrURL !== 'string')
        return [null, null];
    if (originOrURL.length > 10000 || originOrURL.startsWith('data:'))
        return [null, null];
    let m = originOrURL.match(DOMAIN_IN_URL_REGEX);
    let domain;
    if (m) {
        domain = m[1];
    }
    m = originOrURL.match(DOMAIN_CHARACTERS);
    if (m) {
        domain = m[0];
    }
    if (!domain)
        return [null, null];
    if (IP_REGEX.test(domain))
        return [domain, domain];
    m = domain.match(ROOT_DOMAIN_REGEX);
    const rootDomain = m && m[0] || domain;
    return [rootDomain, domain];
}
function getRootDomain(originOrURL) {
    return parseDomains(originOrURL)[0];
}
function sliceSubdomainFromDomain(domain, rootDomain) {
    if (domain.length <= rootDomain.length)
        return domain;
    return domain
        .split('.')
        .slice(1)
        .join('.');
}
function getEntityInDataset(entityByDomain, entityBySubDomain, entityByRootDomain, originOrURL) {
    const [rootDomain, domain] = parseDomains(originOrURL);
    if (!domain || !rootDomain)
        return undefined;
    if (entityByDomain.has(domain))
        return entityByDomain.get(domain);
    for (let subdomain = domain; subdomain.length > rootDomain.length; subdomain = sliceSubdomainFromDomain(subdomain, rootDomain)) {
        if (entityBySubDomain.has(subdomain))
            return entityBySubDomain.get(subdomain);
    }
    if (entityByRootDomain.has(rootDomain))
        return entityByRootDomain.get(rootDomain);
    return undefined;
}
function getProductInDataset(entityByDomain, entityBySubDomain, entityByRootDomain, originOrURL) {
    const entity = getEntityInDataset(entityByDomain, entityBySubDomain, entityByRootDomain, originOrURL);
    const products = entity && entity.products;
    if (!products)
        return undefined;
    if (typeof originOrURL !== 'string')
        return undefined;
    for (const product of products) {
        for (const pattern of product.urlPatterns) {
            if (pattern instanceof RegExp && pattern.test(originOrURL))
                return product;
            if (typeof pattern === 'string' && originOrURL.includes(pattern))
                return product;
        }
    }
    return undefined;
}
function cloneEntities(entities) {
    return entities.map(entity_ => {
        const entity = {
            company: entity_.name,
            categories: [entity_.category],
            ...entity_,
        };
        const products = (entity_.products || []).map(product => ({
            company: entity.company,
            category: entity.category,
            categories: [entity.category],
            facades: [],
            ...product,
            urlPatterns: (product.urlPatterns || []).map(s => s.startsWith('REGEXP:') ? new RegExp(s.slice('REGEXP:'.length)) : s),
        }));
        entity.products = products;
        return entity;
    });
}
function createAPIFromDataset(entities_) {
    const entities = cloneEntities(entities_);
    const entityByDomain = new Map();
    const entityByRootDomain = new Map();
    const entityBySubDomain = new Map();
    for (const entity of entities) {
        entity.totalExecutionTime = Number(entity.totalExecutionTime) || 0;
        entity.totalOccurrences = Number(entity.totalOccurrences) || 0;
        entity.averageExecutionTime = entity.totalExecutionTime / entity.totalOccurrences;
        for (const domain of entity.domains) {
            if (entityByDomain.has(domain)) {
                const duplicate = entityByDomain.get(domain);
                throw new Error(`Duplicate domain ${domain} (${entity.name} and ${duplicate.name})`);
            }
            entityByDomain.set(domain, entity);
            const rootDomain = getRootDomain(domain);
            if (domain.startsWith('*.')) {
                const wildcardDomain = domain.slice(2);
                if (wildcardDomain === rootDomain)
                    entityByRootDomain.set(rootDomain, entity);
                else
                    entityBySubDomain.set(wildcardDomain, entity);
            }
        }
    }
    for (const [rootDomain, entity] of entityByRootDomain.entries()) {
        if (!entity)
            entityByRootDomain.delete(rootDomain);
    }
    const getEntity = getEntityInDataset.bind(null, entityByDomain, entityBySubDomain, entityByRootDomain);
    const getProduct = getProductInDataset.bind(null, entityByDomain, entityBySubDomain, entityByRootDomain);
    return { getEntity, getProduct, getRootDomain, entities };
}
module.exports = { createAPIFromDataset };
//# sourceMappingURL=create-entity-finder-api.js.map
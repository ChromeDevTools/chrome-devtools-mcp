# Cookie Debugging Snippets

Use these JavaScript snippets with the `evaluate_script` tool.

## 1. Parse `document.cookie`

Parses all accessible cookies into a structured key-value JSON object.

```js
() => {
  if (!document.cookie) return {};
  return Object.fromEntries(
    document.cookie.split(';').map(c => {
      const idx = c.indexOf('=');
      const key = idx > -1 ? c.slice(0, idx).trim() : c.trim();
      const val = idx > -1 ? decodeURIComponent(c.slice(idx + 1).trim()) : '';
      return [key, val];
    }),
  );
};
```

## 2. Query Modern CookieStore API

Retrieves rich cookie metadata (name, value, domain, path, expires, sameSite, partitioned) using the asynchronous `cookieStore` API when available.

```js
async () => {
  if (typeof cookieStore !== 'undefined' && cookieStore.getAll) {
    const cookies = await cookieStore.getAll();
    return cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires ? new Date(c.expires).toISOString() : null,
      sameSite: c.sameSite,
      partitioned: c.partitioned,
    }));
  }
  // Fallback to document.cookie parsing
  return document.cookie
    .split(';')
    .filter(Boolean)
    .map(c => {
      const [name, ...rest] = c.trim().split('=');
      return {name, value: decodeURIComponent(rest.join('='))};
    });
};
```

## 3. Cookie Diff / Comparison Helper

Takes a baseline cookie map (obtained from snippet 1) and compares it against current cookies to report added, modified, and removed cookies. Useful for testing cookie banner actions (Decline vs Accept).

```js
(baselineCookies = {}) => {
  const currentCookies = Object.fromEntries(
    document.cookie
      ? document.cookie.split(';').map(c => {
          const idx = c.indexOf('=');
          const key = idx > -1 ? c.slice(0, idx).trim() : c.trim();
          const val =
            idx > -1 ? decodeURIComponent(c.slice(idx + 1).trim()) : '';
          return [key, val];
        })
      : [],
  );

  const added = {};
  const modified = {};
  const removed = {};

  for (const [k, v] of Object.entries(currentCookies)) {
    if (!(k in baselineCookies)) {
      added[k] = v;
    } else if (baselineCookies[k] !== v) {
      modified[k] = {before: baselineCookies[k], after: v};
    }
  }

  for (const [k, v] of Object.entries(baselineCookies)) {
    if (!(k in currentCookies)) {
      removed[k] = v;
    }
  }

  return {
    added,
    modified,
    removed,
    totalCurrent: Object.keys(currentCookies).length,
  };
};
```

## 4. Consent Storage & CMP Detector

Detects popular Consent Management Platforms (OneTrust, Cookiebot, Civic, Complianz, Klaro, Usercentrics) and inspects consent-related keys in `localStorage` and `sessionStorage`.

```js
() => {
  const detectedCMPs = [];
  if (window.OneTrust || window.Optanon)
    detectedCMPs.push('OneTrust / Optanon');
  if (window.Cookiebot) detectedCMPs.push('Cookiebot');
  if (window.CookieControl) detectedCMPs.push('Civic UK Cookie Control');
  if (window.complianz) detectedCMPs.push('Complianz');
  if (window.klaro) detectedCMPs.push('Klaro');
  if (window.UC_UI) detectedCMPs.push('Usercentrics');

  const consentStorageKeys = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (/consent|cookie|optanon|gdpr|ccpa/i.test(key)) {
      consentStorageKeys[key] = localStorage.getItem(key);
    }
  }

  return {
    detectedCMPs,
    consentStorageKeys,
    cookieCount: document.cookie ? document.cookie.split(';').length : 0,
  };
};
```

# Using the Network Panel to Discover Web Scraping Opportunities

The **Network** tools in Chrome DevTools MCP are often the best way to find *how* a site gets its data—and whether you should scrape the DOM or use the same API the page uses. This guide focuses on that discovery workflow.

---

## Why start with Network?

Many modern sites don’t put the data you want in the initial HTML. They:

- Load the shell (HTML/JS/CSS), then
- Call **XHR** or **fetch** APIs to get JSON (or other structured data) and render it in the DOM.

If you only look at the DOM, you’re scraping what the front end already fetched and rendered. If you **discover the underlying request** (URL, method, headers, query/payload), you can often:

- Get **structured data** (e.g. JSON) instead of parsing HTML.
- Reuse the **exact same API** the page uses (sometimes with pagination, filters, or search params).
- Reduce brittleness when the site changes its layout but not its API.

So the best first step for “how do I scrape this?” is often: **inspect Network, focus on XHR/fetch, then decide API vs DOM.**

---

## Discovery workflow (Network-first)

### 1. Load the page and trigger the data you care about

- **Navigate**: `navigate_page` (url = the page that shows the data).
- **Trigger**: If the data appears only after a click, search, or scroll, do that (e.g. `click` on “Load more”, type in search, open a tab). The goal is to make the page issue the requests that deliver the content you want.

### 2. List requests, focus on XHR and fetch

- Call **list_network_requests** with:
  - **resourceTypes: `['xhr', 'fetch']`**  
  This filters out documents, scripts, images, etc., and shows the API-style requests.
- Scan the list: each line is `reqid=<id> <method> <url> [status]`. Look for:
  - URLs that look like APIs (e.g. contain `api`, `graphql`, `search`, `list`, query params).
  - POST/GET to domains you care about.
  - Status `[success - 200]` (or 201, etc.) so the response is likely useful.

### 3. Inspect promising requests

- Pick a **reqid** from the list and call **get_network_request** with that `reqid`.
- Check:
  - **Request**: URL (full path + query string), method, headers (e.g. `Authorization`, `Content-Type`), request body (for POST/PUT). You’ll need these if you later call the API yourself (e.g. from a script).
  - **Response**: Response body. If it’s **JSON** (or another structured format) with the data you need, that’s a strong signal that **using the API** may be better than scraping the DOM.
- For large responses, use **responseFilePath** (and **requestFilePath** if needed) so the full body is written to a file instead of truncated in the tool output.

### 4. Decide: API vs DOM scraping

| If the response… | Prefer |
|------------------|--------|
| Is JSON (or structured) and contains the data you need | **API**: replay the request (same URL, method, headers, body). You can do that from your own code or, for exploration, via `evaluate_script` + `fetch()` in the page context. |
| Is HTML or the “data” is only in the rendered page | **DOM**: use `take_snapshot` + `evaluate_script` to extract from the document. |
| Is mixed (e.g. some data in API, some only in DOM) | Combine: use API where possible, DOM for the rest. |

### 5. Document what you found

- Note: **URL**, **method**, **important headers** (e.g. auth, content-type), **query params** or **body** that affect the result (e.g. page number, search term).
- If you see pagination (e.g. `?page=2` or `offset=20`), you’ve found a way to get more data without clicking “Next” in the UI.

---

## Network tools quick reference (for discovery)

| Goal | Tool / params |
|------|----------------|
| See only API-like requests | **list_network_requests** with `resourceTypes: ['xhr', 'fetch']` |
| See WebSocket connections | `resourceTypes: ['websocket']` |
| See everything (no filter) | **list_network_requests** without `resourceTypes` |
| Inspect one request (headers + body) | **get_network_request** with `reqid` from the list |
| Save large response to file | **get_network_request** with `reqid`, `responseFilePath: 'path/to/file.json'` (and optionally `requestFilePath` for the request body) |
| Requests from last few navigations | **list_network_requests** with `includePreservedRequests: true` |

---

## When to prefer API over DOM

- **Structured data**: The response is JSON/XML with clear fields (e.g. list of items, each with id, name, price). Easier to parse than HTML.
- **Pagination / filters**: The API accepts query params or body fields for page, limit, sort, search. One request per page instead of simulating clicks.
- **Less layout dependency**: Site redesigns often keep the same API; DOM selectors break when the markup changes.
- **Rate and volume**: You can throttle and retry at the HTTP level; no need to render the page for every batch.

## When to prefer DOM over API

- **No usable API**: The data is only in the HTML (server-rendered), or the API is heavily protected/undocumented.
- **Auth / cookies**: The data loads only when the user is logged in and the page sets cookies; replaying the request from outside the browser may require copying cookies or using the browser context (e.g. `evaluate_script` + `fetch()` in the page).
- **Anti-bot**: The site checks browser behavior; using the real page (navigate, click, snapshot) may be necessary.

---

## Summary

- **Best for discovering scraping opportunities**: Use **Network** first—**list_network_requests** with `resourceTypes: ['xhr', 'fetch']` to find API calls, then **get_network_request(reqid)** to inspect request/response.
- If the response is structured and has the data you need, **prefer using that API** (same URL, method, headers, body) instead of scraping the DOM.
- If not, or if you need to stay in the browser for auth/behavior, use the usual **DOM scraping** flow: navigate → wait → snapshot → `evaluate_script` (and optionally Network to verify what the page requested).

For full Network tool and formatter details, see [network-and-console-breakdown.md](./network-and-console-breakdown.md). For the general scraping workflow (DOM + script), see [SKILL.md](./SKILL.md).

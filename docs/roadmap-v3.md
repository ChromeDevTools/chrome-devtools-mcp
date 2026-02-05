# chrome-ai-bridge v3 Roadmap: Network-Native Architecture

> Source: Three-AI Discussion (Claude + ChatGPT + Gemini), 2026-02-05

---

## Current Constraints Analysis

### DOM Selector Dependency (Primary Pain Point)
- ChatGPT/Gemini frequently change their DOM structure
- Selectors like `[data-message-author-role="assistant"]`, `.markdown`, `article` break without notice
- Response extraction requires complex fallback chains (10+ selectors per site)
- Thinking mode, streaming animation, Shadow DOM all add complexity

### Polling-Based Architecture
- Response completion detection via 1s interval polling
- CPU waste during long responses (up to 8 minutes)
- No streaming capability - must wait for full response before returning

### Background Tab Limitations
- `innerText` returns empty in background tabs
- Requires `Page.bringToFront` + scroll workarounds
- Race conditions between React rendering and text extraction

---

## Consensus: Network Layer is the Path Forward

**All three AIs agreed**: DOM selectors are a dead end for reliability. Network-layer interception (CDP Network domain) captures the raw response data before it hits the DOM, eliminating selector fragility.

### Why Network > DOM
| Factor | DOM Approach | Network Approach |
|--------|-------------|-----------------|
| Selector breakage | High risk every UI update | Zero - protocol changes rarely |
| Streaming | Impossible (poll after completion) | Native (token-by-token) |
| Background tabs | Broken (empty innerText) | Works (network layer is tab-agnostic) |
| Thinking mode | Complex detection logic | Clean separation in protocol |
| Performance | CPU polling waste | Event-driven, zero waste |

---

## Three-Phase Roadmap

### Phase 1: Hybrid Stream PoC (Current)
**Goal**: Prove network interception works alongside existing DOM extraction.

- Add `CdpClient.on()`/`.off()` for CDP event subscription
- Enable `Network.enable` on tab attach
- Create `NetworkInterceptor` class for capture lifecycle
- Observe raw WebSocket/SSE data from ChatGPT/Gemini
- Implement parsers based on actual protocol format
- Integrate as parallel path: network preferred, DOM as fallback

**Success Criteria**: Network extraction matches DOM extraction 90%+ of the time.

### Phase 1.5: Streaming Token Delivery
**Goal**: Deliver tokens as they arrive instead of waiting for completion.

- MCP SDK streaming support (if available) or chunked response
- Token-level callbacks from NetworkInterceptor
- Progress reporting during long responses
- Eliminate polling entirely for response completion detection

### Phase 2: Adaptive Selectors (Parallel Track)
**Goal**: Make remaining DOM operations self-healing.

- Use AI to detect input fields and send buttons dynamically
- Fingerprint-based element matching (position, role, structure)
- Automatic selector regeneration when patterns break
- Reduce hard-coded selectors to zero

### Phase 3: Multi-Provider Fabric
**Goal**: Pluggable architecture for any web AI.

- Provider interface: `connect()`, `send()`, `onToken()`, `onComplete()`
- Site-specific drivers implement the interface
- Add new AI providers without core changes
- Community-contributed drivers

---

## Notable Proposals from Discussion

### 1. Token-Level AI Diff (ChatGPT)
Compare network-captured tokens vs DOM-extracted text in real-time to detect extraction errors. Can be used for automated quality monitoring.

### 2. Self-Healing Governor (Gemini)
A meta-layer that monitors extraction success rate and automatically switches between network/DOM/hybrid strategies based on real-time reliability metrics.

### 3. Browser-Resident LLM Transport Layer (Claude)
Instead of intercepting at the network level, inject a service worker that sits between the page and the API. Full control over request/response lifecycle without CDP.

---

## Discussion Meta-Evaluation

| Aspect | Claude | ChatGPT | Gemini |
|--------|--------|---------|--------|
| Primary Strength | Architecture design | Creative solutions | Risk analysis |
| Key Contribution | Hybrid fallback pattern | Token-level diff idea | Self-healing governor |
| Practical Focus | High (implementation-ready) | Medium (needs refinement) | High (production concerns) |

**Consensus Quality**: Strong - all three converged on network interception as Phase 1, disagreed only on Phase 2+ priorities.

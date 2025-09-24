# Changelog

## [0.2.4](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.2.3...chrome-devtools-mcp-v0.2.4) (2025-09-24)


### Bug Fixes

* forbid closing the last page ([#90](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/90)) ([0ca2434](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0ca2434a29eb4bc6e570a4ebe21a135d85f4c0f3))

## [0.2.3](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.2.2...chrome-devtools-mcp-v0.2.3) (2025-09-24)


### Bug Fixes

* add a message indicating that no console messages exist ([#91](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/91)) ([1a4ba4d](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/1a4ba4d3e05f51a85747816f8638f31230881437))
* clean up pending promises on action errors ([#84](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/84)) ([4e7001a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/4e7001ac375ec51f55b29e9faf68aff0dd09fa0f))

## [0.2.2](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.2.1...chrome-devtools-mcp-v0.2.2) (2025-09-23)


### Bug Fixes

* cli version being reported as unknown ([#74](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/74)) ([d6bab91](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d6bab912df55dc2e96a8d7893d1906f1fc608d0a))
* remove unnecessary waiting for navigation ([#83](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/83)) ([924c042](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/924c042492222a555074063841ce765342e3b5b9))
* rework performance parsing & error handling ([#75](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/75)) ([e8fb30c](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/e8fb30c1bfdc2b4ea8c2daf74b24aa82210f99be))

## [0.2.1](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.2.0...chrome-devtools-mcp-v0.2.1) (2025-09-23)


### Bug Fixes

* add 'on the selected page' to performance tools ([#69](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/69)) ([b877f7a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b877f7a3053d0cdf2aad1fefc26cf7b913eb95ce))
* **emulation:** correctly report info for selected page ([#63](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/63)) ([1e8662f](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/1e8662f06860aecb5c01ed4ff1515ceb9dac26e4))
* expose timeout when Emulation is enabled ([#73](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/73)) ([0208bfd](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0208bfdcf6924953879408c18f4c20da544bf4ff))
* fix browserUrl not working ([#53](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/53)) ([a6923b8](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a6923b8d9397d12ee0f9fe67dd62b10088ec6e87))
* increase timeouts in case of Emulation ([#71](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/71)) ([c509c64](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/c509c64576e1be1ddc283653004ef08a117907a2))
* **windows:** work around Chrome not reporting reasons for crash ([#64](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/64)) ([d545741](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d5457412a4a76726547190fb3a46bb78c9d6645c))

## [0.2.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.1.0...chrome-devtools-mcp-v0.2.0) (2025-09-17)


### Features

* add performance_analyze_insight tool. ([#42](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/42)) ([21e175b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/21e175b862c624d7a2d07802141187edf2d2e489))
* support script evaluate arguments ([#40](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/40)) ([c663f4d](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/c663f4d7f9c0b868e8b4750f6441525939bfe920))
* use Performance Trace Formatter in trace output ([#36](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/36)) ([0cb6147](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0cb6147b870e17bc3a624e9c6396d963a3e16b44))
* validate uids ([#37](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/37)) ([014a8bc](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/014a8bc52ecc58080cedeb8023d44f4a55055a05))


### Bug Fixes

* change profile folder name to browser-profile ([#39](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/39)) ([36115d7](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/36115d757abbae0502ffee814f55368d2ca59b9e))
* refresh context based on the browser instance ([#44](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/44)) ([93f4579](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/93f4579dd9aca3beef2bd9f2930ddfcc4069c0e3))
* update puppeteer to fix a11y snapshot issues ([#43](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/43)) ([b58f787](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b58f787234a34d5fcb01b336f5fb14e1c55ecdd5))

## [0.1.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.0.2...chrome-devtools-mcp-v0.1.0) (2025-09-16)


### Features

* improve tools with awaiting common events ([#10](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/10)) ([dba8b3c](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/dba8b3c5fad0d1bca26aaf172751c51188799927))
* initial version ([31a0bdc](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/31a0bdce266a33eaca9a7daae4611abb78ff5a25))


### Bug Fixes

* define tracing categories ([#21](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/21)) ([c939456](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/c93945657cc96ac7ba213730a750c16e9ab87526))
* detect multiple instances and throw ([#12](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/12)) ([732267d](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/732267db5fea0048ed1fcc530bcdd074df4126be))
* make sure tool calls are processed sequentially ([#22](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/22)) ([a76b23d](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a76b23dccf074a13304b0341178665465a2c3399))

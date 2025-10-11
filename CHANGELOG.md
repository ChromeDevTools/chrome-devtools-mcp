# Changelog

## [0.8.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.7.1...chrome-devtools-mcp-v0.8.0) (2025-10-10)


### Features

* support passing args to Chrome ([#338](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/338)) ([e1b5363](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/e1b536365363e1e1a3aa7661dd84290c794510ad))

## [0.7.1](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.7.0...chrome-devtools-mcp-v0.7.1) (2025-10-10)


### Bug Fixes

* document that console and requests are since the last nav ([#335](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/335)) ([9ad7cbb](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/9ad7cbb2de3d285e46e5f3e7c098b0a7535c7e7a))

## [0.7.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.6.1...chrome-devtools-mcp-v0.7.0) (2025-10-10)


### Features

* Add offline network emulation support to emulate_network command ([#326](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/326)) ([139ce60](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/139ce607814bf25ba541a7264ce96a04b2fac871))
* add request and response body ([#267](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/267)) ([dd3c143](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/dd3c14336ee44d057d06231a5bfd5c5bcf661029))


### Bug Fixes

* ordering of information in performance trace summary ([#334](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/334)) ([2d4484a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/2d4484a123968754b4840d112b9c1ca59fb29997))
* publishing to MCP registry ([#313](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/313)) ([1faec78](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/1faec78f84569a03f63585fb84df35992bcfe81a))
* use default ProtocolTimeout ([#315](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/315)) ([a525f19](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a525f199458afb266db4540bf0fa8007323f3301))

## [0.6.1](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.6.0...chrome-devtools-mcp-v0.6.1) (2025-10-07)


### Bug Fixes

* change default screen size in headless ([#299](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/299)) ([357db65](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/357db65d18f87b1299a0f6212b7ec982ef187171))
* **cli:** tolerate empty browser URLs ([#298](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/298)) ([098a904](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/098a904b363f3ad81595ed58c25d34dd7d82bcd8))
* guard performance_stop_trace when tracing inactive ([#295](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/295)) ([8200194](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/8200194c8037cc30b8ab815e5ee0d0b2b000bea6))

## [0.6.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.5.1...chrome-devtools-mcp-v0.6.0) (2025-10-01)


### Features

* **screenshot:** add WebP format support with quality parameter ([#220](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/220)) ([03e02a2](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/03e02a2d769fbfc0c98599444dfed5413d15ae6e))
* **screenshot:** adds ability to output screenshot to a specific pat… ([#172](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/172)) ([f030726](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/f03072698ddda8587ce23229d733405f88b7c89e))
* support --accept-insecure-certs CLI ([#231](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/231)) ([efb106d](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/efb106dc94af0057f88c89f810beb65114eeaa4b))
* support --proxy-server CLI ([#230](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/230)) ([dfacc75](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/dfacc75ee9f46137b5194e35fc604b89a00ff53f))
* support initial viewport in the CLI ([#229](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/229)) ([ef61a08](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/ef61a08707056c5078d268a83a2c95d10e224f31))
* support timeouts in wait_for and navigations ([#228](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/228)) ([36e64d5](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/36e64d5ae21e8bb244a18201a23a16932947e938))


### Bug Fixes

* **network:** show only selected request ([#236](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/236)) ([73f0aec](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/73f0aecd8a48b9d1ee354897fe14d785c80e863e))
* PageCollector subscribing multiple times ([#241](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/241)) ([0412878](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0412878bf51ae46e48a171183bb38cfbbee1038a))
* snapshot does not capture Iframe content ([#217](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/217)) ([ce356f2](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/ce356f256545e805db74664797de5f42e7b92bed)), closes [#186](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/186)

## [0.5.1](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.5.0...chrome-devtools-mcp-v0.5.1) (2025-09-29)


### Bug Fixes

* update package.json engines to reflect node20 support ([#210](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/210)) ([b31e647](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b31e64713e0524f28cbf760fad27b25829ec419d))

## [0.5.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.4.0...chrome-devtools-mcp-v0.5.0) (2025-09-29)


### Features

* **screenshot:** add JPEG quality parameter support ([#184](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/184)) ([139cfd1](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/139cfd135cdb07573fe87d824631fcdb6153186e))


### Bug Fixes

* do not error if the dialog was already handled ([#208](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/208)) ([d9f77f8](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d9f77f85098ffe851308c5de05effb03ac21237b))
* reference to handle_dialog tool ([#209](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/209)) ([205eef5](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/205eef5cdff19ccb7ddbd113bb1450cb87e8f398))
* support node20 ([#52](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/52)) ([13613b4](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/13613b4a33ab7cf2d4fb1f4849bfa6b82f546945))
* update tool reference in an error ([#205](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/205)) ([7765bb3](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/7765bb381ad9d01219547faf879a74978188754a))

## [0.4.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.3.0...chrome-devtools-mcp-v0.4.0) (2025-09-26)


### Features

* add network request filtering by resource type ([#162](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/162)) ([59d81a3](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/59d81a33258a199a3f993c9e02a415f62ef05ce4))


### Bug Fixes

* add core web vitals to performance_start_trace description ([#168](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/168)) ([6cfc977](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6cfc9774f4ec7944c70842999506b2bc2018a667))
* add data format information to trace summary ([#166](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/166)) ([869dd42](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/869dd4273e42309c1bb57d44e0e5a6a9506ffad7))
* expose --debug-file argument ([#164](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/164)) ([22ec7ee](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/22ec7ee45cc04892000cf6dc32f3fe58d33855c1))
* typo in the disclaimers ([#156](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/156)) ([90f686e](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/90f686e5df3d880c35ec566c837ee5a98824be28))

## [0.3.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.2.7...chrome-devtools-mcp-v0.3.0) (2025-09-25)


### Features

* Add pagination list_network_requests ([#145](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/145)) ([4c909bb](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/4c909bb8d7c4a420cb8e3219ec98abf28f5cc664))


### Bug Fixes

* avoid reporting page close errors as errors ([#127](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/127)) ([44cfc8f](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/44cfc8f945edf9370efe26247f322a59a4a4a7be))
* clarify the node version message ([#135](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/135)) ([0cc907a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0cc907a9ad79289a6785e9690c3c6940f0a5de52))
* do not set channel if executablePath is provided ([#150](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/150)) ([03b59f0](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/03b59f0bca024173ad45d7a617994e919d9cbbad))
* **performance:** ImageDelivery insight errors ([#144](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/144)) ([d64ba0d](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d64ba0d9027540eb707381e2577ae3c1fe014346))
* roll latest DevTools to handle Insight errors ([#149](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/149)) ([b2e1e39](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b2e1e3944c7fa170584ce36c7b8923b0e6d6c6cb))

## [0.2.7](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.2.6...chrome-devtools-mcp-v0.2.7) (2025-09-24)


### Bug Fixes

* validate and report incompatible Node versions ([#113](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/113)) ([adfcecf](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/adfcecf9871938b1ad5d1460e0050b849fb2aa49))

## [0.2.6](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.2.5...chrome-devtools-mcp-v0.2.6) (2025-09-24)


### Bug Fixes

* manually bump server.json versions based on package.json ([#105](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/105)) ([cae1cf1](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/cae1cf13d5a97add3b96f20c425f720a1ceabf94))

## [0.2.5](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.2.4...chrome-devtools-mcp-v0.2.5) (2025-09-24)


### Bug Fixes

* add mcpName to package.json ([#103](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/103)) ([bd0351f](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/bd0351fd36ae35e41e613f0d15df40aeca17ba94))

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

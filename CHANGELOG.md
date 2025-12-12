# Changelog

## [0.12.1](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.12.0...chrome-devtools-mcp-v0.12.1) (2025-12-12)


### 🛠️ Fixes

* catch unexpected error in event handlers ([#672](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/672)) ([ca0f560](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/ca0f5607f18bf04134e85ea1f61d1a839a47827b))
* log unhandledRejection instead of crashing ([#673](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/673)) ([f59b4a2](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/f59b4a2ed8b09e1d64916552ee6db49b978fe9a7))
* make bringToFront optional in select_page ([#668](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/668)) ([ceae17b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/ceae17be26b0a812f1b013dcebaed9beb510e7b3))
* Update installation badges in README.md for VS Code ([#660](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/660)) ([61ede1c](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/61ede1c0531ea8b028d9a5cbb28fcdc00cc521e0))


### 📄 Documentation

* Add debug instructions ([#670](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/670)) ([a8aae66](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a8aae6652e205b87ac2efa29217b7cbd18dcbbe6))
* explain new auto connection feature ([#664](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/664)) ([a537a8c](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a537a8c8cef4f2a3493e9f7de47345d565b6fc9f))

## [0.12.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.11.0...chrome-devtools-mcp-v0.12.0) (2025-12-09)


### 🎉 Features

* support --auto-connect to a Chrome instance ([#651](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/651)) ([6ab6d85](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6ab6d85d50226cf12a62563430f552e783f428b2))
* support --user-data-dir with --auto-connect ([#654](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/654)) ([e3c59bc](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/e3c59bcd9c284f3be99cc15e22116b887f04cdab))


### 🛠️ Fixes

* map channel for resolveDefaultUserDataDir ([#658](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/658)) ([6f59b39](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6f59b3975abda50536f8b890f3245662b22e3657))


### 📄 Documentation

* Add AX design principles ([#643](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/643)) ([90ed192](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/90ed192c558d36faf9f6300be1c1fd5abd464d8a))
* improve autoConnect docs ([#653](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/653)) ([09111cc](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/09111cc16464bed27cd623f3b345d3885db12521))

## [0.11.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.10.2...chrome-devtools-mcp-v0.11.0) (2025-12-03)


### 🎉 Features

* **emulation:** add geolocation emulation tool ([#634](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/634)) ([3991e4c](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/3991e4c2a9c28bf8180f9057ce804d978c39529d))
* integrate DevTools issues into the console tools ([#636](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/636)) ([d892145](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d8921453c77a1c0815059fb9bc72c0cd769a7bd4))
* support --user-data-dir ([#622](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/622)) ([fcaf553](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/fcaf55354c2afbdbae538e27eb4b6d02f2e87985))


### 🛠️ Fixes

* handle error messages that are not instanceof Error ([#618](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/618)) ([a67528a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a67528a046746c7131d5265f6c94613d607aaf90))
* handle the case when all pages are filtered out ([#616](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/616)) ([bff5c65](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/bff5c6569003fdbc207448d89a8be6a9a8172ca0))
* ignore hash parts of URLs when finding DevTools ([#608](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/608)) ([52533d0](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/52533d0c695354b816807de253f0ec17099aa9d7))
* ignore quality for png ([#589](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/589)) ([2eaf268](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/2eaf2689c3360f88479f4cdab8ddde5899378e33))
* include a note about selected elements missing from the snapshot ([#593](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/593)) ([80e77fd](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/80e77fd9a35a3dc5c451cc5b070b8baa574c686c))
* prevent dropping license notices on some files when publishing ([#604](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/604)) ([94752ff](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/94752ffade847671ebfd15e4013a5b5cdf8377df))
* rename page content to latest page snapshot ([#579](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/579)) ([9cb99ad](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/9cb99ad3e65054f4ea12a39358719f6630a020d0))
* **wait_for:** respect the provided timeout ([#630](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/630)) ([6b0984a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6b0984aa7dca6f651afd1fed56246893810781c9)), closes [#624](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/624)


### 📄 Documentation

* add Antigravity config ([#580](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/580)) ([6f9182f](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6f9182f4b60f1f6ff8d321fec35545712828686e))
* add Qoder CLI to the MCP client configuration section in the README. ([#552](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/552)) ([1a16f15](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/1a16f15546e227a0708f89d3084c98d4916db53f))
* add VS Code install badges ([#532](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/532)) ([cc4d065](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/cc4d065dd6081a2a9fbcc3d8ebb1536e5426116e))
* clarify browser-url parameter in README ([#613](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/613)) ([05cf8cb](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/05cf8cb8a6c68506282075bc1522c81f0b84f07b))
* Fix Antigravity docs ([#605](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/605)) ([fae2608](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/fae260888748ece77b368a13ee913153caffcef7))
* update readme to explain agy's browser integration ([#612](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/612)) ([2d89865](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/2d89865ddbff6e77332c6157f687dcc2f0bef892))


### ♻️ Chores

* avoid throwing in resolveCdpElementId ([#606](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/606)) ([eb261fd](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/eb261fd48b6753db246d24b77e1f477dc7a9455e))

## [0.10.2](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.10.1...chrome-devtools-mcp-v0.10.2) (2025-11-19)


### 📄 Documentation

* add Factory CLI configuration to MCP clients ([#523](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/523)) ([016e2fd](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/016e2fd6ee57447103f7385285dd503b5576a860))


### ♻️ Chores

* clear issue aggregator on page navigation ([#565](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/565)) ([c3784d1](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/c3784d1990a926f651951e4eef05520c5c448964))
* disable issues in list_console_messages for now ([#575](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/575)) ([08e9a9f](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/08e9a9f42e6ff1a92c60b3e958b0817c7b785afc))
* simplify issue management ([#564](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/564)) ([3b016f1](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/3b016f1a814b1a69750813548b3f35e79bfb6fef))

## [0.10.1](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.10.0...chrome-devtools-mcp-v0.10.1) (2025-11-07)


### 🛠️ Fixes

* avoid no page selected errors ([#537](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/537)) ([4724bbb](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/4724bbba9327fc162cd1f0372e608f6ebefc59cc))

## [0.10.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.9.0...chrome-devtools-mcp-v0.10.0) (2025-11-05)


### 🎉 Features

* add a press_key tool ([#458](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/458)) ([b427392](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b4273923928704e718e0a0f8b5cc86758416e994))
* add insightSetId to performance_analyze_insight ([#518](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/518)) ([36504d2](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/36504d29caf637b2d7bf231204c0478b54220c83))
* an option to ignore cache on reload ([#485](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/485)) ([8e56307](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/8e56307d623fe3651262287b30544ed70426b0b8))
* detect network requests inspected in DevTools UI ([#477](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/477)) ([796aed7](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/796aed72b7126ed4332888ffbc06d6cb678265ef))
* fetch DOM node selected in the DevTools Elements panel ([#486](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/486)) ([4a83574](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/4a83574961d8d6b974037db56fc8bdbbb91f79b6))
* support page reload ([#462](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/462)) ([d177087](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d17708798194486b2571092aa67838085da7231e))
* support saving snapshots to file ([#463](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/463)) ([b0ce08a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b0ce08ae2ce422813fef3f28c18f2cb6c976d9fc))


### 🛠️ Fixes

* Augment fix to prevent stray OGS frames in NTP from causing hangs. ([#521](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/521)) ([d90abd4](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d90abd4e9e534417622d7f4676e9c3dbeb39ea8d))
* improve get_network_request description ([#500](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/500)) ([2f448e8](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/2f448e84ea8d3a44687c74b3577edf882ef2c19f))
* work around NTP iframes causing hangs ([#504](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/504)) ([cca5ff4](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/cca5ff471c2d2c663e63ade1e2ea58f9a7f5a2cd))


### 📄 Documentation

* add Windsurf to the editor config README ([#493](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/493)) ([63a5d82](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/63a5d824c2d914c9007e2b837fa292f5ba74ceed))
* fix typos in README.md exlcude -&gt; exclude ([#513](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/513)) ([8854a34](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/8854a3400c3a6b84c761bf8ed82769fc2dec7366))
* remove unnecessary replace ([#475](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/475)) ([40e1753](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/40e1753d2e874bb22005dbebdb551da304a80033))


### ♻️ Chores

* connect to DevTools targets by default ([#466](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/466)) ([a41e440](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a41e4407996b8090f8cccc85f6c4696006fc31ec))
* detect DevTools page for each page ([#467](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/467)) ([1560ff2](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/1560ff23cad28ab63c1cf9fb1b961db886bc4a3e))
* merge emulate tools into one ([#494](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/494)) ([c06f452](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/c06f4522ee8f762b59c60c2fd23a0deaaa544766))

## [0.9.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.8.1...chrome-devtools-mcp-v0.9.0) (2025-10-22)


### 🎉 Features

* add claude marketplace and plugin json ([#396](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/396)) ([0498611](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0498611429f769c6ccae365674003d2bd538c292))
* add filters and pagination to the console messages tool ([#387](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/387)) ([15d942c](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/15d942c4f3335b35f1cba8e8634651688323663d))
* add WebSocket endpoint and custom headers support ([#404](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/404)) ([41d6a10](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/41d6a107baee0d14a1c14573f958d44198de23aa))
* allow configuring tool categories ([#454](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/454)) ([0fe2b8a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0fe2b8a2b4d64b9da5f7d1adccc5425fd7cbec34))
* expose previous navigations to the MCP ([#419](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/419)) ([165cf9c](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/165cf9c70b7f91dc116558547a870281f29da710))
* support previous navigation for Console messages ([#452](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/452)) ([6f24362](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6f243620391f0c608f51d464257cf3222d653e9e))
* support stable id for network requests ([#375](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/375)) ([f4d7b49](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/f4d7b49bb112b4336bef0d90059485f41f71e4f1))
* support verbose snapshots ([#388](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/388)) ([d47aaa9](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d47aaa96ff990c49dd07a481ea1924f85881eafa))
* tool to get a verbose single console message ([#435](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/435)) ([9205593](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/92055933dc44e5d200dda2ee4ae0e365b24281bb))
* use stable id for network request querying ([#382](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/382)) ([579819b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/579819b5e76f7a34c7c5c0877ac1e5e284beb328))


### 🛠️ Fixes

* allow evaluating in Frames ([#443](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/443)) ([053f1f8](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/053f1f830d051ec415f4b00e645f5a1aff8554a1))
* better wording for evaluate_script ([#392](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/392)) ([2313fda](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/2313fdacad72a1bc5c4d8f1cbdd80fd64ba91771))
* indicate when request and response bodies are not available ([#446](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/446)) ([7d47d6b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/7d47d6b2f40bf08def29de3ca37b1a4a28ce6777))
* pageerror for non-error types ([#442](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/442)) ([b6b42ec](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b6b42ecb998dd4f8fbf4a8e7a49f461333a41103))
* retrieve data correctly with fewer than 3 navigations ([#451](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/451)) ([4c65f59](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/4c65f59cf9f62662cf903fbbd19b67a8828d674a))


### 📄 Documentation

* add instructions for Qoder ([#386](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/386)) ([d8df784](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d8df784127afd590eb02e0060378465ae115a7a4))
* add VM-to-host remote debugging workaround ([#399](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/399)) ([9f9dab0](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/9f9dab0787f19c5730b65daf148c382fb2d9e365))
* Update Copilot CLI instructions ([#423](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/423)) ([c7733a8](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/c7733a818050e50830c9a8e3d62bb80892cf9121))


### ♻️ Chores

* bundle all dependencies together ([#450](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/450)) ([914b980](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/914b980113353fd41b301da397aa45975090487a))
* bundle modelcontextprotocol-sdk ([#409](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/409)) ([6c8432b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6c8432b6b69d5d56d0dee01968882492033f2dc1))
* bundle puppeteer-core ([#417](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/417)) ([b443033](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b443033000e46a992ea7fa071af0f9ec304b9ea7))
* bundle zod together with modelcontextprotocol/sdk ([#414](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/414)) ([800e7e8](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/800e7e836433f3f1b2bfafa12ed35a991404d270))
* cleanup data fetching ([#441](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/441)) ([5c871c3](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/5c871c3bd98127996011f269faddd8d8e7163917))
* dispose listeners on page destroyed ([#318](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/318)) ([76d5e94](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/76d5e9416d833299561242ac45c0ce7813e61dbe))
* extract common paginate type ([#415](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/415)) ([29fd602](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/29fd60216ca1394c46a266c6f853f8d65418e861))
* store the last 3 navigations in PageCollector ([#411](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/411)) ([b873822](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b8738221d8cf8322d5f968ee829f03dc83238a05))
* use different format for reqid ([#380](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/380)) ([78bf66a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/78bf66a7b1eefc93768f39d6d38fd141104fe812))

## [0.8.1](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.8.0...chrome-devtools-mcp-v0.8.1) (2025-10-13)


### Bug Fixes

* add an option value to the snapshot ([#362](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/362)) ([207137e](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/207137edd6d8af2f49277d88a30d8afa51671631))
* improve navigate_page_history error messages ([#321](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/321)) ([0624029](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0624029e0f8735345d202d29dde446b8869d9561))
* return the default dialog value correctly ([#366](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/366)) ([f08f808](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/f08f8080d0be1074a48e5c2ab0a6533f01f65928))
* update puppeteer to 24.24.1 ([#370](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/370)) ([477eef4](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/477eef481a2e6241121ee4aaaed34e8342a8b347))

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

# Changelog

## [1.5.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v1.4.0...chrome-devtools-mcp-v1.5.0) (2026-07-03)


### 🎉 Features

* Add get_heapsnapshot_duplicate_strings MCP tool ([#2280](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2280)) ([67a56c0](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/67a56c0557729dc437e470ea934d7322faba56b0))
* Add MCP tools for heap snapshot comparison ([#2198](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2198)) ([5d7b656](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/5d7b6560504009cd1a16cc02db7e985cf7f71274))


### 🛠️ Fixes

* **cli:** improve error messages to guide AI agents and developers ([#2161](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2161)) ([cf00305](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/cf003051706619ca084235020f62a4d6902fb226))
* create PID directory with secure permissions (0o700) ([#2262](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2262)) ([7fa95d3](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/7fa95d3c33aa3e37374b0e39a6c00de322655554))
* respecte allow/block list in loadResouce ([#2254](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2254)) ([6a94663](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6a9466378c13b6ccba91b54091ea83a5ca37a8db))
* validate extension-enforced output paths ([#2269](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2269)) ([a922814](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a9228141ae2c51bf831ce0cac659e119cf0f4ae6))


### 📄 Documentation

* fix Antigravity config -y flag before npx positional args ([#2272](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2272)) ([604b38f](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/604b38f31951b291eb368dfe61f2d3714ccae778))
* fix formatting and indentation of tool descriptions ([#2275](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2275)) ([8d8cf12](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/8d8cf1299db9d9f371c1f278ccc3e598df22c615))


### ⚡ Performance

* use concurrent reads for `loadIssueDescriptions` ([#2249](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2249)) ([d144965](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d1449654ac10031786e9d4741e781af26933907a))


### 🏗️ Refactor

* Merge MCP tools for comparing heap snapshots ([#2281](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2281)) ([3f4a49a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/3f4a49a89a2dd33dc6fa728aa34bc26f0aa00905))

## [1.4.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v1.3.0...chrome-devtools-mcp-v1.4.0) (2026-06-23)


### 🎉 Features

* publish the skills folder  ([#2229](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2229)) ([5367f7e](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/5367f7e97c1a4f506d8d1e3e8e773c72f1c0a03a))


### 🛠️ Fixes

* hide Windows update check consoles ([#2231](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2231)) ([6225ffb](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6225ffbaf1ceb2d9d0f8b2f3b7380aa8a710b857))
* **network:** keep redirect chain order consistent between text and JSON ([#2221](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2221)) ([5a9d6af](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/5a9d6af743109e3bb9703cf0c9a46f9cb2a97480))


### 📄 Documentation

* fix showing defaults in configuration ([#2234](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2234)) ([38dd346](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/38dd346805416c8bff2196e73c1410ca78d6f397))
* **readme:** explicitly call out that CD4A can power your browser agent ([#2227](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2227)) ([705d0e1](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/705d0e11812b8c1c2506d0ac372a97671298df11))
* update security.md ([#2248](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2248)) ([e559765](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/e55976574030dd2cde45b58d57555f5d433f50e0))

## [1.3.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v1.2.0...chrome-devtools-mcp-v1.3.0) (2026-06-18)


### 🎉 Features

* Add get_heapsnapshot_dominators MCP tool ([#2215](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2215)) ([08c234e](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/08c234ea4b14b0ba0906deeca396873614a8c063))
* Add retaining paths MCP tool ([#2187](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2187)) ([a97c642](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a97c642d43d19fc5198038a7544ff41528ddc316))
* Add the get_heapsnapshot_edges MCP tool ([#2180](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2180)) ([4f8eb7a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/4f8eb7ad6beecc58f56ec383f9ff43549a5604d4))
* include page title in list_pages output ([#2166](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2166)) ([b646feb](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b646feb4f33743a5ecdc6c5e3744e98f86374af3))
* **screenshot:** add CLI options to cap screenshot size at the source ([#1823](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1823)) ([55c8a54](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/55c8a541d4f842056db6bc843e54117b07bf06c1))
* Use HeapSnapshotProxy.nodeIndexById ([#2193](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2193)) ([6bd8c91](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6bd8c91678035b5aa18ee40f72e1f630aa528837))


### 🛠️ Fixes

* handle missing third-party tool toolGroup description gracefully ([#2224](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2224)) ([8fe398e](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/8fe398eb5d6ee87edb51d4e37570d04b02679346))
* handle screencast file extensions case-insensitively and clean up temp dir on failure ([#2207](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2207)) ([ba80096](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/ba80096521da437a834953f697c4c98bcbd6e658))
* limit windows test concurrency ([#2205](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2205)) ([e77101e](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/e77101e5dc53f9f9541eb91916eedb53495544cc))
* Reset toolGroups before gathering toolGroups ([#2200](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2200)) ([ed02047](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/ed02047ae90f25c4c15adb8fd7e224b963f43135))
* return error message when screencast_stop is called with no active recording ([#2209](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2209)) ([9e32002](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/9e32002a6947ff695e463a5fefa99a7f66f19403))

## [1.2.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v1.1.1...chrome-devtools-mcp-v1.2.0) (2026-06-08)


### 🎉 Features

* add experimental TOON support for structured content output ([#2042](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2042)) ([aa33bff](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/aa33bff19fcbf87949eec152c4b49d74e0a9330d))
* Adds close_heapsnapshot MCP tool ([#2174](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2174)) ([8713b93](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/8713b93b41ce301acf0ebc555c9a1b25d29bc526))
* Handle multiple providers of third-party developer tools ([#2168](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2168)) ([30d59a7](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/30d59a78727c31ec9d70d2bd6d9310e78f1888b3))
* implement extension service worker logs ([#1915](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1915)) ([29e3898](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/29e389848fd0cae1116620d44fbce508b4404137))
* memory debugging tools ([#2169](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2169)) ([0217397](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/02173972574241049885171c5a6fc0ba998a20cc))
* support allowedUrlPattern & blockedUrlPattern Options ([#2037](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2037)) ([02b4492](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/02b4492ca605755f67f016ee1de98aa1f506168c))


### 🛠️ Fixes

* Cursor plugin homepage setting field ([#2173](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2173)) ([8971890](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/89718901174be7c0c58a1a2b29281ab2f053cd53))


### 📄 Documentation

* **skill:** guide agent to prompt for --categoryExtensions  ([#2189](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2189)) ([8b458f7](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/8b458f7ad194b52305b831d5bfd6c0b6f5a53376))


### ⚡ Performance

* lighthouse file saves to run concurrently ([#2178](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2178)) ([f90f863](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/f90f863d4b9d643ab880c9dc8cdd78b6c88ae38d))


### 🏗️ Refactor

* change type of logger ([#2165](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2165)) ([bf0574d](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/bf0574da8ce0986beb5dd2f026a2332a7e63b791))
* use validate files on the tool level ([#2152](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2152)) ([2e039c0](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/2e039c09e1a273581d9b51081a0feb8a57791947)), closes [#2150](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2150)

## [1.1.1](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v1.1.0...chrome-devtools-mcp-v1.1.1) (2026-05-27)


### 🛠️ Fixes

* **cli:** have pageId as first argument ([#2142](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2142)) ([60be3e6](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/60be3e6bc157bd1121ea1d4b6ad59e37a73cac3e))

## [1.1.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v1.0.1...chrome-devtools-mcp-v1.1.0) (2026-05-26)


### 🎉 Features

* add extraHttpHeaders emulation to emulate tool ([#1176](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1176)) ([6992106](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6992106d1ca3bcd9390165035e7b0a3acb7e7317))
* created cursor plugin.json setting file with release auto versioning ([#2091](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2091)) ([10c8205](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/10c82055d82eda9e7f229f8ddf3b8770a8732aa7))


### 🛠️ Fixes

* Apply CPU throttling to secondary CDP session ([#2092](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2092)) ([3ade962](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/3ade962a8da6b100800304146dc3e50e6419a6ee))
* **cli:** address pid file creation issues ([#2124](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2124)) ([1b51a52](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/1b51a520f248d809ab4383cd357cae13280735d4))
* exit on stdin EOF and SIGTERM/SIGINT/SIGHUP, closing the browser cleanly ([#2117](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2117)) ([43b934c](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/43b934cd98d5d585fcde38e24d5d7b3eeb133498))
* Fix throttling info in performance trace output ([#2096](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2096)) ([57f32b0](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/57f32b0cd4afe1775b96ba35c27f25d6f0770331))
* make pageId required ([#2084](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2084)) ([d751693](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d751693d887fae4ef7a1e7204545192322cf7820)), closes [#2052](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2052)
* remove duplicate .mcp.json ([#2095](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2095)) ([dbf6ba9](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/dbf6ba93746c4975fc1ed385a8bf0f6395a9a79e))
* Set viewport after updating timeouts when setting emulation ([#2134](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2134)) ([0c3ac37](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0c3ac378a91fa0463ce2302fd963e7946c9f2771))
* use pinned version for plugins ([#2135](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2135)) ([8ea5f09](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/8ea5f098ef7e8d8ae4f4bbaea5291cef84b8f15f))
* use realpath for MCP roots validation ([#2127](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2127)) ([176eb69](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/176eb695137d9c46a61e2d4d5571880c5145cf46))


### 📄 Documentation

* align coding agent examples with Antigravity ([#2094](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2094)) ([ce31594](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/ce31594d6c9614c63a93cd7abddf4522a4c4a053))
* fix installation instructions for VS Code ([#2087](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2087)) ([9f47df3](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/9f47df36847cd69b99873709e7ed3936347b648e))


### 🏗️ Refactor

* remove redundant validatePath calls ([#2136](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2136)) ([521c388](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/521c388624d448c8c55ee3b5415971ebc35b1ec3))

## [1.0.1](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v1.0.0...chrome-devtools-mcp-v1.0.1) (2026-05-18)


### 🛠️ Fixes

* include saved image paths in CLI JSON output ([#2070](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2070)) ([a9fb555](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a9fb555c806122bc03bbca75d9bc03197d7f45b6))


### 📄 Documentation

* add version to the LTS ([#2080](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2080)) ([a2083a2](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a2083a2eddc687e53646877e36b784f2d4ced0e0))

## [1.0.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.26.0...chrome-devtools-mcp-v1.0.0) (2026-05-18)


### 🎉 Features

* report new URL after actions that trigger navigation ([#1853](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1853)) ([b594858](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b5948582a0a143d48b43d64a87cff1f9027e12e3))
* support filePath in evaluate_script ([#2054](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2054)) ([90d368d](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/90d368d34365507d88b1eabf0e7a7a8a240ac019))


### 🛠️ Fixes

* disable NetworkManager in DevTools ([#1834](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1834)) ([d0e6539](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d0e6539ef426a8313ec9266a3b3c5f0511275bdf))
* do not use getSelectedMcpPage ([85f935b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/85f935b2be2d202545d4b8c2af4f15b77a271418))
* improve geolocation emulation ([#2036](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2036)) ([213720b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/213720b69cdc84fc03e1e5b96bfae287d8ffe812))
* report unknown tool arguments ([#2064](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2064)) ([041b208](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/041b2083781e4c2f027ea9c71479e4db3beb7fa7))
* respect user's npm registry configuration in update check ([#2038](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2038)) ([83a299f](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/83a299fc95c6d561acab520837c805ab37ecfde3))


### 📄 Documentation

* explain concurrent session options ([#2062](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2062)) ([41944b3](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/41944b3265a3d2c812fcb55843acd20d039a8748))
* fix typo ([#2075](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2075)) ([1deb4f8](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/1deb4f8a8b414a06bd0caac37b78acfc46143703))
* remove windows workaround and document Node LTS support ([#2074](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2074)) ([30dcd0b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/30dcd0ba965d7195952af141c6799a7e50ee4038))
* unhide various experimental flags ([#2055](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2055)) ([081c903](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/081c9033d601703e19e97072c69b4263efae5b6a))


### 🏗️ Refactor

* waitForResult helpers ([#2041](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2041)) ([f6a12be](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/f6a12be091dc033a31edfbe4b3a47c41579f6e92))

## [0.26.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.25.0...chrome-devtools-mcp-v0.26.0) (2026-05-11)


### 🎉 Features

* add an error logging method ([#2006](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2006)) ([06e0ab6](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/06e0ab602258edf90adafd954f9a7d55f5ca05e4))


### 🛠️ Fixes

* **cli:** allow --autoConnect on CLI start ([#2015](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2015)) ([9882391](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/98823918dde184759f47095ce386705b0fabb653)), closes [#1859](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1859) [#1184](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1184)
* Make fill_form more appealing when filling forms with checkboxes ([#1971](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1971)) ([407c2bd](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/407c2bd03fbdc45a66690a32cfeac1937ce86f10))
* only require a page in page-scoped tools ([#2030](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2030)) ([8e06761](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/8e06761572592764327da00ee653bd4ec2a4a30e))
* **telemetry:** re-run the update metrics script ([#2005](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2005)) ([e9ec375](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/e9ec375f95622a21d9f9f8b1e8210436cc7695d5))


### 📄 Documentation

* Fix Claude Code instructions ([#2018](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2018)) ([a5ad67b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a5ad67bdafa60a774f9c7dea490393b9c845777b))


### 🏗️ Refactor

* extract ToolHandler ([#2032](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2032)) ([178b790](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/178b79049318a63d1df1bd40e069f0627fa06fcc))

## [0.25.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.24.0...chrome-devtools-mcp-v0.25.0) (2026-05-06)


### 🎉 Features

* support third-party developer tools ([#1982](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1982)) ([7548c97](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/7548c97663b71f7ef6a5e41cccf38c6525887410))


### 🛠️ Fixes

* **input:** stop native select option clicks from timing out ([#1960](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1960)) ([510ec0f](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/510ec0f48bbfc7cad3d5d1f9805e901cc992ea89))
* make sure env variables are consistently applied when parsing args ([#1994](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1994)) ([f45f068](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/f45f0681a295e96a66c8247bbc1d9fe445ee04ac))


### 📄 Documentation

* extract WebMCP into its own category ([#1993](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1993)) ([da0441d](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/da0441d4250702898f5f07815ffb9c708393fe96))
* remove token estimates ([#2003](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2003)) ([14938ac](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/14938acd089770ba32a124839c4b7c3a064c7320))
* update generate-docs.ts tools output order ([#1991](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1991)) ([895fc65](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/895fc65a1f2b426c8644baa0cda23ee5de98624e)), closes [#1932](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1932)

## [0.24.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.23.0...chrome-devtools-mcp-v0.24.0) (2026-05-02)


### 🎉 Features

* agentic browsing in lighthouse ([#1931](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1931)) ([5fa2750](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/5fa2750456d8ea5b73ca851c7c44dcec0a2be01e))
* **cli:** generate commands for conditional tools ([#1962](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1962)) ([b2b3e99](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b2b3e99d67e573e65a4cf84258da8560b2753405))
* group identical consecutive console messages in list_console_messages ([#1939](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1939)) ([dbddb2e](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/dbddb2e4efb01c25ce4c6d96fd45b3ab29a498eb))
* support MCP client roots feature ([#1945](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1945)) ([def53dd](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/def53ddf1d0d3fe04c41f1572919cef208161151))


### 🛠️ Fixes

* add proactive tool rejection when dialog is open ([#1978](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1978)) ([6ce254e](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6ce254e54153212bf305e28846bc77f1d6b82b74))
* always allow tmpdir access with client roots ([#1984](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1984)) ([a90378a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a90378adf3226e8b27a05cdcfdd801c199acaa93))
* **cli:** re-generate cli correctly ([#1969](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1969)) ([8cbdb8d](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/8cbdb8d49491e332c1d30a3884304e1f7a519db2))
* handle errors due to open dialogs during tool calls ([#1953](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1953)) ([06b331f](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/06b331f403056727850a633dd64b290d60bdb906))
* note about missing elements should not show in verbose mode ([#1950](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1950)) ([80bee1e](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/80bee1e6cd0e62995496ea9d001994c78ec9dcf0))
* **telemetry:** bucketize string length ([#1972](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1972)) ([bf3cb58](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/bf3cb58d27589ddc5156d7a6ee1b2bb81d9a2cee))

## [0.23.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.22.0...chrome-devtools-mcp-v0.23.0) (2026-04-22)


### 🎉 Features

* add an option to customize ffmpeg path ([#1937](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1937)) ([b377454](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b377454b1bcf9706e8d34c7241593b04f3635257))
* support experimental allowlist for navigate tool calls ([#1935](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1935)) ([d502557](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d50255778a6dcb30fb702755f0dd38f8ee2cd858))
* support webm format in screencast ([#1934](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1934)) ([85b8993](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/85b89931ed7d59ab939abe4c72a63ad02febc29c))


### 📄 Documentation

* clarify resource limitations around the number of tabs ([#1927](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1927)) ([42be7c3](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/42be7c32272448b72091d008d1a0edb9b1ad6ec7))


### 🏗️ Refactor

* add support for CLI sessionIds in tests ([#1919](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1919)) ([82b67b0](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/82b67b07d3c7b5a1ec22d21c2376d24d7393cb82))

## [0.22.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.21.0...chrome-devtools-mcp-v0.22.0) (2026-04-21)


### 🎉 Features

* add update notification to both binaries ([#1783](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1783)) ([e01e333](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/e01e33355e85c3b38e7aba6aceff57271b99a830))
* auto handle dialogs during script evaluation  ([#1839](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1839)) ([da33cb5](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/da33cb5b957fb87bbbab67e4c1521535065881f1))
* ensure extensions for file outputs ([#1867](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1867)) ([e7a0d50](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/e7a0d509778578ceb8ba357f5857a86f95cfb533))
* experimental click_at(x,y) tool ([#1788](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1788)) ([c4f5471](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/c4f54710d9d7c3d1167628e5135b4cf92beaec45))
* support Chrome extensions debugging ([#1922](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1922)) ([3ff21cf](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/3ff21cf30dae19a6af85d836b1b55314f53ff401))
* support DevTools header redactions as an option ([#1848](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1848)) ([5c398c4](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/5c398c4e7ce17facf62316fb1b617c39daa461ef))
* **webmcp:** Add experimental tool to execute WebMCP tool ([#1873](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1873)) ([0aff266](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0aff266111408acfbce39e231c23ce866d0f26c0))
* **webmcp:** Add experimental tool to list WebMCP tools page exposes ([#1845](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1845)) ([f97b573](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/f97b573d70ec670df8bb2b42167e08681f3b488e))


### 🛠️ Fixes

* avoid showing update notification for local builds ([#1889](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1889)) ([3f0cf10](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/3f0cf1068ba35d81c800a81fc6272acaff715b41)), closes [#1886](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1886)
* **cli:** correct WebP MIME type check in handleResponse ('webp' → 'image/webp') ([#1899](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1899)) ([e3a5f6b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/e3a5f6bb69f0dc4e626146d5b4165af97bad8fe4)), closes [#1898](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1898)
* ignore unmapped PerformanceIssue events ([#1852](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1852)) ([ea57e86](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/ea57e863f8b5b48a210c7a2fccd552f5824a7a96))
* **network:** trailing data in Network redirect chain ([#1880](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1880)) ([2f458c1](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/2f458c11ebbb4b8061e8e4375346e5449b222281))
* remove double space in navigate error message ([#1847](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1847)) ([429e0ca](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/429e0ca7b82568de1c0fab27dacb439b3898965c))


### 📄 Documentation

* clarify tools included into CLI ([#1925](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1925)) ([76ab9fa](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/76ab9fa5643dfa6eb93fcb50fe747a948e9a9d63))
* document network response and request extensions ([#1887](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1887)) ([796d6f2](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/796d6f2e242065de1e2cf27f729d66bc71676299))
* fix skill and reference documentation issues ([#1249](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1249)) ([9236834](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/92368345dd62fce0a65a1081f80c23790edbf7d1))
* Include Mistral Vibe setup in README ([#1801](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1801)) ([582c9e0](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/582c9e01e9a5ca1b9bb9e4b816662008430aaf2d))
* Rename project and enhance README content ([#1856](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1856)) ([c066488](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/c0664883a5eb6a3e23bb0a48ea348e5cdab052f2))
* update the README on installing as a VS code agent plugin  ([#1796](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1796)) ([1b5dcae](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/1b5dcae2a03a9de8c29c9f25a4d04cdfbad416a7))


### 🏗️ Refactor

* move waitForEventsAfterAction to McpPage ([#1780](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1780)) ([c7c8f50](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/c7c8f50f802643fd90bd9d0419acfb1bb8dd58ad))
* use puppeteer Extension API ([#1911](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1911)) ([ec895f1](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/ec895f195aa21b36c1bf4373184f281b181ea3e9))

## [0.21.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.20.3...chrome-devtools-mcp-v0.21.0) (2026-04-01)


### 🎉 Features

* add a skill for detecting memory leaks using take_memory_snapshot tool ([#1162](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1162)) ([d19a235](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d19a2350f975ec2fbf8ee61b35163a48c0146c32))


### 🛠️ Fixes

* **cli:** avoid defaulting to isolated when userDataDir is provided ([#1258](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1258)) ([73e1e24](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/73e1e24b26f9e42a83116b586e34d47276a6a2fa))
* list_pages should work after selected page is closed ([#1145](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1145)) ([2664455](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/26644553028d8404fd65a005ea9c19a278671f4d))
* mark lighthouse and memory as non-read-only ([#1769](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1769)) ([bec9dae](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/bec9dae2d26b728feedcd660189f386e6228f3ae))
* **telemetry:** record client name ([9a47b65](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/9a47b657d7b17b9bc64508530c93d55e8033e2a6))
* versioning for Claude Code plugin ([#1233](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1233)) ([966b86f](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/966b86f3aaa9f87c2599b954c4e7f990c2a697ea))
* wrap .mcp.json config in mcpServers key ([#1246](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1246)) ([c7948cf](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/c7948cf0621d80b080220d4cfd36b62bef2790b9))


### 📄 Documentation

* Command Code CLI instructions for MCP server ([0a7c0a7](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0a7c0a74b471935a3e2f5ca0fd93556e8e5165ec))
* provide disclaimer about supported browsers ([#1237](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1237)) ([8676b72](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/8676b7216c66dfd323c2f6c272544a75dbab4dba))


### 🏗️ Refactor

* set process titles for easier debugging ([#1770](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1770)) ([0fe3896](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0fe3896d85c74ce8b2dc189fe8a310727f795344))

## [0.20.3](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.20.2...chrome-devtools-mcp-v0.20.3) (2026-03-20)


### 🛠️ Fixes

* mark categoryExtensions flag mutually exclusive with autoConnect ([#1202](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1202)) ([8c2a7fc](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/8c2a7fc21ead6091567e85608f7916c001ccc7db)), closes [#1072](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1072)


### ⚡ Performance

* **memory:** release old navigation request in NetworkCollector ([#1200](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1200)) ([1e6456c](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/1e6456ce222a8f392341a530b2340336c7a1ab02))
* use CDP to find open DevTools pages (reland) ([#1210](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1210)) ([53483bc](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/53483bc637566658754d781d88f4353ad47f44a7))

## [0.20.2](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.20.1...chrome-devtools-mcp-v0.20.2) (2026-03-18)


### 📄 Documentation

* add troubleshooting for Claude Code plugin HTTPS clone failures ([#1195](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1195)) ([d082ca4](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d082ca4ecd35a023d09f9c1ff949d5fb0c3fb069))

## [0.20.1](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.20.0...chrome-devtools-mcp-v0.20.1) (2026-03-16)


### 🛠️ Fixes

* update VS Code manual installation powershell command ([#1151](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1151)) ([6c64a5b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6c64a5b543714796b25a12dc6f2be7a1e683e8bd))


### ⚡ Performance

* use CDP to find open DevTools pages. ([#1150](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1150)) ([94de19c](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/94de19cdcdae9e31d0962b273ce352dc248eb5a8))

## [0.20.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.19.0...chrome-devtools-mcp-v0.20.0) (2026-03-11)


### 🎉 Features

* experimental `chrome-devtools` CLI ([#1100](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1100)) ([1ac574e](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/1ac574e7154948e86e414e5149fb975a190d5bb0))


### 📄 Documentation

* fix typo ([#1155](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1155)) ([b59cabc](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b59cabcc1d59802ffd7d9667040188e46192357d))
* fix typos and improve phrasing ([#1130](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1130)) ([70d4f36](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/70d4f365dc619a5743e697c30800f7065bc6227d))
* revise contribution process and add release process ([#1134](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1134)) ([d7d26a1](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d7d26a103b840e2feb7cb9af6a242edda94f1ddf))
* **troubleshooting:** add symptom for missing tools due to read-only mode ([#1148](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1148)) ([57e7d51](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/57e7d51e8ca1e2ee325a9e7a9c64c033acbe6d6a))
* Update troubleshooting for MCP server connection errors ([#1017](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1017)) ([00f9c31](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/00f9c3108ab9caefca57998439052c728298920b))


### 🏗️ Refactor

* move main files ([#1120](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1120)) ([c2d8009](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/c2d8009ff75f76bce1ec4cf79c2467b50d81725e))

## [0.19.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.18.1...chrome-devtools-mcp-v0.19.0) (2026-03-05)


### 🎉 Features

* add pageId routing for parallel multi-agent workflows ([#1022](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1022)) ([caf601a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/caf601a32832bb87cfac801a6bbeacb87508412f)), closes [#1019](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1019)
* Add skill which helps with onboarding of the mcp server ([#1083](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1083)) ([7273f16](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/7273f16ec08f6d5b46a2693b0ad4d559086ded89))
* integrate Lighthouse audits ([#831](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/831)) ([dfdac26](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/dfdac2648e560d756a8711ad3bb1fa470be8e7c9))


### 🛠️ Fixes

* improve error messages around --auto-connect ([#1075](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1075)) ([bcb852d](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/bcb852dd2e440b0005f4a9ad270a1a7998767907))
* improve tool descriptions ([#965](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/965)) ([bdbbc84](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/bdbbc84c125bdd48f4be48aa476bec0323de611c))
* repair broken markdown and extract snippets in a11y-debugging skill ([#1096](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1096)) ([adac7c5](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/adac7c537ee304f324c5e7284fb363396d1773f5))
* simplify emulation and script tools ([#1073](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1073)) ([e51ba47](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/e51ba4720338951e621585b77efc6a0e07678d99))
* simplify focus state management ([#1063](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1063)) ([f763da2](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/f763da24a10e27605c0a5069853ce7c92974eec2))
* tweak lighthouse description ([#1112](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1112)) ([5538180](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/55381804ae7ffa8a1e5933b621a9b8390b3000ff))


### 📄 Documentation

* Adapt a11y skill to utilize Lighthouse ([#1054](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1054)) ([21634e6](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/21634e660c346e469ae62116b1824538f51567dd))
* add feature release checklist to CONTRIBUTING.md ([#1118](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1118)) ([0378457](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/03784577ffb6e238bcb2d637bff9ad759723ea7b))
* fix typo in README regarding slim mode ([#1093](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1093)) ([92f2c7b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/92f2c7b48b56a6b1d6ac7c9e2f2e92beb26bcf62))


### 🏗️ Refactor

* clean up more of the context getters ([#1062](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1062)) ([9628dab](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/9628dabcb4d39f0b94d152a0fc419e049246a29d))
* consistently use McpPage in tools ([#1057](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1057)) ([302e5a0](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/302e5a04191ba0558e3c79f1486d01d5eb0f6896))
* improve type safety for page scoped tools ([#1051](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1051)) ([5f694c6](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/5f694c60ffd21f8b022554c92b2ad4cbdb457375))
* make cdp resolvers use McpPage ([#1060](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1060)) ([d6c06c5](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d6c06c56a7b8e4968318adc9fc7c820ace9f5bd9))
* move dialog handling to McpPage ([#1059](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1059)) ([40c241b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/40c241bbfc80d6282953ab325b30a597d3d85ade))
* move server to a separate file ([#1043](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1043)) ([a8bf3e5](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a8bf3e585682c3126dfd378e9f98b5dc7ab6045d))
* remove page passing via context ([#1061](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1061)) ([4cb5a17](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/4cb5a17b57f57d8a367cd423c960ba122b9952e3))
* set defaults to performance trace tool ([#1090](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1090)) ([dfa9b79](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/dfa9b79a4ecc9e67f5b043f2dd97f6889d1fee0b))
* simplify the response texts ([#1095](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1095)) ([cb0079e](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/cb0079efbbd41874f6913772fe3f2a037e9f5f8f))
* type-cast as internal CdpPage interface ([#1064](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1064)) ([2d5e4fa](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/2d5e4fa3579650a384ff21c88c2e6b9cda031e1a))

## [0.18.1](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.18.0...chrome-devtools-mcp-v0.18.1) (2026-02-25)


### 🛠️ Fixes

* remove endsWith for filePath in memory tools ([#1041](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1041)) ([d0622d5](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d0622d52d46ac72a28bc22f93a337fb5007214c7))

## [0.18.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.17.3...chrome-devtools-mcp-v0.18.0) (2026-02-24)


### 🎉 Features

* `--slim` mode for maximum token savings ([#958](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/958)) ([c402b43](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/c402b43697d834994c4fc141305189082da14bee))
* add a new skill for accessibility debugging and auditing with Chrome DevTools MCP. ([#1002](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1002)) ([b0c6d04](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b0c6d042e4d68763acf989edc8097ce07e85dc7a))
* add experimental screencast recording tools ([#941](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/941)) ([33446d4](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/33446d457e4386fadcfe4ddf6c7a43b2e9098c9a))
* add skill to debug and optimize LCP ([#993](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/993)) ([2cd9b95](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/2cd9b95346226aa52cce18f6ab889a2ae194806c))
* add storage-isolated browser contexts ([#991](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/991)) ([59f6477](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/59f6477a70eb07585e9a510089f1dfc840a012fd))
* add take_memory_snapshot tool ([#1023](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1023)) ([7ffdc5e](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/7ffdc5ee4d9df9f62f03354fa758fb4d022c3b08))
* support any-match text arrays in wait_for ([#1011](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1011)) ([496ab1b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/496ab1b45f7a283a1432643777e0795a17f33667))
* support type_text ([#1026](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1026)) ([b5d01b5](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b5d01b5fe65fa20f9b76555b86a749960a5d1738))


### 🛠️ Fixes

* detect X server display on Linux ([#1027](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1027)) ([1746ed9](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/1746ed9ee11c212f78dcbb00af99a0400595e778))


### ♻️ Chores

* cleanup string and structured console formatters ([#1005](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1005)) ([0d78685](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0d78685a5b37dc68bb11a1088ff8816ecff3bb82))
* extract version in a seprate file ([#1032](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1032)) ([0106865](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0106865aad6d51b6cb590bf98ccaf7078e8d7436))
* move emulation settings to context ([#1000](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1000)) ([bc3c40e](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/bc3c40e8f961433fb2ae858482d66f9a55fdde32))
* optimize slim tool descriptions and params ([#1028](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1028)) ([ca6635d](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/ca6635d5a5d5e8b7b9944fa8b4e1063e6269a5f2))
* simplify JavaScript code examples, update code block language, and refine descriptions in a11y debugging skill documentation. ([#1009](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1009)) ([5cedcaa](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/5cedcaad2c8a5e488064e21fb56cbd8643345440))
* types for JSON output of IssueFormatter ([#1007](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1007)) ([9ef4479](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/9ef4479bec39c5f2651d6ebb63e9ec0fecf8bf89))

## [0.17.3](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.17.2...chrome-devtools-mcp-v0.17.3) (2026-02-19)


### 🛠️ Fixes

* remove clean from prepare ([#997](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/997)) ([2016b98](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/2016b98217bf5aa8d65c6668b1e46c8a3400276f))

## [0.17.2](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.17.1...chrome-devtools-mcp-v0.17.2) (2026-02-19)


### 🛠️ Fixes

* check that combobox is actually a select element before filling out options ([#979](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/979)) ([d2bc489](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d2bc489e4351551ba62a104433839c4198ecae84))
* handle network request pagination correctly ([#980](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/980)) ([0d9f422](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0d9f422201538aa847a50417f1ed370e3a6c95b2))


### 📄 Documentation

* Add a note about previously installed server installations ([#982](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/982)) ([c0009f7](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/c0009f7ab2f15bedd1c4ceb609db77bcb3c96f2d))
* update codex doc URL ([#987](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/987)) ([ebbbea7](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/ebbbea7f9d20e4dea902d06e9b86dfe1cc9b221f))


### ♻️ Chores

* **network:** de-duplicate String and JSON formatters ([#985](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/985)) ([1896dbb](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/1896dbb5a7cdc3fc0bcc5e665aee986a1180b014))
* remove text from the status code for Network requests ([#778](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/778)) ([327a388](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/327a3884d8443b8591c06ddb3f9081771ae973c3))

## [0.17.1](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.17.0...chrome-devtools-mcp-v0.17.1) (2026-02-16)


### 📄 Documentation

* Add 'Progressive Complexity' and 'Reference over Value' design principles. ([#939](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/939)) ([8d765c0](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/8d765c0aef7bbcd476c7e7fbe9ea63ee26cf4fa6))
* add Katalon Studio setup instructions to README ([#929](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/929)) ([6cfef24](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6cfef24ec734ed62221c66bdf03b09ce000f5bfe))
* add MCP config for Claude plugin + docs ([#944](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/944)) ([a781da4](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a781da4434c3490901b28017bc7aa40493ef8dcc))
* estimate tokens using tiktoken  ([#959](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/959)) ([fd0a919](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/fd0a9193b37be4c5cda21dc4904093c7b58d61be))
* improve Claude Code installation instructions ([#947](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/947)) ([3ec5b7e](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/3ec5b7e7a2d97c9f0165c5af3317c531a9dc058f))
* Update README with WSL configuration details ([#946](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/946)) ([107c46a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/107c46a4dbd2ba7c7b9217a75ae2b1871d3c7f0d))


### ♻️ Chores

* rename files to have more consistent style ([#935](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/935)) ([9e1f9ac](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/9e1f9ac69667ddc3e2917e2c30e5ee940a03d853))

## [0.17.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.16.0...chrome-devtools-mcp-v0.17.0) (2026-02-10)


### 🎉 Features

* include Error.cause chain for uncaught errors and logged Errors ([#906](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/906)) ([05b01ec](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/05b01ecaba47cf1ce38564636663222c9cab46de))
* Integrate CrUX data into performance trace summaries ([#733](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/733)) ([b747f9d](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/b747f9d74a12d2119b6531476b2f88ab66be0ff8))
* show message and stack trace in details when console.log'ging Error objects ([#902](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/902)) ([ffa00da](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/ffa00dab1b65b2eac8db215e0289317b8ed9b725))


### 🛠️ Fixes

* console formatter hides frames from ignored scripts ([#927](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/927)) ([8e2380b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/8e2380b434d9659ffa8a7043d2589261772fa04f))
* limit stack traces to 50 lines ([#923](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/923)) ([caea23a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/caea23a7cf33c87cd4ce426eb2a10724aba3cc71))


### 📄 Documentation

* add macOS Web Bluetooth troubleshooting note ([#930](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/930)) ([3c9528b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/3c9528b43d9bbff166fcfcfee321149ff44ddd21)), closes [#917](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/917)

## [0.16.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.15.1...chrome-devtools-mcp-v0.16.0) (2026-02-04)


### 🎉 Features

* include source-mapped stack trace for uncaught errors ([#876](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/876)) ([ecef712](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/ecef712e70b47ae81eb3364d0aed801ec1c91a70))


### 🛠️ Fixes

* accidental extra typing in the fill tool ([#886](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/886)) ([3d6e59d](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/3d6e59dda42be3c6fd97446344a28cbbaa5809b3))
* update evaluateScript description formatting ([#880](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/880)) ([24db9dd](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/24db9dd78cd4f054d291322685b4f47601da3f5a))
* use 1-based line/column and fix wasm offsets in stack frames ([#884](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/884)) ([7e1ec81](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/7e1ec81fb63ec8b7c6d77dbdc88beef4240243ba))


### 📄 Documentation

* mention source-mapped stack traces in 'Key features' ([#883](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/883)) ([579d18a](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/579d18a3f4d1d8d05bf267a39de7f2f53e719b17))
* remove outdated --channel=beta note ([#882](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/882)) ([acdb5c9](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/acdb5c9bb3f249c5a9ce1d4a3e84c580af999141))

## [0.15.1](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.15.0...chrome-devtools-mcp-v0.15.1) (2026-01-30)


### 🛠️ Fixes

* disable usage statistics when CI or CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS env is set ([#862](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/862)) ([c0435a2](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/c0435a2d53eb51b7500fc5cce50344520ea164e7))
* respect custom timeouts in navigate tools ([#865](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/865)) ([a0aeb97](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a0aeb97693fd5ca641f45ebcd4ce3b4b08ce21b8))

## [0.15.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.14.0...chrome-devtools-mcp-v0.15.0) (2026-01-28)


### 🎉 Features

* Add ability to inject script to run on page load ([#568](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/568)) ([d845ad4](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d845ad48584a49aa57b11de308beeb17ed0b2e10))
* enable usage statistics by default with opt-out ([#855](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/855)) ([7e279f1](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/7e279f1b67c5cfd4ad033a4147c51fe20a7833f7))
* support testing light and dark mode ([#858](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/858)) ([5a23a8c](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/5a23a8c201d30d40395e283f4434d933826333fa))

## [0.14.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.13.0...chrome-devtools-mcp-v0.14.0) (2026-01-27)


### 🎉 Features

* add a skill for using chrome-devtools-mcp ([#830](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/830)) ([aa0a367](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/aa0a3679f59ab441908d31252afee1cd56102da8))
* add background parameter to new_page tool ([#837](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/837)) ([d756888](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/d7568881ba4aa0e2c10dc6148fd0ef941fee10d5))
* allow skipping snapshot generation for input tools ([#821](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/821)) ([4b8e9f2](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/4b8e9f287572e0a95c30b5ca612acf08bf79595b))
* include stack trace in 'get_console_message' tool ([#740](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/740)) ([a3a0021](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a3a00210a30f78045244bc897ee736bdbdc36007))
* support device viewport and user agent emulation ([#798](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/798)) ([a816967](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a8169676f920f88965a2574f53affe15c1278b43))
* support filePath for network request and response bodies ([#795](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/795)) ([6d0e4ca](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6d0e4cab28a8498c2783c1c0c6436c655de7b336))


### 🛠️ Fixes

* handle beforeunload dialogs in navigations ([#788](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/788)) ([9b21f8b](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/9b21f8b2e972f78f58c6f633851466356330c77d))
* improve error handling for console messages ([#844](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/844)) ([dc43ede](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/dc43ede1f20302bd2feb706e63bcf992b4a66a96))
* improve error reporting when retrieving the element ([#845](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/845)) ([f7dd003](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/f7dd00340a8ac5af7fbe4922f2a1d27d99d933cc))
* improve performance tool description ([#800](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/800)) ([aa9a176](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/aa9a1769568aca2a357f186b2e80b38b2ed76323))
* increase timeouts for long text input ([#787](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/787)) ([a83a338](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a83a33835148905b538b39be93f6115774f91696))
* make request and response handling more robust ([#846](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/846)) ([695817f](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/695817f6d6da5fcb94934fb1c2be8b006522f53b))
* re-use node ids across snapshots ([#814](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/814)) ([a6cd2cd](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a6cd2cd3f2bd823f0e044d7796fd8ff2c100cda3))


### 📄 Documentation

* add a mention of evals into contributing.md ([#773](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/773)) ([9a31ac7](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/9a31ac7abab5890d11fec627bbdcbb8051452453))
* document how to add extensions to gemini-cli ([#834](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/834)) ([0610d11](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/0610d11aa9add484951b76adef557eed5e2bd275))
* update auto-connect docs ([#779](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/779)) ([a106fba](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a106fbadbc1a487ce4c53a9eb783c98e524c0a9e))
* Update README.md to include a link to Android debugging ([#783](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/783)) ([6e52e66](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/6e52e66a7a7ebbf1f2e2080a857f72192036eb0c))

## [0.13.0](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/chrome-devtools-mcp-v0.12.1...chrome-devtools-mcp-v0.13.0) (2026-01-14)


### 🎉 Features

* Allow opting out of default Chrome launch arguments ([#729](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/729)) ([9a51af2](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/9a51af219fc9216cd463bef9363716283f41f36a))
* support filePath in performance tools ([#686](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/686)) ([68ae2f8](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/68ae2f8253e2ba5c34436e25df114874c537f6df))


### 🛠️ Fixes

* support resize_page when browser window is maximized/fullscreenwindow state ([#748](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/748)) ([4d9ac22](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/4d9ac227ddff6fc4aec44e46673f6e44a8168db9))
* use relative path for plugin source in marketplace ([#724](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/724)) ([5c1ecf8](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/5c1ecf835ac8aad4947d0a8f82c899acd4115b64))


### 📄 Documentation

* add experimental chrome on android guide ([#691](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/691)) ([4a87702](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/4a87702ca6913ed62987f71e080f3d481d13b8d8))
* autoConnect - clarify how the mcp server selects a profile ([#693](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/693)) ([28b8ff8](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/28b8ff816461760c82e9b19b70f288bc7fa2fa38))
* claude code broken link ([#707](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/707)) ([1f532b8](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/1f532b8fafa0fa60aaf94c302bad663fab1c12ea))
* enhance cli docs + sort required vs opt params ([#674](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/674)) ([81cbd99](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/81cbd99f52d013d07bdcf21a0840f61a16bacd33))
* update auto connect docs to mention min Chrome version ([#681](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/681)) ([ab2340f](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/ab2340f40127dcdabde6887a411163ce9d130394))
* Update Claude Code instructions in README.md ([#711](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/711)) ([f81cd2d](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/f81cd2d8dfc35da8c718b227e0ee4c4d7c5daca8))
* update readme to include OpenCode example ([#560](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/560)) ([fbba3c9](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/fbba3c9461cec8113216fa4569e879c85312ea29))


### ♻️ Chores

* change pageIdx to page ids ([#741](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/741)) ([a23c6ba](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/a23c6ba8c9e1da90c885e68946635a8cc536a11e))

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

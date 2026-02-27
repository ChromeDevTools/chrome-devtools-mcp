# OpenCode Chrome JavaScript 调试能力配置指南

> 让 AI 在 OpenCode 中拥有 Chrome 断点调试能力：设置断点、单步执行、检查变量、查看调用栈。

## 它能做什么？

配置完成后，AI 可以通过 13 个调试工具对 Chrome 中运行的 JavaScript 进行断点调试：

| 能力 | 工具 |
|------|------|
| 启用/禁用调试器 | `debugger_enable`, `debugger_disable` |
| 断点管理 | `set_breakpoint`, `remove_breakpoint`, `list_breakpoints` |
| 执行控制 | `debugger_resume`, `debugger_step_over`, `debugger_step_into`, `debugger_step_out` |
| 状态检查 | `get_paused_state`, `evaluate_on_call_frame` |
| 脚本查看 | `list_scripts`, `get_script_source` |


## 前置条件

- Node.js >= 20
- Google Chrome 浏览器
- [OpenCode](https://github.com/opencode-ai/opencode) + [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) 插件
- Git

## 原理

```
OpenCode (AI)
  │
  │  skill_mcp(mcp_name="chrome-devtools", tool_name="debugger_enable")
  │
  ▼
chrome-automation skill (SKILL.md + mcp.json)
  │
  │  启动 MCP server 进程
  │
  ▼
chrome-devtools-mcp (本地 fork，含 debugger 工具)
  │
  │  Chrome DevTools Protocol (CDP)
  │
  ▼
Chrome (--remote-debugging-port=9222)
```

关键点：npm 官方的 `chrome-devtools-mcp` 包不含调试工具，必须用我们的 fork。
---
## 配置步骤
### 1. 克隆并构建 fork 仓库
```bash
git clone https://github.com/soul-cat/chrome-devtools-mcp.git ~/chrome-devtools-mcp
cd ~/chrome-devtools-mcp
git checkout feat/debugger-tools
npm install
```
构建：
```bash
npx tsc
# Node >= 22:
node --experimental-strip-types scripts/post-build.ts
# Node 20:
npx tsx scripts/post-build.ts
```
验证：
```bash
ls build/src/tools/debugger.js  # 应存在
```
### 2. 创建启动脚本
创建 `~/chrome-devtools-mcp/run-mcp.sh`：
```bash
#!/bin/bash
cd ~/chrome-devtools-mcp
exec node build/src/index.js "$@"
```
```bash
chmod +x ~/chrome-devtools-mcp/run-mcp.sh
```
> MCP server 必须从仓库根目录启动，否则 node_modules 无法解析。

### 3. 配置 OpenCode Skill

oh-my-opencode 通过 skill 目录下的 `mcp.json` 自动发现并加载 MCP server。

#### 3.1 创建 skill 目录
```bash
mkdir -p ~/.claude/skills/chrome-automation
```

#### 3.2 创建 mcp.json
```bash
cat > ~/.claude/skills/chrome-automation/mcp.json << 'EOF'
{
  "chrome-devtools": {
    "command": "$HOME/chrome-devtools-mcp/run-mcp.sh",
    "args": ["--browser-url=http://127.0.0.1:9222"]
  }
}
EOF
```

> **注意**：`command` 中的路径必须是绝对路径，`$HOME` 需替换为实际路径（如 `/Users/yourname/chrome-devtools-mcp/run-mcp.sh`）。

#### 3.3 创建 SKILL.md

SKILL.md 告诉 AI 这个 skill 的用途和可用工具：

```bash
cat > ~/.claude/skills/chrome-automation/SKILL.md << 'SKILLEOF'
---
name: chrome-automation
description: 此skill用于启动Chrome浏览器并建立MCP连接，支持浏览器自动化和JavaScript断点调试。当用户要求"启动浏览器"、"打开Chrome"、"断点"、"调试JS"、"debug"等操作时使用。
version: 2.0.0
---

# Chrome 自动化 + JavaScript 调试

**重要**：任何浏览器相关操作前，必须先启动 Chrome！

## 第一步：启动 Chrome

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-debug-profile" &
```

## 第二步：验证端口

```bash
curl -s http://127.0.0.1:9222/json/version
```

## 第三步：使用 MCP 工具

所有工具通过 `skill_mcp(mcp_name="chrome-devtools", tool_name="...")` 调用。

## 可用的 Debugger 工具（13个）

| 工具名 | 说明 |
|--------|------|
| `debugger_enable` | 启用调试器（必须先调用） |
| `debugger_disable` | 禁用调试器，清除所有断点 |
| `set_breakpoint` | 设置断点（参数：url, lineNumber） |
| `remove_breakpoint` | 移除断点（参数：breakpointId） |
| `list_breakpoints` | 列出所有活跃断点 |
| `debugger_resume` | 恢复执行 |
| `debugger_step_over` | 单步跳过 |
| `debugger_step_into` | 单步进入 |
| `debugger_step_out` | 单步跳出 |
| `get_paused_state` | 获取暂停状态（调用栈、命中断点） |
| `evaluate_on_call_frame` | 在断点处求值（参数：callFrameId, expression） |
| `list_scripts` | 列出页面脚本 |
| `get_script_source` | 获取脚本源码（参数：scriptId） |
SKILLEOF
```

### 4. 启动 Chrome

MCP server 通过 CDP 协议连接 Chrome，需要 Chrome 以远程调试模式启动。

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-debug-profile" &
```

**Linux:**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-debug-profile" &
```

**Windows:**
```bash
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-debug-profile"
```

验证 Chrome 已就绪：
```bash
curl -s http://127.0.0.1:9222/json/version
# 应返回含 "Browser" 和 "webSocketDebuggerUrl" 的 JSON
```
### 5. 验证配置
**重启 OpenCode**，然后在对话中测试：
```
# 测试 1：启用调试器
skill_mcp(mcp_name="chrome-devtools", tool_name="debugger_enable")
# 期望输出："Debugger enabled for the current page."

# 测试 2：列出脚本
skill_mcp(mcp_name="chrome-devtools", tool_name="list_scripts")
# 期望输出：页面加载的脚本列表

# 测试 3：列出断点
skill_mcp(mcp_name="chrome-devtools", tool_name="list_breakpoints")
# 期望输出："No active breakpoints."

# 测试 4：禁用调试器
skill_mcp(mcp_name="chrome-devtools", tool_name="debugger_disable")
# 期望输出："Debugger disabled."
```
如果 4 个测试都通过，配置完成 ✅

---
## 故障排除

### 问题 1：`skill_mcp` 找不到 `chrome-devtools`
**症状**：`MCP server 'chrome-devtools' not found`
**原因**：`mcp.json` 不在 skill 目录下，或 OpenCode 未重启。
**解决**：
1. 确认文件存在：`ls ~/.claude/skills/chrome-automation/mcp.json`
2. 确认 JSON 格式正确（无尾逗号）
3. 重启 OpenCode
### 问题 2：MCP server 启动崩溃 `ERR_MODULE_NOT_FOUND`
**症状**：`Cannot find module './node_modules/...'`
**原因**：构建后缺少 mock 文件。
**解决**：
```bash
cd ~/chrome-devtools-mcp
# Node >= 22:
node --experimental-strip-types scripts/post-build.ts
# Node 20:
npx tsx scripts/post-build.ts
```
### 问题 3：`Connection refused` 连接 Chrome 失败
**症状**：`connect ECONNREFUSED 127.0.0.1:9222`
**原因**：Chrome 未以远程调试模式启动。
**解决**：
1. 关闭所有 Chrome 实例
2. 用上面 Step 4 的命令重新启动
3. 验证：`curl -s http://127.0.0.1:9222/json/version`
### 问题 4：断点设置后代码不暂停
**症状**：`set_breakpoint` 成功但 `get_paused_state` 显示未暂停。
**原因**：断点所在行的代码未被执行。
**解决**：
1. 确认断点设置在会被执行的代码行上
2. 在 Chrome 中触发相应操作（如刷新页面、点击按钮）
3. 再次调用 `get_paused_state` 检查
### 问题 5：`opencode.json` 中配置的 MCP 无法通过 `skill_mcp` 调用
**症状**：在 `opencode.json` 的 `mcpServers` 中配置了 server，但 `skill_mcp` 找不到。
**原因**：`skill_mcp` 只能访问 skill 目录下 `mcp.json` 定义的 MCP，不能访问 `opencode.json` 配置级别的 MCP。
**解决**：将 MCP 配置放在 `~/.claude/skills/<skill-name>/mcp.json` 中。
---
## 核心机制说明
### 为什么不能用 npm 官方包？
npm 上的 `@anthropic-ai/chrome-devtools-mcp` 只包含浏览器自动化工具（导航、点击、截图等），不包含 JavaScript 调试工具。我们的 fork 通过 CDP 的 `Debugger` domain 添加了 13 个调试工具。
### skill_mcp vs opencode.json MCP
- `opencode.json` 中的 `mcpServers`：由 OpenCode 直接管理，AI 可以直接调用工具名
- `skill mcp.json`：由 oh-my-opencode 插件加载，AI 通过 `skill_mcp()` 调用
- 两者不互通，`skill_mcp` 只能访问 skill 目录下的 MCP
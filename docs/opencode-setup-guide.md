# OpenCode Chrome Debugger 配置指南

本文档说明如何在一个全新的 OpenCode 实例中配置 Chrome JavaScript 断点调试能力。

## 前置条件

- Node.js >= 20
- Google Chrome 浏览器
- OpenCode + oh-my-opencode 插件
- Git

## 架构概览

```
OpenCode (AI)
  └─ skill: chrome-automation
       └─ mcp.json → chrome-devtools MCP server (本地 fork)
            └─ CDP (Chrome DevTools Protocol)
                 └─ Chrome (--remote-debugging-port=9222)
```

AI 通过 `skill_mcp(mcp_name="chrome-devtools", tool_name="...")` 调用 MCP 工具，
MCP server 通过 CDP 协议与 Chrome 通信，实现断点调试。

## 第一步：克隆 Fork 仓库

```bash
git clone https://github.com/soul-cat/chrome-devtools-mcp.git ~/chrome-devtools-mcp
cd ~/chrome-devtools-mcp
git checkout feat/debugger-tools
npm install
```

## 第二步：构建项目

```bash
# 编译 TypeScript
npx tsc

# 运行 post-build（生成 mock 文件）
# Node >= 22 用:
node --experimental-strip-types scripts/post-build.ts
# Node 20 用:
npx tsx scripts/post-build.ts
```

验证构建成功：
```bash
ls build/src/tools/debugger.js  # 应该存在
```
## 第三步：创建启动脚本
在仓库根目录创建 `run-mcp.sh`：
```bash
#!/bin/bash
cd ~/chrome-devtools-mcp
exec node build/src/index.js "$@"
```
```bash
chmod +x ~/chrome-devtools-mcp/run-mcp.sh
```
**为什么需要 wrapper 脚本？** MCP server 必须从仓库根目录启动，否则 `node_modules` 无法正确解析。

## 第四步：配置 OpenCode Skill

### 4.1 创建 skill 目录
```bash
mkdir -p ~/.claude/skills/chrome-automation
```

### 4.2 创建 `mcp.json`
在 skill 目录下创建 `~/.claude/skills/chrome-automation/mcp.json`：
```json
{
  "chrome-devtools": {
    "command": "/Users/你的用户名/chrome-devtools-mcp/run-mcp.sh",
    "args": ["--browser-url=http://127.0.0.1:9222"]
  }
}
```
> **注意**：`command` 路径必须是绝对路径，替换为你的实际用户名。
### 4.3 创建 `SKILL.md`
在 skill 目录下创建 `~/.claude/skills/chrome-automation/SKILL.md`：
```markdown
---
name: chrome-automation
description: 此skill用于启动Chrome浏览器并建立MCP连接，支持浏览器自动化和JavaScript断点调试。
version: 2.0.0
---
# Chrome 自动化 + JavaScript 调试

**重要**：任何浏览器相关操作前，必须先执行此流程！

## 启动 Chrome
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-debug-profile" &
```

## 验证端口
```bash
curl -s http://127.0.0.1:9222/json/version
```

## 可用的 Debugger 工具（13个）
所有工具通过 `skill_mcp(mcp_name="chrome-devtools", tool_name="...")` 调用。

| 工具名 | 说明 | 参数 |
|--------|------|------|
| debugger_enable | 启用调试器（必须先调用） | 无 |
| debugger_disable | 禁用调试器 | 无 |
| set_breakpoint | 设置断点 | url, lineNumber, columnNumber?, condition? |
| remove_breakpoint | 移除断点 | breakpointId |
| list_breakpoints | 列出所有断点 | 无 |
| debugger_resume | 恢复执行 | 无 |
| debugger_step_over | 单步跳过 | 无 |
| debugger_step_into | 单步进入 | 无 |
| debugger_step_out | 单步跳出 | 无 |
| get_paused_state | 获取暂停状态 | 无 |
| evaluate_on_call_frame | 在断点处求值 | callFrameId, expression |
| list_scripts | 列出页面脚本 | filter? |
| get_script_source | 获取脚本源码 | scriptId |
```

## 第五步：验证

### 5.1 启动 Chrome
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-debug-profile" &
```

### 5.2 重启 OpenCode
修改 skill 文件后必须重启 OpenCode 才能生效。

### 5.3 测试 MCP 连接
在 OpenCode 中执行：
```
skill_mcp(mcp_name="chrome-devtools", tool_name="debugger_enable")
```
预期返回：`Debugger enabled for the current page.`

## 故障排查

### MCP server not found
- 确认 `mcp.json` 在 `~/.claude/skills/chrome-automation/` 目录下
- 确认 JSON 格式正确，`command` 是绝对路径
- 重启 OpenCode

### Connection closed
- 确认 Chrome 已启动且端口 9222 可访问：`curl -s http://127.0.0.1:9222/json/version`
- 确认 `run-mcp.sh` 可执行：`chmod +x run-mcp.sh`
- 手动测试 MCP server 启动：`./run-mcp.sh --browser-url=http://127.0.0.1:9222`
### ERR_MODULE_NOT_FOUND
- 确认已运行 `npm install`
- 确认已运行 post-build 脚本（生成 `build/node_modules/` 下的 mock 文件）
- 确认 `run-mcp.sh` 中的 `cd` 路径指向仓库根目录

## 关键机制说明

### 为什么不能直接用 `npx chrome-devtools-mcp@latest`？
npm 官方包不包含 debugger 工具。必须使用我们的 fork（`feat/debugger-tools` 分支）。

### Skill MCP 加载机制
oh-my-opencode 的 `skill_mcp` 工具只能访问 **skill 内嵌的 MCP**，不能访问 `opencode.json` 中配置的 MCP。
Skill 内嵌 MCP 有两种方式：
1. skill 目录下放 `mcp.json` 文件（推荐）
2. SKILL.md frontmatter 中添加 `mcp:` 字段
### mcp.json 格式
支持两种格式：
```json
// 格式1：直接定义（推荐）
{
  "server-name": {
    "command": "/path/to/executable",
    "args": ["--arg1", "--arg2"]
  }
}
// 格式2：mcpServers 包装
{
  "mcpServers": {
    "server-name": {
      "command": "/path/to/executable",
      "args": ["--arg1"]
    }
  }
}
```
## 文件结构总览
```
~/.claude/skills/chrome-automation/
├── SKILL.md          # AI 读取的指南（包含工具列表和调用方式）
└── mcp.json          # MCP server 配置（指向本地 fork）

~/chrome-devtools-mcp/        # fork 仓库
├── run-mcp.sh        # MCP 启动脚本
├── src/tools/debugger.ts   # 13个 debugger 工具实现
└── build/            # 编译输出
```
# Instructions

Use the #tool:vscode/askQuestions tool often. Even for simple yes or no questions. If you want to ask how we should proceed, or if we should continue, please use the #tool:vscode/askQuestions tool.

## Rules for TypeScript

- Do not use `any` type.
- Do not use `as` keyword for type casting.
- Do not use `!` operator for type assertion.
- Do not use `// @ts-ignore` comments.
- Do not use `// @ts-nocheck` comments.
- Do not use `// @ts-expect-error` comments.
- Prefer `for..of` instead of `forEach`.

## CRITICAL: No VS Code Proposed APIs

- DO NOT use any VS Code proposed APIs anywhere in the codebase.
- DO NOT add `enabledApiProposals` to any `package.json`.
- DO NOT use the `--enable-proposed-api` CLI flag.
- DO NOT use APIs like `findTextInFiles`, `onDidWriteTerminalData`, or any other proposed API.
- We have NO access to proposed APIs. Using them causes the extension to crash into Safe Mode.
- If a feature requires a proposed API, find an alternative using stable APIs only.

## CRITICAL: Hot Reloading — DO NOT Manually Rebuild

- DO NOT manually run build, compile, install, reinstall, or reload commands.
- DO NOT ask the user to rebuild, reinstall, or reload anything.
- DO NOT run `npm run compile`, `npm run build`, or `ext:reinstall` tasks manually.
- EVERYTHING HAS HOT RELOADING BUILT IN.
- The MCP server automatically detects source changes and rebuilds on the next tool call.
- The Extension Development Host automatically picks up changes.
- Just TEST THE TOOLS DIRECTLY after making code changes.
- If tools aren't available yet, call any MCP tool — it will auto-reload and then work.
- Get straight to testing. Skip all rebuild/reinstall steps. It's all automatic.

ASK QUESTIONS AS OFTEN AS YOU POSSIBLY CAN. DO NOT MAKE ANY ASSUMPTIONS ABOUT THE USERS INTENT OR PREFERENCES. IF THE USER HAS NOT EXPLICITLY PROVIDED CONSENT TO A CHANGE, DO NO PROCEED WITHOUT ASKING FIRST VIA THE #tool:vscode/askQuestions TOOL.
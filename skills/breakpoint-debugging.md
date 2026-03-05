---
name: Breakpoint Debugging
description: Use the Chrome DevTools Debugger to find root causes of bugs by setting breakpoints, inspecting state, and stepping through code.
---

# Breakpoint Debugging Skill

This skill allows you to perform in-depth Root Cause Analysis (RCA) by controlling the Chrome DevTools Debugger. You can pause execution, inspect variables, and step through code to understand exactly why a bug is occurring.

## Tools

-   `debugger_enable`: Enable the debugger for the page. **Must be called first.**
-   `debugger_set_breakpoint`: Set a breakpoint at a specific URL and line number.
-   `debugger_get_paused_state`: Check if the debugger is paused and get the call stack.
-   `debugger_get_scope_variables`: Inspect variables in a specific scope when paused.
-   `debugger_step_over` / `debugger_step_into` / `debugger_step_out`: Control execution.
-   `debugger_resume`: Resume execution.
-   `debugger_evaluate_on_call_frame`: Evaluate expressions in the current context.
-   `debugger_get_code_lines`: Read code around a specific line.

## Root Cause Analysis Workflow

Your objective is to find the **root cause** of an error or bug. Do not stop at the surface level.

1.  **Enable Debugger**: Always start by ensuring the debugger is enabled.
    ```javascript
    // Example
    debugger_enable({})
    ```

2.  **Hypothesize & Set Trap**:
    -   Read the code using `debugger_get_code_lines` (or `read_file` if local) to understand the logic.
    -   Identify the critical line where state corruption likely occurred.
    -   Set a breakpoint on that line.
    ```javascript
    debugger_set_breakpoint({ url: 'http://localhost:8080/app.js', lineNumber: 42 })
    ```

3.  **Trigger & Wait**:
    -   Perform the action that triggers the bug (e.g., clicking a button using `click`).
    -   Check if the debugger is paused using `debugger_get_paused_state`.
    -   **Note**: If `debugger_get_paused_state` returns "Debugger is not paused", wait a moment and try again, or ask the user to trigger the action if you cannot.

4.  **Inspect State (Runtime Mode)**:
    -   Once paused, examine the `callStack` returned by `debugger_get_paused_state`.
    -   Use `debugger_get_scope_variables` to see values of local variables.
    -   Use `debugger_evaluate_on_call_frame` to check specific expressions or deep objects.
    ```javascript
    // Check local variables (scopeIndex 0 is usually Local)
    debugger_get_scope_variables({ callFrameId: '...', scopeIndex: 0 })
    ```

5.  **Step & Trace**:
    -   Use `debugger_step_into` to enter function calls.
    -   Use `debugger_step_over` to advance line-by-line.
    -   Use `debugger_step_out` to return to the caller.
    -   **Always** check `debugger_get_paused_state` and variable values after stepping to see how state changed.

6.  **Verify Root Cause**:
    -   Explain exactly how the runtime state contradicts the expected logic.
    -   Point to the specific line of code that is the root cause.

7.  **Apply Fix & Verify**:
    -   Once the issue is found, you can try to fix it (e.g., by editing the file).
    -   Remove breakpoints using `debugger_remove_breakpoint` or `debugger_remove_all_breakpoints`.
    -   Resume execution with `debugger_resume`.
    -   Verify the fix by reproducing the steps.

## Tips

-   **STATIC MODE** (Reading code) vs **RUNTIME MODE** (Paused): Switch between them. If you need to see a variable, switch to Runtime Mode by setting a breakpoint.
-   **Already Paused?**: If you are already paused, start inspecting immediately.
-   **Step Into**: Essential for investigating function calls on the current line.
-   **Check Location**: Always confirm where you are with `debugger_get_paused_state` after stepping.

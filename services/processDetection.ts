/**
 * Process State Detection Utilities
 *
 * Adapted from DesktopCommanderMCP's process-detection.ts
 * Detects when terminal processes are waiting for user input vs finished vs running.
 *
 * Used by SingleTerminalController to determine terminal state
 * when Shell Integration events alone are insufficient (e.g. mid-command prompts).
 */

export type TerminalStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'waiting_for_input'
  | 'timeout';

export interface ProcessState {
  status: TerminalStatus;
  detectedPrompt?: string;
  exitCode?: number;
  lastOutputLine: string;
}

// Known REPL prompt patterns (from DesktopCommanderMCP)
const REPL_PROMPTS: Record<string, string[]> = {
  python: ['>>> ', '... '],
  node: ['> ', '... '],
  r: ['> ', '+ '],
  julia: ['julia> '],
  shell: ['$ ', '# ', '% '],
  mysql: ['mysql> ', '    -> '],
  postgres: ['=# ', '-# '],
  redis: ['redis> '],
  mongo: ['> '],
};

// Interactive prompt patterns (yes/no, confirmations, password, etc.)
const INTERACTIVE_PROMPT_PATTERNS = [
  /\?\s*$/,                         // Ends with ?
  /\[Y\/n\]\s*$/i,                  // [Y/n]
  /\[y\/N\]\s*$/i,                  // [y/N]
  /\(yes\/no\)\s*$/i,               // (yes/no)
  /\(y\/n\)\s*$/i,                  // (y/n)
  /:\s*$/,                          // Ends with :  (password prompts, etc.)
  /Enter\s+.*:\s*$/i,               // Enter something:
  /Password\s*:\s*$/i,              // Password:
  /passphrase\s*:\s*$/i,            // passphrase:
  /Are you sure\s*\?/i,             // Are you sure?
  /Press\s+.*\s+to\s+continue/i,    // Press any key to continue
  /Continue\s*\?\s*$/i,             // Continue?
  /Overwrite\s*\?\s*$/i,            // Overwrite?
  /proceed\s*\?\s*$/i,              // proceed?
];

// All flattened REPL prompts for fast lookup
const ALL_REPL_PROMPTS = Object.values(REPL_PROMPTS).flat();

/**
 * Analyze terminal output to determine if the process is waiting for user input.
 *
 * This is a heuristic — there is no definitive API to detect stdin reads.
 * We check the last line of output against known prompt patterns.
 */
export function analyzeProcessOutput(output: string): ProcessState {
  if (!output || output.trim().length === 0) {
    return {
      status: 'running',
      lastOutputLine: '',
    };
  }

  const lines = output.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
  const trimmedLastLine = lastLine.trimEnd();

  // Check for REPL prompts
  const detectedRepl = ALL_REPL_PROMPTS.find(
    (prompt) => trimmedLastLine.endsWith(prompt) || trimmedLastLine === prompt.trim(),
  );

  if (detectedRepl) {
    return {
      status: 'waiting_for_input',
      detectedPrompt: trimmedLastLine,
      lastOutputLine: trimmedLastLine,
    };
  }

  // Check for interactive prompt patterns
  for (const pattern of INTERACTIVE_PROMPT_PATTERNS) {
    if (pattern.test(trimmedLastLine)) {
      return {
        status: 'waiting_for_input',
        detectedPrompt: trimmedLastLine,
        lastOutputLine: trimmedLastLine,
      };
    }
  }

  // Default: still running
  return {
    status: 'running',
    lastOutputLine: trimmedLastLine,
  };
}

/**
 * Clean ANSI escape sequences and control characters from terminal output.
 *
 * Strips CSI, OSC, DCS sequences, handles carriage-return overwriting,
 * normalises CRLF, and removes non-printable control characters.
 */
export function cleanTerminalOutput(raw: string): string {
  // CSI sequences: ESC [ <params> <intermediate> <final byte>
  let text = raw.replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '');
  // OSC sequences: ESC ] ... (BEL | ST)
  text = text.replace(/\x1b][\s\S]*?(?:\x07|\x1b\\|\x9c)/g, '');
  // DCS/PM/APC/SOS sequences
  text = text.replace(/\x1b[P^_X][\s\S]*?(?:\x1b\\|\x9c)/g, '');
  // Two-character ESC sequences
  text = text.replace(/\x1b[\x20-\x7e]/g, '');

  // Normalise CRLF → LF
  text = text.replace(/\r\n/g, '\n');

  // Simulate carriage-return overwriting
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('\r')) continue;
    const segments = line.split('\r');
    const chars: string[] = [];
    for (const seg of segments) {
      if (seg === '') continue;
      for (let c = 0; c < seg.length; c++) {
        chars[c] = seg[c];
      }
    }
    lines[i] = chars.join('');
  }
  text = lines.join('\n');

  // Strip remaining non-printable control characters (keep \n and \t)
  text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

  // Collapse runs of 3+ blank lines into 2
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

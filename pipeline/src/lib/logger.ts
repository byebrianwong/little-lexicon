// Small structured logger. Progress and status go to stderr so that any data a
// stage prints to stdout stays clean and pipeable. No silent catches: callers
// log with context (see CLAUDE.md > Code conventions).

type Level = 'info' | 'warn' | 'error' | 'success' | 'debug';

const COLORS: Record<Level, string> = {
  info: '\x1b[36m', // cyan
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  success: '\x1b[32m', // green
  debug: '\x1b[90m', // grey
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const TAG: Record<Level, string> = {
  info: 'info',
  warn: 'warn',
  error: 'FAIL',
  success: ' ok ',
  debug: 'dbg ',
};

export class Logger {
  constructor(private readonly verbose = false) {}

  private write(level: Level, msg: string): void {
    if (level === 'debug' && !this.verbose) return;
    const stamp = new Date().toISOString().slice(11, 19);
    const color = COLORS[level];
    process.stderr.write(`${color}[${stamp} ${TAG[level]}]${RESET} ${msg}\n`);
  }

  info(msg: string): void {
    this.write('info', msg);
  }
  warn(msg: string): void {
    this.write('warn', msg);
  }
  error(msg: string): void {
    this.write('error', msg);
  }
  success(msg: string): void {
    this.write('success', msg);
  }
  debug(msg: string): void {
    this.write('debug', msg);
  }

  /** A visual section header for a stage. */
  stage(name: string): void {
    process.stderr.write(`\n${BOLD}=== ${name} ===${RESET}\n`);
  }
}

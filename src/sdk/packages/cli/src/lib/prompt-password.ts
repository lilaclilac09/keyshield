/**
 * Read a password from the user with input hidden from the terminal.
 * Falls back to non-hidden read if stdin isn't a TTY (CI / pipe).
 */

import readline from 'node:readline';

export async function promptPassword(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    // Non-interactive: read one line from stdin without hiding.
    // (This is what GitHub Actions / CI pipelines see.)
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  // TTY mode: write the prompt, set stdin raw, eat keystrokes one by
  // one so backspace / Enter / Ctrl-C all work like a normal password
  // prompt. We don't echo characters.
  process.stdout.write(question);
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      for (const ch of s) {
        const code = ch.charCodeAt(0);
        if (code === 0x03) {
          // Ctrl-C
          cleanup();
          process.stdout.write('\n');
          reject(new Error('cancelled'));
          return;
        }
        if (code === 0x0d || code === 0x0a) {
          // Enter
          cleanup();
          process.stdout.write('\n');
          resolve(buf);
          return;
        }
        if (code === 0x7f || code === 0x08) {
          // Backspace
          buf = buf.slice(0, -1);
          continue;
        }
        if (code < 0x20) continue; // ignore other control chars
        buf += ch;
      }
    };
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

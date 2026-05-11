// Side-effect module: must be imported before any code that uses Buffer.
//
// @solana/web3.js calls Buffer.from at module load. ES module imports are
// hoisted, so a top-level `globalThis.Buffer = Buffer` statement in
// index.tsx runs AFTER `import App from './App'` has already pulled in
// solana → ReferenceError → blank page. Putting the assignment inside an
// imported module forces it to run during that module's evaluation, which
// happens before the importing module's later imports execute their bodies.
import { Buffer } from 'buffer';

(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

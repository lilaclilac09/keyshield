import { chromium, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.resolve(process.env.PERF_OUT || '/home/ubuntu/perf-out');
const before = path.resolve(process.env.PERF_BEFORE || `${root}-before`);
const after = path.resolve(process.env.PERF_AFTER || `${root}-after`);
const python = process.env.PERF_PYTHON || '/home/ubuntu/perf-venv/bin/python';
const iterations = Number(process.env.PERF_ITERATIONS || 5);
const sha = dir => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
const revisions = { before: sha(before), after: sha(after) };
if (revisions.after !== 'adb3334823f51076105a9bfdb19042c4b867493b') throw Error('Unexpected AFTER revision');
if (revisions.before !== '9c0070ca31a3c4ad3f27ba1046febb4a6e2b1116') throw Error('Unexpected BEFORE revision');
await mkdir(out, { recursive: true });

function service(command, args, cwd, env = {}) {
  // Deliberately discard service output: never persist headers, tokens or cookies.
  return spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'ignore', detached: true });
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const ended = new Promise(resolve => child.once('exit', resolve));
  try { process.kill(-child.pid, 'SIGTERM'); } catch { return; }
  await Promise.race([ended, new Promise(resolve => setTimeout(resolve, 3000))]);
  try { process.kill(-child.pid, 'SIGKILL'); } catch {}
}
async function ready(url, child) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw Error(`Local service exited (${child.exitCode})`);
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('Local service readiness timeout');
}

export function networkSummary(records, start, end) {
  const own = records.filter(r => r.start >= start && r.start < end);
  const intervals = records.filter(r => r.end > start && r.start < end)
    .map(r => [Math.max(start, r.start), Math.min(end, r.end)]).sort((a,b) => a[0]-b[0]);
  let busy = 0, right = start;
  for (const [a,b] of intervals) { busy += Math.max(0, b - Math.max(a,right)); right = Math.max(right,b); }
  return {
    requests: own.length,
    bytes: own.reduce((n,r) => n+r.bytes,0),
    summedMs: intervals.reduce((n,[a,b]) => n+b-a,0),
    busyMs: busy,
    criticalPathMs: intervals.length ? Math.max(...intervals.map(x=>x[1]))-intervals[0][0] : 0,
  };
}

async function journey(revision, index) {
  const dir = revision === 'before' ? before : after;
  const runDir = path.join(out, `${revision}-${index}`);
  await mkdir(runDir, { recursive: true });
  const state = path.join(runDir, 'state');
  await mkdir(state);
  const apiRoot = path.join(state, 'api');
  await mkdir(apiRoot);
  // Some backend modules use __file__-relative DB paths, ignoring KS_DATA_DIR.
  const archive = execFileSync('git', ['archive', revisions.before, 'src/backend'], {cwd:before});
  execFileSync('tar', ['-x', '-C', apiRoot], {input:archive});
  const api = service(python, [path.join(root, 'tests/perf/offline-api.py')], apiRoot, {
    PYTHONPATH: apiRoot, KS_DATA_DIR: state, KS_DB_PATH: path.join(state, 'auth.db'),
    KS_RP_ID: 'localhost', SERVER_SECRET: 'FAKE_KEYSHIELD_SYNTHETIC_SECRET_0123456789',
    KS_MPP_OWNER_KEY_FILE: path.join(state, 'absent-owner'),
    KS_MPP_OWNER_WRAP_FILE: path.join(state, 'absent-wrap'),
  });
  const worker = service('npm', ['run', 'dev', '--workspace=@keyshield/sync-worker', '--',
    '--var', 'JWT_SECRET:FAKE_KEYSHIELD_SYNTHETIC_SECRET_0123456789',
    '--var', 'RP_ID:localhost', '--var', 'RP_ORIGIN:http://localhost:5173',
    '--persist-to', path.join(state, 'worker')], before, { WRANGLER_SEND_METRICS: 'false' });
  const preview = service('npm', ['run', 'preview', '--workspace=keyshield-web-v2', '--',
    '--host', '127.0.0.1', '--port', '5173', '--strictPort'], dir);
  let browser;
  try {
    await Promise.all([ready('http://127.0.0.1:8001/health',api), ready('http://localhost:8787/health',worker), ready('http://localhost:5173/?local=1',preview)]);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: {width:1280,height:800},
      recordVideo: { dir: runDir, size: {width:1280,height:800} }, serviceWorkers:'block' });
    let blockedExternal = 0;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['localhost','127.0.0.1','[::1]'].includes(url.hostname)) return route.continue();
      blockedExternal++;
      return route.abort('blockedbyclient');
    });
    await context.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '[data-testid="extension-token-copy"] code { color: transparent !important; position: relative; } [data-testid="extension-token-copy"] code::after { content: "[REDACTED]"; color: #8a96c2; position: absolute; left: 12px; top: 8px; }';
        document.head.append(style);
      });
      window.__perfLCP = 0;
      new PerformanceObserver(list => { for (const e of list.getEntries()) window.__perfLCP = e.startTime; })
        .observe({type:'largest-contentful-paint',buffered:true});
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', {cacheDisabled:true});
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',
      hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
    const requests = new Map();
    let confirmations = 0;
    cdp.on('WebAuthn.credentialAdded', () => confirmations++);
    cdp.on('WebAuthn.credentialAsserted', () => confirmations++);
    // Only numeric metadata is retained; no URLs, bodies, headers or credentials.
    cdp.on('Network.requestWillBeSent', e => requests.set(e.requestId,
      {start:performance.now(),end:0,bytes:0,type:e.type}));
    cdp.on('Network.loadingFinished', e => {
      const r=requests.get(e.requestId); if(r) {r.end=performance.now();r.bytes=e.encodedDataLength;}
    });
    cdp.on('Network.loadingFailed', e => {const r=requests.get(e.requestId);if(r) r.end=performance.now();});
    const steps=[];
    let actions=0;
    const click = async name => {actions++;await page.getByRole('button',{name,exact:true}).click();};
    const fill = async (placeholder,value) => {actions++;await page.getByPlaceholder(placeholder).fill(value);};
    async function step(name, work) {
      const start=performance.now(), a=actions, c=confirmations;
      await work();
      const end=performance.now();
      steps.push({name,start,end,wallMs:end-start,actions:actions-a,passkeyConfirmations:confirmations-c});
    }
    await step('Open dashboard', async()=>{
      actions++;
      await page.goto('http://localhost:5173/?local=1', {waitUntil:'load'});
      await expect(page.getByRole('button',{name:'Create account',exact:true})).toBeVisible();
    });
    await step('Sign up → Home', async()=>{
      await fill('you@gmail.com',`fake-keyshield-perf-${revision}-${index}@gmail.com`);
      await fill('at least 8 characters','FAKE_KEYSHIELD_NOT_A_PASSWORD::perf');
      await click('Create account');
      await expect(page.getByRole('button',{name:'Vault',exact:true})).toBeVisible();
      await expect(page.getByText('Connecting…',{exact:true})).toHaveCount(0);
    });
    await step('Reach Vault', async()=>{
      await click(revision==='after'?'Open or create vault':'Vault');
      await expect(page.getByText('Your vault is empty',{exact:true})).toBeVisible();
    });
    await step('Create/unlock Device Vault', async()=>{
      if(revision==='before') {
        await click('Add Secret');
        await fill(/paste sk-or/,'FAKE_KEYSHIELD_NOT_A_KEY::perf');
        await click('Save Secret');
      }
      await click('Unlock or create device vault');
      await click('Enroll passkey');
      await expect(page.getByRole('button',{name:'Lock',exact:true})).toBeVisible();
    });
    await step('Save synthetic key → listed', async()=>{
      if(revision==='after') {
        await click('Add Secret');
        await fill(/paste sk-or/,'FAKE_KEYSHIELD_NOT_A_KEY::perf');
      }
      await click('Save Secret');
      await expect(page.getByPlaceholder(/paste sk-or/)).toHaveCount(0);
      await expect(page.getByText('1 saved',{exact:true})).toBeVisible();
      await expect(page.getByText('OpenRouter (Nemotron free)',{exact:true}).first()).toBeVisible();
    });
    const pageLoad=await page.evaluate(()=>{
      const n=performance.getEntriesByType('navigation')[0];
      return {dclMs:n.domContentLoadedEventEnd,loadMs:n.loadEventEnd,lcpMs:window.__perfLCP};
    });
    await page.screenshot({path:path.join(runDir,'final.png')});
    // Allow numeric completion events to arrive without extending visible-done wall time.
    await page.waitForLoadState('networkidle');
    const end=performance.now();
    const records=[...requests.values()].map(r=>({...r,end:r.end||end}));
    pageLoad.jsBytes=records.filter(r=>r.type==='Script').reduce((n,r)=>n+r.bytes,0);
    for(const s of steps) Object.assign(s,networkSummary(records,s.start,s.end));
    const video=page.video();
    await context.close();
    const videoPath=await video.path();
    return {revision,index,sha:revisions[revision],steps,pageLoad,blockedExternal,videoPath,
      total:{wallMs:steps.reduce((n,s)=>n+s.wallMs,0),actions,passkeyConfirmations:confirmations,
        ...networkSummary(records,steps[0].start,steps.at(-1).end)}};
  } finally {
    if(browser) await browser.close();
    await Promise.all([stop(preview),stop(worker),stop(api)]);
  }
}

export function stats(values) {
  const sorted=[...values].sort((a,b)=>a-b), n=sorted.length;
  if(!n) throw Error('No measurements');
  return {median:n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2,min:sorted[0],max:sorted[n-1]};
}
function report(runs) {
  const rows=[];
  const fmt=s=>`${s.median.toFixed(1)} [${s.min.toFixed(1)}–${s.max.toFixed(1)}]`;
  for(const name of [...runs[0].steps.map(s=>s.name),'TOTAL','Page load']) {
    const metrics=name==='Page load'?['dclMs','loadMs','lcpMs','jsBytes']:
      ['actions','passkeyConfirmations','wallMs','requests','bytes','summedMs','busyMs','criticalPathMs'];
    for(const metric of metrics) {
      const values=revision=>runs.filter(r=>r.revision===revision).map(r=>
        (name==='Page load'?r.pageLoad:name==='TOTAL'?r.total:r.steps.find(s=>s.name===name))[metric]);
      const b=stats(values('before')), a=stats(values('after'));
      const overlap=Math.max(a.min,b.min)<=Math.min(a.max,b.max);
      const withinSpread=Math.abs(a.median-b.median)<=Math.max(a.max-a.min,b.max-b.min);
      const verdict=withinSpread||overlap?'no measurable improvement':a.median<b.median?'lower (beyond observed spread)':'higher (beyond observed spread)';
      rows.push(`| ${name} | ${metric} | ${fmt(b)} | ${fmt(a)} | ${verdict} |`);
    }
  }
  return `# Local dashboard journey measurements\n\nBEFORE: \`${revisions.before}\`\nAFTER: \`${revisions.after}\`\n\n${iterations} iterations each, alternating B,A. Values: median [min–max]; times in ms, bytes in bytes.\n\n| Step | Metric | Before | After | Interpretation |\n|---|---|---:|---:|---|\n${rows.join('\n')}\n\n## Method and limitations\n\nFresh Chromium process/context, cold browser cache, 1280×800 video each run; same machine, loopback ports, API and worker code pinned to BEFORE for both UIs. Fresh per-run backend/worker state; services restarted between runs. Production Vite builds, no artificial latency, no human think time. Browser non-loopback requests aborted; Python outbound DNS/connect restricted to loopback. No HAR, traces, headers, cookies, response bodies, storage state or tokens exported.\n\nActions count clicks, filled fields and navigation, not keystrokes; automated passkey confirmations reported separately (add to actions for a human-gesture total). No scrolling counted; Playwright auto-scrolls as needed. CDP virtual authenticator means passkey timings exclude human/OS prompt delay.\n\nNetwork request count/bytes attributed to requests starting in a step (encodedDataLength, including protocol headers where Chrome reports them). Summed time clips all overlapping request intervals to step boundaries. busyMs is their union. criticalPathMs is the observed first-start-to-last-end network span clipped to the step, NOT a causal dependency graph or server CPU time. Failed/blocked requests count with zero bytes. LCP is the last observed initial-load candidate before first input; DCL/load use Navigation Timing; JS bytes from CDP Script transfers over the journey.\n\nPath: both use synthetic email signup, then Home → Vault → explicit PRF passkey enrollment. Passkey-only signup was probed but its credential did not return PRF. Email signup DOES work when using explicit Enroll passkey (not the direct Unlock control). BEFORE uses sidebar Vault; AFTER uses Home's Open or create vault CTA. BEFORE only exposes setup after Add Secret → enter synthetic key → Save Secret fails locked-vault gate → Unlock or create device vault → Enroll passkey; then retries Save Secret. AFTER exposes setup immediately in Vault → Unlock or create device vault → Enroll passkey; then Add Secret → enter key → Save Secret. Thus key entry necessarily occurs before enrollment only in BEFORE; per-step attribution reflects that, totals are comparable. No provider Call/Save + Call buttons used.\n\nSpread rule: overlapping observed min/max ranges are labelled **no measurable improvement**; these five samples are descriptive, not statistical proof. Non-overlap alone is not proof of a general performance benefit.\n\nBuild caveat: npm ci fails due to preexisting lockfile drift; install with --package-lock=false. Full build:web fails preexisting TypeScript BufferSource errors on both revisions; identical build:vite production bundling used instead.\n`;
}

async function main() {
const runs=[];
for(let i=1;i<=iterations;i++) for(const revision of ['before','after']) {
  const run=await journey(revision,i);runs.push(run);
  await writeFile(path.join(out,'results.json'),JSON.stringify({revisions,iterations,runs},null,2));
  console.log(`${revision} ${i}: ${run.total.wallMs.toFixed(1)} ms; ${run.total.actions} actions; ${run.total.passkeyConfirmations} passkey confirmations`);
}
await writeFile(path.join(out,'results.md'),report(runs) + '\nIsolation detail: each run extracts the unchanged BEFORE backend via git archive into its own state directory, because several backend modules ignore KS_DATA_DIR and use source-relative database paths. The median-difference spread test also labels differences within the larger individual min/max width as no measurable improvement, even when the ranges do not overlap.\n');
for(const revision of ['before','after']) {
  const candidates=runs.filter(r=>r.revision===revision);
  const median=stats(candidates.map(r=>r.total.wallMs)).median;
  const representative=candidates.sort((a,b)=>Math.abs(a.total.wallMs-median)-Math.abs(b.total.wallMs-median))[0];
  await copyFile(representative.videoPath,path.join(out,`${revision}.webm`));
  await copyFile(path.join(out,`${revision}-${representative.index}`,'final.png'),path.join(out,`${revision}.png`));
  execFileSync('ffmpeg',['-y','-i',path.join(out,`${revision}.webm`),'-c:v','libx264','-pix_fmt','yuv420p',
    '-movflags','+faststart',path.join(out,`${revision}.mp4`)],{stdio:'ignore'});
  console.log(`${revision}: representative iteration ${representative.index}`);
}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

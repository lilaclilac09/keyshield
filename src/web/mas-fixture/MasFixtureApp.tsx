import { createFixtureSession, FIXTURE_ENTRY } from './vault';

declare const __KEYSHIELD_RENDERER_PROFILE__: string;

export async function renderMasFixtureApp(root: HTMLElement) {
  const desktop = (window as unknown as { keyshieldDesktop?: { syntheticOnly?: boolean } }).keyshieldDesktop;
  if (__KEYSHIELD_RENDERER_PROFILE__ !== 'mas-fixture' || desktop?.syntheticOnly !== true) {
    root.innerHTML = '<main data-testid="fixture-refusal"><h1>Fixture unavailable</h1><p>This renderer requires the mas-fixture build and an explicitly synthetic-only desktop host. Nothing was opened.</p></main>';
    return;
  }
  const vault = createFixtureSession({
    getItem: key => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  });
  let busy = true;
  function render() {
    const state = vault.snapshot();
    root.innerHTML = `<main>
    <h1>KeyShield synthetic fixture</h1>
    <p>Offline demonstration only. No accounts, real provider keys, passkeys or sync services are accepted or used.</p>
    <p>Public bundled seed: demonstrates lock mechanics only, not real protection.</p>
    <h2>${state.locked ? 'Fixture vault locked' : 'Fixture vault unlocked'}</h2>
    <button data-testid="fixture-lock" ${busy || state.locked || state.error ? 'disabled' : ''}>Lock</button>
    <button data-testid="fixture-unlock" ${busy || !state.locked || state.error ? 'disabled' : ''}>Unlock fixture vault</button>
    ${state.error ? '<p role="alert">Fixture data rejected. Nothing was opened or imported. Stored data was not overwritten.</p>' : `<section aria-label="Built-in synthetic selection">
      <button data-testid="fixture-entry" ${busy || state.locked || state.entry ? 'disabled' : ''}>Demo key</button>
      <p role="status">${state.entry ? 'Demo key saved on this device.' : 'Unlock, then select the one built-in fake entry to see the vault flow.'}</p>
    </section>`}
    </main>`;
    const run = async (action: () => Promise<void>) => {
      if (busy) return;
      busy = true;
      render();
      await action();
      busy = false;
      render();
    };
    root.querySelector<HTMLButtonElement>('[data-testid="fixture-lock"]')!.onclick = () => { void run(vault.lock); };
    root.querySelector<HTMLButtonElement>('[data-testid="fixture-unlock"]')!.onclick = () => { void run(vault.unlock); };
    const select = root.querySelector<HTMLButtonElement>('[data-testid="fixture-entry"]');
    if (select) select.onclick = () => { void run(() => vault.save(FIXTURE_ENTRY)); };
  }
  render();
  await vault.init();
  busy = false;
  render();
}

/**
 * Visible in-app feedback for unlock / save / copy / proxy / MPP.
 * Same bus on the live dashboard and in the Mac DMG; the Electron shell
 * also mirrors events as a native notification when the window is unfocused.
 */

export type AppFeedbackKind = 'success' | 'error' | 'info' | 'busy';
export type AppFeedbackSource = 'unlock' | 'save' | 'copy' | 'proxy' | 'mpp' | 'auth' | 'health';

export type AppFeedback = {
  kind: AppFeedbackKind;
  title: string;
  detail?: string;
  source?: AppFeedbackSource;
};

export const APP_FEEDBACK_EVENT = 'ks-app-feedback';

export function emitAppFeedback(fb: AppFeedback): void {
  if (typeof window === 'undefined' || !fb?.title) return;
  window.dispatchEvent(new CustomEvent(APP_FEEDBACK_EVENT, { detail: fb }));
  try {
    window.keyshieldDesktop?.notify?.(fb);
  } catch {
    /* browser, or preload without notify */
  }
}

export function subscribeAppFeedback(listener: (fb: AppFeedback) => void): () => void {
  const onEvent = (event: Event) => {
    const detail = (event as CustomEvent<AppFeedback>).detail;
    if (detail?.title) listener(detail);
  };
  window.addEventListener(APP_FEEDBACK_EVENT, onEvent);
  return () => window.removeEventListener(APP_FEEDBACK_EVENT, onEvent);
}

export async function copyWithFeedback(text: string): Promise<boolean> {
  try {
    const desktopWrite = typeof window !== 'undefined' ? window.keyshieldDesktop?.writeText : undefined;
    if (desktopWrite) {
      await desktopWrite(text);
    } else {
      await navigator.clipboard.writeText(text);
    }
    emitAppFeedback({ kind: 'success', title: 'Copied', source: 'copy' });
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      emitAppFeedback({ kind: 'success', title: 'Copied', source: 'copy' });
      return true;
    } catch {
      emitAppFeedback({ kind: 'error', title: 'Copy failed', source: 'copy' });
      return false;
    }
  }
}

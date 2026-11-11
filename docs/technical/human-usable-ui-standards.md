# Human-usable UI standards (desktop + web)

These standards define minimum UX behavior for user-triggered actions in KeyShield.
They are acceptance criteria, not design suggestions.

## 1) Waiting states are explicit

For any action that can take more than 400ms (network, passkey, wallet signature, save/reveal):

- UI must show a waiting state within 100ms (spinner, busy label, or explicit "waiting" text).
- Trigger control must become non-repeatable while pending (disabled or equivalent gate).
- Waiting copy must tell the user what to do next (for example, "approve signature in wallet popup").

## 2) Completion feedback is deterministic and readable

Both desktop shell and web toast feedback should remain visible long enough to read:

- `success`: >= 6500ms
- `info`: >= 5000ms
- `error`: >= 9000ms
- `busy`: remains visible until replaced by a completion or cancellation state

Feedback may be queued, but completion messages must never disappear instantly after action completion.

## 3) No silent no-op after user intent

If a user clicks a control and the requested action cannot start:

- show a visible error/info message immediately
- include the reason and a concrete next step
- never fail only in console logs

Examples:
- missing key input
- cancelled wallet/passkey prompt
- app window absent during second-instance activate

## 4) Errors must be actionable

Error copy must include one clear next step. Avoid only technical fragments like
"TypeError: Failed to fetch" without guidance.

Required pattern:

`<what failed>. Next step: <user action>`

## 5) Focus/foreground behavior on desktop (macOS)

For auth and re-open flows:

- successful Touch ID unlock should foreground and focus the app window
- second-instance activation should foreground an existing window, or recreate one if none exists
- if foregrounding fails, surface a visible error in shell feedback

## 6) Test coverage expectation

Every UX change touching these standards must include or update automated tests for:

- waiting state presence/labels
- feedback visibility timing policy
- actionable error copy (includes "Next step:")
- desktop focus/restore behavior where relevant

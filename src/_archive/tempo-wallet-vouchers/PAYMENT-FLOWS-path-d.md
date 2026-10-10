## Path D — Tempo wallet session (TIP-1034 v2)

**When:** a Tempo wallet already holds an open channel and can sign a cumulative voucher. Same latency goal as MPP: no 402 retry.

**Specs:** `draft-httpauth-payment-01` and `draft-tempo-session-00` (`sessionProtocol: "v2"`). The older v1 contract channel is not accepted.

1. The proxy's 402, when `KS_TEMPO_PAYEE` is set, includes `WWW-Authenticate: Payment` with `method="tempo"`, `intent="session"`, and `header="Payment-Authorization"`. The KeyShield bearer stays in `Authorization`.
2. The wallet sends `Payment-Authorization: Payment <base64url credential>`.
3. `ks-proxy` checks the echoed header, payee, escrow, currency, chain, channel id, low-s signature, and a cumulative amount that does not go backwards.
4. The accepted amount is written to `tempo_vouchers.db` before the upstream call. A restart cannot treat an old voucher as a new payment.
5. The response carries `x-ks-pay: tempo`.

Defaults when the matching env var is unset: escrow `0x4D50500000000000000000000000000000000000`, currency pathUSD `0x20c0000000000000000000000000000000000000`, chain `4217`. `KS_TEMPO_PAYEE` is required. `KS_TEMPO_DB` overrides the voucher book.

# Subscription plans

People pay for a plan. Platform calls draw down the calls included in that plan. A call made with the user's own key is outside the plan. The breakdown shows where this month's platform calls went. It does not price each call.

Source of the numbers: `src/backend/billing/plans.py`.

## Plans

| Id | Name | Monthly | Included platform calls | Agents | Notes |
|---|---|---|---|---|---|
| `personal` | Personal | $29 | 40,000 | 1 | Starting plan when none has been chosen |
| `operate` | Operate | $89 | 200,000 | 8 | Marked `recommended`. MPP streams included |
| `floor` | Floor | $240 | 1,000,000 | no cap | MPP streams and Tempo settlement included |

Until `POST /billing/subscription` runs, the account is reported as Personal with `"selected": false`.

## Endpoints

All of these use the same bearer session as the rest of the API. With no session the user id is `default`, matching the other billing routes.

```
GET  /billing/plans
GET  /billing/subscription
POST /billing/subscription     { "plan": "personal" | "operate" | "floor" }
GET  /billing/breakdown
```

`POST` with an unknown id returns `400` and `{"detail": "unknown plan"}`.

## Breakdown

`GET /billing/breakdown` is the transparency API. The month is the current UTC calendar month.

- `allowance.used_calls` counts rows in `usage_log` for this user, this month, `key_type = platform`.
- `own_keys.calls` is every other key type. Those calls do not draw the allowance.
- `by_upstream[].share_pct` is that upstream's share of this month's platform calls. The shares are the cost breakdown.
- `settlement.monthly_usd` is the plan price. `settlement.headline` is the sentence the dashboard shows.
- `settlement.calls_outside_plan` is the count past the allowance. When that count is above zero and a higher plan includes the volume, `covers_with` is that plan id and the headline names it.
- `audit.recorded_platform_usd` is the sum of `cost_usd` on platform rows. It is a record of upstream cost. The plan already covers calls inside the allowance.

The Plan screen (`src/web/components/sections/PlanSection.tsx`) renders the three plans, the allowance, and the upstream shares. It does not list a price per call.

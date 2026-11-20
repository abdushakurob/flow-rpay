# `@rpay/flow`

TypeScript SDK for [Flow by RPay](https://github.com/abdushakurob/flow-rpay).

```ts
import { Flow, verifyWebhook } from "@rpay/flow";

const flow = new Flow({ apiKey: process.env.FLOW_API_KEY!, baseUrl: "https://your-api" });

const checkout = await flow.checkouts.create(
  { amount: "1000", description: "Demo", reference: "order_1" },
  "idem-order_1",
);
```

Amounts are integer satoshis (strings). Local withdrawals use Flow’s server-side payout path — pass only your Flow API key.

**Not published yet.** From the monorepo: `pnpm --filter @rpay/flow build`, then `npm publish` from `packages/sdk` when ready.

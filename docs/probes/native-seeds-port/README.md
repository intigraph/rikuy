# Native Seeds process demonstration

Before: the settlement port had no executable receipt reader; its synthetic fixtures could not join native proof to the Seeds transition.

After: the retained actual qualification joins a native verified receipt through a separately spawned HTTPS reader to one atomic Seeds transaction, durable reservation, wrong-binding refusal and read-only recovery. `result.json` contains the observed results. Keys remained in memory and all stores were disposable.

This uses a native store helper behind the loopback transport and an in-memory Seeds backend. Production root deployment selection, actual HTTP scoped writer grants, revocation and production acceptance remain unqualified.

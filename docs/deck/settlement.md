# Settling an Ask in Seeds

**Status: built, switched off.** Public Today cards are read-only until a
deployment supplies admitted signing and settlement adapters. The source
browser tests use synthetic receipt, writer and native ports. They are not a
human ceremony or production acceptance.

**In short.** Signing an answer records what the person chose. *Settlement* is
the second half: it closes the Ask in Seeds and writes the ruling onto the
work item the Ask was blocking. Only a Choose settles. Later and Comment never
close an Ask.

Background: [Signed decisions](../book/src/signed-decisions.md) and the
[request and answer contract](contract.md).

## What a request adds for settlement

A curated Ask request can include:

```text
settlement: {target, targetRevision}
```

`target` is the work item the Ask unblocks. Both items must use canonical
Seeds IDs under the admitted item prefix.

With settlement present, the signed proposal changes in two ways:

- It adds the target's exact IRI and revision as answer facts.
- It adds a sixth condition: the target is still at that revision.

Publishing the request also guards that revision.

Requests without `settlement` keep the five-condition contract. A receipt for
the five-condition contract can never establish settlement authority.

## What the reader does

- It reads the linked item with the existing exact item query, before and
  after reading answers. This adds two bounded item calls, so production
  read-cost admission is still required.
- A changed item with no admitted choice is refused.
- After a verified choice, earlier answers stay readable even once settlement
  advances or closes the Ask. That history does not prove settlement happened.
- The original request, boundary and proposal are kept privately. Copying an
  answer object or changing nested proposal data cannot rebind it.

## How settlement is applied

`applySettlement` accepts only an answer admitted by the full native receipt
reader for the exact request and boundary.

The work is done by an injected *native port*. It must:

1. Independently verify the full receipt, both revisions, identity, deadline,
   and the graph and store lineage and generation.
2. Own durable one-send custody of the write.
3. Call Seeds' `ask_settlement::settle` for the first attempt, or
   `ask_settlement::reconcile` for read-only recovery.

The native adapter maps the browser's camelCase fields to the Rust request.
The browser's data is not evidence that the native side admitted anything.

This source selects no production adapter, endpoint, credential, enrollment
or writer scope.

## What counts as proof

The native result must prove all of:

- the graph;
- both item IDs and their advanced revisions;
- the exact receipt;
- one linked comment position.

The native transition supplies these only after its atomic batch and a
read-back of both items. The browser keeps the signed pending intent until
this proof succeeds.

## When something goes wrong

| Situation | What happens |
|---|---|
| The write's outcome is uncertain | The signed intent stays pending in the browser |
| The person presses *Recover receipt* | A read-only reconciliation runs. The transition is never sent again. |
| A crash before the first native send | The intent can stay unproven until an operator handles it |
| Evidence is absent | Absence is never treated as permission to retry |

A separate *Check linked ruling* action is also read-only.

## What the card says

The card tells a signed choice apart from a closed Ask. It says the Ask is
closed only after the native settlement has been read back.

The preview is off by default. Today can use a deployment's Ask adapter only
when that is explicitly enabled. Before it shows any controls, it checks the
curated request against the card's exact graph, item, revision, unblocks
target and expiry.

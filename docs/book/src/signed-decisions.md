# Signed decisions

A signed decision is an answer to a question that a person, and only that
person, could have given. This page follows one decision from the card to the
record. All of it is built and switched off; see
[Implementation status](status.md).

## The idea

Agents sometimes need a ruling from a person. In Seeds that is an **Ask**: a
question with options, a recommended option, a default that applies if nobody
answers, and an expiry. Rikuy shows each Ask as a card.

Answering a card must be provable. A click alone is not an answer, and there
is no software-key fallback. The answer is signed by a
**passkey** on the person's own device, and Quipu checks that signature before
it writes anything.

## The steps

1. **A request is published.** A small job called the *curator* writes the
   question, its options and its current revision into a request graph.
2. **The card appears.** The page reads the request and the work item it is
   about, and shows the card.
3. **The person chooses.** They pick an option, pick *Later*, or leave a
   comment.
4. **Quipu issues a challenge.** The page sends the proposed answer. Quipu
   stores it and returns the exact bytes to sign, with a short deadline.
5. **The passkey signs.** The device asks for a fingerprint, face or PIN, then
   signs. There is no software-key fallback.
6. **Quipu commits.** In one step it checks the signature, checks that nothing
   changed since the card was drawn, writes the answer and records a receipt.
   If any check fails, it writes no answer and records the refusal for audit.
7. **The page confirms.** It reads the receipt and the written facts back
   before it says the answer was accepted.
8. **Seeds settles.** If the person chose an option, the Ask closes and the
   ruling is written onto the work item it unblocks. *Later* and comments do
   not close an Ask.

## What makes it safe

| Risk | What stops it |
|---|---|
| Someone else answers | Only an enrolled passkey verifies, and it needs the person's fingerprint, face or PIN |
| A copied page on another site | The signature is tied to one exact origin |
| The same answer sent twice | Each challenge is used once |
| The card is out of date | The commit compares the request and the work item with what the card showed, and refuses if either changed |
| The item was already closed | The commit checks the item is still open |
| A second answer to the same question | The "decided" slot must be empty, and the first answer fills it |
| The reply is lost on the way back | The page never signs or sends again. It looks up the receipt instead. |

## Enrolling a passkey

A passkey is registered once per device, by hand.

1. The person opens the enrollment page and creates a passkey. The page shows
   its public key and a short fingerprint. It sends nothing anywhere.
2. An operator registers that public key in Quipu with a command-line tool,
   and says which graphs it may write and when it expires.
3. The operator and the person compare fingerprints.

The page accepts only passkeys that stay on one device. A passkey that syncs
to a cloud account is declined. When choosing a signing device, check that it
can create a passkey that stays on the device.

## What Quipu knows

By design, Quipu knows nothing about questions, cards or options. It offers one general
feature, the *attested write*: a normal write that is accepted only if an
enrolled person signed its exact content. Everything about Asks lives in
Rikuy and Seeds. That move is not finished: Quipu still carries its older
`/deck/` routes. [Deck boundary](https://github.com/intigraph/rikuy/blob/main/docs/design/deck-boundary.md)
tracks the remaining steps.

## The detail

| Document | Read it for |
|---|---|
| [Deck boundary](https://github.com/intigraph/rikuy/blob/main/docs/design/deck-boundary.md) | The design and the reasons behind it |
| [Request and answer contract](https://github.com/intigraph/rikuy/blob/main/docs/deck/contract.md) | Exactly what is signed and checked |
| [Curator](https://github.com/intigraph/rikuy/blob/main/docs/deck/curator.md) | How requests are published |
| [Reader](https://github.com/intigraph/rikuy/blob/main/docs/deck/reader.md) | How the page reads within fixed limits |
| [Settlement](https://github.com/intigraph/rikuy/blob/main/docs/deck/settlement.md) | How a choice closes the Ask in Seeds |
| [Enrollment ceremony](https://github.com/intigraph/rikuy/blob/main/docs/enrollment/ceremony.md) | Creating and registering a passkey |
| [Admission](https://github.com/intigraph/rikuy/blob/main/docs/deck/admission/README.md) | The checklist before signing is turned on |

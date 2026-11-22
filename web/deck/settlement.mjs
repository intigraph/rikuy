import {Unknown, exact, integer} from './value.mjs';
import {request, scope} from './model.mjs';
import {disposition} from './evidence.mjs';

// No production implementation or transport is selected. This trusted native
// port invokes Seeds' ask_settlement API, verifies the receipt itself and owns
// durable one-send custody. Browser DTOs are never native admission authority.
export function settlementBinding(answer, ask, boundary) {
  const b = scope(boundary), r = request(ask, b);
  const view = disposition([answer], r, b);
  if (!r.settlement || view.state !== 'ANSWERED' || answer.action !== 'choose') throw new Unknown('No admitted choice with both item bindings');
  const id = value => {
    const result = value.slice(b.itemPrefix.length);
    if (!/^[A-Za-z0-9_.-]{1,256}$/.test(result)) throw new Unknown('Noncanonical Seeds item ID');
    return result;
  };
  return Object.freeze({graph: b.itemGraph, ask: id(r.seed), askRevision: r.itemRevision,
    target: id(r.settlement.target), targetRevision: r.settlement.targetRevision, receipt: answer.receiptIri});
}

// Any uncertain send is recovered ONLY through the explicit read-only method.
// The native port reserves before sending; this layer never retries or resets it.
export async function applySettlement({enabled = false, native, answer, ask, boundary, recover = false} = {}) {
  if (enabled !== true || !native || typeof native.settle !== 'function' || typeof native.reconcile !== 'function') throw new Unknown('Native Seeds settlement is not admitted; disabled');
  if (typeof recover !== 'boolean') throw new Unknown('Explicit recovery mode required');
  const binding = settlementBinding(answer, ask, boundary);
  const result = await (recover ? native.reconcile(binding) : native.settle(binding));
  exact(result, ['graph', 'ask', 'askRevision', 'target', 'targetRevision', 'receipt', 'commentIndex', 'complete']);
  if (result.complete !== true || result.graph !== binding.graph || result.ask !== binding.ask || result.target !== binding.target || result.receipt !== binding.receipt ||
      integer(result.askRevision) < binding.askRevision + 1 || integer(result.targetRevision) < binding.targetRevision + 1) throw new Unknown('Atomic Seeds settlement read-back is unproven; reconcile only');
  integer(result.commentIndex);
  return Object.freeze({...result});
}

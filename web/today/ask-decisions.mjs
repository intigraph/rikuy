import {mount} from '../deck/view.mjs';
import {readRequest, scope} from '../deck/model.mjs';
import {GRAPH} from './knowledge/model.mjs';

// A deployment may inject an admitted signer/reader/native Seeds adapter.
// No factory, transport, enrollment or writer is selected in the public build.
export async function mountAskDecision(root, row, adapter) {
  if (row.kind !== 'ask' || typeof adapter !== 'function') throw Error('Typed Ask and admitted adapter required');
  const deps = await adapter(Object.freeze({...row}));
  // A refusing adapter states why; the card shows that reason on disabled choices.
  if (deps?.enabled !== true || typeof deps.read !== 'function' || !deps.nativeSettlement) throw Object.assign(Error('Decision adapter is not admitted'), {reason: typeof deps?.reason === 'string' ? deps.reason : 'Signing not admitted on this deployment'});
  const b = scope(deps.boundary), read = deps.read;
  const checkedRead = async () => {
    const bundle = await read(), r = readRequest(bundle?.requestRow, b);
    if (b.itemGraph !== GRAPH || b.itemPrefix !== 'https://seeds.local/item/' ||
        r.seed !== row.item || r.itemRevision !== Number(row.revision) ||
        r.settlement?.target !== row.unblocks || r.expiresAt !== Date.parse(row.expires) / 1000) throw Object.assign(Error('Curated decision does not match the displayed Ask'), {reason: 'Decision refused · the curated request does not match this card'});
    return bundle;
  };
  // Do not display signing controls until the exact card/request binding reads.
  const first = await checkedRead(); let initial = true;
  return mount(root, {...deps, read: async () => {
    if (initial) {initial = false; return first;}
    return checkedRead();
  }});
}

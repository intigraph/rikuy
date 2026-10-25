import {Unknown, NS, sha256} from './value.mjs';
import {scope, readRequest, buildProposal} from './model.mjs';
import {identity, readAnswer, disposition} from './evidence.mjs';

// The deployment supplies bounded admitted readers and a durable PendingWrite.
// No endpoint, raw query, credential, enrollment or automatic retry is here.
export async function mount(root, {enabled = false, boundary, identity: who, read, writer, now = () => Math.floor(Date.now() / 1000)} = {}) {
  const document = root.ownerDocument;
  const node = (tag, text) => {const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n;};
  const status = node('p', 'Preview · signing is not configured.'), body = node('section');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  root.replaceChildren(status, body);
  if (enabled !== true) return;
  const b = scope(boundary), operator = identity(who);
  if (typeof read !== 'function' || !writer || JSON.stringify(identity(writer.identity)) !== JSON.stringify(operator)) throw new Unknown('Admitted reader and matching durable writer required');
  let bundle, r, admitted = [], busy = false;
  const pending = () => writer.store.get();
  const disable = () => body.querySelectorAll('button').forEach(button => button.disabled = true);
  const settle = async result => {
    if (result?.state !== 'ACCEPTED') {status.textContent = 'Pending · receipt or read-back UNKNOWN. Use Recover receipt; do not sign again.'; return;}
    await refresh();
    const op = result.proposal.datums.find(d => d.p === NS + 'operationId')?.o.value;
    if (!admitted.some(a => a.operationId === op && a.receiptIri === result.proof.receiptIri)) throw new Unknown('Accepted intent is not in the current reader view');
    await writer.acknowledge(); await refresh();
  };
  const run = async operation => {
    if (busy) return;
    busy = true; root.setAttribute('aria-busy', 'true'); disable();
    try {await operation();}
    catch {status.textContent = 'UNKNOWN · retained intent and source evidence need reconciliation.';}
    finally {
      busy = false;
      try {await controls();} catch {disable(); status.textContent = 'UNKNOWN · durable intent storage unavailable.';}
      root.setAttribute('aria-busy', 'false');
    }
  };
  async function controls() {
    const record = await pending();
    body.querySelectorAll('[data-action]').forEach(button => button.disabled = busy || !!record || body.dataset.state !== 'WAITING');
    const recover = body.querySelector('[data-recover]'); if (recover) recover.disabled = busy || !record;
    const cancel = body.querySelector('[data-cancel]'); if (cancel) cancel.disabled = busy || record?.state !== 'PENDING';
  }
  async function refresh() {
    const next = await read();
    if (next?.complete !== true || !Array.isArray(next.rows) || next.rows.length > 100) throw new Unknown('Incomplete request/answer read');
    const nextRequest = readRequest(next.requestRow, b);
    const answers = await Promise.all(next.rows.map(({row, receipt}) => readAnswer(row, receipt, nextRequest, b, operator)));
    const view = disposition(answers, nextRequest, b);
    bundle = next; r = nextRequest; admitted = answers;
    body.replaceChildren(); body.dataset.state = view.state;
    body.append(node('h1', r.title), node('p', `Revision ${r.revision} · ${view.state}`));
    const note = node('textarea'); note.maxLength = 4096; note.setAttribute('aria-label', 'Comment');
    body.append(note);
    const addAction = (label, action, optionLabel = null) => {
      const button = node('button', label); button.dataset.action = action; button.disabled = true;
      button.addEventListener('click', () => run(async () => {
        const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
        const operationId = await sha256(bytes);
        const p = buildProposal({boundary: b, ask: r, freshItem: bundle.freshItem, signer: operator.signer, action: {operationId, action, optionLabel, comment: note.value}, now: now()});
        status.textContent = 'Waiting for your authenticator. A lost response stays pending.';
        await settle(await writer.submit(p, r.expiresAt));
      }));
      body.append(button);
    };
    if (r.actions.includes('choose')) for (const choice of r.options) addAction(choice, 'choose', choice);
    if (r.actions.includes('later')) addAction('Later', 'later');
    if (r.actions.includes('comment')) addAction('Add comment', 'comment');
    const recover = node('button', 'Recover receipt'); recover.dataset.recover = ''; recover.disabled = true;
    recover.addEventListener('click', () => run(async () => settle(await writer.reconcile())));
    const cancel = node('button', 'Cancel unsigned attempt'); cancel.dataset.cancel = ''; cancel.disabled = true;
    cancel.addEventListener('click', () => run(async () => {await writer.cancelUnsigned(); await refresh();}));
    body.append(recover, cancel);
    for (const comment of view.comments) body.append(node('p', `${comment.actor} · ${new Date(comment.recordedAt * 1000).toISOString()}: ${comment.text}`));
    status.textContent = view.state === 'WAITING' ? 'Current request · no admitted decision.' : view.state === 'LATER' ? 'Later · retained in the visible Later state.' : `Answered · ${view.answer.actor} · ${new Date(view.answer.recordedAt * 1000).toISOString()}`;
    await controls();
  }
  try {await refresh();}
  catch {body.replaceChildren(); status.textContent = 'UNKNOWN · request or verified answer evidence unavailable.';}
}

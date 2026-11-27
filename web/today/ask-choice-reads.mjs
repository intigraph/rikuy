// Decision-card OPTIONS/REC reads: at most `limit` in flight, and a failed
// read is remembered by seed@revision so that a feed re-render does not
// re-queue it. Only an explicit retry (the card's Retry button) reads again.
// A new revision is a new key and reads normally.
export function choiceReads(read, {limit = 2} = {}) {
  const queue = [], failed = new Set();
  let active = 0;
  const key = row => `${row.item}@${row.revision}`;
  const pump = () => {
    while (active < limit && queue.length) {
      const next = queue.shift(); active++;
      Promise.resolve().then(next).finally(() => {active--; pump();});
    }
  };
  const enqueue = (row, done) => {
    const k = key(row);
    queue.push(() => read(row.item, row.revision).then(
      found => {failed.delete(k); done({state: 'read', options: found?.options || '', rec: found?.rec || ''});},
      () => {failed.add(k); done({state: 'failed'});}));
    pump();
    return {state: 'loading'};
  };
  return {
    // The state the card starts in: loading (a read was queued) or failed (a
    // previous read of this seed@revision failed; nothing was queued).
    request: (row, done) => failed.has(key(row)) ? {state: 'failed'} : enqueue(row, done),
    retry: (row, done) => {failed.delete(key(row)); return enqueue(row, done);}
  };
}

// Source-only job, with explicit injected governed transport and reader.
// No endpoint, credential, timer or production adapter is selected here.
import {open, lstat, realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';
import {publicationPlan, publicationReport, publicationReadback} from '../web/deck/curator.mjs';
import {Unknown, iri, text, exact, integer} from '../web/deck/value.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
export class CuratorJob {
  constructor({directory, storeId, registration, inspect, send, readBack}) {
    if (typeof directory !== 'string' || typeof inspect !== 'function' || typeof send !== 'function' || typeof readBack !== 'function') throw new Unknown('Explicit custody and governed adapters required');
    exact(registration, ['iri', 'creation']); iri(registration.iri);
    exact(registration.creation, ['actor', 'timestamp']); text(registration.creation.timestamp);
    if (registration.creation.actor !== null) text(registration.creation.actor);
    this.registration = structuredClone(registration); this.inspect = inspect;
    this.directory = resolve(directory); this.storeId = iri(storeId); this.send = send; this.readBack = readBack;
  }
  async publish(input) {return this.run(input, false);}
  async reconcile(input) {return this.run(input, true);}
  async run(input, readOnly) {
    const plan = publicationPlan(readOnly ? {...input, now: 0} : input), payload = JSON.stringify({storeId: this.storeId, registration: this.registration, plan});
    if (this.registration.iri !== plan.boundary.requestGraph) throw new Unknown('Foreign configured graph');
    const admitted = await this.inspect(this.registration.iri);
    const graph = admitted.graph; integer(graph?.g);
    if (admitted.storeId !== this.storeId || graph.iri !== this.registration.iri || graph.class !== 'committed' || JSON.stringify(graph.creation) !== JSON.stringify(this.registration.creation)) throw new Unknown('Unregistered or replaced publication target');
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700 || await realpath(this.directory) !== this.directory) throw new Unknown('Owned private custody directory required');
    // Same request revision has ONE custody slot, including changed payloads.
    const key = hash(JSON.stringify([this.storeId, plan.boundary.requestGraph, plan.next.id, plan.next.revision]));
    const path = join(this.directory, key + '.json');
    const record = {state: 'UNKNOWN', digest: hash(payload), storeId: this.storeId, registration: this.registration, plan};
    const bytes = JSON.stringify(record) + '\n';
    if (Buffer.byteLength(bytes) > 131072) throw new Unknown('Publication custody too large');
    let fresh = false, handle;
    try {
      if (readOnly) {const error = new Error('Reconciliation requires retained custody'); error.code = 'EEXIST'; throw error;}
      handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await handle.writeFile(bytes); await handle.sync();
      await handle.close(); handle = null;
      const dir = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY);
      try {await dir.sync();} finally {await dir.close();}
      fresh = true;
    } catch (error) {
      if (handle) await handle.close();
      if (error.code !== 'EEXIST') throw error;
      const retained = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      let existing;
      try {
        const stat = await retained.stat();
        if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.size > 131072) throw new Unknown('Invalid retained custody');
        existing = JSON.parse(await retained.readFile('utf8'));
      } finally {await retained.close();}
      if (existing.state !== 'UNKNOWN' || existing.digest !== record.digest || JSON.stringify({storeId: existing.storeId, registration: existing.registration, plan: existing.plan}) !== payload) throw new Unknown('Changed or incomplete publication custody');
    }
    let report = null;
    if (fresh) {
      try {report = await this.send(plan.query); publicationReport(report, plan);} catch {return {state: 'UNKNOWN', sent: true, transaction: null};}
    }
    // Retained UNKNOWN never resends. Read-only reconciliation is repeatable.
    try {
      const observed = await this.readBack(plan.next.id);
      if (observed.storeId !== this.storeId) throw new Unknown('Foreign store readback');
      publicationReadback(observed.requestRow, plan);
      return {state: 'CONFIRMED', sent: fresh, transaction: report?.tx ?? null};
    } catch {return {state: 'UNKNOWN', sent: fresh, transaction: null};}
  }
}

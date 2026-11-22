// Resolve only artifacts present in the complete Cargo producer inventory.
// An ambiguous serde_json build requires an explicit file+hash pin; rustc must
// still prove that this exact crate's types link to the selected Quipu library.
export function nativeLibraries(raw, {path, sha256} = {}, hashFile) {
  const candidates = new Map();
  for (const line of raw.split('\n')) {
    let record; try {record = JSON.parse(line);} catch {continue;}
    if (record.reason !== 'compiler-artifact' || record.profile?.test || !record.target?.kind?.includes('lib') || !['quipu', 'serde_json'].includes(record.target.name)) continue;
    const files = record.filenames.filter(p => p.endsWith('.rlib'));
    if (files.length !== 1) throw Error('Ambiguous library artifact outputs');
    if (!candidates.has(record.target.name)) candidates.set(record.target.name, new Set());
    candidates.get(record.target.name).add(files[0]);
  }
  const result = new Map();
  for (const name of ['quipu', 'serde_json']) {
    const files = [...(candidates.get(name) ?? [])];
    if (!files.length) throw Error('Candidate library artifact missing');
    if (name === 'serde_json' && (path !== undefined || sha256 !== undefined)) {
      if (typeof path !== 'string' || !/^[0-9a-f]{64}$/.test(sha256 ?? '') || !files.includes(path) || typeof hashFile !== 'function' || hashFile(path) !== sha256) throw Error('Explicit serde_json producer pin failed');
      result.set(name, path);
    } else {
      if (files.length !== 1) throw Error('Ambiguous candidate library population; explicit serde_json file+hash required');
      result.set(name, files[0]);
    }
  }
  return result;
}

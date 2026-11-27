// Pure: turn an Ask's text into the choices a decision card offers.
// Sources, in order: the seed's OPTIONS excerpt, a "(a / b / c)" title form,
// then the fallback Yes / No. Later and Comment are always offered. A REC
// excerpt marks at most one choice; an ambiguous REC marks none.
// Nothing here reads, writes or signs. Labels are plain text for textContent.

const MAX_CHOICES = 8, MAX_LABEL = 120, MAX_WHY = 200;
const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const clip = (value, max) => value.length > max ? value.slice(0, max - 1).trimEnd() + '…' : value;
const slug = value => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'choice';

// "(1) a (2) b", "1) a 2) b", "(a) x (b) y", "A) x B) y", "A: x B: y", "A. x B. y".
// Markers must run in sequence from the first (1, 2, 3 or a, b, c) so that
// ordinary prose such as "(see below)" is not mistaken for a choice list.
function markedList(text) {
  const pattern = /(?:^|[\s;,])\(?([1-8]|[A-Ha-h])(?:\)|:|\.(?=\s))\s+/g, marks = [];
  for (const m of text.matchAll(pattern)) marks.push({key: m[1].toLowerCase(), start: m.index + m[0].length, at: m.index});
  const run = [];
  for (const mark of marks) {
    const expected = run.length ? String.fromCharCode(run[0].key.charCodeAt(0) + run.length) : null;
    if (!run.length ? mark.key === '1' || mark.key === 'a' : mark.key === expected) run.push(mark);
  }
  if (run.length < 2) return null;
  return run.map((mark, i) => ({key: mark.key, label: clean(text.slice(mark.start, run[i + 1]?.at ?? text.length).replace(/[;,.]\s*$/, ''))}));
}
function splitList(text) {
  for (const separator of [/\s*\|\s*/, /\s+\/\s+/, /\s*;\s*/]) {
    const parts = text.split(separator).map(clean).filter(Boolean);
    if (parts.length >= 2) return parts.map(label => ({key: null, label}));
  }
  return null;
}
function fromOptions(options) {
  // The point read's excerpt may run on into the REC line or a later paragraph.
  const text = clean(String(options || '').split(/\n\s*\n/)[0].split(/\b(?:REC|RECOMMENDATION)\s*:/i)[0]);
  if (!text) return null;
  return markedList(text) || splitList(text);
}
function fromTitle(title) {
  for (const m of clean(title).matchAll(/\(([^()]{3,240})\)/g)) {
    const parts = m[1].split(/\s+\/\s+|\s*\/\s*(?=\S)/).map(clean).filter(Boolean);
    if (parts.length >= 2 && parts.length <= MAX_CHOICES && parts.every(p => p.length <= MAX_LABEL)) return parts.map(label => ({key: null, label}));
  }
  return null;
}
function usable(list) {
  if (!list) return null;
  const seen = new Set(), result = [];
  for (const {key, label} of list) {
    const text = clip(label, MAX_LABEL), folded = text.toLowerCase();
    if (!text || seen.has(folded)) continue;
    seen.add(folded); result.push({key, label: text});
  }
  return result.length >= 2 && result.length <= MAX_CHOICES ? result : null;
}
// REC forms: "B", "(2)", "option A", "A — because…", or the start of a label.
function recommend(rec, choices) {
  const text = clean(rec);
  if (!text) return {index: -1, why: ''};
  const marker = text.match(/^(?:option\s+)?\(?([1-8]|[A-Ha-h])\)?(?=$|[\s:.,;)—–-])/i);
  let hits = [], keyed = false;
  if (marker) {
    const key = marker[1].toLowerCase();
    hits = choices.flatMap((c, i) => c.key === key ? [i] : []);
    if (!hits.length && /^[1-8]$/.test(key) && Number(key) <= choices.length && choices.every(c => c.key === null)) hits = [Number(key) - 1];
    keyed = hits.length > 0;
  }
  const low = text.toLowerCase(), escape = v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!hits.length) hits = choices.flatMap((c, i) => new RegExp('(?:^|\\W)' + escape(c.label.toLowerCase()) + '(?=$|\\W)').test(low) ? [i] : []);
  // A label contained in another mentioned label ("Yes" in "Yes, later") is not
  // a separate mention. Two independent mentions are ambiguous: mark none.
  hits = hits.filter(i => !hits.some(j => j !== i && choices[j].label.toLowerCase().includes(choices[i].label.toLowerCase())));
  const why = !keyed ? text : clean(text.replace(/^(?:option\s+)?\(?[1-8A-Ha-h]\)?(?=$|[\s:.,;)—–-])/i, '').replace(/^[\s:.,;—–-]+/, ''));
  return {index: hits.length === 1 ? hits[0] : -1, why};
}

export function askChoices({title = '', options = '', rec = '', default: fallbackDefault = ''} = {}) {
  let source = 'options', list = usable(fromOptions(options));
  if (!list) {source = 'title'; list = usable(fromTitle(title));}
  if (!list) {source = 'fallback'; list = [{key: null, label: 'Yes'}, {key: null, label: 'No'}];}
  const {index, why} = recommend(rec, list);
  const choices = list.map((c, i) => Object.freeze({id: `choose-${i + 1}-${slug(c.label)}`, action: 'choose', label: c.label, recommended: i === index}));
  const reasons = [why && 'Recommended: ' + clip(why, MAX_WHY), clean(fallbackDefault) && 'If unanswered: ' + clip(clean(fallbackDefault), MAX_WHY)].filter(Boolean).slice(0, 2);
  return Object.freeze({
    source,
    choices: Object.freeze([...choices,
      Object.freeze({id: 'later', action: 'later', label: 'Later', recommended: false}),
      Object.freeze({id: 'comment', action: 'comment', label: 'Comment', recommended: false})]),
    recommended: index >= 0 ? choices[index].id : null,
    why: Object.freeze(reasons)
  });
}

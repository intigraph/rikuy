import test from 'node:test';
import assert from 'node:assert/strict';
import {askChoices} from './ask-choices.mjs';

const labels = r => r.choices.filter(c => c.action === 'choose').map(c => c.label);
const rec = r => r.choices.filter(c => c.recommended).map(c => c.label);

test('numbered OPTIONS with a numbered REC mark exactly one choice', () => {
  const r = askChoices({title: 'ASK Stiwi: which store?', options: ' (1) Keep the current store (2) Move to the shared applier (3) Defer a week\nREC: (2) because it removes a second copy', rec: '(2) because it removes a second copy'});
  assert.equal(r.source, 'options');
  assert.deepEqual(labels(r), ['Keep the current store', 'Move to the shared applier', 'Defer a week']);
  assert.deepEqual(rec(r), ['Move to the shared applier']);
  assert.equal(r.recommended, 'choose-2-move-to-the-shared-applier');
  assert.deepEqual(r.why, ['Recommended: because it removes a second copy']);
});

test('lettered OPTIONS on one line with a "option B" REC', () => {
  const r = askChoices({options: 'A) Ship behind the flag B) Ship on by default C) Hold', rec: 'option B — the flag is already tested'});
  assert.deepEqual(labels(r), ['Ship behind the flag', 'Ship on by default', 'Hold']);
  assert.deepEqual(rec(r), ['Ship on by default']);
});

test('colon-lettered OPTIONS stop at an inline REC', () => {
  const r = askChoices({options: 'A: rotate now; B: rotate at the window REC: A', rec: 'A'});
  assert.deepEqual(labels(r), ['rotate now', 'rotate at the window']);
  assert.deepEqual(rec(r), ['rotate now']);
});

test('pipe-separated OPTIONS with a label REC', () => {
  const r = askChoices({options: 'Blue | Green', rec: 'Blue'});
  assert.deepEqual(labels(r), ['Blue', 'Green']);
  assert.deepEqual(rec(r), ['Blue']);
});

test('title "(a / b / c)" form when no OPTIONS were recorded', () => {
  const r = askChoices({title: 'ASK Stiwi: merge the readers (yes / no / split)', rec: 'split'});
  assert.equal(r.source, 'title');
  assert.deepEqual(labels(r), ['yes', 'no', 'split']);
  assert.deepEqual(rec(r), ['split']);
});

test('fallback Yes / No with Later and Comment always present', () => {
  const r = askChoices({title: 'ASK Stiwi: approve the rollout?'});
  assert.equal(r.source, 'fallback');
  assert.deepEqual(r.choices.map(c => c.id), ['choose-1-yes', 'choose-2-no', 'later', 'comment']);
  assert.equal(r.recommended, null);
  assert.deepEqual(r.why, []);
});

test('fallback REC "yes" marks Yes; default becomes the second why line', () => {
  const r = askChoices({title: 'Approve?', rec: 'Yes, it is reversible', default: 'Keep the current setting'});
  assert.deepEqual(rec(r), ['Yes']);
  assert.deepEqual(r.why, ['Recommended: Yes, it is reversible', 'If unanswered: Keep the current setting']);
});

test('malformed OPTIONS fall through: one item, out-of-sequence markers, prose', () => {
  assert.equal(askChoices({options: '(1) only one choice'}).source, 'fallback');
  assert.equal(askChoices({options: '(2) starts late (3) then this'}).source, 'fallback');
  assert.equal(askChoices({options: 'See the notes for details (none recorded)'}).source, 'fallback');
  assert.equal(askChoices({options: 42, rec: {}, title: null}).source, 'fallback');
  assert.equal(askChoices().source, 'fallback');
});

test('an ambiguous or unmatched REC marks nothing', () => {
  assert.deepEqual(rec(askChoices({options: 'Blue | Green', rec: 'Blue or Green, either works'})), []);
  assert.deepEqual(rec(askChoices({options: 'Blue | Green', rec: 'Red'})), []);
  assert.deepEqual(rec(askChoices({options: '(1) a (2) b', rec: '(5)'})), []);
});

test('REC maps to at most one choice and ids are deterministic', () => {
  const input = {options: 'Yes | Yes, later | No', rec: 'Yes, later is safer'};
  const r = askChoices(input);
  assert.equal(r.choices.filter(c => c.recommended).length, 1);
  assert.deepEqual(rec(r), ['Yes, later']);
  assert.deepEqual(askChoices(input), r);
  assert.equal(new Set(r.choices.map(c => c.id)).size, r.choices.length);
});

test('labels and choice count are bounded; duplicates collapse', () => {
  const long = 'x'.repeat(400);
  const r = askChoices({options: `${long} | Short | short`});
  assert.equal(labels(r)[0].length, 120);
  assert.deepEqual(labels(r).slice(1), ['Short']);
  const nine = Array.from({length: 9}, (_, i) => 'opt' + i).join(' | ');
  assert.equal(askChoices({options: nine}).source, 'fallback');
});

test('unspaced slashes in a title parenthetical are not choices', () => {
  for (const title of ['ASK Stiwi: fix the import (web/today/home.mjs)', 'ASK Stiwi: keep the rule (and/or)', 'ASK Stiwi: split the cards (3/3/2)']) {
    const r = askChoices({title});
    assert.equal(r.source, 'fallback', title);
    assert.deepEqual(labels(r), ['Yes', 'No'], title);
  }
});

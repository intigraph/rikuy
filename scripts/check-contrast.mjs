// WCAG AA contrast for every console token pair (aegis-xwm C). Fails CI when a
// declared pair is under its ratio, when a pair names a missing token, or when a
// colour token in tokens.css is used in no checked pair.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const file=resolve(import.meta.dirname,'../web/console/tokens.css');
const tokens=Object.fromEntries([...readFileSync(file,'utf8').matchAll(/--(c-[a-z]+):\s*(#[0-9a-f]{6})/gi)].map(m=>[m[1],m[2]]));
// [foreground, background, minimum, where]. Text is 4.5:1; component boundaries 3:1.
export const PAIRS=[
  ['c-cord','c-field',4.5,'title, byline rail text'],
  ['c-cord','c-panel',4.5,'ask text, ghost pill label'],
  ['c-dim','c-field',4.5,'feed label, byline'],
  ['c-dim','c-panel',4.5,'tile labels, ask terms, status'],
  ['c-dim','c-hatch',4.5,'unknown tile text on hatch stripe'],
  ['c-dim','c-panel',3,'ghost pill border'],
  ['c-live','c-field',4.5,'live panel heading'],
  ['c-ask','c-field',4.5,'ask panel heading'],
  ['c-quiet','c-field',4.5,'quiet panel heading'],
  ['c-fail','c-panel',4.5,'failure metric value'],
  ['c-field','c-live',4.5,'rail number on live rail'],
  ['c-field','c-ask',4.5,'rail number on ask rail, filled pill label'],
  ['c-field','c-quiet',4.5,'rail number on quiet rail'],
  ['c-field','c-cord',4.5,'rail number on cord rail'],
];
const lum=hex=>{const [r,g,b]=[1,3,5].map(i=>{const c=parseInt(hex.slice(i,i+2),16)/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;};
export const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
const problems=[];
for(const [fg,bg,min,where] of PAIRS){
  if(!tokens[fg]||!tokens[bg]){problems.push(`missing token in ${fg}/${bg}`);continue;}
  const r=ratio(tokens[fg],tokens[bg]);
  console.log(`${r>=min?'ok  ':'FAIL'} ${fg} on ${bg} ${r.toFixed(2)}:1 (>= ${min}) ${where}`);
  if(r<min)problems.push(`${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
}
const used=new Set(PAIRS.flatMap(([f,b])=>[f,b]));
for(const name of Object.keys(tokens))if(!used.has(name))problems.push(`--${name} is in no checked pair`);
if(!Object.keys(tokens).length)problems.push('no colour tokens found');
if(problems.length){console.error('Contrast check failed:\n'+problems.join('\n'));process.exit(1);}
console.log(`WCAG AA: ${PAIRS.length} token pairs pass over ${Object.keys(tokens).length} tokens.`);

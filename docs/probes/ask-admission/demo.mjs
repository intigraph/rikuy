import {readFileSync} from 'node:fs';
import {assessPacket} from '../../../scripts/admission/ask-packet.mjs';
const packet = JSON.parse(readFileSync(new URL('../../deck/admission/example.json', import.meta.url)));
console.log('Preparation source fixture; no endpoint, credential or key operation');
const report = assessPacket(packet);
console.log(`Complete inventory: ${report.selected.length} selected, ${report.unknown.length} UNKNOWN; runtimeAuthorized=${report.runtimeAuthorized}`);
packet.pins[0].value = 'guessed-runtime-pin';
try {assessPacket(packet); throw Error('Guessed pin unexpectedly passed');}
catch (e) {if(e.message==='Guessed pin unexpectedly passed')throw e; console.log('Guessed UNKNOWN value refused:', e.message);}
packet.pins[0].value = null;
packet.mode = 'GO';
try {assessPacket(packet); throw Error('Runtime mode unexpectedly passed');}
catch (e) {if(e.message==='Runtime mode unexpectedly passed')throw e; console.log('Runtime GO refused:', e.message);}

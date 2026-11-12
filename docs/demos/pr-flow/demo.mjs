// Synthetic presentation demo: node docs/demos/pr-flow/demo.mjs
import {prFlowLine,readPRFlow} from '../../../web/knowledge/pr-flow.mjs';
const now=Date.parse('2026-11-12T20:00:00Z');
const source={schema:'chaski.github.pr-flow/v1',state:'observed',graph:'urn:example:github',
 checked_at:new Date(now).toISOString(),scope:{repos:['example/project'],window_days:30,basis:'observed activity window'},
 unknown_repos:[],counts:{approved:1},oldest_age_seconds:7200,records:[{
 repo:'example/project',pr:1,head:'a'.repeat(40),state:'approved',age_seconds:7200,
 first_review_at:'2026-11-12T18:00:00Z',observed_head_to_first_review_seconds:1800,
 since:'2026-11-12T18:00:00Z',source_observed_at:'2026-11-12T19:59:00Z'}]};
let reads=0;
const request=async()=>{reads++;return source;};
console.log('Disabled:',prFlowLine(await readPRFlow({config:{},request,now})), 'reads:',reads);
const prFlow={enabled:true,url:'https://reader.example.test/pr-flow.json',graph:source.graph,
 sourceVersion:'synthetic-source',registrationReceipt:'synthetic-registration',readCostReceipt:'synthetic-cost',maxAgeSeconds:900};
console.log('Admitted fixture:',prFlowLine(await readPRFlow({config:{prFlow},request,now})), 'reads:',reads);

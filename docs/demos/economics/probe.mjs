import {summarize} from '../../../web/economics/model.mjs';
const start='2026-01-01T00:00:00Z',at=Date.parse(start)/1000;
const rows=[10,20,30].map((seconds,i)=>({name:`eph-task-demo${i}`,job:'task',harness:'codex',state:'done',spawned_at:at+i,ended_at:at+i+seconds,deadline:at+i+600,max_turns:10,max_context_k:100,request_id:'one',cause:i===1?'timeout':'report',verdict:i===1?'blocked':'done',...(i?{retry_of:'eph-task-demo0'}:{})}));
const s=summarize({version:'ephemeral-economics/v1',window:{start,end:'2026-01-02T00:00:00Z'},observed_at:at+400,complete:true,unknown:[],attempts:rows});
console.log(JSON.stringify({attempts:s.spawned,work_requests:s.work_requests,retries:s.retries,median_seconds:s.cohorts[0].p50,p90_seconds:s.cohorts[0].p90,exhaustion:s.cohorts[0].exhaustion_ratio,tokens:s.tokens.state,savings:s.savings.state},null,2));

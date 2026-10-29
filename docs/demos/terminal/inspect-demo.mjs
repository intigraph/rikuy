import {demoRows,verifiedDemo} from '../../../scripts/demo-data.mjs';
import {validateRows} from '../../../web/legacy/model.mjs';
if(process.argv[2]==='reject'){
 const bad=demoRows();bad.rows[0].curator='foreign';let rejected=false;
 try{validateRows(bad);}catch(error){rejected=true;console.log(error.message);}
 if(!rejected)throw new Error('wrong-curator fixture was accepted');
}else{
 const rows=verifiedDemo();
 console.log(`Validated synthetic brief: ${rows.filter(r=>r.collection==='priorities').length} priorities, ${rows.filter(r=>r.collection==='asks').length} decision.`);
 for(const row of rows)console.log(row.collection+': '+(row.payload.title||row.payload.ask));
 console.log('No graph connection, signing or production data.');
}

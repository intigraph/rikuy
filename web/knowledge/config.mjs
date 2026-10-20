// Root changes these only after reviewed definitions, bounded served-plan
// admission and actual new-view smoke. No URL/localStorage activation switch.
export const config=Object.freeze({enabled:false,endpoint:'http://localhost:3030',
  sourceVersion:null,registration:null,readCostReceipt:null,
  watches:Object.freeze({enabled:false,graph:'urn:quipu:graph:root',registrationReceipt:null,readCostReceipt:null})});

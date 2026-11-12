// Root changes these only after reviewed definitions, bounded served-plan
// admission and actual new-view smoke. No URL/localStorage activation switch.
export const config=Object.freeze({enabled:false,endpoint:'http://localhost:3030',
  sourceVersion:null,registration:null,readCostReceipt:null,
  prFlow:Object.freeze({enabled:false,url:null,graph:null,sourceVersion:null,
    registrationReceipt:null,readCostReceipt:null,maxAgeSeconds:900}),
  watches:Object.freeze({enabled:false,graph:'urn:quipu:graph:root',registrationReceipt:null,readCostReceipt:null})});

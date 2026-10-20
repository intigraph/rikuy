// Deployment-owned, immutable source configuration. No URL/storage activation.
export const contract=Object.freeze({graph:'urn:rikuy:demo:brief',rowPrefix:'urn:rikuy:demo:row:',source:'urn:rikuy:demo:source',curator:'demo',itemPrefix:'demo-',statsSourceHash:null,statsCoverage:[]});
export const config=Object.freeze({enabled:false,endpoint:'http://localhost:3030',graph:contract.graph,transport:'poll',pollMs:15000,refreshMs:5000,bodyBytes:524288,feedBytes:262144,registration:null,boundedSeed:false,watermarkBootstrap:false});

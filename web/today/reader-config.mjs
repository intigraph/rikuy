// Deployment-owned admission: public builds never start live readers.
export const enabled=false;
export const readerOrigin=location.origin;
export const liveFeed=false;

// Signing and native settlement require a separately admitted deployment factory.
export const askDecisionsEnabled=false;

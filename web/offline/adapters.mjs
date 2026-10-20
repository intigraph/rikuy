import {Unsupported} from './protocol.mjs';
export async function connect(){
  throw new Unsupported('Quipu offline snapshot/enrollment/settlement adapter is not delivered. No online-challenge or unsigned graph-write fallback is permitted.');
}

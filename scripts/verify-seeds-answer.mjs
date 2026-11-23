// Read-only executable for a separately admitted Seeds process boundary.
// No credential, writer, default endpoint or production profile is selected.
import https from 'node:https';
import {exact} from '../web/deck/value.mjs';
import {readerTransport} from '../web/deck/reader.mjs';
import {verifySeedsAnswer} from './admission/verify-seeds-answer.mjs';

const controller = new AbortController();
const deadline = setTimeout(() => {controller.abort(); process.stdin.destroy();}, 7000);
try {
  const parts = []; let size = 0;
  for await (const part of process.stdin) {
    size += part.length; if (size > 65536) throw Error('Input bound'); parts.push(part);
  }
  const input = JSON.parse(Buffer.concat(parts).toString('utf8'));
  exact(input, ['schema', 'binding', 'reader', 'tlsCaPem']);
  if (input.schema !== 'seeds-native-verifier/v1' || input.tlsCaPem !== null && (typeof input.tlsCaPem !== 'string' || input.tlsCaPem.length > 32768)) throw Error('Profile');
  const fetcher = (address, options) => new Promise((resolve, reject) => {
    const url = new URL(address);
    const req = https.request(url, {method: options.method, headers: options.headers, signal: controller.signal,
      ...(input.tlsCaPem ? {ca: input.tlsCaPem} : {})}, response => {
      const chunks = []; let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 262144) {response.destroy(); req.destroy(); reject(Error('Response bound'));}
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), {status: response.statusCode, headers: response.headers})));
    });
    req.on('error', reject); if (options.body) req.write(options.body); req.end();
  });
  const request = readerTransport(input.reader.endpoint, fetcher);
  const result = await verifySeedsAnswer({binding: input.binding, profile: input.reader, request, signal: controller.signal});
  process.stdout.write(JSON.stringify(result) + '\n');
} catch {
  process.stderr.write('Native answer verification refused; no writer was invoked.\n'); process.exitCode = 1;
} finally {clearTimeout(deadline); controller.abort();}

// Raw request body for the Twilio webhooks (config bodyParser:false): the
// signature covers the exact bytes Twilio sent, so nothing may parse it first.
// Capped at 64 KB; a Twilio form post is a few KB.
export function readRawBody(req) {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size <= 64 * 1024) chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

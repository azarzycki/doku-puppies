// Evaluate a JavaScript expression inside the app's WebView over Chrome DevTools (debug builds expose it; run.sh
// forwards the WebView's DevTools socket to port 9222 first). Prints the value as JSON. Exit 1 when there is no page
// or the expression throws. A promise is awaited. Needs Node 22+ (global fetch and WebSocket).
//   node page.mjs "document.title"
const expr = process.argv[2];
const port = process.env.DEVTOOLS_PORT || 9222;
let targets;
try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); }
catch (e) { console.error('no devtools on port ' + port + ':', e.message); process.exit(1); }
const t = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
if (!t) { console.error('no page target among', JSON.stringify(targets.map(t => t.type + ' ' + t.url))); process.exit(1); }
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('websocket failed')); });
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
const msg = await new Promise(resolve => { ws.onmessage = m => resolve(JSON.parse(m.data)); });
ws.close();
const d = msg.result?.exceptionDetails;
if (d) { console.error('threw:', d.exception?.description || d.text); process.exit(1); }
console.log(JSON.stringify(msg.result?.result?.value ?? null));

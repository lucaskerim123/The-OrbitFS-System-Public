import http from 'node:http';
import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const publicPort = 1033;
const appPort = 1034;
const backendPort = 4174;

const app = spawn(process.execPath, ['build'], {
  cwd: process.cwd(),
  env: { ...process.env, HOST: host, PORT: String(appPort), ORIGIN: 'https://orbitfs.incendiarynetworks.cc' },
  stdio: 'inherit',
  windowsHide: true
});

app.on('exit', (code) => {
  console.error(`OrbitFS production app exited with code ${code}`);
  process.exit(code ?? 1);
});

const server = http.createServer((req, res) => {
  const isApi = req.url === '/api' || req.url?.startsWith('/api/');
  const targetPort = isApi ? backendPort : appPort;
  const upstream = http.request({
    hostname: host,
    port: targetPort,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: `${host}:${targetPort}` }
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on('error', (error) => {
    console.error('Proxy error:', error.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'OrbitFS upstream unavailable' }));
  });
  req.pipe(upstream);
});

server.listen(publicPort, host, () => {
  console.log(`OrbitFS main server listening on http://${host}:${publicPort}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  app.kill();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
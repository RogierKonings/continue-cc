const http = require('http');
const url = require('url');

const PORT = 3001;

const mockResponses = {
  '/auth/token': {
    access_token: 'mock_access_token_123',
    refresh_token: 'mock_refresh_token_456',
    expires_in: 3600,
    token_type: 'Bearer'
  },
  '/completions': {
    completion: {
      id: 'mock_completion_123',
      text: '// This is a mock completion from the development server',
      stop_reason: 'stop_sequence',
      model: 'claude-3-sonnet'
    }
  },
  '/health': {
    status: 'ok',
    version: '1.0.0-mock',
    timestamp: new Date().toISOString()
  }
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  console.log(`[Mock Server] ${req.method} ${pathname}`);
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const delay = parsedUrl.query.delay ? parseInt(parsedUrl.query.delay) : 100;
  
  setTimeout(() => {
    if (mockResponses[pathname]) {
      res.writeHead(200);
      res.end(JSON.stringify(mockResponses[pathname]));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found', path: pathname }));
    }
  }, delay);
});

server.listen(PORT, () => {
  console.log(`[Mock Server] Claude Code API mock server running on http://localhost:${PORT}`);
  console.log('[Mock Server] Available endpoints:');
  Object.keys(mockResponses).forEach(endpoint => {
    console.log(`  - ${endpoint}`);
  });
});

process.on('SIGTERM', () => {
  console.log('[Mock Server] Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
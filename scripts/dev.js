#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logProcess(name, message, color = 'reset') {
  console.log(`${colors[color]}[${name}]${colors.reset} ${message}`);
}

async function checkDependencies() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
  
  if (!fs.existsSync(nodeModulesPath)) {
    log('Dependencies not found. Installing...', 'yellow');
    return new Promise((resolve, reject) => {
      const install = spawn('npm', ['install'], {
        cwd: path.join(__dirname, '..'),
        shell: true,
        stdio: 'inherit'
      });
      
      install.on('close', (code) => {
        if (code === 0) {
          log('Dependencies installed successfully!', 'green');
          resolve();
        } else {
          reject(new Error('Failed to install dependencies'));
        }
      });
    });
  }
  
  log('Dependencies found ✓', 'green');
}

function createProcess(name, command, args, color) {
  const proc = spawn(command, args, {
    cwd: path.join(__dirname, '..'),
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe']
  });
  
  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => logProcess(name, line, color));
  });
  
  proc.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => logProcess(name, `ERROR: ${line}`, 'red'));
  });
  
  proc.on('error', (error) => {
    logProcess(name, `Failed to start: ${error.message}`, 'red');
  });
  
  proc.on('close', (code) => {
    if (code !== 0 && code !== null) {
      logProcess(name, `Exited with code ${code}`, 'red');
    }
  });
  
  return proc;
}

async function main() {
  console.clear();
  log('🚀 Claude Code Continue - Development Environment', 'bright');
  log('================================================\n', 'bright');
  
  try {
    // Check dependencies
    await checkDependencies();
    
    // Check if TypeScript is compiled
    const outDir = path.join(__dirname, '..', 'out');
    if (!fs.existsSync(outDir)) {
      log('Building extension...', 'yellow');
      const buildProc = spawn('npm', ['run', 'compile'], {
        cwd: path.join(__dirname, '..'),
        shell: true,
        stdio: 'inherit'
      });
      
      await new Promise((resolve) => {
        buildProc.on('close', resolve);
      });
    }
    
    log('\nStarting development processes...', 'cyan');
    
    const processes = [];
    
    // Start TypeScript compiler in watch mode
    processes.push(createProcess('TSC', 'npm', ['run', 'watch'], 'blue'));
    
    // Start extension watcher with nodemon
    setTimeout(() => {
      processes.push(createProcess('Extension', 'npm', ['run', 'watch:extension'], 'green'));
    }, 2000);
    
    // Start webpack dev server for webview
    setTimeout(() => {
      processes.push(createProcess('Webview', 'npm', ['run', 'watch:webview'], 'magenta'));
    }, 3000);
    
    // Start mock API server
    setTimeout(() => {
      processes.push(createProcess('Mock API', 'node', ['src/dev/mockServer.js'], 'yellow'));
    }, 4000);
    
    log('\n✅ All processes started!', 'green');
    log('📝 Open VSCode and press F5 to launch the extension', 'cyan');
    log('🔧 Webview DevTools available at: http://localhost:9000', 'cyan');
    log('🌐 Mock API server running at: http://localhost:3001', 'cyan');
    log('\nPress Ctrl+C to stop all processes\n', 'yellow');
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      log('\n\nShutting down development environment...', 'yellow');
      processes.forEach(proc => {
        try {
          proc.kill('SIGTERM');
        } catch (e) {
          // Process might already be dead
        }
      });
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    });
    
  } catch (error) {
    log(`\nError: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
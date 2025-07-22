#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkCommand(command, minVersion = null) {
  try {
    const version = execSync(`${command} --version`, { encoding: 'utf8' }).trim();
    
    if (minVersion) {
      const versionMatch = version.match(/(\d+)\.(\d+)\.(\d+)/);
      if (versionMatch) {
        const [, major, minor] = versionMatch;
        const [minMajor, minMinor] = minVersion.split('.');
        
        if (parseInt(major) < parseInt(minMajor) || 
            (parseInt(major) === parseInt(minMajor) && parseInt(minor) < parseInt(minMinor))) {
          return { success: false, version, message: `Version ${minVersion} or higher required` };
        }
      }
    }
    
    return { success: true, version };
  } catch (error) {
    return { success: false, message: 'Not installed' };
  }
}

function checkFile(filePath, description) {
  const fullPath = path.join(__dirname, '..', filePath);
  if (fs.existsSync(fullPath)) {
    return { success: true, message: 'Found' };
  }
  return { success: false, message: 'Not found' };
}

function checkVSCodeVersion() {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
    );
    const requiredVersion = packageJson.engines.vscode;
    return { success: true, version: requiredVersion };
  } catch (error) {
    return { success: false, message: 'Could not read package.json' };
  }
}

async function main() {
  console.clear();
  log('🔍 Claude Code Continue - Environment Validation', 'bright');
  log('================================================\n', 'bright');
  
  const checks = [
    {
      name: 'Node.js',
      check: () => checkCommand('node', '18.0'),
      required: true
    },
    {
      name: 'npm',
      check: () => checkCommand('npm', '8.0'),
      required: true
    },
    {
      name: 'TypeScript',
      check: () => checkCommand('tsc'),
      required: true
    },
    {
      name: 'Git',
      check: () => checkCommand('git'),
      required: false
    },
    {
      name: 'VSCode Engine',
      check: checkVSCodeVersion,
      required: true
    },
    {
      name: 'package.json',
      check: () => checkFile('package.json', 'Package configuration'),
      required: true
    },
    {
      name: 'tsconfig.json',
      check: () => checkFile('tsconfig.json', 'TypeScript configuration'),
      required: true
    },
    {
      name: 'node_modules',
      check: () => checkFile('node_modules', 'Dependencies'),
      required: false
    },
    {
      name: '.vscode/launch.json',
      check: () => checkFile('.vscode/launch.json', 'Debug configuration'),
      required: true
    }
  ];
  
  let hasErrors = false;
  let hasWarnings = false;
  
  for (const item of checks) {
    process.stdout.write(`Checking ${item.name}... `);
    const result = await item.check();
    
    if (result.success) {
      log('✓', 'green');
      if (result.version) {
        log(`  └─ ${result.version}`, 'blue');
      }
    } else {
      if (item.required) {
        log('✗', 'red');
        hasErrors = true;
      } else {
        log('⚠', 'yellow');
        hasWarnings = true;
      }
      log(`  └─ ${result.message || 'Failed'}`, item.required ? 'red' : 'yellow');
    }
  }
  
  console.log('');
  
  if (hasErrors) {
    log('❌ Environment validation failed!', 'red');
    log('Please fix the errors above before continuing.', 'red');
    process.exit(1);
  } else if (hasWarnings) {
    log('⚠️  Environment validation passed with warnings.', 'yellow');
    log('Some optional components are missing but development can continue.', 'yellow');
  } else {
    log('✅ Environment validation passed!', 'green');
    log('Your development environment is properly configured.', 'green');
  }
  
  // Additional tips
  console.log('\n📝 Quick tips:');
  console.log('  • Run "npm install" to install dependencies');
  console.log('  • Run "npm run dev" to start the development environment');
  console.log('  • Press F5 in VSCode to debug the extension');
}

main().catch(error => {
  log(`\nError: ${error.message}`, 'red');
  process.exit(1);
});
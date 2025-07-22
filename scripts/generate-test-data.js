#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const testCompletions = [
  {
    trigger: 'function calculate',
    completion: 'function calculateTotal(items: Item[]): number {\n  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);\n}',
    language: 'typescript'
  },
  {
    trigger: 'class User',
    completion: 'class User {\n  constructor(\n    private id: string,\n    private email: string,\n    private name: string\n  ) {}\n\n  getName(): string {\n    return this.name;\n  }\n\n  getEmail(): string {\n    return this.email;\n  }\n}',
    language: 'typescript'
  },
  {
    trigger: 'async function fetch',
    completion: 'async function fetchUserData(userId: string): Promise<User> {\n  try {\n    const response = await fetch(`/api/users/${userId}`);\n    if (!response.ok) {\n      throw new Error(`HTTP error! status: ${response.status}`);\n    }\n    return await response.json();\n  } catch (error) {\n    console.error("Failed to fetch user:", error);\n    throw error;\n  }\n}',
    language: 'typescript'
  },
  {
    trigger: 'const config =',
    completion: 'const config = {\n  apiUrl: process.env.API_URL || "http://localhost:3000",\n  timeout: 5000,\n  retries: 3,\n  headers: {\n    "Content-Type": "application/json",\n    "Accept": "application/json"\n  }\n};',
    language: 'typescript'
  },
  {
    trigger: 'interface',
    completion: 'interface ApiResponse<T> {\n  data: T;\n  status: number;\n  message: string;\n  timestamp: Date;\n}',
    language: 'typescript'
  }
];

const testContexts = [
  {
    file: 'src/utils/math.ts',
    content: `export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}`,
    cursor: { line: 8, column: 0 }
  },
  {
    file: 'src/models/user.ts',
    content: `export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export class UserService {
  private users: Map<string, User> = new Map();
  
  addUser(user: User): void {
    this.users.set(user.id, user);
  }
}`,
    cursor: { line: 14, column: 0 }
  }
];

const mockApiResponses = {
  authentication: {
    success: {
      access_token: 'mock_access_token_' + Date.now(),
      refresh_token: 'mock_refresh_token_' + Date.now(),
      expires_in: 3600,
      token_type: 'Bearer'
    },
    error: {
      error: 'invalid_grant',
      error_description: 'The provided authorization grant is invalid'
    }
  },
  completions: {
    simple: {
      id: 'comp_' + Date.now(),
      completion: '  return a + b;',
      stop_reason: 'stop_sequence'
    },
    complex: {
      id: 'comp_' + Date.now(),
      completion: testCompletions[0].completion,
      stop_reason: 'max_tokens'
    }
  },
  errors: {
    rate_limit: {
      error: {
        type: 'rate_limit_error',
        message: 'Rate limit exceeded. Please try again later.'
      }
    },
    server_error: {
      error: {
        type: 'server_error',
        message: 'Internal server error'
      }
    }
  }
};

function generateTestFiles() {
  const testDataDir = path.join(__dirname, '..', 'test-data');
  
  // Create test data directory
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }
  
  // Write completions test data
  fs.writeFileSync(
    path.join(testDataDir, 'completions.json'),
    JSON.stringify(testCompletions, null, 2)
  );
  
  // Write contexts test data
  fs.writeFileSync(
    path.join(testDataDir, 'contexts.json'),
    JSON.stringify(testContexts, null, 2)
  );
  
  // Write mock API responses
  fs.writeFileSync(
    path.join(testDataDir, 'mock-responses.json'),
    JSON.stringify(mockApiResponses, null, 2)
  );
  
  // Create sample TypeScript files for testing
  const samplesDir = path.join(testDataDir, 'samples');
  if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
  }
  
  // Sample file with various TypeScript patterns
  const sampleCode = `// Sample TypeScript file for testing completions

interface Product {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

class ShoppingCart {
  private items: Product[] = [];
  
  addItem(product: Product): void {
    const existingItem = this.items.find(item => item.id === product.id);
    if (existingItem) {
      existingItem.quantity += product.quantity;
    } else {
      this.items.push(product);
    }
  }
  
  // TODO: Add calculateTotal method
  
  // TODO: Add removeItem method
  
  getItems(): Product[] {
    return [...this.items];
  }
}

// Test function starts
function process

// Test async function
async function load

// Test arrow function
const filter = 

// Test class
class Order

// Test interface
interface Customer
`;
  
  fs.writeFileSync(
    path.join(samplesDir, 'shopping-cart.ts'),
    sampleCode
  );
  
  console.log('✅ Test data generated successfully!');
  console.log(`📁 Location: ${testDataDir}`);
  console.log('\nGenerated files:');
  console.log('  - completions.json: Sample completion responses');
  console.log('  - contexts.json: Sample code contexts');
  console.log('  - mock-responses.json: Mock API responses');
  console.log('  - samples/shopping-cart.ts: Sample TypeScript file');
}

// Run the generator
generateTestFiles();
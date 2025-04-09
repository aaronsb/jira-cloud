#!/usr/bin/env node
/**
 * Test script for Jira Cloud MCP tool resources
 * 
 * This script tests the tool resources functionality by:
 * 1. Listing all available resources (should include tool documentation resources)
 * 2. Reading a specific tool documentation resource
 */

import { spawn } from 'child_process';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the MCP server executable
const serverPath = path.resolve(__dirname, '../build/index.js');

// Check for required environment variables
if (!process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN || !process.env.JIRA_HOST) {
  console.error('Error: Missing required Jira credentials in environment variables');
  console.error('Please set JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_HOST environment variables');
  console.error('Example: JIRA_EMAIL=user@example.com JIRA_API_TOKEN=token JIRA_HOST=https://your-domain.atlassian.net node test-scripts/test-tool-resources.js');
  process.exit(1);
}

// Start the MCP server process with Jira credentials from environment variables
const serverProcess = spawn('node', [serverPath], {
  env: {
    ...process.env,
    // Environment variables are already passed through from process.env
  },
  stdio: ['pipe', 'pipe', process.stderr]
});

// Create readline interface for reading server output
const rl = readline.createInterface({
  input: serverProcess.stdout,
  crlfDelay: Infinity
});

// Handle server process exit
serverProcess.on('exit', (code) => {
  console.log(`Server process exited with code ${code}`);
  process.exit(code);
});

// Handle server process errors
serverProcess.on('error', (err) => {
  console.error('Failed to start server process:', err);
  process.exit(1);
});

// Function to send a request to the server
function sendRequest(request) {
  return new Promise((resolve) => {
    const requestId = Math.floor(Math.random() * 1000000);
    const jsonRpcRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method: request.method,
      params: request.params || {}
    };
    
    console.log('\nSending request:', JSON.stringify(jsonRpcRequest, null, 2));
    serverProcess.stdin.write(JSON.stringify(jsonRpcRequest) + '\n');
    
    // Set up listener for the response
    const responseListener = (line) => {
      try {
        const response = JSON.parse(line);
        if (response.id === requestId) {
          rl.removeListener('line', responseListener);
          resolve(response);
        }
      } catch (err) {
        // Ignore non-JSON lines
      }
    };
    
    rl.on('line', responseListener);
  });
}

// Main test function
async function runTests() {
  try {
    console.log('Testing Jira Cloud MCP tool resources...');
    
    // Test 1: List all resources
    console.log('\n=== Test 1: List all resources ===');
    const listResourcesResponse = await sendRequest({
      method: 'mcp.list_resources'
    });
    
    if (listResourcesResponse.error) {
      console.error('Error listing resources:', listResourcesResponse.error);
    } else {
      console.log('Resources found:', listResourcesResponse.result.resources.length);
      
      // Find tool documentation resources
      const toolResources = listResourcesResponse.result.resources.filter(
        resource => resource.uri.startsWith('jira://tools/')
      );
      
      console.log('Tool documentation resources found:', toolResources.length);
      if (toolResources.length > 0) {
        console.log('Tool documentation resources:');
        toolResources.forEach(resource => {
          console.log(`- ${resource.uri}: ${resource.name}`);
        });
        
        // Test 2: Read a specific tool documentation resource
        if (toolResources.length > 0) {
          console.log('\n=== Test 2: Read tool documentation resource ===');
          const testResource = toolResources[0];
          console.log(`Reading resource: ${testResource.uri}`);
          
          const readResourceResponse = await sendRequest({
            method: 'mcp.read_resource',
            params: {
              uri: testResource.uri
            }
          });
          
          if (readResourceResponse.error) {
            console.error('Error reading resource:', readResourceResponse.error);
          } else {
            console.log('Resource content:');
            const content = JSON.parse(readResourceResponse.result.contents[0].text);
            console.log(`Name: ${content.name}`);
            console.log(`Description: ${content.description}`);
            console.log(`Operations: ${Object.keys(content.operations).join(', ')}`);
            console.log(`Common use cases: ${content.common_use_cases.length}`);
          }
        }
      } else {
        console.error('No tool documentation resources found!');
      }
    }
    
    console.log('\nTests completed.');
  } catch (error) {
    console.error('Error running tests:', error);
  } finally {
    // Clean up
    serverProcess.stdin.end();
    setTimeout(() => {
      serverProcess.kill();
      process.exit(0);
    }, 500);
  }
}

// Run the tests
runTests();

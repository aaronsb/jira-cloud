#!/usr/bin/env node
import { AgileClient } from 'jira.js';

// Create a simple script to inspect the available methods in the jira.js library
// This will help us identify the correct methods for sprint management

// Create a dummy client (we won't actually connect to Jira)
const dummyClient = new AgileClient({
  host: 'https://example.atlassian.net',
  authentication: {
    basic: {
      email: 'dummy@example.com',
      apiToken: 'dummy-token',
    },
  },
});

// Function to inspect an object's methods
function inspectMethods(obj, name) {
  console.log(`\n=== ${name} Methods ===`);
  
  // Get all properties including methods
  const properties = Object.getOwnPropertyNames(Object.getPrototypeOf(obj));
  
  // Filter out constructor and private methods
  const methods = properties.filter(prop => 
    prop !== 'constructor' && !prop.startsWith('_')
  );
  
  // Log each method
  methods.forEach(method => {
    console.log(`- ${method}`);
  });
}

// Inspect the sprint methods
console.log('Inspecting jira.js AgileClient API...');
console.log('Available client groups:');
Object.keys(dummyClient).forEach(key => console.log(`- ${key}`));

// Inspect sprint methods specifically
if (dummyClient.sprint) {
  inspectMethods(dummyClient.sprint, 'Sprint');
}

// Inspect backlog methods
if (dummyClient.backlog) {
  inspectMethods(dummyClient.backlog, 'Backlog');
}

// Inspect board methods
if (dummyClient.board) {
  inspectMethods(dummyClient.board, 'Board');
}

console.log('\nThis script helps identify the correct methods for sprint management in jira.js v4.0.5');

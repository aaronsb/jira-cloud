#!/usr/bin/env node
import { AgileClient } from 'jira.js';

// Create a client with the authentication details from the MCP configuration
const client = new AgileClient({
  host: 'https://your-jira-instance.atlassian.net',
  authentication: {
    basic: {
      email: 'your-email@example.com',
      apiToken: 'YOUR_JIRA_API_TOKEN',
    },
  },
});

// Function to get sprint details
async function getSprint(sprintId) {
  try {
    const sprint = await client.sprint.getSprint({
      sprintId
    });
    console.log('Current Sprint Details:');
    console.log(JSON.stringify(sprint, null, 2));
    return sprint;
  } catch (error) {
    console.error('Error getting sprint:', error.message);
    return null;
  }
}

// Function to update sprint
async function updateSprint(sprintId, updateData) {
  try {
    console.log(`Updating sprint ${sprintId} with:`, updateData);
    
    // Use the updateSprint method directly
    await client.sprint.updateSprint({
      sprintId,
      ...updateData
    });
    
    console.log('Sprint updated successfully');
    
    // Get the updated sprint details
    const updatedSprint = await getSprint(sprintId);
    return updatedSprint;
  } catch (error) {
    console.error('Error updating sprint:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return null;
  }
}

// Main function
async function main() {
  const sprintId = 123; // Replace with your sprint ID
  
  // Get current sprint details
  const currentSprint = await getSprint(sprintId);
  if (!currentSprint) {
    console.error('Failed to get current sprint details');
    return;
  }
  
  // Update the sprint with minimal changes, including the current state
  const updateData = {
    name: 'Sprint Name - Updated',
    goal: 'Updated sprint goal with more details',
    state: currentSprint.state // Include the current state
  };
  
  await updateSprint(sprintId, updateData);
}

// Run the main function
main().catch(console.error);

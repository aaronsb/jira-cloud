#!/usr/bin/env node

import axios from 'axios';

/**
 * Health check script for container monitoring
 * Verifies:
 * 1. Environment variables are set
 * 2. Jira API is accessible
 * 3. Required directories exist and are writable
 */

async function checkEnvironmentVariables(): Promise<boolean> {
  const required = ['JIRA_API_TOKEN', 'JIRA_EMAIL', 'JIRA_HOST'];
  const missing = required.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    return false;
  }
  
  return true;
}

async function checkJiraAccess(): Promise<boolean> {
  const baseURL = `https://${process.env.JIRA_HOST}/rest/api/3`;
  const auth = {
    username: process.env.JIRA_EMAIL!,
    password: process.env.JIRA_API_TOKEN!
  };

  try {
    await axios.get(`${baseURL}/myself`, { auth });
    return true;
  } catch (error) {
    console.error('Failed to access Jira API:', error);
    return false;
  }
}

async function checkDirectories(): Promise<boolean> {
  const fs = await import('fs/promises');
  const directories = ['/app/config', '/app/logs'];
  
  try {
    for (const dir of directories) {
      await fs.access(dir, fs.constants.W_OK);
    }
    return true;
  } catch (error) {
    console.error('Directory check failed:', error);
    return false;
  }
}

async function main() {
  try {
    const envCheck = await checkEnvironmentVariables();
    const jiraCheck = await checkJiraAccess();
    const dirCheck = await checkDirectories();

    if (envCheck && jiraCheck && dirCheck) {
      console.log('Health check passed');
      process.exit(0);
    } else {
      console.error('Health check failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('Health check error:', error);
    process.exit(1);
  }
}

main();

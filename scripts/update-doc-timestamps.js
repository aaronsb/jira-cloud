#!/usr/bin/env node

/**
 * Script to update "Last updated" timestamps in documentation files
 * 
 * This script scans the docs directory for markdown files and updates
 * the "Last updated" timestamp at the end of each file. If no timestamp
 * line exists, it adds one.
 * 
 * Usage:
 *   node scripts/update-doc-timestamps.js [file-path]
 * 
 * If file-path is provided, only that file is updated.
 * Otherwise, all markdown files in the docs directory are updated.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const readFile = fs.promises.readFile;
const writeFile = fs.promises.writeFile;
const readdir = fs.promises.readdir;
const stat = fs.promises.stat;

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Format date as YYYY-MM-DD at HH:MM:SS
function formatDate(date) {
  const pad = (num) => String(num).padStart(2, '0');
  
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  
  return `${year}-${month}-${day} at ${hours}:${minutes}:${seconds}`;
}

// Update timestamp in a file
async function updateTimestamp(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    const now = new Date();
    const timestamp = formatDate(now);
    
    // Check if file already has a timestamp line
    const timestampRegex = /Last updated: \d{4}-\d{2}-\d{2} at \d{2}:\d{2}:\d{2}/;
    
    let newContent;
    if (timestampRegex.test(content)) {
      // Replace existing timestamp
      newContent = content.replace(
        timestampRegex,
        `Last updated: ${timestamp}`
      );
    } else {
      // Add timestamp at the end of the file
      newContent = content.trim() + `\n\nLast updated: ${timestamp}\n`;
    }
    
    await writeFile(filePath, newContent);
    console.log(`Updated timestamp in ${filePath}`);
  } catch (error) {
    console.error(`Error updating ${filePath}:`, error);
  }
}

// Recursively find all markdown files in a directory
async function findMarkdownFiles(dir) {
  const files = await readdir(dir);
  const markdownFiles = [];
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = await stat(filePath);
    
    if (stats.isDirectory()) {
      // Skip the generated directory
      if (file !== 'generated') {
        const subDirFiles = await findMarkdownFiles(filePath);
        markdownFiles.push(...subDirFiles);
      }
    } else if (file.endsWith('.md')) {
      markdownFiles.push(filePath);
    }
  }
  
  return markdownFiles;
}

// Main function
async function main() {
  try {
    const args = process.argv.slice(2);
    
    if (args.length > 0) {
      // Update specific file
      const filePath = args[0];
      if (!filePath.endsWith('.md')) {
        console.error('Error: File must be a markdown file (.md)');
        process.exit(1);
      }
      
      await updateTimestamp(filePath);
    } else {
      // Update all markdown files in docs directory
      const docsDir = path.join(__dirname, '..', 'docs');
      const markdownFiles = await findMarkdownFiles(docsDir);
      
      console.log(`Found ${markdownFiles.length} markdown files`);
      
      for (const file of markdownFiles) {
        await updateTimestamp(file);
      }
    }
    
    console.log('Timestamp update complete');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

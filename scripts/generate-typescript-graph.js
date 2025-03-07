#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Output directories
const outputDir = path.join(process.cwd(), 'docs', 'generated');
const mermaidOutputPath = path.join(outputDir, 'class-diagram.md');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate Mermaid diagram using typescript-graph
console.log('Generating Mermaid diagram from TypeScript source...');

try {
  // Run typescript-graph with appropriate options
  // --md: Specify the output markdown file
  // --dir: Specify the root directory of the TypeScript project
  // --include: Focus on the core source directories
  // --exclude: Exclude node_modules and test files
  // --highlight: Highlight important classes
  // --LR: Set the flowchart orientation to Left-to-Right for better readability
  execSync(
    `npx tsg --md ${mermaidOutputPath} --dir ${process.cwd()} --include src/client src/handlers src/types --exclude node_modules test tests coverage build --highlight jira-client.ts issue-handlers.ts board-handlers.ts search-handlers.ts --LR`,
    { stdio: 'inherit' }
  );
  
  console.log(`Mermaid diagram saved to ${mermaidOutputPath}`);
  
  // Update the class-structure.md file to reference the Mermaid diagram
  const classStructurePath = path.join(process.cwd(), 'docs', 'class-structure.md');
  if (fs.existsSync(classStructurePath)) {
    let content = fs.readFileSync(classStructurePath, 'utf8');
    
    // Read the generated Mermaid diagram
    const mermaidContent = fs.readFileSync(mermaidOutputPath, 'utf8');
    
    // Extract just the Mermaid diagram part (between ```mermaid and ```)
    const mermaidMatch = mermaidContent.match(/```mermaid\n([\s\S]*?)```/);
    const mermaidDiagram = mermaidMatch ? mermaidMatch[0] : '';
    
    if (mermaidDiagram) {
      // Update or add the Mermaid diagram reference
      if (content.includes('```plantuml')) {
        // Replace existing PlantUML diagram with Mermaid
        content = content.replace(/```plantuml[\s\S]*?```/m, mermaidDiagram);
      } else if (content.includes('```mermaid')) {
        // Replace existing Mermaid diagram
        content = content.replace(/```mermaid[\s\S]*?```/m, mermaidDiagram);
      } else if (content.includes('![Class Diagram]')) {
        // Replace SVG reference with Mermaid
        content = content.replace(/!\[Class Diagram\][\s\S]*?\)/m, mermaidDiagram);
      } else {
        // Add Mermaid diagram at the end
        content += '\n\n## Class Diagram\n\n' + mermaidDiagram;
      }
      
      // Remove duplicate Class Diagram sections
      const classDiagramPattern = /## Class Diagram\s+```mermaid[\s\S]*?```/g;
      const matches = content.match(classDiagramPattern);
      if (matches && matches.length > 1) {
        // Keep only the first occurrence
        const firstMatch = matches[0];
        content = content.replace(classDiagramPattern, '');
        content += '\n\n' + firstMatch;
      }
      
      // Clean up excessive blank lines
      content = content.replace(/\n{3,}/g, '\n\n');
      
      // Update timestamp
      const timestamp = `Last updated: ${new Date().toISOString().split('T')[0]} at ${new Date().toTimeString().split(' ')[0]}`;
      if (content.includes('Last updated:')) {
        content = content.replace(/Last updated:.*/, timestamp);
      } else {
        content += `\n\n${timestamp}`;
      }
      
      // Update the note about diagram generation
      content = content.replace(
        /> \*\*Note\*\*: The class diagrams for this project are automatically generated from the TypeScript source code using PlantUML.*/,
        '> **Note**: The class diagrams for this project are automatically generated from the TypeScript source code using typescript-graph, which produces Mermaid diagrams showing the relationships between files and classes. To update these diagrams, run `./scripts/build-diagrams.sh`.'
      );
      
      fs.writeFileSync(classStructurePath, content);
      console.log(`Updated class-structure.md with Mermaid diagram reference`);
    } else {
      console.error('Failed to extract Mermaid diagram from generated file');
    }
  }
  
  console.log('Mermaid diagram generation complete!');
} catch (error) {
  console.error('Error generating Mermaid diagram:', error.message);
  process.exit(1);
}

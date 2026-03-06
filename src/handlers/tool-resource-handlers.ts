import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

import { formatToolName, generateToolDocumentation } from '../docs/tool-documentation.js';
import { toolSchemas } from '../schemas/tool-schemas.js';

export function setupToolResourceHandlers() {
  return {
    async listToolResources() {
      const resources = Object.keys(toolSchemas)
        .map(toolName => ({
          uri: `jira://tools/${toolName}/documentation`,
          name: `${formatToolName(toolName)} Documentation`,
          mimeType: 'application/json',
          description: `Comprehensive documentation for the ${formatToolName(toolName)} tool`
        }));

      return { resources };
    },

    async readToolResource(uri: string) {
      const toolMatch = uri.match(/^jira:\/\/tools\/([^/]+)\/documentation$/);
      if (!toolMatch) {
        throw new McpError(ErrorCode.InvalidRequest, `Unknown tool resource: ${uri}`);
      }

      const toolName = toolMatch[1];
      if (!(toolName in toolSchemas)) {
        throw new McpError(ErrorCode.InvalidRequest, `Tool not found: ${toolName}`);
      }

      const schema = toolSchemas[toolName as keyof typeof toolSchemas];
      const documentation = generateToolDocumentation(toolName, schema);

      return {
        contents: [{
          uri: `jira://tools/${toolName}/documentation`,
          mimeType: 'application/json',
          text: JSON.stringify(documentation, null, 2)
        }]
      };
    }
  };
}

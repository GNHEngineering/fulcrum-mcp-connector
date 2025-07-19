const express = require('express');
const cors = require('cors');
const path = require('path');

// Load environment variables from API_token.env
require('dotenv').config({ path: './API_token.env' });

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Fulcrum API configuration
const FULCRUM_API_TOKEN = process.env.FULCRUM_API_TOKEN;
const FULCRUM_API_URL = process.env.FULCRUM_SITE_URL;

// Helper function to make Fulcrum API calls
async function callFulcrumAPI(endpoint, method = 'GET', body = null) {
  const url = `${FULCRUM_API_URL}${endpoint}`;
  
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${FULCRUM_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };
  
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Fulcrum API Error:', error);
    throw error;
  }
}

// MCP Server Setup
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

class FulcrumMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'fulcrum-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_fulcrum_records',
          description: 'Search for records in Fulcrum using SQL queries',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'SQL query to search records (e.g., "SELECT * FROM forms LIMIT 10")'
              },
              format: {
                type: 'string',
                enum: ['json', 'csv', 'geojson'],
                default: 'json',
                description: 'Output format for results'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'list_fulcrum_forms',
          description: 'Get a list of all available forms in Fulcrum',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of forms to return',
                default: 20
              }
            }
          }
        },
        {
          name: 'get_fulcrum_form',
          description: 'Get details about a specific form',
          inputSchema: {
            type: 'object',
            properties: {
              form_id: {
                type: 'string',
                description: 'The ID of the form to retrieve'
              }
            },
            required: ['form_id']
          }
        },
        {
          name: 'get_fulcrum_records',
          description: 'Get records from a specific form',
          inputSchema: {
            type: 'object',
            properties: {
              form_id: {
                type: 'string',
                description: 'The ID of the form to get records from'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of records to return',
                default: 50
              }
            },
            required: ['form_id']
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_fulcrum_records':
            return await this.searchRecords(args.query, args.format || 'json');
          
          case 'list_fulcrum_forms':
            return await this.listForms(args.limit || 20);
          
          case 'get_fulcrum_form':
            return await this.getForm(args.form_id);
          
          case 'get_fulcrum_records':
            return await this.getRecords(args.form_id, args.limit || 50);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  async searchRecords(query, format = 'json') {
    try {
      // Note: This is a simplified version. Real Fulcrum query API might have different endpoints
      const result = await callFulcrumAPI(`/api/query?sql=${encodeURIComponent(query)}&format=${format}`);
      
      return {
        content: [
          {
            type: 'text',
            text: `Query Results:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to search records: ${error.message}`);
    }
  }

  async listForms(limit = 20) {
    try {
      const result = await callFulcrumAPI(`/api/forms?per_page=${limit}`);
      
      const formsList = result.forms || result.data || [];
      const summary = formsList.map(form => ({
        id: form.id,
        name: form.name || form.title,
        description: form.description || 'No description'
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Available Forms (${summary.length}):\n\n${summary.map(form => 
              `**${form.name}** (ID: ${form.id})\n${form.description}\n`
            ).join('\n')}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to list forms: ${error.message}`);
    }
  }

  async getForm(formId) {
    try {
      const result = await callFulcrumAPI(`/api/forms/${formId}`);
      
      return {
        content: [
          {
            type: 'text',
            text: `Form Details:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get form: ${error.message}`);
    }
  }

  async getRecords(formId, limit = 50) {
    try {
      const result = await callFulcrumAPI(`/api/records?form_id=${formId}&per_page=${limit}`);
      
      return {
        content: [
          {
            type: 'text',
            text: `Records from Form ${formId}:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get records: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Fulcrum MCP server running on stdio');
  }
}

// Start the server
const server = new FulcrumMCPServer();
server.run().catch(console.error);
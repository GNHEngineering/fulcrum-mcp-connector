const express = require('express');
const cors = require('cors');

// For Railway, just use dotenv without specifying a path
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// CORRECTED Fulcrum API configuration based on official docs
const FULCRUM_API_TOKEN = process.env.FULCRUM_API_TOKEN;
// The base URL should be the official Fulcrum API endpoint (not company-specific)
const FULCRUM_API_URL = 'https://api.fulcrumpro.com';

// Debug logging
console.log('API Token loaded:', FULCRUM_API_TOKEN ? 'Yes' : 'No');
console.log('API URL (corrected):', FULCRUM_API_URL);

// Helper function to make Fulcrum API calls with enhanced error handling
async function callFulcrumAPI(endpoint, method = 'GET', body = null) {
  const url = `${FULCRUM_API_URL}${endpoint}`;
  
  console.log('Making API call to:', url);
  console.log('Method:', method);
  
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
    console.log('Request body:', JSON.stringify(body, null, 2));
  }
  
  try {
    const response = await fetch(url, options);
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      
      // Provide more specific error messages based on Fulcrum API docs
      if (response.status === 401) {
        throw new Error(`Authentication failed (401): Check if your API token is valid and not expired. Generate token from Business Setup -> System Data -> Public Api in your Fulcrum site.`);
      } else if (response.status === 403) {
        throw new Error(`Access forbidden (403): Your API token may not have sufficient permissions for this operation.`);
      } else if (response.status === 404) {
        throw new Error(`Endpoint not found (404): ${url} - Check if the API endpoint is correct.`);
      } else {
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }
    }
    
    const data = await response.json();
    console.log('Response data keys:', Object.keys(data));
    return data;
  } catch (error) {
    console.error('Fulcrum API Error:', error);
    throw error;
  }
}

// Test endpoint for debugging
app.get('/test-auth', async (req, res) => {
  try {
    console.log('Testing authentication with corrected URL...');
    const result = await callFulcrumAPI('/api/sales-orders', 'GET');
    
    res.json({
      success: true,
      message: 'Successfully authenticated with Fulcrum API',
      apiUrl: FULCRUM_API_URL,
      dataReceived: !!result,
      responseKeys: Object.keys(result || {})
    });
  } catch (error) {
    console.error('Authentication test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      apiUrl: FULCRUM_API_URL,
      hasToken: !!FULCRUM_API_TOKEN
    });
  }
});

// Basic health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Fulcrum MCP Server',
    apiUrl: FULCRUM_API_URL,
    hasApiToken: !!FULCRUM_API_TOKEN
  });
});

// Start the HTTP server
app.listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
  console.log(`Test authentication: https://fulcrum-mcp-connector-production.up.railway.app/test-auth`);
});

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
        version: '0.2.0',
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
          name: 'list_sales_orders',
          description: 'Get a list of sales orders from Fulcrum',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of sales orders to return',
                default: 20
              },
              includeCustomFields: {
                type: 'boolean',
                description: 'Include custom fields in the response',
                default: false
              }
            }
          }
        },
        {
          name: 'get_sales_order',
          description: 'Get details about a specific sales order',
          inputSchema: {
            type: 'object',
            properties: {
              salesOrderId: {
                type: 'string',
                description: 'The ID of the sales order to retrieve'
              }
            },
            required: ['salesOrderId']
          }
        },
        {
          name: 'list_jobs',
          description: 'Get a list of work orders/jobs from Fulcrum',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of jobs to return',
                default: 20
              },
              statusFilter: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Filter jobs by status (e.g., ["Active", "Complete"])'
              }
            }
          }
        },
        {
          name: 'get_job',
          description: 'Get details about a specific job/work order',
          inputSchema: {
            type: 'object',
            properties: {
              jobId: {
                type: 'string',
                description: 'The ID of the job to retrieve'
              }
            },
            required: ['jobId']
          }
        },
        {
          name: 'list_items',
          description: 'Get a list of items/parts from Fulcrum inventory',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of items to return',
                default: 50
              },
              searchTerm: {
                type: 'string',
                description: 'Search for items by name or item number'
              }
            }
          }
        },
        {
          name: 'get_item',
          description: 'Get details about a specific item/part',
          inputSchema: {
            type: 'object',
            properties: {
              itemId: {
                type: 'string',
                description: 'The ID of the item to retrieve'
              }
            },
            required: ['itemId']
          }
        },
        {
          name: 'get_inventory_summary',
          description: 'Get inventory levels and stock information',
          inputSchema: {
            type: 'object',
            properties: {
              itemId: {
                type: 'string',
                description: 'Get inventory for a specific item (optional)'
              }
            }
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'list_sales_orders':
            return await this.listSalesOrders(args.limit || 20, args.includeCustomFields || false);
          
          case 'get_sales_order':
            return await this.getSalesOrder(args.salesOrderId);
          
          case 'list_jobs':
            return await this.listJobs(args.limit || 20, args.statusFilter);
          
          case 'get_job':
            return await this.getJob(args.jobId);
          
          case 'list_items':
            return await this.listItems(args.limit || 50, args.searchTerm);
          
          case 'get_item':
            return await this.getItem(args.itemId);
          
          case 'get_inventory_summary':
            return await this.getInventorySummary(args.itemId);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Error in ${name}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  async listSalesOrders(limit = 20, includeCustomFields = false) {
    try {
      // Use POST to /api/sales-orders/list with filter body
      const filterBody = {
        includeCustomFields: includeCustomFields,
        pageSize: limit
      };

      const result = await callFulcrumAPI('/api/sales-orders/list', 'POST', filterBody);
      
      const orders = result.data || result.salesOrders || [];
      
      if (orders.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No sales orders found. This could mean:\n- No sales orders exist in your Fulcrum account\n- API permissions may be limited\n- Check if you have access to sales order data'
            }
          ]
        };
      }

      const summary = orders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber || 'N/A',
        customerName: order.customer?.name || 'Unknown Customer',
        status: order.status || 'Unknown',
        totalAmount: order.totalAmount || 0,
        dueDate: order.dueDate || 'No due date',
        createdDate: order.createdDateUtc || order.createdDate || 'Unknown'
      }));

      return {
        content: [
          {
            type: 'text',
            text: `**Sales Orders (${summary.length} found):**\n\n${summary.map(order => 
              `**Order #${order.orderNumber}** (ID: ${order.id})\n` +
              `Customer: ${order.customerName}\n` +
              `Status: ${order.status}\n` +
              `Total: $${order.totalAmount}\n` +
              `Due: ${order.dueDate}\n` +
              `Created: ${order.createdDate}\n`
            ).join('\n')}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to list sales orders: ${error.message}`);
    }
  }

  async getSalesOrder(salesOrderId) {
    try {
      const result = await callFulcrumAPI(`/api/sales-orders/${salesOrderId}`);
      
      return {
        content: [
          {
            type: 'text',
            text: `**Sales Order Details:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get sales order: ${error.message}`);
    }
  }

  async listJobs(limit = 20, statusFilter = null) {
    try {
      const filterBody = {
        pageSize: limit
      };
      
      if (statusFilter && statusFilter.length > 0) {
        filterBody.statusFilter = statusFilter;
      }

      const result = await callFulcrumAPI('/api/jobs/list', 'POST', filterBody);
      
      const jobs = result.data || result.jobs || [];
      
      if (jobs.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No jobs found. This could mean:\n- No work orders exist in your Fulcrum account\n- Status filter excluded all jobs\n- Check if you have access to job data'
            }
          ]
        };
      }

      const summary = jobs.map(job => ({
        id: job.id,
        jobNumber: job.jobNumber || 'N/A',
        description: job.description || 'No description',
        status: job.status || 'Unknown',
        quantityToManufacture: job.quantityToManufacture || 0,
        dueDate: job.productionDueDate || job.dueDate || 'No due date'
      }));

      return {
        content: [
          {
            type: 'text',
            text: `**Jobs/Work Orders (${summary.length} found):**\n\n${summary.map(job => 
              `**Job #${job.jobNumber}** (ID: ${job.id})\n` +
              `Description: ${job.description}\n` +
              `Status: ${job.status}\n` +
              `Quantity: ${job.quantityToManufacture}\n` +
              `Due: ${job.dueDate}\n`
            ).join('\n')}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to list jobs: ${error.message}`);
    }
  }

  async getJob(jobId) {
    try {
      const result = await callFulcrumAPI(`/api/jobs/${jobId}`);
      
      return {
        content: [
          {
            type: 'text',
            text: `**Job Details:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get job: ${error.message}`);
    }
  }

  async listItems(limit = 50, searchTerm = null) {
    try {
      const filterBody = {
        pageSize: limit
      };
      
      if (searchTerm) {
        filterBody.searchTerm = searchTerm;
      }

      const result = await callFulcrumAPI('/api/items/list', 'POST', filterBody);
      
      const items = result.data || result.items || [];
      
      if (items.length === 0) {
        const message = searchTerm 
          ? `No items found matching "${searchTerm}"`
          : 'No items found in inventory';
        
        return {
          content: [
            {
              type: 'text',
              text: message
            }
          ]
        };
      }

      const summary = items.map(item => ({
        id: item.id,
        itemNumber: item.itemNumber || 'N/A',
        description: item.description || 'No description',
        makeOrBuy: item.makeOrBuy || 'Unknown',
        unitOfMeasure: item.unitOfMeasure || 'EA'
      }));

      return {
        content: [
          {
            type: 'text',
            text: `**Items (${summary.length} found):**\n\n${summary.map(item => 
              `**${item.itemNumber}** (ID: ${item.id})\n` +
              `Description: ${item.description}\n` +
              `Type: ${item.makeOrBuy}\n` +
              `Unit: ${item.unitOfMeasure}\n`
            ).join('\n')}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to list items: ${error.message}`);
    }
  }

  async getItem(itemId) {
    try {
      const result = await callFulcrumAPI(`/api/items/${itemId}`);
      
      return {
        content: [
          {
            type: 'text',
            text: `**Item Details:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get item: ${error.message}`);
    }
  }

  async getInventorySummary(itemId = null) {
    try {
      let endpoint = '/api/inventory/list';
      const filterBody = {};
      
      if (itemId) {
        filterBody.itemId = itemId;
      }

      const result = await callFulcrumAPI(endpoint, 'POST', filterBody);
      
      const inventory = result.data || result.inventory || [];
      
      if (inventory.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: itemId ? `No inventory found for item ${itemId}` : 'No inventory data found'
            }
          ]
        };
      }

      const summary = inventory.map(inv => ({
        itemId: inv.itemId || 'N/A',
        itemNumber: inv.item?.itemNumber || 'Unknown',
        onHandQuantity: inv.onHandQuantity || 0,
        availableQuantity: inv.availableQuantity || 0,
        reservedQuantity: inv.reservedQuantity || 0
      }));

      return {
        content: [
          {
            type: 'text',
            text: `**Inventory Summary (${summary.length} items):**\n\n${summary.map(inv => 
              `**${inv.itemNumber}** (Item ID: ${inv.itemId})\n` +
              `On Hand: ${inv.onHandQuantity}\n` +
              `Available: ${inv.availableQuantity}\n` +
              `Reserved: ${inv.reservedQuantity}\n`
            ).join('\n')}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get inventory summary: ${error.message}`);
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

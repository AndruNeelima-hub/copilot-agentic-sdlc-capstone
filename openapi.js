const swaggerJsdoc = require('swagger-jsdoc');

module.exports = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Order History API',
      version: '1.0.0',
      description: 'Authenticated order-history retrieval with filtering, sorting, and pagination.'
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT signed with the configured shared secret. The token subject must match userId.'
        }
      },
      schemas: {
        OrderHistoryResponse: {
          type: 'object',
          required: ['data', 'metadata'],
          properties: {
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/Order' }
            },
            metadata: { $ref: '#/components/schemas/PaginationMetadata' }
          }
        },
        Order: {
          type: 'object',
          required: [
            'orderId', 'orderNumber', 'date', 'status', 'items', 'subtotal',
            'tax', 'shipping', 'discount', 'total', 'currency'
          ],
          properties: {
            orderId: { type: 'string', format: 'uuid' },
            orderNumber: { type: 'string' },
            date: { type: 'string', format: 'date-time' },
            status: { $ref: '#/components/schemas/OrderStatus' },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/OrderItem' }
            },
            subtotal: { type: 'number', minimum: 0 },
            tax: { type: 'number', minimum: 0 },
            shipping: { type: 'number', minimum: 0 },
            discount: { type: 'number', minimum: 0 },
            total: { type: 'number', minimum: 0 },
            currency: { type: 'string', pattern: '^[A-Z]{3}$', example: 'USD' }
          }
        },
        OrderItem: {
          type: 'object',
          required: ['itemId', 'productName', 'sku', 'quantity', 'unitPrice', 'lineTotal'],
          properties: {
            itemId: { type: 'string', format: 'uuid' },
            productName: { type: 'string' },
            sku: { type: 'string' },
            quantity: { type: 'integer', minimum: 1 },
            unitPrice: { type: 'number', minimum: 0 },
            lineTotal: { type: 'number', minimum: 0 }
          }
        },
        PaginationMetadata: {
          type: 'object',
          required: ['totalRecords', 'totalPages', 'currentPage', 'hasNextPage'],
          properties: {
            totalRecords: { type: 'integer', minimum: 0 },
            totalPages: { type: 'integer', minimum: 0 },
            currentPage: { type: 'integer', minimum: 1 },
            hasNextPage: { type: 'boolean' }
          }
        },
        OrderStatus: {
          type: 'string',
          enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded', 'Returned']
        },
        ErrorResponse: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'traceId'],
              properties: {
                code: {
                  type: 'string',
                  enum: [
                    'INVALID_UUID', 'INVALID_STATUS', 'INVALID_DATE', 'INVALID_PAGINATION',
                    'INVALID_SORT', 'UNAUTHORIZED', 'FORBIDDEN', 'USER_NOT_FOUND', 'INTERNAL_ERROR'
                  ]
                },
                message: { type: 'string' },
                traceId: { type: 'string', nullable: true }
              }
            }
          }
        }
      }
    },
    paths: {
      '/api/v1/users/{userId}/orders': {
        get: {
          operationId: 'getUserOrderHistory',
          summary: 'Retrieve a user\'s order history',
          description: 'Users can retrieve only their own history. Date bounds are inclusive UTC calendar days; duplicate single-valued query parameters are rejected.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'userId',
              in: 'path',
              required: true,
              description: 'UUID of the authenticated user.',
              schema: { type: 'string', format: 'uuid' },
              example: '00000000-0000-4000-8000-000000000001'
            },
            {
              name: 'page',
              in: 'query',
              required: false,
              description: 'One-based page number.',
              schema: { type: 'integer', minimum: 1, default: 1 }
            },
            {
              name: 'pageSize',
              in: 'query',
              required: false,
              description: 'Number of orders per page.',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
            },
            {
              name: 'status',
              in: 'query',
              required: false,
              description: 'Filter by one order status. Repeated values are not allowed.',
              schema: { $ref: '#/components/schemas/OrderStatus' }
            },
            {
              name: 'startDate',
              in: 'query',
              required: false,
              description: 'Inclusive start date in UTC. Must be on or before endDate when supplied.',
              schema: { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
            },
            {
              name: 'endDate',
              in: 'query',
              required: false,
              description: 'Inclusive end date through 23:59:59.999 UTC.',
              schema: { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
            },
            {
              name: 'sortBy',
              in: 'query',
              required: false,
              description: 'Field used to sort orders.',
              schema: { type: 'string', enum: ['date', 'total'], default: 'date' }
            },
            {
              name: 'sortOrder',
              in: 'query',
              required: false,
              description: 'Sort direction.',
              schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
            }
          ],
          responses: {
            '200': {
              description: 'Order history and pagination metadata.',
              headers: {
                'X-Trace-Id': {
                  description: 'Request trace identifier.',
                  schema: { type: 'string' }
                }
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/OrderHistoryResponse' },
                  examples: {
                    orderHistory: {
                      summary: 'One order with an item',
                      value: {
                        data: [{
                          orderId: 'f7f45d5d-17cb-4336-a86b-d430dae1758e',
                          orderNumber: 'ORD-10001',
                          date: '2026-05-01T12:00:00.000Z',
                          status: 'Delivered',
                          items: [{
                            itemId: '4dc6c338-ef01-4ee7-b4da-21520c31dc82',
                            productName: 'Wireless Mouse',
                            sku: 'MOU-100',
                            quantity: 2,
                            unitPrice: 25,
                            lineTotal: 50
                          }],
                          subtotal: 100,
                          tax: 8,
                          shipping: 5,
                          discount: 10,
                          total: 103,
                          currency: 'USD'
                        }],
                        metadata: { totalRecords: 150, totalPages: 8, currentPage: 1, hasNextPage: true }
                      }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Invalid request. Codes: INVALID_UUID, INVALID_STATUS, INVALID_DATE, INVALID_PAGINATION, INVALID_SORT.',
              headers: {
                'X-Trace-Id': { description: 'Request trace identifier.', schema: { type: 'string' } }
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  examples: {
                    invalidPagination: {
                      summary: 'Page size exceeds the maximum',
                      value: { error: { code: 'INVALID_PAGINATION', message: 'page must be at least 1 and pageSize must be between 1 and 100', traceId: 'trace-id' } }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Missing, expired, or invalid bearer token.',
              headers: {
                'X-Trace-Id': { description: 'Request trace identifier.', schema: { type: 'string' } }
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  examples: {
                    unauthorized: {
                      value: { error: { code: 'UNAUTHORIZED', message: 'Authentication required', traceId: 'trace-id' } }
                    }
                  }
                }
              }
            },
            '403': {
              description: 'The authenticated user does not match userId.',
              headers: {
                'X-Trace-Id': { description: 'Request trace identifier.', schema: { type: 'string' } }
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  examples: {
                    forbidden: {
                      value: { error: { code: 'FORBIDDEN', message: 'Access denied', traceId: 'trace-id' } }
                    }
                  }
                }
              }
            },
            '404': {
              description: 'The authenticated user does not exist, is disabled, or is soft-deleted.',
              headers: {
                'X-Trace-Id': { description: 'Request trace identifier.', schema: { type: 'string' } }
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  examples: {
                    userNotFound: {
                      value: { error: { code: 'USER_NOT_FOUND', message: 'User not found', traceId: 'trace-id' } }
                    }
                  }
                }
              }
            },
            '500': {
              description: 'Unexpected server error.',
              headers: {
                'X-Trace-Id': { description: 'Request trace identifier.', schema: { type: 'string' } }
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                  example: { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', traceId: 'trace-id' } }
                }
              }
            }
          }
        }
      }
    }
  },
  apis: []
});
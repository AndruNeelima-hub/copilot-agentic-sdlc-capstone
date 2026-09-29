const { z } = require('zod');
const { createAppError } = require('../middleware/errorHandler');

const STATUSES = [
  'Pending',
  'Processing',
  'Shipped',
  'Delivered',
  'Cancelled',
  'Refunded',
  'Returned'
];

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

const pageSchema = z.string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(1_000_000));

const pageSizeSchema = z.string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(100));

const querySchema = z.object({
  page: pageSchema.optional().transform((value) => value ?? 1),
  pageSize: pageSizeSchema.optional().transform((value) => value ?? 20),
  status: z.enum(STATUSES).optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  sortBy: z.enum(['date', 'total']).optional().transform((value) => value ?? 'date'),
  sortOrder: z.enum(['asc', 'desc']).optional().transform((value) => value ?? 'desc')
});

function errorCodeFor(field) {
  if (field === 'userId') return 'INVALID_UUID';
  if (field === 'status') return 'INVALID_STATUS';
  if (field === 'startDate' || field === 'endDate') return 'INVALID_DATE';
  if (field === 'page' || field === 'pageSize') return 'INVALID_PAGINATION';
  return 'INVALID_SORT';
}

function throwValidationError(field) {
  const code = errorCodeFor(field);
  const messages = {
    INVALID_UUID: 'userId must be a valid UUID',
    INVALID_STATUS: 'status is not supported',
    INVALID_DATE: 'Dates must be valid YYYY-MM-DD values and form an inclusive range',
    INVALID_PAGINATION: 'page must be at least 1 and pageSize must be between 1 and 100',
    INVALID_SORT: 'sortBy and sortOrder are not supported'
  };

  throw createAppError(400, code, messages[code]);
}

function validateUserId(userId) {
  const parsedUserId = z.string().uuid().safeParse(userId);
  if (!parsedUserId.success) {
    throwValidationError('userId');
  }

  return parsedUserId.data;
}

function parseQueryValues(query) {
  const parsedQuery = querySchema.safeParse(query);
  if (!parsedQuery.success) {
    throwValidationError(parsedQuery.error.issues[0].path[0]);
  }

  const values = parsedQuery.data;
  if (!Number.isSafeInteger((values.page - 1) * values.pageSize)) {
    throwValidationError('page');
  }

  return values;
}

function normalizeDateRange(values) {
  if (values.startDate && values.endDate && values.startDate > values.endDate) {
    throwValidationError('startDate');
  }

  return {
    startTimestampUtc: values.startDate
      ? `${values.startDate}T00:00:00.000Z`
      : null,
    endTimestampUtc: values.endDate
      ? `${values.endDate}T23:59:59.999Z`
      : null,
  };
}

function validateOrderHistoryQuery(userId, query) {
  const parsedUserId = validateUserId(userId);
  const values = parseQueryValues(query);

  return {
    userId: parsedUserId,
    page: values.page,
    pageSize: values.pageSize,
    status: values.status ?? null,
    ...normalizeDateRange(values),
    sortBy: values.sortBy,
    sortOrder: values.sortOrder
  };
}

module.exports = { validateOrderHistoryQuery };
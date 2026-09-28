const { AppError } = require('./errorHandler');

const SINGLE_VALUE_PARAMS = new Map([
  ['page', 'INVALID_PAGINATION'],
  ['pageSize', 'INVALID_PAGINATION'],
  ['status', 'INVALID_STATUS'],
  ['startDate', 'INVALID_DATE'],
  ['endDate', 'INVALID_DATE'],
  ['sortBy', 'INVALID_SORT'],
  ['sortOrder', 'INVALID_SORT']
]);

function rejectDuplicateParams(req, res, next) {
  const requestUrl = new URL(req.originalUrl, 'http://localhost');

  for (const [parameter, errorCode] of SINGLE_VALUE_PARAMS) {
    if (requestUrl.searchParams.getAll(parameter).length > 1) {
      next(new AppError(400, errorCode, 'Query parameter must appear at most once'));
      return;
    }
  }

  next();
}

module.exports = rejectDuplicateParams;
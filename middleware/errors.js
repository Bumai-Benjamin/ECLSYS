// SEC-7: last-resort error handler. The visitor sees a friendly page; the log
// gets the method, path and error code/message only. Request bodies, query
// strings and SQL are never logged, so passwords and OTPs can't leak there.

function describe(err) {
  if (!err) return 'Error';
  // mysql errors: code + errno is enough to diagnose; their messages can
  // quote values from the query (e.g. the duplicate email), so leave them out
  if (err.code && err.errno) return err.code + ' (errno ' + err.errno + ')';
  return (err.name || 'Error') + ': ' + err.message;
}

function errorHandler(err, req, res, next) {
  console.error('[error] ' + req.method + ' ' + req.path + ' -> ' + describe(err));
  if (res.headersSent) return next(err);
  res.status(500).render('error.ejs', {
    message: 'The request could not be completed. Please try again in a moment.'
  });
}

module.exports = { errorHandler: errorHandler };

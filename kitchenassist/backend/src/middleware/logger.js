const logger = (req, res, next) => {
  const start = process.hrtime.bigint();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const status = res.statusCode;
    const length = res.getHeader('content-length') || 0;
    // eslint-disable-next-line no-console
    console.log(
      `${method} ${originalUrl} ${status} ${length}b ${durationMs.toFixed(1)}ms`
    );
  });

  next();
};

module.exports = logger;

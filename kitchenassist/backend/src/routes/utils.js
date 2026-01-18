const omitUndefined = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));

module.exports = { omitUndefined };

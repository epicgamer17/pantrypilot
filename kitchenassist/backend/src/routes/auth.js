const { ObjectId } = require('mongodb');

const USER_ID_HEADER = 'x-user-id';
const HOUSEHOLD_ID_HEADER = 'x-household-id';

const PUBLIC_ROUTES = [
  { method: 'GET', path: '/health' },
  { method: 'POST', path: '/users/auth0' },
];

function isPublicRoute(req) {
  return PUBLIC_ROUTES.some(
    (route) => route.method === req.method && route.path === req.path
  );
}

function requireAuth(req, res, next) {
  if (isPublicRoute(req)) {
    return next();
  }

  const userId = req.header(USER_ID_HEADER);
  const householdId = req.header(HOUSEHOLD_ID_HEADER);

  const needsHousehold =
    req.path.startsWith('/households/') &&
    !req.path.startsWith('/households/join') &&
    req.method !== 'POST';

  if (!userId || !ObjectId.isValid(userId)) {
    return res.status(401).json({ error: 'Missing or invalid x-user-id.' });
  }

  if (needsHousehold && (!householdId || !ObjectId.isValid(householdId))) {
    return res.status(401).json({ error: 'Missing or invalid x-household-id.' });
  }

  req.auth = {
    userId,
    householdId: householdId || null,
  };

  return next();
}

module.exports = { requireAuth };

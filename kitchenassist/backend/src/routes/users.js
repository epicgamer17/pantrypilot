const express = require('express');
const { ObjectId } = require('mongodb');

const { omitUndefined } = require('./utils');

const router = express.Router();

router.post('/users/auth0', async (req, res) => {
  const { auth0UserId, email, firstName, lastName, auth0 } = req.body ?? {};

  if (!auth0UserId || !email) {
    return res.status(400).json({ error: 'auth0UserId and email are required.' });
  }

  const db = req.app.locals.db;
  const now = new Date();
  const data = omitUndefined({
    auth0UserId,
    email,
    firstName,
    lastName,
    auth0: auth0 ? omitUndefined(auth0) : undefined,
    updatedAt: now,
  });

  try {
    const result = await db.collection('users').findOneAndUpdate(
      { auth0UserId },
      {
        $set: data,
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    // UNIVERSAL FIX: Support both MongoDB Driver v5 ({ value: doc }) and v6 (doc directly)
    const userDoc = (result && result.value) ? result.value : result;

    if (!userDoc || !userDoc._id) {
      console.error('[POST /users/auth0] Critical Error: DB returned no document.', result);
      return res.status(500).json({ error: 'Failed to create/update user.' });
    }

    console.log(`[POST /users/auth0] Success. User ID: ${userDoc._id} (Type: ${typeof userDoc._id})`);
    return res.json(userDoc);
  } catch (err) {
    console.error('[POST /users/auth0] Exception:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const db = req.app.locals.db;

  // DEBUG LOGGING
  console.log(`[GET /users/:userId] searching for ID: "${userId}"`);

  if (!ObjectId.isValid(userId)) {
    console.warn(`[GET /users/:userId] Invalid Hex ID: ${userId}`);
    return res.status(400).json({ error: 'Invalid user id.' });
  }

  try {
    // Try finding by ObjectId
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });

    if (!user) {
      console.warn(`[GET /users/:userId] 404 Not Found for ObjectId("${userId}")`);
      // Fallback check: Did it somehow get saved as a string?
      const stringIdUser = await db.collection('users').findOne({ _id: userId });
      if (stringIdUser) {
        console.warn(`[GET /users/:userId] FOUND but id was stored as String, not ObjectId!`);
        return res.json(stringIdUser);
      }
      return res.status(404).json({ error: 'User not found.' });
    }

    console.log(`[GET /users/:userId] User found.`);
    return res.json(user);
  } catch (err) {
    console.error('[GET /users/:userId] Exception:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

router.patch('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const updates = req.body ?? {};
  const db = req.app.locals.db;

  const allowed = [
    'email',
    'firstName',
    'lastName',
    'householdId',
    'role',
    'foodPreferences',
    'notificationPreferences',
    'auth0',
  ];
  const updateFields = Object.fromEntries(
    Object.entries(updates).filter(([key, value]) => allowed.includes(key) && value !== undefined)
  );

  if (!Object.keys(updateFields).length) {
    return res.status(400).json({ error: 'No valid fields to update.' });
  }

  try {
    // Validation for householdId linking
    if (updateFields.householdId) {
      const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
      if (!user) return res.status(404).json({ error: 'User not found.' });

      // Prevent overwriting existing householdId if it's different (optional business logic)
      if (user.householdId && String(user.householdId) !== String(updateFields.householdId)) {
        return res.status(409).json({ error: 'User already belongs to a household.' });
      }
      updateFields.householdId = new ObjectId(updateFields.householdId);
    }

    const now = new Date();

    const result = await db.collection('users').findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $set: { ...updateFields, updatedAt: now } },
      { returnDocument: 'after' }
    );

    // UNIVERSAL FIX
    const userDoc = (result && result.value) ? result.value : result;

    if (!userDoc) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json(userDoc);
  } catch (err) {
    console.error('[PATCH /users/:userId] Exception:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/users/:userId/leave-household', async (req, res) => {
  const { userId } = req.params;
  const db = req.app.locals.db;

  if (!ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Invalid user id.' });
  }

  try {
    const now = new Date();
    const result = await db.collection('users').findOneAndUpdate(
      { _id: new ObjectId(userId) },
      {
        $unset: { householdId: '' },
        $set: { updatedAt: now },
      },
      { returnDocument: 'after' }
    );

    const userDoc = (result && result.value) ? result.value : result;

    if (!userDoc) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json(userDoc);
  } catch (err) {
    console.error('[POST /users/:userId/leave-household] Exception:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

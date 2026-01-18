const express = require('express');
const { ObjectId } = require('mongodb');

const router = express.Router();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/items', async (req, res) => {
  const { search, limit } = req.query ?? {};
  const db = req.app.locals.db;

  const parsedLimit = Math.min(Number(limit) || 20, 50);
  const filter = {};

  if (search) {
    filter.name = { $regex: String(search), $options: 'i' };
  }

  try {
    const items = await db
      .collection('items')
      .find(filter)
      .project({ name: 1, category: 1 })
      .sort({ name: 1 })
      .limit(parsedLimit)
      .toArray();

    return res.json(items.map((item) => ({
      id: item._id,
      name: item.name,
      category: item.category,
    })));
  } catch (err) {
    console.error('[GET /items] Exception:', err);
    return res.status(500).json({ error: 'Failed to fetch items.' });
  }
});

router.get('/items/lookup', async (req, res) => {
  const { ids } = req.query ?? {};
  const db = req.app.locals.db;

  if (!ids) {
    return res.json([]);
  }

  const idList = String(ids)
    .split(',')
    .map((id) => id.trim())
    .filter((id) => ObjectId.isValid(id));

  if (!idList.length) {
    return res.json([]);
  }

  try {
    const items = await db
      .collection('items')
      .find({ _id: { $in: idList.map((id) => new ObjectId(id)) } })
      .project({ name: 1, category: 1, packageQuantity: 1, packageUnit: 1 })
      .toArray();

    return res.json(
      items.map((item) => ({
        id: item._id,
        name: item.name,
        category: item.category,
        packageQuantity: item.packageQuantity,
        packageUnit: item.packageUnit,
      }))
    );
  } catch (err) {
    console.error('[GET /items/lookup] Exception:', err);
    return res.status(500).json({ error: 'Failed to fetch items.' });
  }
});

router.post('/items', async (req, res) => {
  const { name, category } = req.body ?? {};
  const trimmedName = typeof name === 'string' ? name.trim() : '';

  if (!trimmedName) {
    return res.status(400).json({ error: 'name is required.' });
  }

  const db = req.app.locals.db;
  const now = new Date();

  try {
    const existing = await db
      .collection('items')
      .findOne({ name: { $regex: `^${escapeRegExp(trimmedName)}$`, $options: 'i' } });

    if (existing) {
      return res.json({
        id: existing._id,
        name: existing.name,
        category: existing.category,
      });
    }

    const doc = {
      name: trimmedName,
      category: category || 'Other',
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('items').insertOne(doc);
    return res.status(201).json({
      id: result.insertedId,
      name: doc.name,
      category: doc.category,
    });
  } catch (err) {
    console.error('[POST /items] Exception:', err);
    return res.status(500).json({ error: 'Failed to create item.' });
  }
});

module.exports = router;

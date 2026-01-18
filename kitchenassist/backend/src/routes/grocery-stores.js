const express = require('express');
const { ObjectId } = require('mongodb');

const { omitUndefined } = require('./utils');

const router = express.Router();

// Helper for MongoDB Driver compatibility
const getDoc = (result) => (result && result.value) ? result.value : result;

router.post('/grocery-stores', async (req, res) => {
  const { name, location, phone, hours, seededTag } = req.body ?? {};

  if (!name || !location?.address || !location?.city || !location?.state || !location?.zipCode) {
    return res.status(400).json({ error: 'name and full location are required.' });
  }

  if (!location?.coordinates?.type || !location?.coordinates?.coordinates?.length) {
    return res.status(400).json({ error: 'location.coordinates is required.' });
  }

  const db = req.app.locals.db;
  const now = new Date();

  const store = {
    name,
    seededTag,
    location,
    phone,
    hours,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection('groceryStores').insertOne(omitUndefined(store));
  return res.status(201).json({ storeId: result.insertedId });
});

router.patch('/grocery-stores/:storeId', async (req, res) => {
  const { storeId } = req.params;
  const updates = req.body ?? {};

  const allowed = ['name', 'location', 'phone', 'hours'];
  const updateFields = Object.fromEntries(
    Object.entries(updates).filter(([key, value]) => allowed.includes(key) && value !== undefined)
  );

  if (!Object.keys(updateFields).length) {
    return res.status(400).json({ error: 'No valid fields to update.' });
  }

  const db = req.app.locals.db;
  const now = new Date();

  const result = await db.collection('groceryStores').findOneAndUpdate(
    { _id: new ObjectId(storeId) },
    { $set: { ...updateFields, updatedAt: now } },
    { returnDocument: 'after' }
  );

  const updatedStore = getDoc(result);

  if (!updatedStore) {
    return res.status(404).json({ error: 'Store not found.' });
  }

  return res.json(updatedStore);
});

router.delete('/grocery-stores/:storeId', async (req, res) => {
  const { storeId } = req.params;
  const db = req.app.locals.db;

  const result = await db.collection('groceryStores').deleteOne({ _id: new ObjectId(storeId) });
  if (!result.deletedCount) {
    return res.status(404).json({ error: 'Store not found.' });
  }

  return res.status(204).send();
});

router.get('/grocery-stores/nearby', async (req, res) => {
  const {
    lat,
    lng,
    radius = '3000',
    limit = '20',
    name,
    city,
    state,
    zipCode,
    seededTag,
  } = req.query;
  const latitude = Number(lat);
  const longitude = Number(lng);
  const maxDistance = Number(radius);
  const maxResults = Number(limit);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: 'lat and lng must be numbers.' });
  }

  const db = req.app.locals.db;

  const filters = {
    'location.coordinates': {
      $near: {
        $geometry: { type: 'Point', coordinates: [longitude, latitude] },
        $maxDistance: maxDistance,
      },
    },
    ...(name ? { name: { $regex: name, $options: 'i' } } : {}),
    ...(seededTag ? { seededTag } : {}),
    ...(city ? { 'location.city': city } : {}),
    ...(state ? { 'location.state': state } : {}),
    ...(zipCode ? { 'location.zipCode': zipCode } : {}),
  };

  const stores = await db.collection('groceryStores').find(filters).limit(maxResults).toArray();

  return res.json(stores);
});

router.get('/grocery-stores/items/search', async (req, res) => {
  const {
    query,
    storeId,
    category,
    subcategory,
    brand,
    onSale,
    inStock,
    minPrice,
    maxPrice,
    limit = '50',
    sortBy = 'price',
    sortOrder = 'asc',
  } = req.query;

  const db = req.app.locals.db;
  const priceMin = minPrice !== undefined ? Number(minPrice) : undefined;
  const priceMax = maxPrice !== undefined ? Number(maxPrice) : undefined;
  const maxResults = Number(limit);
  const order = String(sortOrder).toLowerCase() === 'desc' ? -1 : 1;

  const inventoryMatch = {
    ...(storeId ? { storeId: new ObjectId(String(storeId)) } : {}),
    ...(onSale !== undefined ? { onSale: String(onSale).toLowerCase() === 'true' } : {}),
    ...(inStock !== undefined ? { inStock: String(inStock).toLowerCase() === 'true' } : {}),
    ...(Number.isFinite(priceMin) ? { price: { ...(priceMax !== undefined ? {} : { $gte: priceMin }) } } : {}),
    ...(Number.isFinite(priceMax) ? { price: { ...(priceMin !== undefined ? {} : { $lte: priceMax }) } } : {}),
  };

  if (Number.isFinite(priceMin) && Number.isFinite(priceMax)) {
    inventoryMatch.price = { $gte: priceMin, $lte: priceMax };
  }

  const itemMatch = {
    ...(query ? { name: { $regex: String(query), $options: 'i' } } : {}),
    ...(category ? { category: String(category) } : {}),
    ...(subcategory ? { subcategory: String(subcategory) } : {}),
    ...(brand ? { brand: { $regex: String(brand), $options: 'i' } } : {}),
  };

  const sortMap = {
    price: { price: order },
    name: { 'item.name': order },
    store: { 'store.name': order },
    updated: { lastUpdated: order },
  };

  const pipeline = [
    { $match: inventoryMatch },
    {
      $lookup: {
        from: 'items',
        localField: 'itemId',
        foreignField: '_id',
        as: 'item',
      },
    },
    { $unwind: '$item' },
    ...(Object.keys(itemMatch).length ? [{ $match: itemMatch }] : []),
    {
      $lookup: {
        from: 'groceryStores',
        localField: 'storeId',
        foreignField: '_id',
        as: 'store',
      },
    },
    { $unwind: '$store' },
    { $sort: sortMap[sortBy] ?? { price: order } },
    { $limit: Number.isFinite(maxResults) ? maxResults : 50 },
    {
      $project: {
        _id: 1,
        price: 1,
        onSale: 1,
        salePrice: 1,
        inStock: 1,
        aisle: 1,
        lastUpdated: 1,
        item: 1,
        store: 1,
      },
    },
  ];

  const results = await db.collection('storeInventory').aggregate(pipeline).toArray();
  return res.json(results);
});

router.get('/grocery-stores/items/prices', async (req, res) => {
  const { ids, limit = '50' } = req.query ?? {};
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

  const maxResults = Number(limit);

  const pipeline = [
    { $match: { itemId: { $in: idList.map((id) => new ObjectId(id)) } } },
    {
      $addFields: {
        effectivePrice: {
          $cond: [{ $ifNull: ['$onSale', false] }, { $ifNull: ['$salePrice', '$price'] }, '$price'],
        },
      },
    },
    { $sort: { effectivePrice: 1 } },
    {
      $group: {
        _id: '$itemId',
        price: { $first: '$price' },
        salePrice: { $first: '$salePrice' },
        onSale: { $first: '$onSale' },
        storeId: { $first: '$storeId' },
        effectivePrice: { $first: '$effectivePrice' },
      },
    },
    {
      $lookup: {
        from: 'items',
        localField: '_id',
        foreignField: '_id',
        as: 'item',
      },
    },
    { $unwind: { path: '$item', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'groceryStores',
        localField: 'storeId',
        foreignField: '_id',
        as: 'store',
      },
    },
    { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
    { $limit: Number.isFinite(maxResults) ? maxResults : 50 },
    {
      $project: {
        _id: 0,
        itemId: '$_id',
        price: 1,
        salePrice: 1,
        onSale: 1,
        storeId: 1,
        storeName: '$store.name',
        itemName: '$item.name',
        effectivePrice: 1,
      },
    },
  ];

  const results = await db.collection('storeInventory').aggregate(pipeline).toArray();
  return res.json(results);
});

module.exports = router;

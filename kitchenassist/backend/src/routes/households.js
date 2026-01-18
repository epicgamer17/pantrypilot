const express = require('express');
const { ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const { omitUndefined } = require('./utils');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${unique}_${safeName}`);
  },
});

const upload = multer({ storage });

const LOG_PREFIX = '__standard__: Successfully created JSON: ';

const getStoreFilter = (store) => {
  if (store.location?.address || store.location?.city) {
    return {
      name: store.name,
      'location.address': store.location?.address,
      'location.city': store.location?.city,
      'location.state': store.location?.state,
      'location.zipCode': store.location?.zipCode,
    };
  }
  return { name: store.name };
};

const getItemFilter = (item) => {
  if (item.barcode) {
    return { barcode: item.barcode };
  }
  const filter = { name: item.name };
  if (item.brand) {
    filter.brand = item.brand;
  }
  return filter;
};

const cleanString = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const lowered = trimmed.toLowerCase();
  if (!trimmed || lowered === 'n/a' || lowered === 'not specified')
    return undefined;
  return trimmed;
};

const normalizeCoordinates = (coordinates) => {
  if (!coordinates) return undefined;
  if (Array.isArray(coordinates)) {
    const nums = coordinates.map((entry) => Number(entry));
    if (nums.every((entry) => Number.isFinite(entry))) return nums;
    return undefined;
  }
  if (typeof coordinates === 'string') {
    const trimmed = coordinates.trim();
    if (!trimmed) return undefined;
    const parts = trimmed.split(',').map((entry) => Number(entry.trim()));
    if (parts.length >= 2 && parts.every((entry) => Number.isFinite(entry))) {
      return parts.slice(0, 2);
    }
  }
  return undefined;
};

const normalizeNumber = (value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeStorePayload = (store) => {
  if (!store || typeof store !== 'object') return null;
  const normalized = { ...store };
  const location = { ...(store.location ?? {}) };

  Object.entries(store).forEach(([key, value]) => {
    if (!key.startsWith('location.')) return;
    const path = key.split('.').slice(1);
    let target = location;
    for (let i = 0; i < path.length - 1; i += 1) {
      if (!target[path[i]] || typeof target[path[i]] !== 'object') {
        target[path[i]] = {};
      }
      target = target[path[i]];
    }
    target[path[path.length - 1]] = value;
    delete normalized[key];
  });

  if (Object.keys(location).length) {
    normalized.location = location;
  }

  if (normalized.location) {
    normalized.location = omitUndefined({
      address: cleanString(normalized.location.address),
      city: cleanString(normalized.location.city),
      state: cleanString(normalized.location.state),
      zipCode: cleanString(normalized.location.zipCode),
      coordinates: omitUndefined({
        type: cleanString(normalized.location.coordinates?.type) || 'Point',
        coordinates: normalizeCoordinates(
          normalized.location.coordinates?.coordinates,
        ) || [0, 0],
      }),
    });
  }

  return normalized;
};

const normalizeReceiptItem = (item) => {
  if (!item || typeof item !== 'object') return null;
  const parsedPackageQuantity = normalizeNumber(item.packageQuantity);
  return omitUndefined({
    name: cleanString(item.name),
    category: cleanString(item.category),
    subcategory: cleanString(item.subcategory),
    brand: cleanString(item.brand),
    barcode: cleanString(item.barcode),
    packageQuantity: parsedPackageQuantity,
    packageUnit: cleanString(item.packageUnit),
    defaultUnit: cleanString(item.defaultUnit),
    nutritionalInfo: item.nutritionalInfo,
    averageShelfLife: item.averageShelfLife,
    storageLocation: item.storageLocation,
    imageUrl: item.imageUrl,
    tags: item.tags,
    price: normalizeNumber(item.price),
    salePrice: normalizeNumber(item.salePrice),
    onSale: item.onSale,
    inStock: item.inStock,
    aisle: item.aisle,
    quantity: normalizeNumber(item.quantity),
    unit: item.unit,
    location: item.location,
    purchaseDate: item.purchaseDate,
    expirationDate: item.expirationDate,
    isOpen: item.isOpen,
    notes: item.notes,
  });
};

const extractReceiptData = (runResponse) => {
  const logEntries = Array.isArray(runResponse?.log) ? runResponse.log : [];
  const parsedObjects = [];
  logEntries.forEach((entry) => {
    if (typeof entry !== 'string' || !entry.startsWith(LOG_PREFIX)) return;
    const jsonStr = entry.slice(LOG_PREFIX.length).trim();
    try {
      parsedObjects.push(JSON.parse(jsonStr));
    } catch (error) {
      return;
    }
  });

  if (parsedObjects.length > 0) {
    return {
      store: parsedObjects[parsedObjects.length - 1],
      items: parsedObjects.slice(0, -1),
    };
  }

  if (runResponse?.outputs?.store || runResponse?.outputs?.items) {
    return {
      store: runResponse.outputs.store,
      items: runResponse.outputs.items ?? [],
    };
  }

  return { store: null, items: [] };
};

const callReceiptPipeline = async ({
  baseUrl,
  apiKey,
  userId,
  savedItemId,
  receiptImage,
}) => {
  const startUrl = new URL('/start_pipeline', baseUrl);
  startUrl.searchParams.set('user_id', userId);
  startUrl.searchParams.set('saved_item_id', savedItemId);

  const startResponse = await fetch(startUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ receipt_image: receiptImage }),
  });

  if (!startResponse.ok) {
    const errorText = await startResponse.text();
    throw new Error(errorText || `Status ${startResponse.status}`);
  }

  const startData = await startResponse.json();
  const runId = startData?.run_id;
  if (!runId) {
    return startData;
  }

  const pollUrl = new URL('/get_pl_run', baseUrl);
  pollUrl.searchParams.set('run_id', runId);
  pollUrl.searchParams.set('user_id', userId);

  const timeoutMs = 120000;
  const pollIntervalMs = 2000;
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const pollResponse = await fetch(pollUrl.toString(), {
      headers: { Authorization: apiKey },
    });
    if (!pollResponse.ok) {
      const errorText = await pollResponse.text();
      throw new Error(errorText || `Status ${pollResponse.status}`);
    }
    const pollData = await pollResponse.json();
    const state = pollData?.state;
    if (state === 'DONE') {
      return pollData;
    }
    if (state === 'FAILED') {
      throw new Error('Receipt pipeline failed.');
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error('Receipt pipeline timed out.');
};

// Helper for MongoDB Driver compatibility (v5 vs v6)
const getDoc = (result) => (result && result.value ? result.value : result);

router.post('/households', async (req, res) => {
  const { name, userId, location } = req.body ?? {};

  if (!name || !userId) {
    return res.status(400).json({ error: 'name and userId are required.' });
  }

  const db = req.app.locals.db;
  const now = new Date();
  const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();

  const user = await db
    .collection('users')
    .findOne({ _id: new ObjectId(userId) });
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  if (user.householdId) {
    return res
      .status(409)
      .json({ error: 'User already belongs to a household.' });
  }

  const household = {
    name,
    location: location ?? {},
    preferredStores: [],
    fridgeItems: [],
    shoppingList: [],
    savedRecipes: [],
    inviteCode,
    createdAt: now,
    updatedAt: now,
  };

  const householdResult = await db
    .collection('households')
    .insertOne(household);

  await db
    .collection('users')
    .updateOne(
      { _id: new ObjectId(userId) },
      { $set: { householdId: householdResult.insertedId, updatedAt: now } },
    );

  return res
    .status(201)
    .json({ householdId: householdResult.insertedId, inviteCode });
});

router.post('/households/join', async (req, res) => {
  const { inviteCode, userId } = req.body ?? {};

  if (!inviteCode || !userId) {
    return res
      .status(400)
      .json({ error: 'inviteCode and userId are required.' });
  }

  const db = req.app.locals.db;
  const now = new Date();

  const user = await db
    .collection('users')
    .findOne({ _id: new ObjectId(userId) });
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  if (user.householdId) {
    return res
      .status(409)
      .json({ error: 'User already belongs to a household.' });
  }

  const household = await db.collection('households').findOne({ inviteCode });
  if (!household) {
    return res.status(404).json({ error: 'Household not found.' });
  }

  await db
    .collection('users')
    .updateOne(
      { _id: new ObjectId(userId) },
      { $set: { householdId: household._id, updatedAt: now } },
    );

  return res.json({ householdId: household._id });
});

router.post(
  '/households/:householdId/receipts',
  upload.single('receipt'),
  async (req, res) => {
    const { householdId } = req.params;
    const pipelineBaseUrl = process.env.RECEIPT_PIPELINE_BASE_URL;
    const pipelineUserId = process.env.RECEIPT_PIPELINE_USER_ID;
    const pipelineSavedItemId = process.env.RECEIPT_PIPELINE_SAVED_ITEM_ID;
    const pipelineApiKey = process.env.RECEIPT_PIPELINE_API_KEY;

    if (!req.file) {
      return res.status(400).json({ error: 'Missing receipt file.' });
    }
    if (
      !pipelineBaseUrl ||
      !pipelineUserId ||
      !pipelineSavedItemId ||
      !pipelineApiKey
    ) {
      return res
        .status(500)
        .json({ error: 'Missing receipt pipeline configuration.' });
    }

    const db = req.app.locals.db;
    const now = new Date();
    const imageUrl = `/uploads/${req.file.filename}`;
    const receiptImage = `${req.protocol}://${req.get('host')}${imageUrl}`;

    let webhookData;
    try {
      const runResponse = await callReceiptPipeline({
        baseUrl: pipelineBaseUrl,
        apiKey: pipelineApiKey,
        userId: pipelineUserId,
        savedItemId: pipelineSavedItemId,
        receiptImage,
      });
      webhookData = extractReceiptData(runResponse);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Receipt pipeline request failed.';
      console.error('Receipt pipeline request failed:', message);
      return res.status(502).json({ error: message });
    }

    const groceryStore = normalizeStorePayload(
      webhookData.groceryStore ?? webhookData.store,
    );
    const itemPayload =
      webhookData.items ?? webhookData.item ?? webhookData.itemData;
    const itemDataList = Array.isArray(itemPayload)
      ? itemPayload
      : itemPayload
        ? [itemPayload]
        : [];

    if (!groceryStore || !itemDataList.length) {
      return res
        .status(400)
        .json({ error: 'Webhook response missing groceryStore or items.' });
    }
    if (!groceryStore.name) {
      return res
        .status(400)
        .json({ error: 'Webhook response missing groceryStore.name.' });
    }
    if (
      !groceryStore.location?.address ||
      !groceryStore.location?.city ||
      !groceryStore.location?.state
    ) {
      return res
        .status(400)
        .json({ error: 'Webhook response missing groceryStore.location.' });
    }

    // Store Upsert
    const storeResult = await db.collection('groceryStores').findOneAndUpdate(
      getStoreFilter(groceryStore),
      {
        $set: omitUndefined({
          name: groceryStore.name,
          location: groceryStore.location,
          phone: groceryStore.phone,
          hours: groceryStore.hours,
          updatedAt: now,
        }),
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: 'after' },
    );
    const storeDoc = getDoc(storeResult);
    const storeId = storeDoc?._id;

    if (!storeId) {
      return res.status(500).json({ error: 'Failed to upsert grocery store.' });
    }

    const results = [];

    for (const rawItem of itemDataList) {
      const itemData = normalizeReceiptItem(rawItem);
      if (!itemData?.name) {
        continue;
      }

      const itemResult = await db.collection('items').findOneAndUpdate(
        getItemFilter(itemData),
        {
          $set: omitUndefined({
            name: itemData.name,
            category: itemData.category,
            subcategory: itemData.subcategory,
            brand: itemData.brand,
            barcode: itemData.barcode,
            packageQuantity: itemData.packageQuantity,
            packageUnit: itemData.packageUnit,
            defaultUnit: itemData.defaultUnit,
            nutritionalInfo: itemData.nutritionalInfo,
            averageShelfLife: itemData.averageShelfLife,
            storageLocation: itemData.storageLocation,
            imageUrl: itemData.imageUrl,
            tags: itemData.tags,
            updatedAt: now,
          }),
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, returnDocument: 'after' },
      );
      const itemDoc = getDoc(itemResult);
      const itemId = itemDoc?._id;

      if (!itemId) {
        continue;
      }

      if (itemData.price !== undefined || itemData.salePrice !== undefined) {
        await db.collection('storeInventory').findOneAndUpdate(
          { storeId, itemId },
          {
            $set: omitUndefined({
              price: itemData.price ?? itemData.salePrice ?? 0,
              onSale: itemData.onSale ?? false,
              salePrice: itemData.salePrice,
              inStock: itemData.inStock ?? true,
              aisle: itemData.aisle,
              lastUpdated: now,
            }),
            $setOnInsert: { storeId, itemId },
          },
          { upsert: true },
        );
      }

      const fridgeItemId = new ObjectId();
      const fridgeItem = omitUndefined({
        _id: fridgeItemId,
        itemId,
        quantity: itemData.quantity ?? 1,
        unit: itemData.unit ?? itemData.defaultUnit ?? 'count',
        location: itemData.location ?? 'fridge',
        purchasePrice:
          itemData.purchasePrice ?? itemData.price ?? itemData.salePrice,
        purchaseDate: itemData.purchaseDate
          ? new Date(itemData.purchaseDate)
          : now,
        expirationDate: itemData.expirationDate
          ? new Date(itemData.expirationDate)
          : undefined,
        isOpen: itemData.isOpen,
        notes: itemData.notes,
        addedBy: req.auth?.userId ? new ObjectId(req.auth.userId) : undefined,
        addedAt: now,
      });

      await db
        .collection('households')
        .updateOne(
          { _id: new ObjectId(householdId) },
          { $push: { fridgeItems: fridgeItem }, $set: { updatedAt: now } },
        );

      results.push({ itemId, fridgeItemId });
    }

    return res.status(201).json({
      householdId,
      storeId,
      imageUrl,
      items: results,
    });
  },
);

router.get('/households/:householdId', async (req, res) => {
  const { householdId } = req.params;
  const db = req.app.locals.db;

  const household = await db
    .collection('households')
    .findOne({ _id: new ObjectId(householdId) });
  if (!household) {
    return res.status(404).json({ error: 'Household not found.' });
  }

  return res.json(household);
});

router.get('/households/:householdId/fridge-items', async (req, res) => {
  const { householdId } = req.params;
  const db = req.app.locals.db;

  try {
    const pipeline = [
      { $match: { _id: new ObjectId(householdId) } },
      { $unwind: { path: '$fridgeItems', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'items',
          localField: 'fridgeItems.itemId',
          foreignField: '_id',
          as: 'itemDetails',
        },
      },
      { $unwind: { path: '$itemDetails', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          id: '$fridgeItems._id',
          itemId: '$fridgeItems.itemId',
          name: '$itemDetails.name',
          category: '$itemDetails.category',
          quantity: '$fridgeItems.quantity',
          initialQuantity: '$fridgeItems.quantity',
          unit: '$fridgeItems.unit',
          purchasePrice: { $ifNull: ['$fridgeItems.purchasePrice', 0] },
          purchaseDate: '$fridgeItems.purchaseDate',
          expiryDate: '$fridgeItems.expirationDate',
          store: { $literal: 'Store' },
          isUsed: '$fridgeItems.isOpen',
        },
      },
    ];

    const results = await db
      .collection('households')
      .aggregate(pipeline)
      .toArray();
    const items = results.filter((r) => r.id); // Filter out if no items
    return res.json(items);
  } catch (err) {
    console.error('Error fetching fridge items:', err);
    return res.status(500).json({ error: 'Failed to fetch fridge items.' });
  }
});

router.patch(
  '/households/:householdId/fridge-items/:fridgeItemId',
  async (req, res) => {
    const { householdId, fridgeItemId } = req.params;
    const updates = req.body ?? {};

    const allowed = [
      'quantity',
      'unit',
      'location',
      'purchaseDate',
      'expirationDate',
      'isOpen',
      'notes',
      'purchasePrice',
    ];
    const updateFields = Object.fromEntries(
      Object.entries(updates).filter(
        ([key, value]) => allowed.includes(key) && value !== undefined,
      ),
    );

    if (!Object.keys(updateFields).length) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    if (updateFields.purchaseDate)
      updateFields.purchaseDate = new Date(updateFields.purchaseDate);
    if (updateFields.expirationDate)
      updateFields.expirationDate = new Date(updateFields.expirationDate);
    if (updateFields.purchasePrice !== undefined)
      updateFields.purchasePrice = Number(updateFields.purchasePrice);

    const db = req.app.locals.db;
    const now = new Date();

    const setFields = Object.fromEntries(
      Object.entries(updateFields).map(([key, value]) => [
        `fridgeItems.$.${key}`,
        value,
      ]),
    );

    const result = await db
      .collection('households')
      .findOneAndUpdate(
        {
          _id: new ObjectId(householdId),
          'fridgeItems._id': new ObjectId(fridgeItemId),
        },
        { $set: { ...setFields, updatedAt: now } },
        { returnDocument: 'after' },
      );

    const updatedHousehold = getDoc(result);

    if (!updatedHousehold) {
      return res
        .status(404)
        .json({ error: 'Household or fridge item not found.' });
    }

    return res.json(updatedHousehold);
  },
);

// NEW: Delete Fridge Item Endpoint
router.delete(
  '/households/:householdId/fridge-items/:fridgeItemId',
  async (req, res) => {
    const { householdId, fridgeItemId } = req.params;
    const db = req.app.locals.db;
    const now = new Date();

    try {
      const result = await db.collection('households').updateOne(
        { _id: new ObjectId(householdId) },
        {
          $pull: { fridgeItems: { _id: new ObjectId(fridgeItemId) } },
          $set: { updatedAt: now },
        },
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Household not found.' });
      }

      if (result.modifiedCount === 0) {
        return res
          .status(404)
          .json({ error: 'Fridge item not found in household.' });
      }

      return res.status(200).json({ message: 'Item removed successfully.' });
    } catch (error) {
      console.error('Error removing fridge item:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  },
);

router.post('/households/:householdId/fridge-items', async (req, res) => {
  const { householdId } = req.params;
  let {
    itemId,
    name,
    category,
    quantity,
    unit,
    location,
    purchaseDate,
    expirationDate,
    isOpen,
    notes,
    addedBy,
  } = req.body ?? {};

  const db = req.app.locals.db;
  const now = new Date();

  // Auto-create item if only name provided
  if (!itemId && name) {
    let itemDoc = await db.collection('items').findOne({ name: name });
    if (!itemDoc) {
      const newItem = {
        name,
        category: category || 'Other',
        createdAt: now,
        updatedAt: now,
      };
      const createRes = await db.collection('items').insertOne(newItem);
      itemId = createRes.insertedId;
    } else {
      itemId = itemDoc._id;
    }
  }

  if (
    !itemId ||
    quantity === undefined ||
    !unit ||
    !location ||
    !purchaseDate
  ) {
    return res
      .status(400)
      .json({
        error:
          'itemId (or name), quantity, unit, location, and purchaseDate are required.',
      });
  }

  const fridgeItemId = new ObjectId();
  const fridgeItem = omitUndefined({
    _id: fridgeItemId,
    itemId: new ObjectId(itemId),
    quantity: Number(quantity),
    unit,
    location,
    purchasePrice:
      purchasePrice !== undefined ? Number(purchasePrice) : undefined,
    purchaseDate: new Date(purchaseDate),
    expirationDate: expirationDate ? new Date(expirationDate) : undefined,
    isOpen,
    notes,
    addedBy: addedBy ? new ObjectId(addedBy) : undefined,
    addedAt: now,
  });

  const result = await db
    .collection('households')
    .findOneAndUpdate(
      { _id: new ObjectId(householdId) },
      { $push: { fridgeItems: fridgeItem }, $set: { updatedAt: now } },
      { returnDocument: 'after' },
    );

  const updatedHousehold = getDoc(result);

  if (!updatedHousehold) {
    return res.status(404).json({ error: 'Household not found.' });
  }

  return res.status(201).json({ fridgeItemId, household: updatedHousehold });
});

router.patch('/households/:householdId', async (req, res) => {
  const { householdId } = req.params;
  const updates = req.body ?? {};

  const allowed = [
    'name',
    'location',
    'preferredStores',
    'fridgeItems',
    'shoppingList',
    'savedRecipes',
  ];
  const updateFields = Object.fromEntries(
    Object.entries(updates).filter(
      ([key, value]) => allowed.includes(key) && value !== undefined,
    ),
  );

  if (!Object.keys(updateFields).length) {
    return res.status(400).json({ error: 'No valid fields to update.' });
  }

  const db = req.app.locals.db;
  const now = new Date();

  if (Array.isArray(updateFields.shoppingList)) {
    updateFields.shoppingList = updateFields.shoppingList.map((item) =>
      omitUndefined({
        itemId:
          item.itemId && ObjectId.isValid(item.itemId)
            ? new ObjectId(item.itemId)
            : undefined,
        quantity: item.quantity !== undefined ? Number(item.quantity) : 1,
        unit: item.unit || 'unit',
        priority: item.priority || 'medium',
        addedBy:
          item.addedBy && ObjectId.isValid(item.addedBy)
            ? new ObjectId(item.addedBy)
            : undefined,
        addedAt: item.addedAt ? new Date(item.addedAt) : now,
        purchased: item.purchased ?? false,
        purchasedBy:
          item.purchasedBy && ObjectId.isValid(item.purchasedBy)
            ? new ObjectId(item.purchasedBy)
            : undefined,
        purchasedAt: item.purchasedAt ? new Date(item.purchasedAt) : undefined,
        purchasedFrom:
          item.purchasedFrom && ObjectId.isValid(item.purchasedFrom)
            ? new ObjectId(item.purchasedFrom)
            : undefined,
      }),
    );
  }

  const result = await db
    .collection('households')
    .findOneAndUpdate(
      { _id: new ObjectId(householdId) },
      { $set: { ...updateFields, updatedAt: now } },
      { returnDocument: 'after' },
    );

  const updatedHousehold = getDoc(result);

  if (!updatedHousehold) {
    return res.status(404).json({ error: 'Household not found.' });
  }

  return res.json(updatedHousehold);
});

module.exports = router;

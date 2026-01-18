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
    category: cleanString(item.category) || 'Other',
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
  const startUrl = `${baseUrl}/start_pipeline?user_id=${userId}&saved_item_id=${savedItemId}`;

  console.log('Start pipeline URL:', startUrl);

  const startResponse = await fetch(startUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify({ receipt_image: receiptImage }),
  });

  console.log('Start pipeline response status:', startResponse.status);

  if (!startResponse.ok) {
    const errorText = await startResponse.text();
    console.log('Start pipeline error:', errorText);
    throw new Error(errorText || `Status ${startResponse.status}`);
  }

  const startData = await startResponse.json();
  const runId = startData?.run_id;
  if (!runId) {
    return startData;
  }

  const pollUrl = `${baseUrl}/get_pl_run?run_id=${runId}&user_id=${userId}`;

  const timeoutMs = 120000;
  const pollIntervalMs = 2000;
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const pollResponse = await fetch(pollUrl, {
      headers: { 'Authorization': apiKey },
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

// Receipt processing from Gmail
router.post('/households/:householdId/receipts/from-gmail', async (req, res) => {
  const { householdId } = req.params;
  const emailUrl = process.env.EMAIL_URL;
  const pipelineApiKey = process.env.API_KEY || 'ef1f551abfa5460f945f8a5e32979b91';
  const pipelineBaseUrl = process.env.BASE_URL || 'https://api.gumloop.com/api/v1';
  const pipelineUserId = process.env.USER_ID || '6IBmuxzZmmXRRQ4lX4EiGO1GeoJ2';

  if (!emailUrl) {
    return res.status(500).json({ error: 'EMAIL_URL not configured in environment' });
  }

  const db = req.app.locals.db;
  const now = new Date();

  console.log('Processing receipt from Gmail');
  console.log('EMAIL_URL:', emailUrl);
  console.log('API_KEY:', pipelineApiKey ? `${pipelineApiKey.substring(0, 15)}...` : 'MISSING');

  let webhookData;
  try {
    // Start the pipeline
    console.log('Starting Gmail pipeline with URL:', emailUrl);
    
    const authHeader = `Bearer ${pipelineApiKey.replace('Bearer ', '')}`;
    console.log('Authorization header:', authHeader.substring(0, 20) + '...');
    
    const startResponse = await fetch(emailUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
    });

    console.log('Gmail pipeline response status:', startResponse.status);

    if (!startResponse.ok) {
      const errorText = await startResponse.text();
      console.log('Gmail pipeline error:', errorText);
      throw new Error(errorText || `Status ${startResponse.status}`);
    }

    const startData = await startResponse.json();
    const runId = startData?.run_id;
    
    if (!runId) {
      if (startData.outputs && startData.state === 'DONE') {
        webhookData = extractReceiptData(startData);
      } else {
        throw new Error('No run_id in pipeline response');
      }
    } else {
      // Poll for completion
      const pollUrl = `${pipelineBaseUrl}/get_pl_run?run_id=${runId}&user_id=${pipelineUserId}`;
      const timeoutMs = 120000;
      const pollIntervalMs = 2000;
      const startTime = Date.now();
      
      while (Date.now() - startTime < timeoutMs) {
        const pollResponse = await fetch(pollUrl, {
          headers: { 'Authorization': pipelineApiKey.startsWith('Bearer ') ? pipelineApiKey : `Bearer ${pipelineApiKey}` },
        });
        
        if (!pollResponse.ok) {
          const errorText = await pollResponse.text();
          throw new Error(errorText || `Status ${pollResponse.status}`);
        }
        
        const pollData = await pollResponse.json();
        const state = pollData?.state;
        console.log('Gmail pipeline state:', state);
        
        if (state === 'DONE') {
          webhookData = extractReceiptData(pollData);
          break;
        }
        if (state === 'FAILED') {
          console.log('Gmail pipeline failed. Full response:', JSON.stringify(pollData));
          
          // Extract user-friendly error from logs
          let errorMsg = 'Gmail receipt pipeline failed.';
          const logs = pollData?.log || [];
          for (const log of logs) {
            if (typeof log === 'string' && log.includes('__standard__:')) {
              const match = log.match(/__standard__:\s*(.+)/);
              if (match) {
                errorMsg = match[1].replace(/\u001b\[\d+m/g, '').trim(); // Remove ANSI color codes
                break;
              }
            }
          }
          
          throw new Error(errorMsg);
        }
        
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
      
      if (!webhookData) {
        throw new Error('Gmail receipt pipeline timed out.');
      }
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Gmail receipt pipeline request failed.';
    console.error('Gmail receipt pipeline request failed:', message);
    return res.status(502).json({ error: message });
  }

  let groceryStore = normalizeStorePayload(
    webhookData.groceryStore ?? webhookData.store,
  );
  const itemPayload =
    webhookData.items ?? webhookData.item ?? webhookData.itemData;
  const itemDataList = Array.isArray(itemPayload)
    ? itemPayload
    : itemPayload
      ? [itemPayload]
      : [];

  console.log('Gmail extracted store:', JSON.stringify(groceryStore));
  console.log('Gmail extracted items count:', itemDataList.length);

  // If the store looks like item data (has category, brand, etc.), use a default store
  if (groceryStore && (groceryStore.category || groceryStore.brand || groceryStore.packageUnit)) {
    console.log('Gmail: Store data appears to be item data, using default store');
    groceryStore = {
      name: 'Gmail Receipt Store',
      location: {
        address: 'Unknown',
        city: 'Unknown',
        state: 'Unknown',
        zipCode: '00000',
        coordinates: { type: 'Point', coordinates: [0, 0] }
      },
    };
  }

  if (!groceryStore || !itemDataList.length) {
    console.log('Missing store or items:', webhookData);
    return res
      .status(400)
      .json({ error: 'Gmail response missing groceryStore or items.' });
  }
  if (!groceryStore.name) {
    return res
      .status(400)
      .json({ error: 'Gmail response missing groceryStore.name.' });
  }

  // Store Upsert - ensure all required fields are present
  const storeLocation = groceryStore.location || {};
  const gmailStoreUpdateData = {
    name: groceryStore.name,
    location: {
      address: storeLocation.address || 'Unknown',
      city: storeLocation.city || 'Unknown',
      state: storeLocation.state || 'Unknown',
      zipCode: storeLocation.zipCode || '00000',
      coordinates: storeLocation.coordinates || { type: 'Point', coordinates: [0, 0] }
    },
    updatedAt: now,
  };
  // Add optional fields only if defined
  if (groceryStore.phone) gmailStoreUpdateData.phone = groceryStore.phone;
  if (groceryStore.hours) gmailStoreUpdateData.hours = groceryStore.hours;

  console.log('Upserting store with data:', JSON.stringify(gmailStoreUpdateData));

  const storeResult = await db.collection('groceryStores').findOneAndUpdate(
    getStoreFilter(groceryStore),
    {
      $set: gmailStoreUpdateData,
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, returnDocument: 'after' },
  ).catch(err => {
    console.error('Store upsert failed:', err.message);
    console.error('Store data:', JSON.stringify(groceryStore));
    throw err;
  });
  const storeDoc = getDoc(storeResult);
  const storeId = storeDoc?._id;

  if (!storeId) {
    return res.status(500).json({ error: 'Failed to upsert grocery store.' });
  }

  const fridgeItemsToAdd = [];

  for (const rawItem of itemDataList) {
    const itemData = normalizeReceiptItem(rawItem);
    if (!itemData?.name) {
      continue;
    }

    const itemResult = await db.collection('items').findOneAndUpdate(
      getItemFilter(itemData),
      {
        $set: {
          name: itemData.name,
          category: itemData.category || 'Other',
          updatedAt: now,
          ...omitUndefined({
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
          }),
        },
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
            updatedAt: now,
          }),
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
    }

    const parsedExpiryDate = itemData.expirationDate ?? itemData.expiryDate;
    const expiryDate =
      parsedExpiryDate instanceof Date
        ? parsedExpiryDate
        : typeof parsedExpiryDate === 'string' && parsedExpiryDate.trim()
          ? new Date(parsedExpiryDate)
          : null;

    const finalExpiryDate =
      expiryDate && !isNaN(expiryDate.getTime()) ? expiryDate : null;

    const fridgeItemId = new ObjectId();
    const fridgeItem = omitUndefined({
      _id: fridgeItemId,
      itemId,
      quantity: Number(itemData.quantity ?? 1),
      unit: itemData.unit || itemData.packageUnit || itemDoc?.defaultUnit || 'unit',
      location: itemData.storageLocation || 'fridge',
      purchasePrice: Number(itemData.price ?? itemData.salePrice ?? 0),
      purchaseDate: now,
      expirationDate: finalExpiryDate ? finalExpiryDate : undefined,
      isOpen: itemData.isOpen ?? false,
      notes: itemData.notes,
      addedAt: now,
    });

    // Add to household's fridgeItems array
    await db.collection('households').updateOne(
      { _id: new ObjectId(householdId) },
      { 
        $push: { fridgeItems: fridgeItem },
        $set: { updatedAt: now }
      }
    );

    fridgeItemsToAdd.push({ itemId, fridgeItemId });
  }

  console.log(`Processed ${fridgeItemsToAdd.length} items from Gmail receipt`);

  return res.json({
    householdId: new ObjectId(householdId),
    storeId,
    items: fridgeItemsToAdd,
  });
});

// Receipt processing from URL
router.post('/households/:householdId/receipts/from-url', async (req, res) => {
  const { householdId } = req.params;
  const { receiptUrl } = req.body;
  const pipelineBaseUrl = process.env.BASE_URL || 'https://api.gumloop.com/api/v1';
  const pipelineUserId = process.env.USER_ID || '6IBmuxzZmmXRRQ4lX4EiGO1GeoJ2';
  const pipelineSavedItemId = process.env.SAVED_ITEM_ID || 'qPJPBHYMYQXZcYqG7dX13o';
  const pipelineApiKey = process.env.API_KEY || 'ef1f551abfa5460f945f8a5e32979b91';

  if (!receiptUrl || typeof receiptUrl !== 'string') {
    return res.status(400).json({ error: 'receiptUrl is required.' });
  }

  const db = req.app.locals.db;
  const now = new Date();

  console.log('Processing receipt from URL:', receiptUrl);
  console.log('Pipeline config:', {
    baseUrl: pipelineBaseUrl,
    apiKey: pipelineApiKey ? `${pipelineApiKey.substring(0, 10)}...` : 'MISSING',
    userId: pipelineUserId,
    savedItemId: pipelineSavedItemId,
  });

  let webhookData;
  try {
    const runResponse = await callReceiptPipeline({
      baseUrl: pipelineBaseUrl,
      apiKey: pipelineApiKey,
      userId: pipelineUserId,
      savedItemId: pipelineSavedItemId,
      receiptImage: receiptUrl,
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

  let groceryStore = normalizeStorePayload(
    webhookData.groceryStore ?? webhookData.store,
  );
  const itemPayload =
    webhookData.items ?? webhookData.item ?? webhookData.itemData;
  const itemDataList = Array.isArray(itemPayload)
    ? itemPayload
    : itemPayload
      ? [itemPayload]
      : [];

  console.log('URL: Extracted store:', JSON.stringify(groceryStore));
  console.log('URL: Extracted items count:', itemDataList.length);

  // If the store looks like item data (has category, brand, etc.), use a default store
  if (groceryStore && (groceryStore.category || groceryStore.brand || groceryStore.packageUnit)) {
    console.log('URL: Store data appears to be item data, using default store');
    groceryStore = {
      name: 'Receipt Store',
      location: {
        address: 'Unknown',
        city: 'Unknown',
        state: 'Unknown',
        zipCode: '00000',
        coordinates: { type: 'Point', coordinates: [0, 0] }
      },
    };
  }

  if (!groceryStore || !itemDataList.length) {
    console.log('Missing store or items:', webhookData);
    return res
      .status(400)
      .json({ error: 'Webhook response missing groceryStore or items.' });
  }
  if (!groceryStore.name) {
    return res
      .status(400)
      .json({ error: 'Webhook response missing groceryStore.name.' });
  }

  // Store Upsert - ensure all required fields are present
  const storeLocation = groceryStore.location || {};
  const urlStoreUpdateData = {
    name: groceryStore.name,
    location: {
      address: storeLocation.address || 'Unknown',
      city: storeLocation.city || 'Unknown',
      state: storeLocation.state || 'Unknown',
      zipCode: storeLocation.zipCode || '00000',
      coordinates: storeLocation.coordinates || { type: 'Point', coordinates: [0, 0] }
    },
    createdAt: now,
    updatedAt: now,
  };
  // Add optional fields only if defined
  if (groceryStore.phone) urlStoreUpdateData.phone = groceryStore.phone;
  if (groceryStore.hours) urlStoreUpdateData.hours = groceryStore.hours;

  console.log('URL: Upserting store with data:', JSON.stringify(urlStoreUpdateData));

  const storeResult = await db.collection('groceryStores').findOneAndUpdate(
    getStoreFilter(groceryStore),
    {
      $set: urlStoreUpdateData,
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, returnDocument: 'after' },
  ).catch(err => {
    console.error('URL: Store upsert failed:', err.message);
    console.error('URL: Store data:', JSON.stringify(groceryStore));
    console.error('URL: Update data:', JSON.stringify(urlStoreUpdateData));
    throw err;
  });
  const storeDoc = getDoc(storeResult);
  const storeId = storeDoc?._id;

  if (!storeId) {
    return res.status(500).json({ error: 'Failed to upsert grocery store.' });
  }

  const fridgeItemsToAdd = [];

  for (const rawItem of itemDataList) {
    const itemData = normalizeReceiptItem(rawItem);
    if (!itemData?.name) {
      continue;
    }

    const itemResult = await db.collection('items').findOneAndUpdate(
      getItemFilter(itemData),
      {
        $set: {
          name: itemData.name,
          category: itemData.category || 'Other',
          updatedAt: now,
          ...omitUndefined({
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
          }),
        },
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
            updatedAt: now,
          }),
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
    }

    const parsedExpiryDate = itemData.expirationDate ?? itemData.expiryDate;
    const expiryDate =
      parsedExpiryDate instanceof Date
        ? parsedExpiryDate
        : typeof parsedExpiryDate === 'string' && parsedExpiryDate.trim()
          ? new Date(parsedExpiryDate)
          : null;

    const finalExpiryDate =
      expiryDate && !isNaN(expiryDate.getTime()) ? expiryDate : null;

    const fridgeItemId = new ObjectId();
    const fridgeItem = omitUndefined({
      _id: fridgeItemId,
      itemId,
      quantity: Number(itemData.quantity ?? 1),
      unit: itemData.unit || itemData.packageUnit || itemDoc?.defaultUnit || 'unit',
      location: itemData.storageLocation || 'fridge',
      purchasePrice: Number(itemData.price ?? itemData.salePrice ?? 0),
      purchaseDate: now,
      expirationDate: finalExpiryDate ? finalExpiryDate : undefined,
      isOpen: itemData.isOpen ?? false,
      notes: itemData.notes,
      addedAt: now,
    });

    // Add to household's fridgeItems array
    await db.collection('households').updateOne(
      { _id: new ObjectId(householdId) },
      { 
        $push: { fridgeItems: fridgeItem },
        $set: { updatedAt: now }
      }
    );

    fridgeItemsToAdd.push({ itemId, fridgeItemId });
  }

  console.log(`Processed ${fridgeItemsToAdd.length} items from receipt URL`);

  return res.json({
    householdId: new ObjectId(householdId),
    storeId,
    items: fridgeItemsToAdd,
  });
});

router.post(
  '/households/:householdId/receipts',
  upload.single('receipt'),
  async (req, res) => {
    const { householdId } = req.params;
    const pipelineBaseUrl = process.env.BASE_URL || 'https://api.gumloop.com/api/v1';
    const pipelineUserId = process.env.USER_ID || '6IBmuxzZmmXRRQ4lX4EiGO1GeoJ2';
    const pipelineSavedItemId = process.env.SAVED_ITEM_ID || 'qPJPBHYMYQXZcYqG7dX13o';
    const pipelineApiKey = process.env.API_KEY || 'ef1f551abfa5460f945f8a5e32979b91';

    if (!req.file) {
      return res.status(400).json({ error: 'Missing receipt file.' });
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

    // Store Upsert - ensure all required fields are present
    const storeLocation = groceryStore.location || {};
    const uploadStoreUpdateData = {
      name: groceryStore.name,
      location: {
        address: storeLocation.address || 'Unknown',
        city: storeLocation.city || 'Unknown',
        state: storeLocation.state || 'Unknown',
        zipCode: storeLocation.zipCode || '00000',
        coordinates: storeLocation.coordinates || { type: 'Point', coordinates: [0, 0] }
      },
      createdAt: now,
      updatedAt: now,
    };
    // Add optional fields only if defined
    if (groceryStore.phone) uploadStoreUpdateData.phone = groceryStore.phone;
    if (groceryStore.hours) uploadStoreUpdateData.hours = groceryStore.hours;

    console.log('Upload: Upserting store with data:', JSON.stringify(uploadStoreUpdateData));

    const storeResult = await db.collection('groceryStores').findOneAndUpdate(
      getStoreFilter(groceryStore),
      {
        $set: uploadStoreUpdateData,
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: 'after' },
    ).catch(err => {
      console.error('Upload: Store upsert failed:', err.message);
      console.error('Upload: Store data:', JSON.stringify(groceryStore));
      throw err;
    });
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

router.get('/households/:householdId/members', async (req, res) => {
  const { householdId } = req.params;
  const db = req.app.locals.db;

  if (!ObjectId.isValid(householdId)) {
    return res.status(400).json({ error: 'Invalid household id.' });
  }

  try {
    const members = await db
      .collection('users')
      .find({ householdId: new ObjectId(householdId) })
      .project({ firstName: 1, lastName: 1, email: 1 })
      .toArray();

    const formatted = members.map((member) => ({
      id: member._id,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
    }));

    return res.json(formatted);
  } catch (error) {
    console.error('[GET /households/:householdId/members] Exception:', error);
    return res.status(500).json({ error: 'Failed to fetch household members.' });
  }
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
          id: { $ifNull: ['$fridgeItems._id', '$fridgeItems.itemId'] },
          itemId: '$fridgeItems.itemId',
          name: { $ifNull: ['$itemDetails.name', '$fridgeItems.name'] },
          category: { $ifNull: ['$itemDetails.category', '$fridgeItems.category'] },
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
    const items = results.filter((r) => r.id || r.itemId); // Filter out if no items
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

    if (!ObjectId.isValid(householdId) || !ObjectId.isValid(fridgeItemId)) {
      return res.status(400).json({ error: 'Invalid household or fridge item id.' });
    }

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
    const percentWastedRaw = Number(req.body?.percentWasted ?? 0);
    const percentWasted =
      Number.isFinite(percentWastedRaw) && percentWastedRaw > 0
        ? Math.min(100, Math.max(0, percentWastedRaw))
        : 0;
    const userIdHeader = req.headers['x-user-id'];

    try {
      if (percentWasted > 0) {
        try {
          const household = await db.collection('households').findOne(
            {
              _id: new ObjectId(householdId),
              'fridgeItems._id': new ObjectId(fridgeItemId),
            },
            {
              projection: {
                fridgeItems: { $elemMatch: { _id: new ObjectId(fridgeItemId) } },
              },
            },
          );
          const fridgeItem = household?.fridgeItems?.[0];
          if (fridgeItem) {
            const quantity = Number(fridgeItem.quantity ?? 0);
            const purchasePrice = Number(fridgeItem.purchasePrice ?? 0);
            const wastedQuantity = Number.isFinite(quantity)
              ? (quantity * percentWasted) / 100
              : 0;
            const wasteCost = Number.isFinite(purchasePrice)
              ? purchasePrice * wastedQuantity
              : 0;
            const userId =
              typeof userIdHeader === 'string' && ObjectId.isValid(userIdHeader)
                ? new ObjectId(userIdHeader)
                : undefined;

            const itemId =
              fridgeItem.itemId && ObjectId.isValid(fridgeItem.itemId)
                ? new ObjectId(fridgeItem.itemId)
                : undefined;

            await db.collection('consumptionHistory').insertOne({
              householdId: new ObjectId(householdId),
              itemId,
              userId,
              quantityConsumed: wastedQuantity,
              unit: fridgeItem.unit || 'unit',
              consumptionDate: now,
              consumptionType: 'waste',
              wasteReason: 'user_marked_waste',
              originalPurchaseDate: fridgeItem.purchaseDate
                ? new Date(fridgeItem.purchaseDate)
                : undefined,
              percentWasted,
              wasteCost,
              createdAt: now,
            });
          }
        } catch (error) {
          console.error('Error recording waste entry:', error);
        }
      }

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
    purchasePrice,
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

  const resolvedItemId = ObjectId.isValid(itemId) ? new ObjectId(itemId) : null;
  if (!resolvedItemId) {
    return res.status(400).json({ error: 'Invalid itemId.' });
  }

  let resolvedPurchasePrice =
    purchasePrice !== undefined ? Number(purchasePrice) : undefined;
  if (resolvedPurchasePrice === undefined) {
    const [priceDoc] = await db
      .collection('storeInventory')
      .aggregate([
        { $match: { itemId: resolvedItemId } },
        {
          $addFields: {
            effectivePrice: {
              $cond: [
                { $ifNull: ['$onSale', false] },
                { $ifNull: ['$salePrice', '$price'] },
                '$price',
              ],
            },
          },
        },
        { $sort: { effectivePrice: 1 } },
        { $limit: 1 },
        { $project: { _id: 0, effectivePrice: 1 } },
      ])
      .toArray();
    if (priceDoc?.effectivePrice !== undefined) {
      resolvedPurchasePrice = Number(priceDoc.effectivePrice);
    }
  }

  const fridgeItemId = new ObjectId();
  const fridgeItem = omitUndefined({
    _id: fridgeItemId,
    itemId: resolvedItemId,
    quantity: Number(quantity),
    unit,
    location,
    purchasePrice:
      resolvedPurchasePrice !== undefined ? resolvedPurchasePrice : undefined,
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
        fromRecipe: item.fromRecipe,
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

router.post('/households/:householdId/purchases', async (req, res) => {
  const { householdId } = req.params;
  const { items } = req.body ?? {};

  if (!ObjectId.isValid(householdId)) {
    return res.status(400).json({ error: 'Invalid household id.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required.' });
  }

  const db = req.app.locals.db;
  const now = new Date();
  const docs = items
    .map((item) => {
      if (!ObjectId.isValid(item.itemId)) return null;
      const quantity = Number(item.quantity ?? 1);
      const pricePerUnit = Number(item.pricePerUnit ?? 0);
      const purchasedAt = item.purchasedAt ? new Date(item.purchasedAt) : now;
      return omitUndefined({
        householdId: new ObjectId(householdId),
        itemId: new ObjectId(item.itemId),
        userId: item.userId && ObjectId.isValid(item.userId) ? new ObjectId(item.userId) : undefined,
        quantity: Number.isFinite(quantity) ? quantity : 1,
        unit: item.unit || 'unit',
        pricePerUnit: Number.isFinite(pricePerUnit) ? pricePerUnit : 0,
        totalPrice:
          Number.isFinite(quantity) && Number.isFinite(pricePerUnit)
            ? quantity * pricePerUnit
            : undefined,
        storeName: item.storeName,
        purchasedAt,
        createdAt: now,
      });
    })
    .filter(Boolean);

  if (!docs.length) {
    return res.status(400).json({ error: 'No valid items to record.' });
  }

  await db.collection('purchaseHistory').insertMany(docs);
  const userIdSet = new Set();
  const itemIdSet = new Set();
  docs.forEach((doc) => {
    if (doc.userId) userIdSet.add(String(doc.userId));
    if (doc.itemId) itemIdSet.add(String(doc.itemId));
  });

  const normalizeCategoryKey = (value) =>
    String(value || 'Other').replace(/[.$]/g, '_');

  if (userIdSet.size && itemIdSet.size) {
    const itemIds = Array.from(itemIdSet).map((id) => new ObjectId(id));
    const items = await db
      .collection('items')
      .find({ _id: { $in: itemIds } })
      .project({ name: 1, category: 1 })
      .toArray();
    const itemMap = new Map(
      items.map((item) => [String(item._id), item]),
    );

    const userIds = Array.from(userIdSet).map((id) => new ObjectId(id));
    const users = await db
      .collection('users')
      .find({ _id: { $in: userIds } })
      .project({
        spendByCategory: 1,
        mostExpensivePurchasePerUnit: 1,
        mostExpensivePurchaseLine: 1,
      })
      .toArray();
    const userMap = new Map(users.map((user) => [String(user._id), user]));

    const aggregates = new Map();
    docs.forEach((doc) => {
      if (!doc.userId) return;
      const userId = String(doc.userId);
      const itemInfo = itemMap.get(String(doc.itemId));
      const category = normalizeCategoryKey(itemInfo?.category);
      const name = itemInfo?.name || 'Item';
      const quantity = Number(doc.quantity ?? 0);
      const pricePerUnit = Number(doc.pricePerUnit ?? 0);
      const totalPrice = Number.isFinite(doc.totalPrice)
        ? Number(doc.totalPrice)
        : quantity * pricePerUnit;
      if (!Number.isFinite(totalPrice)) return;

      const entry = aggregates.get(userId) || {
        spendByCategory: {},
        mostExpensivePerUnit: null,
        mostExpensiveLine: null,
      };
      entry.spendByCategory[category] =
        (entry.spendByCategory[category] || 0) + totalPrice;

      const candidate = {
        itemId: doc.itemId,
        name,
        category: itemInfo?.category || 'Other',
        pricePerUnit,
        totalPrice,
        purchasedAt: doc.purchasedAt,
      };
      if (!entry.mostExpensiveLine || totalPrice > entry.mostExpensiveLine.totalPrice) {
        entry.mostExpensiveLine = candidate;
      }
      if (!entry.mostExpensivePerUnit || pricePerUnit > entry.mostExpensivePerUnit.pricePerUnit) {
        entry.mostExpensivePerUnit = {
          itemId: doc.itemId,
          name,
          category: itemInfo?.category || 'Other',
          pricePerUnit,
          purchasedAt: doc.purchasedAt,
        };
      }
      aggregates.set(userId, entry);
    });

    const updates = [];
    aggregates.forEach((entry, userId) => {
      const user = userMap.get(userId);
      if (!user) return;
      const nextSpend = { ...(user.spendByCategory ?? {}) };
      Object.entries(entry.spendByCategory).forEach(([category, amount]) => {
        nextSpend[category] = (nextSpend[category] || 0) + amount;
      });

      const existingPerUnit = user.mostExpensivePurchasePerUnit;
      const nextPerUnit =
        entry.mostExpensivePerUnit &&
          (!existingPerUnit ||
            entry.mostExpensivePerUnit.pricePerUnit >
              Number(existingPerUnit.pricePerUnit ?? 0))
          ? entry.mostExpensivePerUnit
          : existingPerUnit;

      const existingLine = user.mostExpensivePurchaseLine;
      const nextLine =
        entry.mostExpensiveLine &&
          (!existingLine ||
            entry.mostExpensiveLine.totalPrice >
              Number(existingLine.totalPrice ?? 0))
          ? entry.mostExpensiveLine
          : existingLine;

      const update = {
        $set: {
          spendByCategory: nextSpend,
          updatedAt: now,
        },
      };
      if (nextPerUnit) {
        update.$set.mostExpensivePurchasePerUnit = nextPerUnit;
      }
      if (nextLine) {
        update.$set.mostExpensivePurchaseLine = nextLine;
      }

      updates.push({
        updateOne: {
          filter: { _id: new ObjectId(userId) },
          update,
        },
      });
    });

    if (updates.length) {
      await db.collection('users').bulkWrite(updates);
    }
  }
  return res.status(201).json({ recorded: docs.length });
});

router.get('/households/:householdId/purchases', async (req, res) => {
  const { householdId } = req.params;
  const { limit = '100' } = req.query ?? {};

  if (!ObjectId.isValid(householdId)) {
    return res.status(400).json({ error: 'Invalid household id.' });
  }

  const db = req.app.locals.db;
  const maxResults = Number(limit);
  const pipeline = [
    { $match: { householdId: new ObjectId(householdId) } },
    { $sort: { purchasedAt: -1 } },
    { $limit: Number.isFinite(maxResults) ? maxResults : 100 },
    {
      $lookup: {
        from: 'items',
        localField: 'itemId',
        foreignField: '_id',
        as: 'item',
      },
    },
    { $unwind: { path: '$item', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        itemId: 1,
        name: '$item.name',
        category: '$item.category',
        quantity: 1,
        unit: 1,
        pricePerUnit: 1,
        totalPrice: 1,
        storeName: 1,
        purchasedAt: 1,
      },
    },
  ];

  const results = await db.collection('purchaseHistory').aggregate(pipeline).toArray();
  return res.json(results);
});

module.exports = router;

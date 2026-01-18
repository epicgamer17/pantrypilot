const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
const {
  groceryStoreSchema,
  storeInventorySchema,
  itemSchema,
  recipeSchema,
  householdSchema,
  userSchema,
  consumptionHistorySchema,
  purchaseHistorySchema,
  mealPlanSchema,
  imageSchema,
} = require('../src/schema');

dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;

if (!uri) {
  throw new Error('Missing MONGODB_URI');
}
if (!dbName) {
  throw new Error('Missing MONGODB_DB_NAME');
}

const collections = [
  { name: 'groceryStores', schema: groceryStoreSchema },
  { name: 'storeInventory', schema: storeInventorySchema },
  { name: 'items', schema: itemSchema },
  { name: 'recipes', schema: recipeSchema },
  { name: 'households', schema: householdSchema },
  { name: 'users', schema: userSchema },
  { name: 'consumptionHistory', schema: consumptionHistorySchema },
  { name: 'purchaseHistory', schema: purchaseHistorySchema },
  { name: 'mealPlans', schema: mealPlanSchema },
  { name: 'images', schema: imageSchema },
];

async function ensureCollection(db, name, schema) {
  const existing = await db.listCollections({ name }).toArray();
  if (existing.length === 0) {
    await db.createCollection(name, {
      validator: { $jsonSchema: schema },
      validationLevel: 'strict',
      validationAction: 'error',
    });
  } else {
    await db.command({
      collMod: name,
      validator: { $jsonSchema: schema },
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }
}

async function createIndexes(db) {
  await db.collection('groceryStores').createIndex({ 'location.coordinates': '2dsphere' });

  await db.collection('storeInventory').createIndex({ storeId: 1, itemId: 1 }, { unique: true });
  await db.collection('storeInventory').createIndex({ itemId: 1 });
  await db.collection('storeInventory').createIndex({ storeId: 1 });

  await db.collection('items').createIndex({ name: 'text', brand: 'text' });
  await db.collection('items').createIndex({ category: 1 });
  await db.collection('items').createIndex({ barcode: 1 });

  await db.collection('recipes').createIndex({ name: 'text', description: 'text' });
  await db.collection('recipes').createIndex({ tags: 1 });
  await db.collection('recipes').createIndex({ 'ingredients.itemId': 1 });

  await db.collection('households').createIndex({ 'location.coordinates': '2dsphere' });
  await db.collection('households').createIndex({ 'fridgeItems.itemId': 1 });

  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('users').createIndex({ householdId: 1 });

  await db.collection('consumptionHistory').createIndex({ householdId: 1, consumptionDate: -1 });
  await db.collection('consumptionHistory').createIndex({ itemId: 1, consumptionDate: -1 });
  await db
    .collection('consumptionHistory')
    .createIndex({ householdId: 1, itemId: 1 });
  await db.collection('consumptionHistory').createIndex({ userId: 1 });
  await db.collection('consumptionHistory').createIndex({ consumptionType: 1 });

  await db.collection('purchaseHistory').createIndex({ householdId: 1, purchasedAt: -1 });
  await db.collection('purchaseHistory').createIndex({ itemId: 1, purchasedAt: -1 });
  await db.collection('purchaseHistory').createIndex({ userId: 1 });

  await db.collection('mealPlans').createIndex({ householdId: 1, startDate: -1 });

  await db.collection('images').createIndex({ uploadedBy: 1, createdAt: -1 });
  await db.collection('images').createIndex({ householdId: 1, createdAt: -1 });
}

async function run() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(dbName);

  for (const collection of collections) {
    await ensureCollection(db, collection.name, collection.schema);
  }

  await createIndexes(db);

  await client.close();
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Database initialized');
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Database initialization failed:', error);
    process.exit(1);
  });

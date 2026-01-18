const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;

if (!uri) {
  throw new Error('Missing MONGODB_URI');
}
if (!dbName) {
  throw new Error('Missing MONGODB_DB_NAME');
}

async function cleanup() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(dbName);

  const itemResult = await db.collection('items').deleteMany({ tags: 'seeded' });
  const storeResult = await db.collection('groceryStores').deleteMany({ seededTag: 'seeded' });
  const householdResult = await db.collection('households').deleteMany({ seededTag: 'seeded' });

  await client.close();

  // eslint-disable-next-line no-console
  console.log(
    `Deleted ${itemResult.deletedCount} seeded items, ${storeResult.deletedCount} stores, and ${householdResult.deletedCount} households.`
  );
}

cleanup().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Cleanup failed:', error);
  process.exit(1);
});

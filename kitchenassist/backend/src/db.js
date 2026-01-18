const { MongoClient } = require('mongodb');

let client;

async function connectToDatabase(uri) {
  if (!uri) {
    throw new Error('Missing MONGODB_URI');
  }

  if (!client) {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
  }

  return client;
}

async function closeDatabase() {
  if (client) {
    await client.close();
    client = undefined;
  }
}

module.exports = { connectToDatabase, closeDatabase };

const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');

const { connectToDatabase, closeDatabase } = require('./db');
const routes = require('./routes');
const logger = require('./middleware/logger');

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(logger);
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(routes);

async function startServer() {
  const dbName = process.env.MONGODB_DB_NAME;
  if (!dbName) {
    throw new Error('Missing MONGODB_DB_NAME');
  }

  const client = await connectToDatabase(process.env.MONGODB_URI);
  app.locals.db = client.db(dbName);

  const server = app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${port}`);
  });

  const shutdown = async () => {
    await closeDatabase();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', error);
  process.exit(1);
});

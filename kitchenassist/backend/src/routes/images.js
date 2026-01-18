const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { ObjectId } = require('mongodb');

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

router.post('/images', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Missing image file.' });
  }

  const db = req.app.locals.db;
  const now = new Date();

  const imageDoc = omitUndefined({
    filename: req.file.filename,
    originalName: req.file.originalname,
    path: `/uploads/${req.file.filename}`,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedBy: req.header('x-user-id') ? new ObjectId(req.header('x-user-id')) : undefined,
    householdId: req.header('x-household-id') ? new ObjectId(req.header('x-household-id')) : undefined,
    tags: req.body.tags ? String(req.body.tags).split(',').map((tag) => tag.trim()).filter(Boolean) : undefined,
    createdAt: now,
    updatedAt: now,
  });

  const result = await db.collection('images').insertOne(imageDoc);

  return res.status(201).json({ imageId: result.insertedId, url: imageDoc.path });
});

module.exports = router;

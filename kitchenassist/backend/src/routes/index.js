const express = require('express');

const { requireAuth } = require('./auth');
const health = require('./health');
const users = require('./users');
const households = require('./households');
const groceryStores = require('./grocery-stores');
const images = require('./images');
const recipes = require('./recipes'); // Import the new route
const items = require('./items');

const router = express.Router();

// Comment out the next line to disable auth enforcement globally.
router.use(requireAuth);
router.use(health);
router.use(users);
router.use(households);
router.use(groceryStores);
router.use(images);
router.use(recipes); // Use the new route
router.use(items);

module.exports = router;

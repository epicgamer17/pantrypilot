const express = require('express');
const { ObjectId } = require('mongodb');
const { omitUndefined } = require('./utils');

const router = express.Router();

// GET all recipes (optionally filter by household or public)
router.get('/recipes', async (req, res) => {
    const { householdId, limit, publicOnly } = req.query;
    const db = req.app.locals.db;

    const query = {};

    // 1. Discover Mode: Show only public recipes
    if (publicOnly === 'true') {
        query.isPublic = true;
    }
    // 2. My Recipes Mode: Show only this household's recipes
    else if (householdId) {
        if (ObjectId.isValid(householdId)) {
            query.householdId = new ObjectId(householdId);
        }
    }

    const recipes = await db.collection('recipes')
        .find(query)
        .sort({ createdAt: -1 }) // Sort by Newest First so new recipes don't get cut off
        .limit(Number(limit) || 20)
        .toArray();

    // Transform _id to id for frontend convenience if needed
    const result = recipes.map(r => ({ ...r, id: r._id }));
    return res.json(result);
});

// POST a new recipe
router.post('/recipes', async (req, res) => {
    const { name, ingredients, instructions, householdId, isPublic } = req.body;

    if (!name || !ingredients) {
        return res.status(400).json({ error: 'Name and ingredients are required' });
    }
    if (!Array.isArray(ingredients) || !ingredients.length) {
        return res.status(400).json({ error: 'Ingredients must be a non-empty array.' });
    }

    const normalizedIngredients = ingredients.map((ingredient) => ({
        ...omitUndefined({
            name: ingredient.name,
            quantity: ingredient.quantity,
            unit: ingredient.unit,
            notes: ingredient.notes,
            isOptional: ingredient.isOptional,
            itemId: ingredient.itemId ? new ObjectId(ingredient.itemId) : undefined,
        }),
    }));

    const missingItem = normalizedIngredients.some((ingredient) => !ingredient.itemId);
    if (missingItem) {
        return res.status(400).json({ error: 'Each ingredient must include itemId.' });
    }

    const db = req.app.locals.db;
    const now = new Date();

    const newRecipe = {
        name,
        ingredients: normalizedIngredients,
        instructions: instructions || [],
        householdId: householdId ? new ObjectId(householdId) : undefined,
        isPublic: !!isPublic, // Explicitly save public status (defaults to false)
        createdAt: now,
        updatedAt: now
    };

    const result = await db.collection('recipes').insertOne(newRecipe);
    return res.status(201).json({ ...newRecipe, id: result.insertedId });
});

// PUT update a recipe
router.put('/recipes/:id', async (req, res) => {
    const { id } = req.params;
    const { name, ingredients, instructions, isPublic } = req.body;
    const db = req.app.locals.db;

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid recipe ID' });
    }

    if (!name || !ingredients) {
        return res.status(400).json({ error: 'Name and ingredients are required' });
    }

    const normalizedIngredients = ingredients.map((ingredient) => ({
        ...omitUndefined({
            name: ingredient.name,
            quantity: ingredient.quantity,
            unit: ingredient.unit,
            notes: ingredient.notes,
            isOptional: ingredient.isOptional,
            itemId: ingredient.itemId ? new ObjectId(ingredient.itemId) : undefined,
        }),
    }));

    // Ensure itemIds are present
    const missingItem = normalizedIngredients.some((ingredient) => !ingredient.itemId);
    if (missingItem) {
        return res.status(400).json({ error: 'Each ingredient must include itemId.' });
    }

    const updateDoc = {
        $set: {
            name,
            ingredients: normalizedIngredients,
            instructions: instructions || [],
            isPublic: !!isPublic,
            updatedAt: new Date()
        }
    };

    const result = await db.collection('recipes').updateOne(
        { _id: new ObjectId(id) },
        updateDoc
    );

    if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Recipe not found' });
    }

    return res.json({ id, ...req.body, updatedAt: updateDoc.$set.updatedAt });
});

module.exports = router;
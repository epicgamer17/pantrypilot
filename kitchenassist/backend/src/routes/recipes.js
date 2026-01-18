const express = require('express');
const { ObjectId } = require('mongodb');
const { omitUndefined } = require('./utils');

const router = express.Router();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const buildGeminiPrompt = (fridgeItems) => {
    const itemSchema = {
        name: 'string',
        category: 'string',
        quantity: 'number',
        unit: 'string',
    };
    const ingredientSchema = {
        name: 'string',
        quantity: 'number',
        unit: 'string',
        notes: 'string (optional)',
    };
    const recipeSchema = {
        name: 'string',
        servings: 'number',
        ingredients: [ingredientSchema],
        instructions: ['string'],
    };

    return [
        'You are a recipe generator.',
        'Return ONLY valid JSON (no markdown) that conforms to the recipe schema below.',
        'Use only ingredients that can be reasonably made from the fridge items list. You do not have to use every item; focus on making a good simple meal.',
        'Use realistic quantities and units.',
        '',
        `Recipe schema: ${JSON.stringify(recipeSchema)}`,
        `Ingredient schema: ${JSON.stringify(ingredientSchema)}`,
        `Item schema: ${JSON.stringify(itemSchema)}`,
        '',
        `Fridge items: ${JSON.stringify(fridgeItems)}`,
    ].join('\n');
};

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
    const { name, ingredients, instructions, householdId, isPublic, servings, isAiGenerated } = req.body;

    if (!name || !ingredients) {
        return res.status(400).json({ error: 'Name and ingredients are required' });
    }
    if (!Array.isArray(ingredients) || !ingredients.length) {
        return res.status(400).json({ error: 'Ingredients must be a non-empty array.' });
    }

    const invalidQuantity = ingredients.some(
        (ingredient) => !Number.isFinite(Number(ingredient.quantity)),
    );
    if (invalidQuantity) {
        return res.status(400).json({ error: 'Each ingredient must include a numeric quantity.' });
    }
    const invalidUnit = ingredients.some((ingredient) => typeof ingredient.unit !== 'string' || !ingredient.unit);
    if (invalidUnit) {
        return res.status(400).json({ error: 'Each ingredient must include a unit.' });
    }

    const normalizedIngredients = ingredients.map((ingredient) => ({
        ...omitUndefined({
            name: ingredient.name,
            quantity: Number(ingredient.quantity),
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

    const parsedServings = Number(servings);
    const newRecipe = omitUndefined({
        name,
        ingredients: normalizedIngredients,
        instructions: Array.isArray(instructions) ? instructions : [],
        servings: Number.isFinite(parsedServings) ? parsedServings : undefined,
        householdId: householdId ? new ObjectId(householdId) : undefined,
        isPublic: !!isPublic, // Explicitly save public status (defaults to false)
        isAiGenerated: !!isAiGenerated,
        createdAt: now,
        updatedAt: now
    });
    let result;
    try {
        result = await db.collection('recipes').insertOne(newRecipe);
    } catch (e) {
        console.log(JSON.stringify(e))
    }
    return res.status(201).json({ ...newRecipe, id: result.insertedId });
});

// PUT update a recipe
router.put('/recipes/:id', async (req, res) => {
    const { id } = req.params;
    const { name, ingredients, instructions, isPublic, servings, isAiGenerated } = req.body;
    const db = req.app.locals.db;

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid recipe ID' });
    }

    if (!name || !ingredients) {
        return res.status(400).json({ error: 'Name and ingredients are required' });
    }

    const invalidQuantity = ingredients.some(
        (ingredient) => !Number.isFinite(Number(ingredient.quantity)),
    );
    if (invalidQuantity) {
        return res.status(400).json({ error: 'Each ingredient must include a numeric quantity.' });
    }
    const invalidUnit = ingredients.some((ingredient) => typeof ingredient.unit !== 'string' || !ingredient.unit);
    if (invalidUnit) {
        return res.status(400).json({ error: 'Each ingredient must include a unit.' });
    }

    const normalizedIngredients = ingredients.map((ingredient) => ({
        ...omitUndefined({
            name: ingredient.name,
            quantity: Number(ingredient.quantity),
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

    const parsedServings = Number(servings);
    const shouldUnsetServings = servings === null || servings === '';
    const updateDoc = {
        $set: omitUndefined({
            name,
            ingredients: normalizedIngredients,
            instructions: Array.isArray(instructions) ? instructions : [],
            servings: Number.isFinite(parsedServings) ? parsedServings : undefined,
            isPublic: !!isPublic,
            isAiGenerated: isAiGenerated === undefined ? undefined : !!isAiGenerated,
            updatedAt: new Date()
        }),
        ...(shouldUnsetServings ? { $unset: { servings: '' } } : {}),
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

// DELETE a recipe
router.delete('/recipes/:id', async (req, res) => {
    const { id } = req.params;
    const db = req.app.locals.db;

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid recipe ID' });
    }

    const result = await db.collection('recipes').deleteOne({ _id: new ObjectId(id) });
    if (!result.deletedCount) {
        return res.status(404).json({ error: 'Recipe not found' });
    }

    return res.status(204).send();
});

router.post('/recipes/generate', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
    }

    const { fridgeItems } = req.body ?? {};
    if (!Array.isArray(fridgeItems) || fridgeItems.length === 0) {
        return res.status(400).json({ error: 'fridgeItems is required.' });
    }

    const prompt = buildGeminiPrompt(fridgeItems);
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                }),
            },
        );
        if (!response.ok) {
            const text = await response.text();
            return res.status(500).json({ error: 'Gemini request failed', details: text });
        }
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start === -1 || end === -1) {
            return res.status(500).json({ error: 'Gemini response was not JSON.' });
        }
        const parsed = JSON.parse(text.slice(start, end + 1));
        return res.json({ recipe: parsed });
    } catch (error) {
        return res.status(500).json({ error: 'Gemini request failed.' });
    }
});

module.exports = router;

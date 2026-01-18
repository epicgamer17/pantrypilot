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

router.post('/recipes/from-article', async (req, res) => {
    // Use the exact configuration from article-recipe.py
    const API_KEY = process.env.GUMLOOP_API_KEY || 'ef1f551abfa5460f945f8a5e32979b91';
    const USER_ID = process.env.GUMLOOP_USER_ID || '6IBmuxzZmmXRRQ4lX4EiGO1GeoJ2';
    const SAVED_ITEM_ID = process.env.GUMLOOP_ARTICLE_SAVED_ITEM_ID || '4SbKGD8iRn16UjfNmDUoUT';
    const BASE_URL = process.env.GUMLOOP_BASE_URL || 'https://api.gumloop.com/api/v1';

    const { articleUrl } = req.body;
    if (!articleUrl || typeof articleUrl !== 'string') {
        return res.status(400).json({ error: 'articleUrl is required' });
    }

    try {
        // Start Gumloop pipeline with article_url (matching article-recipe.py)
        const startUrl = `${BASE_URL}/start_pipeline?api_key=${API_KEY}&user_id=${USER_ID}&saved_item_id=${SAVED_ITEM_ID}`;
        console.log('Starting Gumloop pipeline for article URL:', articleUrl);
        
        const startResponse = await fetch(startUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ article_url: articleUrl }),
        });

        if (!startResponse.ok) {
            const text = await startResponse.text();
            console.error('Failed to start pipeline:', text);
            return res.status(500).json({ error: 'Failed to start Gumloop pipeline', details: text });
        }

        const startData = await startResponse.json();
        console.log('Pipeline started:', startData);
        const runId = startData.run_id;

        if (!runId) {
            // Check if synchronous result
            if (startData.outputs && startData.state === 'DONE') {
                return res.json({ recipe: extractRecipeFromLogs(startData) });
            }
            console.error('No run_id in response:', startData);
            return res.status(500).json({ error: 'No run_id in Gumloop response' });
        }

        // Poll for completion (matching article-recipe.py timeout)
        const timeout = 120000; // 120 seconds
        const pollInterval = 2000; // 2 seconds
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const pollUrl = `${BASE_URL}/get_pl_run?run_id=${runId}&user_id=${USER_ID}&api_key=${API_KEY}`;
            const pollResponse = await fetch(pollUrl, {
                headers: { 'Content-Type': 'application/json' }
            });

            const pollData = await pollResponse.json();
            const state = pollData.state;
            console.log('Pipeline state:', state);
            console.log('Full poll response:', JSON.stringify(pollData).substring(0, 200));

            if (state === 'DONE') {
                const recipe = extractRecipeFromLogs(pollData);
                console.log('Recipe extracted:', recipe.name);
                console.log('Ingredients count:', recipe.ingredients?.length || 0);
                console.log('First ingredient:', JSON.stringify(recipe.ingredients?.[0] || {}));
                return res.json({ recipe });
            }

            if (state === 'FAILED') {
                console.error('Pipeline failed:', pollData);
                return res.status(500).json({ error: 'Gumloop pipeline failed', details: pollData });
            }

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        console.error('Pipeline timeout after 120 seconds');
        return res.status(408).json({ error: 'Pipeline timeout after 120 seconds' });
    } catch (error) {
        console.error('Error processing article recipe:', error);
        return res.status(500).json({ error: 'Failed to process article recipe', details: error.message });
    }
});

router.post('/recipes/from-youtube', async (req, res) => {
    // Use the exact configuration from youtube-recipe.py
    const API_KEY = process.env.GUMLOOP_API_KEY || 'ef1f551abfa5460f945f8a5e32979b91';
    const USER_ID = process.env.GUMLOOP_USER_ID || '6IBmuxzZmmXRRQ4lX4EiGO1GeoJ2';
    const SAVED_ITEM_ID = process.env.GUMLOOP_SAVED_ITEM_ID || 'hFMQjdfjvPobH137HhPmLQ';
    const BASE_URL = process.env.GUMLOOP_BASE_URL || 'https://api.gumloop.com/api/v1';

    const { youtubeUrl } = req.body;
    if (!youtubeUrl || typeof youtubeUrl !== 'string') {
        return res.status(400).json({ error: 'youtubeUrl is required' });
    }

    try {
        // Start Gumloop pipeline with article_url (matching youtube-recipe.py)
        const startUrl = `${BASE_URL}/start_pipeline?api_key=${API_KEY}&user_id=${USER_ID}&saved_item_id=${SAVED_ITEM_ID}`;
        console.log('Starting Gumloop pipeline for URL:', youtubeUrl);
        
        const startResponse = await fetch(startUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ article_url: youtubeUrl }),
        });

        if (!startResponse.ok) {
            const text = await startResponse.text();
            console.error('Failed to start pipeline:', text);
            return res.status(500).json({ error: 'Failed to start Gumloop pipeline', details: text });
        }

        const startData = await startResponse.json();
        console.log('Pipeline started:', startData);
        const runId = startData.run_id;

        if (!runId) {
            // Check if synchronous result
            if (startData.outputs && startData.state === 'DONE') {
                return res.json({ recipe: extractRecipeFromLogs(startData) });
            }
            console.error('No run_id in response:', startData);
            return res.status(500).json({ error: 'No run_id in Gumloop response' });
        }

        // Poll for completion (matching youtube-recipe.py timeout)
        const timeout = 120000; // 120 seconds
        const pollInterval = 2000; // 2 seconds
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const pollUrl = `${BASE_URL}/get_pl_run?run_id=${runId}&user_id=${USER_ID}&api_key=${API_KEY}`;
            const pollResponse = await fetch(pollUrl, {
                headers: { 'Content-Type': 'application/json' }
            });

            const pollData = await pollResponse.json();
            const state = pollData.state;
            console.log('Pipeline state:', state);
            console.log('Full poll response:', JSON.stringify(pollData).substring(0, 200));

            if (state === 'DONE') {
                const recipe = extractRecipeFromLogs(pollData);
                console.log('Recipe extracted:', recipe.name);
                console.log('Ingredients count:', recipe.ingredients?.length || 0);
                console.log('First ingredient:', JSON.stringify(recipe.ingredients?.[0] || {}));
                return res.json({ recipe });
            }

            if (state === 'FAILED') {
                console.error('Pipeline failed:', pollData);
                return res.status(500).json({ error: 'Gumloop pipeline failed', details: pollData });
            }

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        console.error('Pipeline timeout after 120 seconds');
        return res.status(408).json({ error: 'Pipeline timeout after 120 seconds' });
    } catch (error) {
        console.error('Error processing YouTube recipe:', error);
        return res.status(500).json({ error: 'Failed to process YouTube recipe', details: error.message });
    }
});

// Helper function to extract recipe from Gumloop logs
function extractRecipeFromLogs(runResponse) {
    const logs = runResponse.log || [];
    const extractedData = {};

    function cleanValue(value) {
        if (typeof value === 'string') {
            const cleaned = value.trim();
            if (cleaned.toLowerCase() === 'unknown' || cleaned.toLowerCase() === 'n/a' || cleaned.toLowerCase() === 'na') {
                return '';
            }
            return cleaned;
        }
        return value;
    }

    // Parse log entries
    for (const logEntry of logs) {
        if (logEntry.includes("__standard__: Key item") && logEntry.includes("extracted successfully:")) {
            const match = logEntry.match(/__standard__: Key item '([^']+)' extracted successfully: (.+)/s);
            if (match) {
                const key = match[1];
                const value = cleanValue(match[2]);
                extractedData[key] = value;
            }
        }
    }

    // Build recipe JSON
    const recipe = {};

    if (extractedData.name) recipe.name = extractedData.name;
    if (extractedData.description) recipe.description = extractedData.description;
    if (extractedData.imageUrl) recipe.imageUrl = extractedData.imageUrl;
    if (extractedData.sourceUrl) recipe.sourceUrl = extractedData.sourceUrl;
    if (extractedData.sourceType) recipe.sourceType = extractedData.sourceType;

    // Numeric fields
    if (extractedData.prepTime) {
        try { recipe.prepTime = parseInt(extractedData.prepTime); } catch (e) {}
    }
    if (extractedData.cookTime) {
        try { recipe.cookTime = parseInt(extractedData.cookTime); } catch (e) {}
    }
    if (extractedData.servings) {
        try { recipe.servings = parseInt(extractedData.servings); } catch (e) {}
    }
    if (extractedData.difficulty) recipe.difficulty = extractedData.difficulty;
    if (extractedData.cuisine) recipe.cuisine = extractedData.cuisine;

    // Array fields
    if (extractedData.tags) {
        try {
            const tags = JSON.parse(extractedData.tags);
            const cleanedTags = tags.map(cleanValue).filter(Boolean);
            if (cleanedTags.length) recipe.tags = cleanedTags;
        } catch (e) {}
    }

    if (extractedData.ingredients) {
        try {
            const ingredients = JSON.parse(extractedData.ingredients);
            ingredients.forEach(ing => {
                ['itemId', 'unit', 'notes'].forEach(key => {
                    if (ing[key]) ing[key] = cleanValue(ing[key]);
                });
                if (ing.quantity) {
                    const cleaned = cleanValue(String(ing.quantity));
                    try {
                        ing.quantity = parseFloat(cleaned);
                    } catch (e) {
                        ing.quantity = '';
                    }
                }
            });
            recipe.ingredients = ingredients;
        } catch (e) {}
    }

    if (extractedData.instructions) {
        try {
            const instructions = JSON.parse(extractedData.instructions);
            instructions.forEach(inst => {
                if (inst.instruction) inst.instruction = cleanValue(inst.instruction);
                if (inst.imageUrl) inst.imageUrl = cleanValue(inst.imageUrl);
            });
            recipe.instructions = instructions;
        } catch (e) {}
    }

    // Nutritional info
    const nutritionalInfo = {};
    const nutritionalFields = ['totalCalories', 'caloriesPerServing', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium'];
    for (const field of nutritionalFields) {
        if (extractedData[field]) {
            try {
                const value = parseFloat(extractedData[field]);
                if (value > 0) nutritionalInfo[field] = value;
            } catch (e) {}
        }
    }
    if (Object.keys(nutritionalInfo).length) recipe.nutritionalInfo = nutritionalInfo;

    return recipe;
}

module.exports = router;

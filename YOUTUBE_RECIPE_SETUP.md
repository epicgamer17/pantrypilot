# Recipe Extraction Setup Guide

This guide explains how to configure the "Add Recipe from YouTube" and "Add Recipe from Article" features.

## Backend Configuration

The backend is pre-configured with default Gumloop credentials from your Python scripts. 

**No additional configuration is required** - it will work out of the box!

If you need to use different credentials, you can optionally add these environment variables to your `backend/.env` file:

```env
# Gumloop API Configuration (Optional)
GUMLOOP_API_KEY=ef1f551abfa5460f945f8a5e32979b91
GUMLOOP_USER_ID=6IBmuxzZmmXRRQ4lX4EiGO1GeoJ2
GUMLOOP_SAVED_ITEM_ID=hFMQjdfjvPobH137HhPmLQ  # For YouTube
GUMLOOP_ARTICLE_SAVED_ITEM_ID=4SbKGD8iRn16UjfNmDUoUT  # For Articles
GUMLOOP_BASE_URL=https://api.gumloop.com/api/v1
```

## How It Uses Your Existing Pipelines

The backend uses your existing Gumloop pipeline configurations:

**YouTube Pipeline** (from `youtube-recipe.py`):
- Pipeline ID: `hFMQjdfjvPobH137HhPmLQ`
- Endpoint: `POST /recipes/from-youtube`

**Article Pipeline** (from `article-recipe.py`):
- Pipeline ID: `4SbKGD8iRn16UjfNmDUoUT`
- Endpoint: `POST /recipes/from-article`

Both use:
- Same API key and credentials
- Same polling logic and timeout (120 seconds)
- Same payload structure with `article_url`

## Frontend Usage

### From YouTube:
1. Navigate to the Recipes page
2. Click on the **"+ From YouTube"** button (red button)
3. Enter a YouTube URL (e.g., `https://www.youtube.com/watch?v=...`)
4. Click "Extract Recipe"
5. Wait for the recipe to be extracted (this may take 30-120 seconds)
6. Review the extracted recipe data
7. Make any necessary edits to the ingredients or instructions
8. Click "Save Recipe" to add it to your recipes

### From Article/Blog:
1. Navigate to the Recipes page
2. Click on the **"+ From Article"** button (orange button)
3. Enter a recipe article URL (e.g., `https://pinchofyum.com/recipe-name`)
4. Click "Extract Recipe"
5. Wait for the recipe to be extracted (this may take 30-120 seconds)
6. Review the extracted recipe data
7. Make any necessary edits to the ingredients or instructions
8. Click "Save Recipe" to add it to your recipes

## API Endpoints

### POST `/recipes/from-youtube`

Extracts recipe data from a YouTube video URL.

**Request Body:**
```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=..."
}
```

### POST `/recipes/from-article`

Extracts recipe data from a recipe article/blog URL.

**Request Body:**
```json
{
  "articleUrl": "https://example.com/recipe-article"
}
```

**Response (both endpoints):**
```json
{
  "recipe": {
    "name": "Recipe Name",
    "description": "Recipe description",
    "servings": 4,
    "prepTime": 15,
    "cookTime": 30,
    "ingredients": [
      {
        "name": "Ingredient name",
        "quantity": 2,
        "unit": "cups",
        "notes": "Optional notes"
      }
    ],
    "instructions": [
      {
        "stepNumber": 1,
        "instruction": "Step description"
      }
    ],
    "tags": ["tag1", "tag2"],
    "difficulty": "Medium",
    "cuisine": "Italian",
    "sourceUrl": "https://www.youtube.com/watch?v=...",
    "sourceType": "youtube",
    "nutritionalInfo": {
      "totalCalories": 500,
      "caloriesPerServing": 125,
      "protein": 20,
      "carbs": 50,
      "fat": 15
    }
  }
}
```

## Troubleshooting

### "Missing Gumloop configuration" Error
- Make sure all three environment variables are set in your `backend/.env` file
- Restart your backend server after adding the environment variables

### "Failed to extract recipe from YouTube" Error
- Verify that the YouTube URL is valid
- Check that your Gumloop API key is correct
- Ensure your Gumloop pipeline is properly configured to extract recipe data

### "Pipeline timeout" Error
- The extraction is taking longer than 120 seconds
- Try again with a different video or check your Gumloop pipeline

## Notes

- The extraction process typically takes 30-120 seconds depending on the video length and complexity
- The extracted data will automatically resolve ingredient names to items in your database
- You can edit all fields before saving the recipe
- The recipe will not be marked as AI-generated since it's extracted from a real source

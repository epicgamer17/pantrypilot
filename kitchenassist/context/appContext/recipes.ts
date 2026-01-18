import { Recipe } from '../../types';

type HeadersBuilder = (
  includeJson?: boolean,
  explicitHouseholdId?: string | null,
) => Record<string, string>;

type RecipeDeps = {
  userId: string | null;
  householdId: string | null;
  getAuthHeaders: HeadersBuilder;
  refreshData: () => Promise<void>;
  setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
  apiUrl: string;
};

export const createRecipeActions = ({
  userId,
  householdId,
  getAuthHeaders,
  refreshData,
  setRecipes,
  apiUrl,
}: RecipeDeps) => {
  const addRecipe = async (recipe: Recipe) => {
    if (!userId || !householdId) return;

    // Optimistic update (removed for add to ensure we get ID back, but kept pattern consistent)
    // For add, we usually wait for response to get the ID.
    // However, existing code was setting it optimistically then replacing.

    try {
      const payloadIngredients = recipe.ingredients.map((ingredient) => ({
        itemId: ingredient.itemId,
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
      }));

      if (payloadIngredients.some((ingredient) => !ingredient.itemId)) {
        throw new Error('All ingredients must have an itemId.');
      }

      const res = await fetch(`${apiUrl}/recipes`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          name: recipe.name,
          ingredients: payloadIngredients,
          householdId: householdId,
          isPublic: (recipe as { isPublic?: boolean }).isPublic,
          servings: recipe.servings,
        }),
      });

      if (res.ok) {
        const savedRecipe = await res.json();
        setRecipes((prev) => [...prev, { ...savedRecipe, id: savedRecipe.id || savedRecipe._id }]);
      } else {
        throw new Error('Failed to save recipe');
      }
    } catch (error) {
      console.error('Error adding recipe:', error);
      refreshData();
    }
  };

  const updateRecipe = async (recipe: Recipe) => {
    if (!userId || !householdId) return;

    // Optimistic Update
    setRecipes((prev) =>
      prev.map((r) => (r.id === recipe.id ? recipe : r))
    );

    try {
      const payloadIngredients = recipe.ingredients.map((ingredient) => ({
        itemId: ingredient.itemId,
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
      }));

      if (payloadIngredients.some((ingredient) => !ingredient.itemId)) {
        throw new Error('All ingredients must have an itemId.');
      }

      const res = await fetch(`${apiUrl}/recipes/${recipe.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          name: recipe.name,
          ingredients: payloadIngredients,
          householdId: householdId,
          isPublic: (recipe as { isPublic?: boolean }).isPublic,
          servings: recipe.servings,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update recipe');
      }

      // Optionally fetch the updated recipe to ensure sync, 
      // but optimistic update covers the UI immediate need.
    } catch (error) {
      console.error('Error updating recipe:', error);
      refreshData(); // Revert on error
    }
  };

  const deleteRecipe = async (id: string) => {
    if (!userId || !householdId) return;

    setRecipes((prev) => prev.filter((recipe) => recipe.id !== id));

    try {
      const res = await fetch(`${apiUrl}/recipes/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        throw new Error('Failed to delete recipe');
      }
    } catch (error) {
      console.error('Error deleting recipe:', error);
      refreshData();
    }
  };

  return { addRecipe, updateRecipe, deleteRecipe };
};

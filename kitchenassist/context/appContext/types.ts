import { GroceryItem, Item, PurchaseRecord, Recipe } from '../../types';

export interface AppContextType {
  fridgeItems: Item[];
  groceryList: GroceryItem[];
  recipes: Recipe[];
  purchaseHistory: PurchaseRecord[];
  recentlyDepletedItems: Item[];
  userId: string | null;
  setUserId: (id: string | null) => void;
  householdId: string | null;
  setHouseholdId: (id: string | null) => void;
  householdInfo: HouseholdInfo | null;
  setHouseholdInfo: (info: HouseholdInfo | null) => void;
  refreshData: () => Promise<void>;

  addToFridge: (item: Omit<Item, 'initialQuantity'>) => void;
  addItemsToFridge: (items: Omit<Item, 'initialQuantity'>[]) => void;
  updateFridgeItem: (item: Item) => void;
  removeFromFridge: (id: string, percentWasted: number) => void;
  consumeItem: (id: string, amount: number) => void;
  cookRecipeFromFridge: (recipe: Recipe, servingsOverride?: number) => void;

  addToGroceryList: (
    name: string,
    category?: string,
    price?: number,
    fromRecipe?: string,
  ) => void;
  addItemsToGroceryList: (
    items: {
      name: string;
      category?: string;
      price?: number;
      fromRecipe?: string;
      unit?: string;
      quantity?: number;
    }[],
  ) => void;

  toggleGroceryItem: (id: string) => void;
  updateGroceryItem: (
    id: string,
    updates: { name?: string; quantity?: number; unit?: string; aisle?: string },
  ) => void;
  setAllGroceryItemsChecked: (checked: boolean) => void;
  clearPurchasedItems: () => void;
  addRecipe: (recipe: Recipe) => void;
  updateRecipe: (recipe: Recipe) => void;
  deleteRecipe: (id: string) => void;
  calculateTotalWasteCost: () => number;
}

export type HouseholdInfo = {
  id: string;
  name: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    coordinates?: {
      type: 'Point';
      coordinates: [number, number];
    };
  };
  inviteCode?: string;
};

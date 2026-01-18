// types/index.tsx

export type Category = 'Dairy' | 'Produce' | 'Meat' | 'Pantry' | 'Snacks' | 'Beverages' | 'Frozen' | 'Bakery' | 'Other';

export interface Item {
    id: string;
    itemId?: string;
    name: string;
    category: Category;
    quantity: number;
    initialQuantity: number;
    // Updated to include all units used in the app
    unit: 'g' | 'ml' | 'unit' | 'kg' | 'L' | 'oz' | 'lb' | 'cup';
    purchasePrice: number;
    purchaseDate: string;
    expiryDate: string;
    store: string;
    isUsed: boolean;
    percentWasted?: number;
}

export interface GroceryItem {
    id: string;
    name: string;
    targetPrice?: number;
    aisle?: string;
    onSale?: boolean;
    checked?: boolean;
    fromRecipe?: string;
    itemId?: string;
    quantity?: number;
    unit?: string;
    priority?: string;
    addedAt?: string;
    purchased?: boolean;
    purchasedAt?: string;
    purchasedBy?: string;
}

export interface Ingredient {
    name: string;
    itemId?: string;
    quantity: number;
    unit: string;
}

export interface Recipe {
    id: string;
    name: string;
    ingredients: Ingredient[];
    instructions?: string;
    isAiGenerated?: boolean;
    isPublic?: boolean;
}

export interface PurchaseRecord {
    id: string;
    name: string;
    category: string;
    price: number;
    date: string;
    store: string;
    quantity: number;
    unit: string;
}

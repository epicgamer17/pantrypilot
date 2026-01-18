const numericBsonTypes = ['int', 'long', 'double', 'decimal'];

const groceryStoreSchema = {
  bsonType: 'object',
  required: ['name', 'location', 'createdAt', 'updatedAt'],
  properties: {
    name: { bsonType: 'string' },
    seededTag: { bsonType: 'string' },
    inviteCode: { bsonType: 'string' },
    location: {
      bsonType: 'object',
      required: ['address', 'city', 'state', 'zipCode', 'coordinates'],
      properties: {
        address: { bsonType: 'string' },
        city: { bsonType: 'string' },
        state: { bsonType: 'string' },
        zipCode: { bsonType: 'string' },
        coordinates: {
          bsonType: 'object',
          required: ['type', 'coordinates'],
          properties: {
            type: { bsonType: 'string', enum: ['Point'] },
            coordinates: {
              bsonType: 'array',
              minItems: 2,
              maxItems: 2,
              items: { bsonType: numericBsonTypes },
            },
          },
        },
      },
    },
    phone: { bsonType: 'string' },
    hours: {
      bsonType: 'object',
      properties: {
        monday: { bsonType: 'string' },
        tuesday: { bsonType: 'string' },
        wednesday: { bsonType: 'string' },
        thursday: { bsonType: 'string' },
        friday: { bsonType: 'string' },
        saturday: { bsonType: 'string' },
        sunday: { bsonType: 'string' },
      },
    },
    createdAt: { bsonType: 'date' },
    updatedAt: { bsonType: 'date' },
  },
};

const storeInventorySchema = {
  bsonType: 'object',
  required: ['storeId', 'itemId', 'price', 'onSale', 'inStock', 'lastUpdated'],
  properties: {
    storeId: { bsonType: 'objectId' },
    itemId: { bsonType: 'objectId' },
    price: { bsonType: numericBsonTypes },
    onSale: { bsonType: 'bool' },
    salePrice: { bsonType: numericBsonTypes },
    inStock: { bsonType: 'bool' },
    aisle: { bsonType: 'string' },
    lastUpdated: { bsonType: 'date' },
    priceHistory: {
      bsonType: 'array',
      items: {
        bsonType: 'object',
        required: ['price', 'date'],
        properties: {
          price: { bsonType: numericBsonTypes },
          date: { bsonType: 'date' },
        },
      },
    },
  },
};

const itemSchema = {
  bsonType: 'object',
  required: ['name', 'category', 'createdAt', 'updatedAt'],
  properties: {
    name: { bsonType: 'string' },
    category: { bsonType: 'string' },
    subcategory: { bsonType: 'string' },
    brand: { bsonType: 'string' },
    barcode: { bsonType: 'string' },
    packageQuantity: { bsonType: numericBsonTypes },
    packageUnit: { bsonType: 'string' },
    defaultUnit: { bsonType: 'string' },
    nutritionalInfo: {
      bsonType: 'object',
      properties: {
        servingSize: { bsonType: numericBsonTypes },
        servingUnit: { bsonType: 'string' },
        servingsPerContainer: { bsonType: numericBsonTypes },
        calories: { bsonType: numericBsonTypes },
        protein: { bsonType: numericBsonTypes },
        carbs: { bsonType: numericBsonTypes },
        fat: { bsonType: numericBsonTypes },
        saturatedFat: { bsonType: numericBsonTypes },
        transFat: { bsonType: numericBsonTypes },
        fiber: { bsonType: numericBsonTypes },
        sugar: { bsonType: numericBsonTypes },
        sodium: { bsonType: numericBsonTypes },
      },
    },
    averageShelfLife: { bsonType: numericBsonTypes },
    storageLocation: { bsonType: 'string' },
    imageUrl: { bsonType: 'string' },
    tags: {
      bsonType: 'array',
      items: { bsonType: 'string' },
    },
    createdAt: { bsonType: 'date' },
    updatedAt: { bsonType: 'date' },
  },
};

const recipeSchema = {
  bsonType: 'object',
  required: ['name', 'createdAt', 'updatedAt'],
  properties: {
    name: { bsonType: 'string' },
    description: { bsonType: 'string' },
    imageUrl: { bsonType: 'string' },
    sourceUrl: { bsonType: 'string' },
    sourceType: { bsonType: 'string' },
    prepTime: { bsonType: numericBsonTypes },
    cookTime: { bsonType: numericBsonTypes },
    servings: { bsonType: numericBsonTypes },
    difficulty: { bsonType: 'string' },
    cuisine: { bsonType: 'string' },
    tags: { bsonType: 'array', items: { bsonType: 'string' } },
    isAiGenerated: { bsonType: 'bool' },
    ingredients: {
      bsonType: 'array',
      items: {
        bsonType: 'object',
        required: ['itemId', 'quantity', 'unit'],
        properties: {
          itemId: { bsonType: 'objectId' },
          quantity: { bsonType: numericBsonTypes },
          unit: { bsonType: 'string' },
          notes: { bsonType: 'string' },
          isOptional: { bsonType: 'bool' },
          nutritionalContribution: {
            bsonType: 'object',
            properties: {
              calories: { bsonType: numericBsonTypes },
              protein: { bsonType: numericBsonTypes },
              carbs: { bsonType: numericBsonTypes },
              fat: { bsonType: numericBsonTypes },
              fiber: { bsonType: numericBsonTypes },
            },
          },
        },
      },
    },
    instructions: {
      bsonType: 'array',
      items: {
        bsonType: 'object',
        required: ['stepNumber', 'instruction'],
        properties: {
          stepNumber: { bsonType: numericBsonTypes },
          instruction: { bsonType: 'string' },
          duration: { bsonType: numericBsonTypes },
          imageUrl: { bsonType: 'string' },
        },
      },
    },
    nutritionalInfo: {
      bsonType: 'object',
      properties: {
        totalCalories: { bsonType: numericBsonTypes },
        caloriesPerServing: { bsonType: numericBsonTypes },
        protein: { bsonType: numericBsonTypes },
        carbs: { bsonType: numericBsonTypes },
        fat: { bsonType: numericBsonTypes },
        fiber: { bsonType: numericBsonTypes },
        sugar: { bsonType: numericBsonTypes },
        sodium: { bsonType: numericBsonTypes },
        lastCalculated: { bsonType: 'date' },
      },
    },
    createdBy: { bsonType: 'objectId' },
    isPublic: { bsonType: 'bool' },
    rating: { bsonType: numericBsonTypes },
    ratings: {
      bsonType: 'array',
      items: {
        bsonType: 'object',
        required: ['userId', 'rating', 'createdAt'],
        properties: {
          userId: { bsonType: 'objectId' },
          rating: { bsonType: numericBsonTypes },
          review: { bsonType: 'string' },
          createdAt: { bsonType: 'date' },
        },
      },
    },
    createdAt: { bsonType: 'date' },
    updatedAt: { bsonType: 'date' },
  },
};

const householdSchema = {
  bsonType: 'object',
  required: ['name', 'createdAt', 'updatedAt'],
  properties: {
    name: { bsonType: 'string' },
    seededTag: { bsonType: 'string' },
    location: {
      bsonType: 'object',
      properties: {
        address: { bsonType: 'string' },
        city: { bsonType: 'string' },
        state: { bsonType: 'string' },
        zipCode: { bsonType: 'string' },
        coordinates: {
          bsonType: 'object',
          required: ['type', 'coordinates'],
          properties: {
            type: { bsonType: 'string', enum: ['Point'] },
            coordinates: {
              bsonType: 'array',
              minItems: 2,
              maxItems: 2,
              items: { bsonType: numericBsonTypes },
            },
          },
        },
      },
    },
    preferredStores: {
      bsonType: 'array',
      items: {
        bsonType: 'object',
        required: ['storeId', 'priority'],
        properties: {
          storeId: { bsonType: 'objectId' },
          priority: { bsonType: numericBsonTypes },
          notes: { bsonType: 'string' },
        },
      },
    },
    fridgeItems: {
      bsonType: 'array',
      items: {
        bsonType: 'object',
        required: ['itemId', 'quantity', 'unit', 'location', 'purchaseDate'],
        properties: {
          _id: { bsonType: 'objectId' },
          itemId: { bsonType: 'objectId' },
          quantity: { bsonType: numericBsonTypes },
          unit: { bsonType: 'string' },
          location: { bsonType: 'string' },
          purchasePrice: { bsonType: numericBsonTypes },
          purchaseDate: { bsonType: 'date' },
          expirationDate: { bsonType: 'date' },
          isOpen: { bsonType: 'bool' },
          notes: { bsonType: 'string' },
          addedBy: { bsonType: 'objectId' },
          addedAt: { bsonType: 'date' },
        },
      },
    },
    shoppingList: {
      bsonType: 'array',
      items: {
        bsonType: 'object',
        required: ['itemId', 'quantity', 'unit', 'priority', 'addedBy', 'addedAt'],
        properties: {
          itemId: { bsonType: 'objectId' },
          quantity: { bsonType: numericBsonTypes },
          unit: { bsonType: 'string' },
          priority: { bsonType: 'string' },
          addedBy: { bsonType: 'objectId' },
          addedAt: { bsonType: 'date' },
          fromRecipe: { bsonType: 'string' },
          purchased: { bsonType: 'bool' },
          purchasedBy: { bsonType: 'objectId' },
          purchasedAt: { bsonType: 'date' },
          purchasedFrom: { bsonType: 'objectId' },
        },
      },
    },
    savedRecipes: { bsonType: 'array', items: { bsonType: 'objectId' } },
    createdAt: { bsonType: 'date' },
    updatedAt: { bsonType: 'date' },
  },
};

const userSchema = {
  bsonType: 'object',
  required: ['email', 'auth0UserId', 'createdAt', 'updatedAt'],
  properties: {
    email: { bsonType: 'string' },
    auth0UserId: { bsonType: 'string' },
    auth0: {
      bsonType: 'object',
      properties: {
        provider: { bsonType: 'string' },
        emailVerified: { bsonType: 'bool' },
        lastLogin: { bsonType: 'date' },
      },
    },
    firstName: { bsonType: 'string' },
    lastName: { bsonType: 'string' },
    householdId: { bsonType: 'objectId' },
    role: { bsonType: 'string' },
    foodPreferences: {
      bsonType: 'object',
      properties: {
        dietaryRestrictions: { bsonType: 'array', items: { bsonType: 'string' } },
        allergies: { bsonType: 'array', items: { bsonType: 'string' } },
        dislikes: { bsonType: 'array', items: { bsonType: 'string' } },
        favoriteItems: { bsonType: 'array', items: { bsonType: 'objectId' } },
        favoriteRecipes: { bsonType: 'array', items: { bsonType: 'objectId' } },
      },
    },
    notificationPreferences: {
      bsonType: 'object',
      properties: {
        expirationAlerts: { bsonType: 'bool' },
        lowStockAlerts: { bsonType: 'bool' },
        shoppingListUpdates: { bsonType: 'bool' },
        recipeRecommendations: { bsonType: 'bool' },
      },
    },
    createdAt: { bsonType: 'date' },
    updatedAt: { bsonType: 'date' },
  },
};

const consumptionHistorySchema = {
  bsonType: 'object',
  required: ['householdId', 'itemId', 'userId', 'quantityConsumed', 'unit', 'consumptionDate', 'createdAt'],
  properties: {
    householdId: { bsonType: 'objectId' },
    itemId: { bsonType: 'objectId' },
    userId: { bsonType: 'objectId' },
    quantityConsumed: { bsonType: numericBsonTypes },
    unit: { bsonType: 'string' },
    consumptionDate: { bsonType: 'date' },
    consumptionType: { bsonType: 'string' },
    recipeId: { bsonType: 'objectId' },
    wasteReason: { bsonType: 'string' },
    notes: { bsonType: 'string' },
    originalPurchaseDate: { bsonType: 'date' },
    daysUntilConsumed: { bsonType: numericBsonTypes },
    createdAt: { bsonType: 'date' },
  },
};

const purchaseHistorySchema = {
  bsonType: 'object',
  required: ['householdId', 'itemId', 'userId', 'quantity', 'unit', 'pricePerUnit', 'purchasedAt', 'createdAt'],
  properties: {
    householdId: { bsonType: 'objectId' },
    itemId: { bsonType: 'objectId' },
    userId: { bsonType: 'objectId' },
    quantity: { bsonType: numericBsonTypes },
    unit: { bsonType: 'string' },
    pricePerUnit: { bsonType: numericBsonTypes },
    totalPrice: { bsonType: numericBsonTypes },
    storeName: { bsonType: 'string' },
    purchasedAt: { bsonType: 'date' },
    createdAt: { bsonType: 'date' },
  },
};

const mealPlanSchema = {
  bsonType: 'object',
  required: ['householdId', 'name', 'startDate', 'endDate', 'createdAt', 'updatedAt'],
  properties: {
    householdId: { bsonType: 'objectId' },
    name: { bsonType: 'string' },
    startDate: { bsonType: 'date' },
    endDate: { bsonType: 'date' },
    meals: {
      bsonType: 'array',
      items: {
        bsonType: 'object',
        required: ['date', 'mealType', 'recipeId', 'servings', 'status'],
        properties: {
          date: { bsonType: 'date' },
          mealType: { bsonType: 'string' },
          recipeId: { bsonType: 'objectId' },
          servings: { bsonType: numericBsonTypes },
          assignedTo: { bsonType: 'objectId' },
          status: { bsonType: 'string' },
          notes: { bsonType: 'string' },
        },
      },
    },
    createdBy: { bsonType: 'objectId' },
    createdAt: { bsonType: 'date' },
    updatedAt: { bsonType: 'date' },
  },
};

const imageSchema = {
  bsonType: 'object',
  required: ['filename', 'path', 'mimeType', 'size', 'createdAt', 'updatedAt'],
  properties: {
    filename: { bsonType: 'string' },
    originalName: { bsonType: 'string' },
    path: { bsonType: 'string' },
    mimeType: { bsonType: 'string' },
    size: { bsonType: numericBsonTypes },
    uploadedBy: { bsonType: 'objectId' },
    householdId: { bsonType: 'objectId' },
    tags: { bsonType: 'array', items: { bsonType: 'string' } },
    createdAt: { bsonType: 'date' },
    updatedAt: { bsonType: 'date' },
  },
};

module.exports = {
  groceryStoreSchema,
  storeInventorySchema,
  itemSchema,
  recipeSchema,
  householdSchema,
  userSchema,
  consumptionHistorySchema,
  purchaseHistorySchema,
  mealPlanSchema,
  imageSchema,
};

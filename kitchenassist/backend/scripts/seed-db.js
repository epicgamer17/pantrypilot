const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;

if (!uri) {
  throw new Error('Missing MONGODB_URI');
}
if (!dbName) {
  throw new Error('Missing MONGODB_DB_NAME');
}

const STORES = [
  { name: 'Provigo Le James', address: '3421 Av. du Parc', coords: [-73.5735, 45.5095], type: 'Full Grocery' },
  { name: 'Metro McGill', address: '3575 Park Ave', coords: [-73.5752, 45.5101], type: 'Full Grocery' },
  { name: 'Marché Eden', address: '3575 Ave du Parc #4115', coords: [-73.5756, 45.5052], type: 'Specialty/Asian' },
  { name: 'Marché Newon', address: '1616 Saint-Catherine St W', coords: [-73.5798, 45.5056], type: 'Asian Market' },
  { name: 'Supermarché PA du Parc', address: '5242 Park Ave', coords: [-73.5971, 45.5215], type: 'Discount/Quality' },
  { name: 'Segal’s Market', address: '4001 St Laurent Blvd', coords: [-73.5828, 45.5186], type: 'Budget/Organic' },
  { name: 'Marche G&D', address: '1006 Boul. Saint-Laurent', coords: [-73.5605, 45.5075], type: 'Asian Grocery' },
  { name: 'IGA Van Horne', address: '1250 Av. Van Horne', coords: [-73.6115, 45.5245], type: 'Full Grocery' },
  { name: 'Adonis Downtown', address: '2173 Saint-Catherine St W', coords: [-73.5835, 45.4901], type: 'Middle Eastern' },
  { name: 'Marché Lobo', address: '3509 Av. du Parc', coords: [-73.5742, 45.5112], type: 'Middle Eastern/Convenience' },
];

const ITEM_TEMPLATES = [
  { name: 'English Cucumber', cat: 'Produce', sub: 'Vegetables', price: 2.5, unit: 'ea', shelf: 7 },
  { name: 'Mini Cucumbers', cat: 'Produce', sub: 'Vegetables', price: 3.49, unit: 'bag', shelf: 7 },
  { name: 'Avocado Bag (5-pack)', cat: 'Produce', sub: 'Fruit', price: 5.99, unit: 'bag', shelf: 5 },
  { name: 'Bananas', cat: 'Produce', sub: 'Fruit', price: 0.89, unit: 'lb', shelf: 6 },
  { name: 'Red Seedless Grapes', cat: 'Produce', sub: 'Fruit', price: 3.99, unit: 'lb', shelf: 10 },
  { name: 'Russet Potatoes', cat: 'Produce', sub: 'Vegetables', price: 6, unit: '10lb bag', shelf: 30 },
  { name: 'Gala Apples', cat: 'Produce', sub: 'Fruit', price: 1.99, unit: 'lb', shelf: 21 },
  { name: 'Baby Spinach', cat: 'Produce', sub: 'Vegetables', price: 4.99, unit: 'pkg', shelf: 5 },
  { name: 'Kale', cat: 'Produce', sub: 'Vegetables', price: 2.99, unit: 'bunch', shelf: 7 },
  { name: 'Collard Greens', cat: 'Produce', sub: 'Vegetables', price: 2.99, unit: 'bunch', shelf: 7 },
  { name: 'Broccoli Crowns', cat: 'Produce', sub: 'Vegetables', price: 2.49, unit: 'lb', shelf: 7 },
  { name: 'Carrots', cat: 'Produce', sub: 'Vegetables', price: 3.49, unit: '3lb bag', shelf: 28 },
  { name: 'Cherry Tomatoes', cat: 'Produce', sub: 'Vegetables', price: 3.99, unit: 'pint', shelf: 7 },
  { name: 'Yellow Onion', cat: 'Produce', sub: 'Vegetables', price: 1.29, unit: 'lb', shelf: 30 },
  { name: 'Sweet Potato', cat: 'Produce', sub: 'Vegetables', price: 1.29, unit: 'lb', shelf: 30 },
  { name: 'Celery', cat: 'Produce', sub: 'Vegetables', price: 2.49, unit: 'bunch', shelf: 14 },
  { name: 'Garlic', cat: 'Produce', sub: 'Vegetables', price: 1.19, unit: 'ea', shelf: 30 },
  { name: 'Limes', cat: 'Produce', sub: 'Fruit', price: 0.79, unit: 'ea', shelf: 10 },
  { name: 'Baby Potatoes', cat: 'Produce', sub: 'Vegetables', price: 3.99, unit: '1.5lb bag', shelf: 21 },
  { name: 'Green Beans', cat: 'Produce', sub: 'Vegetables', price: 3.49, unit: 'lb', shelf: 7 },
  { name: 'Green Onions', cat: 'Produce', sub: 'Herbs', price: 1.29, unit: 'bunch', shelf: 7 },
  { name: 'Fresh Parsley', cat: 'Produce', sub: 'Herbs', price: 2.49, unit: 'bunch', shelf: 7 },
  { name: 'Fresh Cilantro', cat: 'Produce', sub: 'Herbs', price: 2.49, unit: 'bunch', shelf: 7 },
  { name: 'Fresh Basil', cat: 'Produce', sub: 'Herbs', price: 2.99, unit: 'bunch', shelf: 7 },
  { name: 'Fresh Mint', cat: 'Produce', sub: 'Herbs', price: 2.99, unit: 'bunch', shelf: 7 },
  { name: 'Fresh Thyme', cat: 'Produce', sub: 'Herbs', price: 2.49, unit: 'bunch', shelf: 10 },
  { name: 'Fresh Rosemary', cat: 'Produce', sub: 'Herbs', price: 2.99, unit: 'bunch', shelf: 10 },
  { name: 'Fresh Bay Leaves', cat: 'Produce', sub: 'Herbs', price: 3.49, unit: 'bunch', shelf: 10 },
  { name: 'Roma Tomatoes', cat: 'Produce', sub: 'Vegetables', price: 2.49, unit: 'lb', shelf: 7 },
  { name: 'Roma Peppers', cat: 'Produce', sub: 'Vegetables', price: 1.99, unit: 'ea', shelf: 7 },
  { name: 'Lemons', cat: 'Produce', sub: 'Fruit', price: 0.79, unit: 'ea', shelf: 10 },
  { name: 'Shallots', cat: 'Produce', sub: 'Vegetables', price: 2.49, unit: 'lb', shelf: 30 },
  { name: 'Radicchio', cat: 'Produce', sub: 'Vegetables', price: 3.49, unit: 'ea', shelf: 7 },
  { name: 'Fresh Dill', cat: 'Produce', sub: 'Herbs', price: 2.99, unit: 'bunch', shelf: 7 },
  { name: 'Fresh Tarragon', cat: 'Produce', sub: 'Herbs', price: 3.49, unit: 'bunch', shelf: 7 },
  { name: 'Asparagus', cat: 'Produce', sub: 'Vegetables', price: 3.99, unit: 'lb', shelf: 7 },
  { name: 'Baby Arugula', cat: 'Produce', sub: 'Greens', price: 4.49, unit: 'pkg', shelf: 5 },

  { name: 'Quebon 2% Milk', cat: 'Dairy', sub: 'Milk', price: 4.51, unit: '2L', shelf: 12 },
  { name: 'Whole Milk', cat: 'Dairy', sub: 'Milk', price: 4.79, unit: '2L', shelf: 12 },
  { name: 'Large Grade A Eggs', cat: 'Dairy', sub: 'Eggs', price: 4.29, unit: '12pk', shelf: 30 },
  { name: 'Lactantia Salted Butter', cat: 'Dairy', sub: 'Butter', price: 6.49, unit: '454g', shelf: 60 },
  { name: 'Greek Yogurt (Plain)', cat: 'Dairy', sub: 'Yogurt', price: 5.99, unit: '750g', shelf: 14 },
  { name: 'Plain Yogurt (Full Fat)', cat: 'Dairy', sub: 'Yogurt', price: 4.99, unit: '750g', shelf: 14 },
  { name: 'Cheddar Cheese block', cat: 'Dairy', sub: 'Cheese', price: 7.49, unit: '400g', shelf: 45 },
  { name: 'Cottage Cheese', cat: 'Dairy', sub: 'Cheese', price: 4.99, unit: '500g', shelf: 14 },
  { name: 'Silk Almond Milk', cat: 'Dairy', sub: 'Alternative', price: 4.99, unit: '1.89L', shelf: 10 },
  { name: 'Cream Cheese', cat: 'Dairy', sub: 'Cheese', price: 4.29, unit: '250g', shelf: 30 },
  { name: 'Sour Cream', cat: 'Dairy', sub: 'Cream', price: 3.79, unit: '500ml', shelf: 21 },
  { name: 'Heavy Cream', cat: 'Dairy', sub: 'Cream', price: 3.99, unit: '473ml', shelf: 14 },
  { name: 'Shredded Mozzarella', cat: 'Dairy', sub: 'Cheese', price: 5.99, unit: '320g', shelf: 30 },
  { name: 'Shredded Cheddar', cat: 'Dairy', sub: 'Cheese', price: 5.99, unit: '320g', shelf: 30 },
  { name: 'Shredded Gruyere', cat: 'Dairy', sub: 'Cheese', price: 7.99, unit: '200g', shelf: 21 },
  { name: 'Shredded Monterey Jack', cat: 'Dairy', sub: 'Cheese', price: 6.49, unit: '320g', shelf: 21 },
  { name: 'Grated Parmesan', cat: 'Dairy', sub: 'Cheese', price: 6.99, unit: '170g', shelf: 30 },
  { name: 'Halloumi', cat: 'Dairy', sub: 'Cheese', price: 6.49, unit: '200g', shelf: 21 },
  { name: 'Creme Fraiche', cat: 'Dairy', sub: 'Cream', price: 6.49, unit: '200g', shelf: 21 },
  { name: 'Buttermilk', cat: 'Dairy', sub: 'Milk', price: 4.69, unit: '1L', shelf: 10 },
  { name: 'Unsalted Butter', cat: 'Dairy', sub: 'Butter', price: 6.29, unit: '454g', shelf: 60 },

  { name: 'Chicken Breast Skinless', cat: 'Meat', sub: 'Poultry', price: 19.82, unit: 'kg', shelf: 3 },
  { name: 'Chicken Thighs (Bone-in, Skin-on)', cat: 'Meat', sub: 'Poultry', price: 12.99, unit: 'kg', shelf: 3 },
  { name: 'Chicken Thighs (Boneless, Skinless)', cat: 'Meat', sub: 'Poultry', price: 13.99, unit: 'kg', shelf: 3 },
  { name: 'Ground Beef Lean', cat: 'Meat', sub: 'Beef', price: 14.5, unit: 'kg', shelf: 3 },
  { name: 'Ground Lamb', cat: 'Meat', sub: 'Lamb', price: 18.99, unit: 'kg', shelf: 3 },
  { name: 'Atlantic Salmon Fillet', cat: 'Meat', sub: 'Seafood', price: 28.99, unit: 'kg', shelf: 2 },
  { name: 'Jumbo Shrimp', cat: 'Meat', sub: 'Seafood', price: 24.99, unit: 'kg', shelf: 2 },
  { name: 'Pork Tenderloin', cat: 'Meat', sub: 'Pork', price: 12.99, unit: 'kg', shelf: 4 },
  { name: 'Ground Chicken', cat: 'Meat', sub: 'Poultry', price: 12.49, unit: 'kg', shelf: 3 },

  { name: 'Organic Tofu (Firm)', cat: 'Pantry', sub: 'Protein', price: 3.49, unit: '454g', shelf: 20 },
  { name: 'Silken Tofu', cat: 'Pantry', sub: 'Protein', price: 3.79, unit: '454g', shelf: 20 },
  { name: 'Short Grain Rice', cat: 'Pantry', sub: 'Grains', price: 18.99, unit: '5kg', shelf: 365 },
  { name: 'Salt', cat: 'Pantry', sub: 'Seasonings', price: 1.99, unit: '1kg', shelf: 365 },
  { name: 'Black Pepper', cat: 'Pantry', sub: 'Seasonings', price: 4.49, unit: '100g', shelf: 365 },
  { name: 'Lemon Pepper Seasoning', cat: 'Pantry', sub: 'Seasonings', price: 3.99, unit: '120g', shelf: 365 },
  { name: 'Tomato Paste', cat: 'Pantry', sub: 'Canned Goods', price: 2.29, unit: '156ml', shelf: 730 },
  { name: 'Beef Broth', cat: 'Pantry', sub: 'Canned Goods', price: 2.99, unit: '900ml', shelf: 365 },
  { name: 'Chicken Stock', cat: 'Pantry', sub: 'Canned Goods', price: 2.99, unit: '900ml', shelf: 365 },
  { name: 'Chicken Broth', cat: 'Pantry', sub: 'Canned Goods', price: 2.99, unit: '900ml', shelf: 365 },
  { name: 'Worcestershire Sauce', cat: 'Pantry', sub: 'Condiments', price: 4.99, unit: '296ml', shelf: 365 },
  { name: 'Chile Crisp', cat: 'Pantry', sub: 'Condiments', price: 8.99, unit: '210g', shelf: 365 },
  { name: 'Dried Bay Leaves', cat: 'Pantry', sub: 'Seasonings', price: 3.49, unit: '20g', shelf: 365 },
  { name: 'Onion Powder', cat: 'Pantry', sub: 'Seasonings', price: 3.29, unit: '90g', shelf: 365 },
  { name: 'Ground Ginger', cat: 'Pantry', sub: 'Seasonings', price: 2.99, unit: '60g', shelf: 365 },
  { name: 'Sweet Paprika', cat: 'Pantry', sub: 'Seasonings', price: 2.99, unit: '90g', shelf: 365 },
  { name: 'Dried Sage', cat: 'Pantry', sub: 'Seasonings', price: 3.49, unit: '18g', shelf: 365 },
  { name: 'Dried Thyme', cat: 'Pantry', sub: 'Seasonings', price: 3.49, unit: '18g', shelf: 365 },
  { name: 'Dried Oregano', cat: 'Pantry', sub: 'Seasonings', price: 3.49, unit: '18g', shelf: 365 },
  { name: 'Crushed Red Pepper', cat: 'Pantry', sub: 'Seasonings', price: 2.99, unit: '28g', shelf: 365 },
  { name: 'Cornstarch', cat: 'Pantry', sub: 'Baking', price: 2.49, unit: '454g', shelf: 365 },
  { name: 'Ground Turmeric', cat: 'Pantry', sub: 'Seasonings', price: 2.99, unit: '60g', shelf: 365 },
  { name: 'Ras el Hanout', cat: 'Pantry', sub: 'Seasonings', price: 5.99, unit: '70g', shelf: 365 },
  { name: 'Nonstick Cooking Spray', cat: 'Pantry', sub: 'Baking', price: 4.49, unit: '170g', shelf: 365 },
  { name: 'Soy Sauce (Kikkoman)', cat: 'Pantry', sub: 'Condiments', price: 5.49, unit: '591ml', shelf: 365 },
  { name: 'Ketchup', cat: 'Pantry', sub: 'Condiments', price: 4.49, unit: '800ml', shelf: 365 },
  { name: 'Yellow Mustard', cat: 'Pantry', sub: 'Condiments', price: 2.99, unit: '400ml', shelf: 365 },
  { name: 'Dijon Mustard', cat: 'Pantry', sub: 'Condiments', price: 3.99, unit: '250ml', shelf: 365 },
  { name: 'Hot Sauce', cat: 'Pantry', sub: 'Condiments', price: 3.49, unit: '150ml', shelf: 365 },
  { name: 'Shin Ramyun (5-pack)', cat: 'Pantry', sub: 'Noodles', price: 6.99, unit: 'pkg', shelf: 180 },
  { name: 'Extra Virgin Olive Oil', cat: 'Pantry', sub: 'Oils', price: 14.99, unit: '750ml', shelf: 365 },
  { name: 'Canola Oil', cat: 'Pantry', sub: 'Oils', price: 6.99, unit: '1.42L', shelf: 365 },
  { name: 'Vegetable Oil', cat: 'Pantry', sub: 'Oils', price: 6.49, unit: '1.5L', shelf: 365 },
  { name: 'Safflower Oil', cat: 'Pantry', sub: 'Oils', price: 8.99, unit: '946ml', shelf: 365 },
  { name: 'Hummus Classic', cat: 'Pantry', sub: 'Dips', price: 4.49, unit: '227g', shelf: 10 },
  { name: 'Tahini', cat: 'Pantry', sub: 'Condiments', price: 8.99, unit: '500g', shelf: 120 },
  { name: 'White Miso Paste', cat: 'Pantry', sub: 'Condiments', price: 6.99, unit: '400g', shelf: 180 },
  { name: 'Hoisin Sauce', cat: 'Pantry', sub: 'Condiments', price: 4.49, unit: '400ml', shelf: 365 },
  { name: 'Toasted Sesame Oil', cat: 'Pantry', sub: 'Oils', price: 5.99, unit: '250ml', shelf: 365 },
  { name: 'Peanut Butter (Creamy)', cat: 'Pantry', sub: 'Spreads', price: 5.49, unit: '500g', shelf: 365 },
  { name: 'Cashew Butter', cat: 'Pantry', sub: 'Spreads', price: 9.99, unit: '250g', shelf: 365 },
  { name: 'Strawberry Jam', cat: 'Pantry', sub: 'Spreads', price: 4.99, unit: '375ml', shelf: 365 },
  { name: 'Hazelnut Spread', cat: 'Pantry', sub: 'Spreads', price: 6.99, unit: '350g', shelf: 365 },
  { name: 'Honey', cat: 'Pantry', sub: 'Sweeteners', price: 7.99, unit: '500g', shelf: 365 },
  { name: 'Maple Syrup', cat: 'Pantry', sub: 'Sweeteners', price: 9.99, unit: '500ml', shelf: 365 },
  { name: 'Pomegranate Molasses', cat: 'Pantry', sub: 'Condiments', price: 6.99, unit: '250ml', shelf: 365 },
  { name: 'Apple Cider Vinegar', cat: 'Pantry', sub: 'Condiments', price: 3.49, unit: '500ml', shelf: 365 },
  { name: 'Red Wine Vinegar', cat: 'Pantry', sub: 'Condiments', price: 3.49, unit: '500ml', shelf: 365 },
  { name: 'Sherry Vinegar', cat: 'Pantry', sub: 'Condiments', price: 4.49, unit: '375ml', shelf: 365 },
  { name: 'All-Purpose Flour', cat: 'Pantry', sub: 'Baking', price: 4.49, unit: '2.5kg', shelf: 365 },
  { name: 'Panko Bread Crumbs', cat: 'Pantry', sub: 'Baking', price: 3.49, unit: '250g', shelf: 365 },
  { name: 'Granulated Sugar', cat: 'Pantry', sub: 'Baking', price: 3.49, unit: '2kg', shelf: 365 },
  { name: 'Brown Sugar', cat: 'Pantry', sub: 'Baking', price: 3.69, unit: '1kg', shelf: 365 },
  { name: 'Baking Powder', cat: 'Pantry', sub: 'Baking', price: 2.49, unit: '250g', shelf: 365 },
  { name: 'Baking Soda', cat: 'Pantry', sub: 'Baking', price: 1.99, unit: '500g', shelf: 365 },
  { name: 'Pure Vanilla Extract', cat: 'Pantry', sub: 'Baking', price: 7.99, unit: '100ml', shelf: 365 },
  { name: 'Chocolate Chips', cat: 'Pantry', sub: 'Baking', price: 4.99, unit: '300g', shelf: 365 },
  { name: 'Shredded Coconut (Unsweetened)', cat: 'Pantry', sub: 'Baking', price: 3.99, unit: '200g', shelf: 365 },
  { name: 'Coconut Milk (Full Fat)', cat: 'Pantry', sub: 'Canned Goods', price: 2.99, unit: '400ml', shelf: 365 },
  { name: 'Dried Porcini Mushrooms', cat: 'Pantry', sub: 'Dried Goods', price: 8.99, unit: '40g', shelf: 365 },
  { name: 'Chopped Walnuts', cat: 'Pantry', sub: 'Baking', price: 5.49, unit: '250g', shelf: 365 },
  { name: 'Raisins', cat: 'Pantry', sub: 'Baking', price: 3.49, unit: '300g', shelf: 365 },
  { name: 'Dried Cranberries', cat: 'Pantry', sub: 'Baking', price: 4.49, unit: '300g', shelf: 365 },
  { name: 'Cashews (Roasted Unsalted)', cat: 'Pantry', sub: 'Nuts', price: 6.49, unit: '250g', shelf: 365 },
  { name: 'Sliced Almonds', cat: 'Pantry', sub: 'Baking', price: 6.49, unit: '200g', shelf: 365 },
  { name: 'Active Dry Yeast', cat: 'Pantry', sub: 'Baking', price: 3.49, unit: '113g', shelf: 365 },
  { name: 'Cocoa Powder', cat: 'Pantry', sub: 'Baking', price: 4.49, unit: '227g', shelf: 365 },
  { name: 'Powdered Sugar', cat: 'Pantry', sub: 'Baking', price: 3.29, unit: '500g', shelf: 365 },
  { name: 'Rolled Oats', cat: 'Pantry', sub: 'Breakfast', price: 4.29, unit: '1kg', shelf: 365 },
  { name: 'Jasmine Rice', cat: 'Pantry', sub: 'Grains', price: 13.99, unit: '5kg', shelf: 365 },
  { name: 'Pasta (Spaghetti)', cat: 'Pantry', sub: 'Pasta', price: 2.29, unit: '900g', shelf: 365 },
  { name: 'Tagliatelle Nests', cat: 'Pantry', sub: 'Pasta', price: 4.99, unit: '250g', shelf: 365 },
  { name: 'French Green Lentils', cat: 'Pantry', sub: 'Grains', price: 4.99, unit: '900g', shelf: 365 },
  { name: 'Potato Gnocchi', cat: 'Pantry', sub: 'Pasta', price: 4.99, unit: '500g', shelf: 180 },
  { name: 'Wheat Noodles', cat: 'Pantry', sub: 'Noodles', price: 3.99, unit: '400g', shelf: 365 },
  { name: 'Sesame Seeds (White)', cat: 'Pantry', sub: 'Seasonings', price: 3.49, unit: '200g', shelf: 365 },
  { name: 'Red Lentils', cat: 'Pantry', sub: 'Grains', price: 3.99, unit: '900g', shelf: 365 },
  { name: 'Quinoa', cat: 'Pantry', sub: 'Grains', price: 6.99, unit: '1kg', shelf: 365 },
  { name: 'Canned Chickpeas', cat: 'Pantry', sub: 'Canned Goods', price: 1.79, unit: '540ml', shelf: 730 },
  { name: 'Canned Black Beans', cat: 'Pantry', sub: 'Canned Goods', price: 1.79, unit: '540ml', shelf: 730 },
  { name: 'Canned Cannellini Beans', cat: 'Pantry', sub: 'Canned Goods', price: 1.79, unit: '540ml', shelf: 730 },
  { name: 'Pita Bread (6-pack)', cat: 'Bakery', sub: 'Bread', price: 2.99, unit: 'pkg', shelf: 5 },
  { name: 'Frozen Dumplings', cat: 'Frozen', sub: 'Prepared', price: 9.99, unit: '800g', shelf: 180 },
  { name: 'Frozen Peas', cat: 'Frozen', sub: 'Vegetables', price: 3.49, unit: '500g', shelf: 180 },
  { name: 'Vanilla Ice Cream', cat: 'Frozen', sub: 'Dessert', price: 6.49, unit: '1.5L', shelf: 180 },
  { name: 'Chocolate Ice Cream', cat: 'Frozen', sub: 'Dessert', price: 6.49, unit: '1.5L', shelf: 180 },
  { name: 'Strawberry Ice Cream', cat: 'Frozen', sub: 'Dessert', price: 6.49, unit: '1.5L', shelf: 180 },
  { name: 'Frozen Yogurt (Vanilla)', cat: 'Frozen', sub: 'Dessert', price: 5.99, unit: '1L', shelf: 180 },

  { name: 'Tortilla Chips', cat: 'Snacks', sub: 'Chips', price: 4.29, unit: '300g', shelf: 90 },
  { name: 'Corn Tortillas', cat: 'Bakery', sub: 'Tortillas', price: 3.49, unit: '20pk', shelf: 7 },
  { name: 'Flour Tortillas', cat: 'Bakery', sub: 'Tortillas', price: 3.99, unit: '10pk', shelf: 7 },
  { name: 'Sparkling Water', cat: 'Beverages', sub: 'Water', price: 6.99, unit: '12pk', shelf: 365 },
  { name: 'Dry Red Wine', cat: 'Beverages', sub: 'Wine', price: 12.99, unit: '750ml', shelf: 365 },
  { name: 'Dark Chocolate Bar', cat: 'Snacks', sub: 'Candy', price: 3.99, unit: '100g', shelf: 180 },
  { name: 'Ground Coffee (Medium Roast)', cat: 'Pantry', sub: 'Beverages', price: 12.99, unit: '340g', shelf: 90 },
  { name: 'Tomato Sauce', cat: 'Pantry', sub: 'Sauces', price: 2.49, unit: '680ml', shelf: 365 },
  { name: 'Pesto Sauce', cat: 'Pantry', sub: 'Sauces', price: 5.99, unit: '190ml', shelf: 90 },

  { name: 'Whole Wheat Sliced Bread', cat: 'Bakery', sub: 'Bread', price: 3.89, unit: '675g', shelf: 6 },
  { name: 'Butter Croissants (4-pack)', cat: 'Bakery', sub: 'Pastries', price: 5.49, unit: 'pkg', shelf: 3 },
  { name: 'Baguette', cat: 'Bakery', sub: 'Bread', price: 2.25, unit: 'ea', shelf: 1 },
  { name: 'Avocado', cat: 'Produce', sub: 'Fruit', price: 1.49, unit: 'ea', shelf: 5 },
  { name: 'Salsa Verde', cat: 'Pantry', sub: 'Sauces', price: 3.99, unit: '500ml', shelf: 365 },
  { name: 'Pico de Gallo', cat: 'Produce', sub: 'Prepared', price: 4.99, unit: '400g', shelf: 5 },
  { name: 'Pickled Vegetables', cat: 'Pantry', sub: 'Condiments', price: 4.99, unit: '500ml', shelf: 365 },
];

const RECIPE_INGREDIENT_TEMPLATE_NAMES = [
  'Ground Beef Lean',
  'Salt',
  'Black Pepper',
  'Lactantia Salted Butter',
  'Yellow Onion',
  'Celery',
  'Carrots',
  'Garlic',
  'Tomato Paste',
  'All-Purpose Flour',
  'Beef Broth',
  'Dry Red Wine',
  'Frozen Peas',
  'Worcestershire Sauce',
  'Fresh Thyme',
  'Dried Bay Leaves',
  'Russet Potatoes',
  'Whole Milk',
  'Grated Parmesan',
  'Broccoli Crowns',
  'Extra Virgin Olive Oil',
  'Soy Sauce (Kikkoman)',
  'Cashews (Roasted Unsalted)',
  'Chile Crisp',
  'Panko Bread Crumbs',
  'Silken Tofu',
  'Cashew Butter',
  'Chicken Thighs (Bone-in, Skin-on)',
  'Canola Oil',
  'Chicken Stock',
  'Limes',
  'Maple Syrup',
  'Fresh Parsley',
  'Chicken Breast Skinless',
  'Lemon Pepper Seasoning',
  'Lemons',
  'Chicken Thighs (Boneless, Skinless)',
  'Onion Powder',
  'Hot Sauce',
  'Corn Tortillas',
  'Flour Tortillas',
  'Avocado',
  'Salsa Verde',
  'Pico de Gallo',
  'Pickled Vegetables',
  'Sweet Potato',
  'Green Onions',
  'Ground Ginger',
  'Safflower Oil',
  'Coconut Milk (Full Fat)',
  'Jasmine Rice',
  'Ground Chicken',
  'Baby Potatoes',
  'Green Beans',
  'Heavy Cream',
  'Chicken Broth',
  'Sweet Paprika',
  'Dried Sage',
  'Dried Thyme',
  'Dried Oregano',
  'Apple Cider Vinegar',
  'Crushed Red Pepper',
  'Tagliatelle Nests',
  'Dried Porcini Mushrooms',
  'Ground Turmeric',
  'White Miso Paste',
  'Green Onions',
  'Atlantic Salmon Fillet',
  'Fresh Rosemary',
  'Fresh Bay Leaves',
  'Shallots',
  'Radicchio',
  'Fresh Dill',
  'Fresh Tarragon',
  'Red Wine Vinegar',
  'French Green Lentils',
  'Asparagus',
  'Baby Arugula',
  'Sherry Vinegar',
  'Potato Gnocchi',
  'Cherry Tomatoes',
  'Halloumi',
  'Canned Cannellini Beans',
  'Ras el Hanout',
  'Nonstick Cooking Spray',
  'Roma Tomatoes',
  'Roma Peppers',
  'Cottage Cheese',
  'Shredded Gruyere',
  'Shredded Monterey Jack',
  'Hoisin Sauce',
  'Toasted Sesame Oil',
  'Wheat Noodles',
  'Sesame Seeds (White)',
  'Jumbo Shrimp',
  'Cornstarch',
  'Red Lentils',
  'Plain Yogurt (Full Fat)',
  'Kale',
  'Collard Greens',
  'Quinoa',
  'Mini Cucumbers',
  'Ground Lamb',
  'Raisins',
  'Dried Cranberries',
  'Pomegranate Molasses',
];

const RECIPE_SEEDS = [
  {
    name: 'Roasted Broccoli and Whipped Tofu With Chile Crisp Crunch',
    prepTime: 10,
    cookTime: 20,
    servings: 4,
    sourceType: 'seeded',
    tags: ['seeded', 'vegetarian'],
    ingredients: [
      { templateName: 'Broccoli Crowns', quantity: 1.5, unit: 'lb', notes: 'cut into florets' },
      { templateName: 'Extra Virgin Olive Oil', quantity: 4, unit: 'tbsp' },
      { templateName: 'Soy Sauce (Kikkoman)', quantity: 2, unit: 'tsp' },
      { templateName: 'Salt', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Black Pepper', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Garlic', quantity: 1, unit: 'clove', notes: 'thinly sliced' },
      { templateName: 'Cashews (Roasted Unsalted)', quantity: 0.5, unit: 'cup', notes: 'coarsely chopped' },
      { templateName: 'Chile Crisp', quantity: 1, unit: 'tbsp', notes: 'plus more for serving' },
      { templateName: 'Panko Bread Crumbs', quantity: 0.33, unit: 'cup' },
      { templateName: 'Silken Tofu', quantity: 14, unit: 'oz', isOptional: true, notes: 'drained' },
      { templateName: 'Cashew Butter', quantity: 1, unit: 'cup', isOptional: true },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction:
          'Heat the oven to 400 degrees. Line a large baking sheet with aluminum foil. Add the broccoli, drizzle with 3 tablespoons olive oil and the soy sauce, season lightly with salt and pepper, and toss to coat. Arrange in an even layer, then dot with the garlic.',
      },
      {
        stepNumber: 2,
        instruction:
          'Tightly wrap the broccoli mixture with another piece of aluminum foil, sealing shut, and bake until crisp-tender, about 15 minutes.',
      },
      {
        stepNumber: 3,
        instruction:
          'While the broccoli bakes, prepare the chile crisp bread crumbs: Heat the remaining 1 tablespoon olive oil in a medium skillet over medium. Add the cashews, season to taste with salt and pepper and cook, stirring frequently, until fragrant, about 3 minutes.',
      },
      {
        stepNumber: 4,
        instruction:
          'Add the chile crisp to the cashews, then stir in the panko and continue to cook, stirring frequently, until the panko is toasted, 2 to 3 minutes. Season to taste and transfer to a paper towel-lined plate.',
      },
      {
        stepNumber: 5,
        instruction:
          'If using cashew cream, add the tofu, cashew butter and 6 tablespoons water to a small food processor; blend until fluffy. Season generously with salt and pepper, then spread it on a serving platter or shallow bowl.',
      },
      {
        stepNumber: 6,
        instruction:
          'Arrange the cooked broccoli on top, drizzle with additional chile crisp, if desired, and sprinkle generously with the chile crisp topping. Serve immediately, with any additional chile crisp crunch on the side.',
      },
    ],
  },
  {
    name: 'Crispy Chicken With Lime Butter',
    prepTime: 5,
    cookTime: 35,
    servings: 4,
    sourceType: 'seeded',
    tags: ['seeded'],
    ingredients: [
      { templateName: 'Chicken Thighs (Bone-in, Skin-on)', quantity: 2, unit: 'lb' },
      { templateName: 'Salt', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Black Pepper', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Canola Oil', quantity: 1, unit: 'tbsp', notes: 'or peanut oil' },
      { templateName: 'Garlic', quantity: 2, unit: 'clove', notes: 'crushed' },
      { templateName: 'Chicken Stock', quantity: 0.5, unit: 'cup', notes: 'or water' },
      { templateName: 'Limes', quantity: 2, unit: 'tbsp', notes: 'juice, plus wedges for serving' },
      { templateName: 'Maple Syrup', quantity: 2, unit: 'tsp' },
      { templateName: 'Unsalted Butter', quantity: 3, unit: 'tbsp', notes: 'cold, cut into pats' },
      {
        templateName: 'Fresh Parsley',
        quantity: 0.25,
        unit: 'cup',
        notes: 'optional; or cilantro, basil, or mint',
        isOptional: true,
      },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction:
          'Pat the chicken dry and season with salt and pepper. If you have time, set aside at room temperature for at least 10 minutes and up to 30 minutes.',
      },
      {
        stepNumber: 2,
        instruction:
          'Heat a large skillet over medium. Add the oil and swirl the pan to coat it. Place the chicken skin side down and cook without moving it until the skin is crispy and golden brown, 20 to 25 minutes. Reduce the heat if the chicken splatters too much or browns too quickly.',
      },
      {
        stepNumber: 3,
        instruction:
          'Add the garlic to the pan. Flip the chicken and cook until the bottom is lightly browned and the meat is cooked through, about 5 minutes. Transfer the chicken to a plate, skin side up. Remove all but 3 tablespoons of the fat from the pan and save for another use.',
      },
      {
        stepNumber: 4,
        instruction:
          'Add the chicken stock, lime juice and maple syrup to the skillet. Season with salt and pepper. Bring to a simmer over high, then reduce the heat to medium and cook, stirring occasionally, until reduced by half, about 3 minutes. Add the butter and continue simmering, now stirring constantly, until incorporated; the sauce will thicken and become shiny as the butter melts. Taste and add more salt and pepper as desired.',
      },
      {
        stepNumber: 5,
        instruction:
          'Serve the chicken with the pan sauce, lime wedges and the optional fresh herbs (spritzed with a little lime juice and lightly seasoned with salt and pepper).',
      },
    ],
  },
  {
    name: 'Lemon-Pepper Chicken Breasts',
    prepTime: 5,
    cookTime: 15,
    servings: 4,
    sourceType: 'seeded',
    tags: ['seeded'],
    ingredients: [
      { templateName: 'Chicken Breast Skinless', quantity: 1.5, unit: 'lb' },
      { templateName: 'All-Purpose Flour', quantity: 3, unit: 'tbsp' },
      { templateName: 'Lemon Pepper Seasoning', quantity: 1, unit: 'tbsp' },
      { templateName: 'Canola Oil', quantity: 2, unit: 'tbsp', notes: 'plus more as needed' },
      { templateName: 'Unsalted Butter', quantity: 3, unit: 'tbsp' },
      { templateName: 'Garlic', quantity: 1, unit: 'clove', notes: 'minced' },
      { templateName: 'Lemons', quantity: 3, unit: 'tbsp', notes: 'juice' },
      { templateName: 'Fresh Parsley', quantity: 0.25, unit: 'cup', notes: 'chopped, for serving' },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction: 'Cut the chicken breasts in half horizontally and place them on a large plate.',
      },
      {
        stepNumber: 2,
        instruction:
          'Combine the flour and lemon-pepper seasoning in a small bowl and mix with a fork. Sprinkle the mixture evenly over the chicken breasts, turning to coat all sides and patting to adhere.',
      },
      {
        stepNumber: 3,
        instruction:
          'Heat a large (12-inch) pan over medium-high. Add the oil and, working in batches, cook the chicken breasts for 3 to 4 minutes on each side, until browned and cooked through. Add more oil if necessary. If the oil begins smoking at any point, turn down the heat. Transfer the chicken breasts to a plate, and drain and discard any remaining oil.',
      },
      {
        stepNumber: 4,
        instruction:
          'Add the butter and garlic to the pan, and stir over medium-low heat for 30 seconds to 1 minute, until the garlic is just starting to take on color. Add the lemon juice and cook for another 30 seconds, until the sauce is slightly reduced.',
      },
      {
        stepNumber: 5,
        instruction:
          'Off the heat, return the chicken breasts to the pan, turning to coat them in the sauce. Garnish with parsley and serve hot. Store leftover chicken in a sealed container in the refrigerator for up to 3 days.',
      },
    ],
  },
  {
    name: 'Easy Chicken Tacos',
    prepTime: 10,
    cookTime: 20,
    servings: 8,
    sourceType: 'seeded',
    tags: ['seeded'],
    ingredients: [
      { templateName: 'Chicken Thighs (Boneless, Skinless)', quantity: 1.5, unit: 'lb' },
      { templateName: 'Garlic', quantity: 3, unit: 'clove', notes: 'grated' },
      { templateName: 'Limes', quantity: 1, unit: 'ea', notes: 'juiced, plus wedges for serving' },
      { templateName: 'Hot Sauce', quantity: 1, unit: 'tbsp', notes: 'vinegar-based' },
      { templateName: 'Onion Powder', quantity: 1, unit: 'tsp' },
      { templateName: 'Vegetable Oil', quantity: 4, unit: 'tbsp', notes: 'divided' },
      { templateName: 'Salt', quantity: 1, unit: 'tsp' },
      { templateName: 'Black Pepper', quantity: 0.5, unit: 'tsp' },
      { templateName: 'Corn Tortillas', quantity: 8, unit: 'ea', notes: 'or flour tortillas' },
      { templateName: 'Yellow Onion', quantity: 0.25, unit: 'cup', notes: 'minced, for serving' },
      { templateName: 'Fresh Cilantro', quantity: 0.25, unit: 'cup', notes: 'minced, for serving' },
      { templateName: 'Avocado', quantity: 1, unit: 'ea', notes: 'guacamole, optional', isOptional: true },
      { templateName: 'Salsa Verde', quantity: 0.5, unit: 'cup', notes: 'optional', isOptional: true },
      { templateName: 'Pico de Gallo', quantity: 0.5, unit: 'cup', notes: 'optional', isOptional: true },
      { templateName: 'Pickled Vegetables', quantity: 0.5, unit: 'cup', notes: 'optional', isOptional: true },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction:
          'Mix the chicken, garlic, lime juice, hot sauce, onion powder, 2 tablespoons oil, salt and pepper in a bowl and toss to combine, making sure the chicken is thoroughly coated.',
      },
      {
        stepNumber: 2,
        instruction:
          'Heat the remaining oil in a 12-inch cast-iron skillet or other large heavy-bottomed pan over medium-high. Add chicken in a single layer and cook until browned and edges begin to crisp, 6 to 8 minutes per side. Move the chicken to a cutting board. Adjust heat to medium-low, carefully add 1/2 cup water and scrape up browned bits.',
      },
      {
        stepNumber: 3,
        instruction:
          'Cut the chicken into bite-sized pieces and return to the skillet. Toss to coat in the pan sauce and cook, stirring frequently, for 3 more minutes. Serve with warm tortillas, onions, cilantro and desired toppings.',
      },
    ],
  },
  {
    name: 'Fragrant Coconut Chicken and Sweet Potato',
    prepTime: 20,
    cookTime: 20,
    servings: 4,
    sourceType: 'seeded',
    tags: ['seeded'],
    ingredients: [
      { templateName: 'Canola Oil', quantity: 3, unit: 'tbsp', notes: 'neutral oil' },
      { templateName: 'Sweet Potato', quantity: 1, unit: 'ea', notes: 'peeled and diced' },
      { templateName: 'Salt', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Black Pepper', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Green Onions', quantity: 0.5, unit: 'cup', notes: 'thinly sliced, plus more for garnish' },
      { templateName: 'Garlic', quantity: 3, unit: 'clove', notes: 'minced' },
      { templateName: 'Ground Ginger', quantity: 1, unit: 'tbsp', notes: 'fresh minced or ground' },
      { templateName: 'Ground Chicken', quantity: 1, unit: 'lb' },
      { templateName: 'Coconut Milk (Full Fat)', quantity: 1, unit: 'cup' },
      { templateName: 'Baby Spinach', quantity: 4, unit: 'cup' },
      { templateName: 'Limes', quantity: 2, unit: 'tbsp', notes: 'juice' },
      { templateName: 'Fresh Cilantro', quantity: 0.25, unit: 'cup', notes: 'chopped, plus more for garnish' },
      { templateName: 'Jasmine Rice', quantity: 1, unit: 'cup', notes: 'cooked, for serving' },
      { templateName: 'Hot Sauce', quantity: 1, unit: 'tbsp', notes: 'for serving', isOptional: true },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction:
          'In a 12-inch nonstick skillet, heat 1 tablespoon of the oil over medium. Add the sweet potato, season with salt and pepper and stir to evenly coat in the oil. Cover and cook, stirring halfway through, until golden and tender, about 8 minutes. Transfer to a plate.',
      },
      {
        stepNumber: 2,
        instruction:
          'Add the remaining 2 tablespoons oil plus the scallions, garlic and ginger to the skillet and cook, stirring, until fragrant, about 30 seconds. Add the chicken, season with salt and pepper, and cook, breaking up the meat until no longer pink, about 5 minutes.',
      },
      {
        stepNumber: 3,
        instruction:
          'Add the coconut milk and sweet potato and bring back to a simmer. Cook until the liquid is slightly reduced and thickened, about 2 to 3 minutes. Stir in spinach just until wilted, then turn off the heat. Stir in lime juice and cilantro and season again with salt and pepper.',
      },
      {
        stepNumber: 4,
        instruction:
          'Divide the coconut chicken mixture over rice in bowls and garnish with more scallions and cilantro. Serve warm, with hot sauce on the side.',
      },
    ],
  },
  {
    name: 'Chicken Stew',
    prepTime: 15,
    cookTime: 45,
    servings: 4,
    sourceType: 'seeded',
    tags: ['seeded'],
    ingredients: [
      { templateName: 'Lactantia Salted Butter', quantity: 2, unit: 'tbsp' },
      { templateName: 'Extra Virgin Olive Oil', quantity: 2, unit: 'tbsp' },
      { templateName: 'Yellow Onion', quantity: 1, unit: 'ea', notes: 'diced' },
      { templateName: 'Carrots', quantity: 2, unit: 'ea', notes: 'peeled and diced' },
      { templateName: 'Celery', quantity: 3, unit: 'stalk', notes: 'diced' },
      { templateName: 'Garlic', quantity: 4, unit: 'clove', notes: 'minced' },
      { templateName: 'Sweet Paprika', quantity: 0.5, unit: 'tsp' },
      { templateName: 'Salt', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Black Pepper', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'All-Purpose Flour', quantity: 3, unit: 'tbsp' },
      { templateName: 'Chicken Broth', quantity: 4, unit: 'cup' },
      { templateName: 'Apple Cider Vinegar', quantity: 1, unit: 'tbsp' },
      { templateName: 'Chicken Thighs (Boneless, Skinless)', quantity: 1.5, unit: 'lb' },
      { templateName: 'Baby Potatoes', quantity: 1, unit: 'lb', notes: 'quartered' },
      { templateName: 'Green Beans', quantity: 1, unit: 'cup', notes: '1-inch pieces' },
      { templateName: 'Heavy Cream', quantity: 0.5, unit: 'cup' },
      { templateName: 'Dried Sage', quantity: 0.5, unit: 'tsp' },
      { templateName: 'Dried Thyme', quantity: 0.5, unit: 'tsp' },
      { templateName: 'Dried Oregano', quantity: 0.5, unit: 'tsp' },
      { templateName: 'Fresh Parsley', quantity: 0.25, unit: 'cup', notes: 'for serving' },
      { templateName: 'Lemons', quantity: 1, unit: 'ea', notes: 'wedges for serving', isOptional: true },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction:
          'Heat a large pot or Dutch oven on medium. Add butter, olive oil, onion, carrots, celery, garlic, paprika and a big pinch of salt and cook, stirring frequently, until the onion is translucent, 5 to 7 minutes.',
      },
      {
        stepNumber: 2,
        instruction:
          'Add flour and stir for 1 minute. Add chicken broth and vinegar and stir until the flour is incorporated.',
      },
      {
        stepNumber: 3,
        instruction:
          'Add chicken thighs, potatoes, green beans, heavy cream, sage, thyme, oregano, and 1 teaspoon each of salt and black pepper. Bring the stew to a gentle boil on medium-high and then reduce heat to maintain a simmer. Simmer, with the lid partially covering the pot, until the chicken is cooked through, about 20 minutes.',
      },
      {
        stepNumber: 4,
        instruction:
          'Transfer the chicken to a plate. Cover the pot and let the vegetables cook for 5 to 10 minutes, until desired doneness. Shred the chicken into bite-size pieces, return it to the pot, and season to taste with more salt and pepper. Serve warm, garnished with parsley and lemon wedges if desired.',
      },
    ],
  },
  {
    name: 'Porcini Ragu',
    prepTime: 10,
    cookTime: 35,
    servings: 4,
    sourceType: 'seeded',
    tags: ['seeded', 'vegetarian'],
    ingredients: [
      { templateName: 'Dried Porcini Mushrooms', quantity: 1.5, unit: 'oz' },
      { templateName: 'Salt', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Black Pepper', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Extra Virgin Olive Oil', quantity: 0.25, unit: 'cup', notes: 'plus more for serving' },
      { templateName: 'Garlic', quantity: 3, unit: 'clove', notes: 'very finely chopped' },
      { templateName: 'Crushed Red Pepper', quantity: 0.5, unit: 'tsp' },
      { templateName: 'Fresh Parsley', quantity: 0.5, unit: 'cup', notes: 'finely chopped, plus more for serving' },
      { templateName: 'Tomato Paste', quantity: 1.5, unit: 'tbsp' },
      { templateName: 'Tagliatelle Nests', quantity: 9, unit: 'oz' },
      { templateName: 'Grated Parmesan', quantity: 0.75, unit: 'cup', notes: 'plus more for serving' },
      { templateName: 'Heavy Cream', quantity: 3, unit: 'tbsp' },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction:
          'In a medium bowl, cover the mushrooms with boiling water and let soak for 10 minutes. Drain, reserving 5 tablespoons of the soaking liquid. Very finely chop the mushrooms, then set aside. Heat a medium pot of salted water to a boil.',
      },
      {
        stepNumber: 2,
        instruction:
          'Put the oil, garlic, crushed red pepper, parsley and a heaping 1/4 teaspoon salt into a cold, large saute pan over medium-low heat. Gently fry for 5 minutes until soft and lightly golden, turning the heat down if the garlic starts to brown.',
      },
      {
        stepNumber: 3,
        instruction:
          'Increase the heat to medium-high, then add the chopped mushrooms, tomato paste and plenty of freshly ground black pepper. Stir-fry for 3 minutes, then set the pan aside while you boil the pasta.',
      },
      {
        stepNumber: 4,
        instruction:
          'Cook the pasta in the salted boiling water according to package directions until al dente. Drain, reserving 1 3/4 cups of the pasta water.',
      },
      {
        stepNumber: 5,
        instruction:
          'Return the saute pan with the mushroom mixture to medium-high heat, then stir in 1 1/2 cups of the reserved pasta water plus the reserved porcini soaking liquid. Bring to a simmer and let it bubble away for 3 minutes.',
      },
      {
        stepNumber: 6,
        instruction:
          'Add half the Parmesan, stirring until it has melted before adding the rest. Lower the heat to medium, then stir in the cream, followed by the drained tagliatelle. Toss over the heat until the pasta and sauce have emulsified, 1 to 2 minutes, adding a splash more pasta water if the pasta looks dry.',
      },
      {
        stepNumber: 7,
        instruction:
          'Remove from the heat and serve at once, finished with more olive oil and Parmesan, plus a sprinkling of parsley.',
      },
    ],
  },
  {
    name: 'One-Pot Miso-Turmeric Salmon and Coconut Rice',
    prepTime: 15,
    cookTime: 25,
    servings: 4,
    sourceType: 'seeded',
    tags: ['seeded'],
    ingredients: [
      { templateName: 'Jasmine Rice', quantity: 2, unit: 'cup' },
      { templateName: 'Coconut Milk (Full Fat)', quantity: 15, unit: 'oz' },
      { templateName: 'Salt', quantity: 1, unit: 'tsp' },
      { templateName: 'Black Pepper', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Green Onions', quantity: 4, unit: 'stalk', notes: 'thinly sliced' },
      { templateName: 'White Miso Paste', quantity: 2, unit: 'tbsp' },
      { templateName: 'Soy Sauce (Kikkoman)', quantity: 2, unit: 'tbsp' },
      { templateName: 'Extra Virgin Olive Oil', quantity: 1, unit: 'tbsp' },
      { templateName: 'Ground Turmeric', quantity: 1, unit: 'tsp' },
      { templateName: 'Atlantic Salmon Fillet', quantity: 1.5, unit: 'lb', notes: 'skinless, cut into pieces' },
      { templateName: 'Baby Spinach', quantity: 5, unit: 'cup' },
      { templateName: 'Limes', quantity: 1, unit: 'ea', notes: 'quartered' },
      { templateName: 'Fresh Cilantro', quantity: 0.25, unit: 'cup', notes: 'optional garnish', isOptional: true },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction:
          'In a large Dutch oven or other large heavy pot with a tight-fitting lid, combine the rice, coconut milk and 2 cups of water; season with 1 teaspoon salt. Bring to a boil, covered, over high.',
      },
      {
        stepNumber: 2,
        instruction:
          'In a medium bowl, combine the scallions with the miso, soy sauce, olive oil, turmeric and a few grinds of pepper to form a chunky paste. Add the salmon and toss to coat.',
      },
      {
        stepNumber: 3,
        instruction:
          'When the rice starts to boil, reduce the heat to medium-low, adjusting it as needed to maintain a simmer. Stir to make sure nothing is sticking on the bottom.',
      },
      {
        stepNumber: 4,
        instruction:
          'Layer the spinach on top of the rice. Squeeze 2 lime quarters over the spinach. Nestle the salmon pieces on top in an even layer, scraping in any scallions remaining in the bowl. Cover and cook until the salmon is just cooked through, 12 to 16 minutes.',
      },
      {
        stepNumber: 5,
        instruction:
          'Squeeze the remaining lime quarters over the salmon. Top with cilantro, if using. Scoop into bowls or plates to serve.',
      },
    ],
  },
  {
    name: 'French Lentil Salad',
    prepTime: 30,
    cookTime: 40,
    servings: 9,
    sourceType: 'seeded',
    tags: ['seeded', 'vegetarian'],
    ingredients: [
      { templateName: 'French Green Lentils', quantity: 1.5, unit: 'cup' },
      { templateName: 'Fresh Thyme', quantity: 5, unit: 'sprig' },
      { templateName: 'Fresh Rosemary', quantity: 5, unit: 'sprig' },
      { templateName: 'Fresh Bay Leaves', quantity: 2, unit: 'leaf' },
      { templateName: 'Red Wine Vinegar', quantity: 0.25, unit: 'cup' },
      { templateName: 'Extra Virgin Olive Oil', quantity: 3, unit: 'tbsp', notes: 'plus more to taste' },
      { templateName: 'Dijon Mustard', quantity: 1, unit: 'tbsp' },
      { templateName: 'Honey', quantity: 2, unit: 'tsp' },
      { templateName: 'Lemons', quantity: 1, unit: 'ea', notes: 'zested and juiced' },
      { templateName: 'Salt', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Black Pepper', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Shallots', quantity: 2, unit: 'ea', notes: 'sliced lengthwise' },
      { templateName: 'Garlic', quantity: 3, unit: 'clove', notes: 'minced' },
      { templateName: 'Carrots', quantity: 3, unit: 'ea', notes: 'thinly sliced' },
      { templateName: 'Radicchio', quantity: 1, unit: 'head', notes: 'thinly sliced' },
      { templateName: 'Fresh Parsley', quantity: 1, unit: 'bunch', notes: 'finely chopped' },
      { templateName: 'Fresh Dill', quantity: 1, unit: 'tbsp', notes: 'roughly chopped' },
      { templateName: 'Fresh Tarragon', quantity: 2, unit: 'tsp', notes: 'chopped' },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction:
          'Sort through lentils, removing any small pebbles or stones, then rinse lentils well. Tie the thyme sprigs, rosemary sprigs and bay leaves together to form a bouquet garni.',
      },
      {
        stepNumber: 2,
        instruction:
          'Add lentils and the bouquet garni to a large pot and cover with water by 2 inches. Bring to a boil, then reduce heat to maintain a simmer. Cover and simmer until lentils are tender, 12 to 20 minutes. Discard the bouquet garni. Drain the lentils and rinse with cold water. Spread on a towel-lined sheet pan to dry and cool.',
      },
      {
        stepNumber: 3,
        instruction:
          'While the lentils cook, prepare the vinaigrette: In a large bowl, combine vinegar, olive oil, mustard, honey, thyme leaves, half the lemon juice, salt and pepper; whisk well. Add the shallots and garlic and mix well to combine.',
      },
      {
        stepNumber: 4,
        instruction:
          'Stir in the carrots and radicchio to coat, then add the cooled lentils and toss again. Stir in the parsley, dill, tarragon and half the lemon zest.',
      },
      {
        stepNumber: 5,
        instruction:
          'Taste and adjust the seasoning. Finish with a generous drizzle of olive oil, lemon juice to taste and a few more pinches of lemon zest.',
      },
    ],
  },
  {
    name: 'Skillet Gnocchi With Miso Butter and Asparagus',
    prepTime: 10,
    cookTime: 15,
    servings: 4,
    sourceType: 'seeded',
    tags: ['seeded', 'vegetarian'],
    ingredients: [
      { templateName: 'Vegetable Oil', quantity: 1, unit: 'tbsp', notes: 'or canola oil' },
      { templateName: 'Potato Gnocchi', quantity: 16, unit: 'oz' },
      { templateName: 'Unsalted Butter', quantity: 4, unit: 'tbsp', notes: 'softened' },
      { templateName: 'White Miso Paste', quantity: 2, unit: 'tbsp' },
      { templateName: 'Sherry Vinegar', quantity: 2, unit: 'tsp' },
      { templateName: 'Black Pepper', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Asparagus', quantity: 1, unit: 'lb', notes: 'trimmed and cut into 1/2-inch lengths' },
      { templateName: 'Salt', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Baby Arugula', quantity: 2, unit: 'cup', notes: 'packed' },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction:
          'In a large nonstick or well-seasoned cast-iron skillet, heat the oil over medium-high. Break apart any stuck-together gnocchi and add to the skillet in an even layer. Cover and cook, undisturbed, until the gnocchi are golden brown underneath and no longer sticking to the skillet, 2 to 4 minutes.',
      },
      {
        stepNumber: 2,
        instruction:
          'Meanwhile, in a small bowl, smash together the butter, miso, vinegar and a few grinds of pepper until combined.',
      },
      {
        stepNumber: 3,
        instruction:
          'Add the asparagus and a pinch of salt to the skillet. Cook, stirring occasionally, until the asparagus are bright green and crisp-tender, 2 to 3 minutes. Turn off the heat and add the miso butter in spoonfuls. Stir until the butter has melted and gnocchi are glossed with sauce. Season to taste with salt and pepper, then stir in the arugula until combined. Serve right away.',
      },
    ],
  },
  {
    name: 'Cottage Pie',
    prepTime: 20,
    cookTime: 100,
    servings: 8,
    sourceType: 'seeded',
    tags: ['seeded'],
    ingredients: [
      { templateName: 'Ground Beef Lean', quantity: 2, unit: 'lb' },
      { templateName: 'Salt', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Black Pepper', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Lactantia Salted Butter', quantity: 7, unit: 'tbsp', notes: 'divided' },
      { templateName: 'Yellow Onion', quantity: 1, unit: 'ea', notes: 'diced' },
      { templateName: 'Celery', quantity: 2, unit: 'stalk', notes: 'finely chopped' },
      { templateName: 'Carrots', quantity: 1, unit: 'ea', notes: 'peeled and finely chopped' },
      { templateName: 'Garlic', quantity: 3, unit: 'clove', notes: 'minced' },
      { templateName: 'Tomato Paste', quantity: 2, unit: 'tbsp' },
      { templateName: 'All-Purpose Flour', quantity: 0.25, unit: 'cup' },
      { templateName: 'Beef Broth', quantity: 2, unit: 'cup' },
      { templateName: 'Dry Red Wine', quantity: 0.5, unit: 'cup', notes: 'or water' },
      { templateName: 'Frozen Peas', quantity: 0.5, unit: 'cup' },
      { templateName: 'Worcestershire Sauce', quantity: 2, unit: 'tbsp' },
      { templateName: 'Fresh Thyme', quantity: 4, unit: 'sprig' },
      { templateName: 'Dried Bay Leaves', quantity: 2, unit: 'leaf' },
      { templateName: 'Russet Potatoes', quantity: 2.5, unit: 'lb', notes: 'peeled and cut into cubes' },
      { templateName: 'Whole Milk', quantity: 0.5, unit: 'cup' },
      { templateName: 'Grated Parmesan', quantity: 0.75, unit: 'cup' },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction: 'Heat the oven to 350 degrees.',
      },
      {
        stepNumber: 2,
        instruction:
          'Heat an ovenproof 12-inch skillet over medium. Add ground beef and a large pinch of salt and cook, breaking up the meat, until slightly pink and just cooked through, 5 to 7 minutes. Transfer the beef to a bowl and leave about a teaspoon of fat in the pan.',
      },
      {
        stepNumber: 3,
        instruction:
          'Add butter, onion, celery and carrot with a pinch of salt. Cook, stirring occasionally, until the onion is translucent and the carrot is just tender, about 5 minutes. Add the garlic and tomato paste, stirring to coat, about 1 minute. Add flour and stir to incorporate.',
      },
      {
        stepNumber: 4,
        instruction:
          'Add broth, red wine, peas, Worcestershire sauce, thyme sprigs, bay leaves and 1 teaspoon each salt and pepper. Bring to a simmer and cook, stirring occasionally, until thickened, 7 to 10 minutes. Remove the bay leaves and thyme sprigs and stir in the ground beef. Remove from heat and set aside to cool slightly.',
      },
      {
        stepNumber: 5,
        instruction:
          'Add 4 quarts of water and 2 tablespoons of salt to a large saucepan and bring to a boil. Add potatoes and cook until knife-tender, about 15 minutes. Drain and return to the saucepan. Add milk, 4 tablespoons butter and 1/2 cup grated Parmesan. Mash until just creamy. Taste and add salt if needed.',
      },
      {
        stepNumber: 6,
        instruction:
          'Dollop the mashed potatoes over the beef mixture and smooth to cover. Drizzle the remaining butter over the top, sprinkle with remaining Parmesan and bake until golden and bubbly, about 30 minutes. Let stand for 10 minutes before serving.',
      },
    ],
  },
  {
    name: 'Crispy Halloumi With Tomatoes and White Beans',
    prepTime: 5,
    cookTime: 25,
    servings: 4,
    sourceType: 'seeded',
    tags: ['seeded', 'vegetarian'],
    ingredients: [
      { templateName: 'Extra Virgin Olive Oil', quantity: 2, unit: 'tbsp', notes: 'plus more for serving' },
      { templateName: 'Cherry Tomatoes', quantity: 1, unit: 'lb', notes: 'halved' },
      { templateName: 'Garlic', quantity: 2, unit: 'clove', notes: 'minced' },
      { templateName: 'Fresh Parsley', quantity: 1, unit: 'tbsp', notes: 'chopped, plus more for serving' },
      { templateName: 'Honey', quantity: 1, unit: 'tsp', notes: 'plus more for serving' },
      { templateName: 'Dried Oregano', quantity: 0.5, unit: 'tsp', notes: 'or dried thyme' },
      { templateName: 'Salt', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Black Pepper', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Canned Cannellini Beans', quantity: 15, unit: 'oz', notes: 'drained' },
      { templateName: 'Halloumi', quantity: 8, unit: 'oz', notes: 'sliced' },
      { templateName: 'Lemons', quantity: 0.5, unit: 'ea', notes: 'squeezed' },
      { templateName: 'Baguette', quantity: 1, unit: 'ea', notes: 'crusty bread, optional', isOptional: true },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction:
          'Set broiler to high heat, with a rack positioned in the upper third of the oven, 3 to 4 inches from the heat source.',
      },
      {
        stepNumber: 2,
        instruction:
          'In a large ovenproof pan over medium heat, combine olive oil with the tomatoes, garlic, parsley, honey and oregano. Season with salt and pepper and cook, stirring frequently, until the tomatoes soften and release their juices, about 10 minutes.',
      },
      {
        stepNumber: 3,
        instruction:
          'Stir in the beans and cook until heated through, about 3 minutes. Taste and season with more salt and pepper if needed. Turn off the heat.',
      },
      {
        stepNumber: 4,
        instruction:
          'Arrange the halloumi slices on top of the tomato-bean mixture. Transfer the pan to the oven and broil until the halloumi is golden and crispy on top, about 5 minutes.',
      },
      {
        stepNumber: 5,
        instruction:
          'Drizzle with olive oil, squeeze the lemon over the pan and add a light drizzle of honey. Garnish with parsley and serve immediately, with bread if desired.',
      },
    ],
  },
  {
    name: 'Chicken and Chickpea Tray Bake',
    prepTime: 10,
    cookTime: 80,
    servings: 8,
    sourceType: 'seeded',
    tags: ['seeded'],
    ingredients: [
      { templateName: 'Chicken Thighs (Bone-in, Skin-on)', quantity: 3.25, unit: 'lb' },
      { templateName: 'Ras el Hanout', quantity: 2, unit: 'tbsp' },
      { templateName: 'Salt', quantity: 2, unit: 'tsp' },
      { templateName: 'Black Pepper', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Baby Potatoes', quantity: 3, unit: 'ea', notes: 'cut into wedges' },
      { templateName: 'Canned Chickpeas', quantity: 15, unit: 'oz', notes: 'rinsed' },
      { templateName: 'Roma Tomatoes', quantity: 3, unit: 'ea', notes: 'halved lengthwise' },
      { templateName: 'Roma Peppers', quantity: 4, unit: 'ea', notes: 'halved lengthwise, stems removed' },
      { templateName: 'Garlic', quantity: 1, unit: 'head', notes: 'top trimmed' },
      { templateName: 'Extra Virgin Olive Oil', quantity: 0.75, unit: 'cup' },
      { templateName: 'Sherry Vinegar', quantity: 2, unit: 'tbsp', notes: 'divided' },
      { templateName: 'Fresh Cilantro', quantity: 0.25, unit: 'cup', notes: 'roughly chopped' },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction: 'Heat the oven to 375 degrees.',
      },
      {
        stepNumber: 2,
        instruction:
          'Season the chicken with the ras el hanout, salt and black pepper on a sheet pan and leave to marinate for 10 minutes.',
      },
      {
        stepNumber: 3,
        instruction:
          'Add the potatoes, chickpeas, tomatoes, peppers, garlic, oil and 1 tablespoon of the vinegar, and gently mix so everything is coated with oil. Spread evenly across the pan and set the chicken on top, skin-side up.',
      },
      {
        stepNumber: 4,
        instruction:
          'Bake for 30 minutes, then give the pan a gentle shake to encourage everything into an even layer. Cook for another 35 minutes, until the chicken is tender and well browned.',
      },
      {
        stepNumber: 5,
        instruction:
          'Squeeze out the garlic cloves, discarding the papery skins. Use a fork to crush the tomatoes and garlic, then loosely mix into the sauce. Sprinkle with the cilantro and drizzle over the remaining vinegar before serving.',
      },
    ],
  },
  {
    name: 'Cottage Cheese Egg Bites',
    prepTime: 10,
    cookTime: 30,
    servings: 12,
    sourceType: 'seeded',
    tags: ['seeded', 'vegetarian'],
    ingredients: [
      { templateName: 'Nonstick Cooking Spray', quantity: 1, unit: 'tbsp', notes: 'for greasing' },
      { templateName: 'Large Grade A Eggs', quantity: 8, unit: 'ea' },
      { templateName: 'Cottage Cheese', quantity: 1, unit: 'cup' },
      { templateName: 'Shredded Cheddar', quantity: 1.5, unit: 'cup', notes: 'or gruyere, mozzarella, Monterey Jack' },
      { templateName: 'Salt', quantity: 0.5, unit: 'tsp' },
      { templateName: 'Black Pepper', quantity: 0.25, unit: 'tsp' },
      { templateName: 'Hot Sauce', quantity: 1, unit: 'tsp', notes: 'optional', isOptional: true },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction:
          'Heat the oven to 325 degrees with the rack in the center position. Bring 3 cups of water to a boil and keep at a simmer. Coat a 12-cup muffin pan with nonstick cooking spray.',
      },
      {
        stepNumber: 2,
        instruction:
          'Blend the eggs, cottage cheese, 1 cup of the shredded cheese, salt and pepper until smooth and frothy, about 8 to 10 seconds.',
      },
      {
        stepNumber: 3,
        instruction:
          'Place the muffin pan on a sheet pan. Pour the egg mixture into the muffin cups, filling each three-quarters full. Add any optional mix-ins if desired, top with the remaining shredded cheese, and pour the hot water into the sheet pan to cover the very bottom of the muffin cups.',
      },
      {
        stepNumber: 4,
        instruction:
          'Bake for 25 to 30 minutes, until the egg bites have set. Rest for 5 minutes, then remove from the pan.',
      },
    ],
  },
  {
    name: 'Hoisin Garlic Noodles',
    prepTime: 5,
    cookTime: 20,
    servings: 4,
    sourceType: 'seeded',
    tags: ['seeded'],
    ingredients: [
      { templateName: 'Salt', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Black Pepper', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Wheat Noodles', quantity: 14, unit: 'oz' },
      { templateName: 'Hoisin Sauce', quantity: 0.25, unit: 'cup' },
      { templateName: 'Soy Sauce (Kikkoman)', quantity: 2, unit: 'tbsp' },
      { templateName: 'Toasted Sesame Oil', quantity: 1, unit: 'tbsp' },
      { templateName: 'Maple Syrup', quantity: 2, unit: 'tsp', notes: 'or honey' },
      { templateName: 'Vegetable Oil', quantity: 2, unit: 'tbsp', notes: 'for cooking' },
      { templateName: 'Garlic', quantity: 6, unit: 'clove', notes: 'finely chopped' },
      { templateName: 'Green Onions', quantity: 6, unit: 'stalk', notes: 'thinly sliced, whites and greens separated' },
      { templateName: 'Sesame Seeds (White)', quantity: 4, unit: 'tbsp', notes: 'toasted' },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction:
          'Bring a large pot of salted water to a boil. Add the noodles and cook according to package instructions until al dente. Drain and rinse until the noodles are cool.',
      },
      {
        stepNumber: 2,
        instruction:
          'In a small bowl, combine hoisin sauce, soy sauce, sesame oil and maple syrup; set aside.',
      },
      {
        stepNumber: 3,
        instruction:
          'Heat a large skillet on medium-high for 2 minutes. Add the oil along with the garlic and white parts of the scallions. Stir until fragrant, about 30 seconds. Add the sauce and noodles, and toss until evenly coated.',
      },
      {
        stepNumber: 4,
        instruction:
          'Leave the noodles to cook, undisturbed, until they start sticking to the pan and the bottom looks crispy, 2 to 3 minutes. Taste and season with salt and pepper.',
      },
      {
        stepNumber: 5,
        instruction:
          'Serve topped with the sesame seeds and the green parts of the scallions.',
      },
    ],
  },
  {
    name: 'Honey Garlic Shrimp',
    prepTime: 5,
    cookTime: 20,
    servings: 4,
    sourceType: 'seeded',
    tags: ['seeded'],
    ingredients: [
      { templateName: 'Jumbo Shrimp', quantity: 1, unit: 'lb', notes: 'peeled and deveined' },
      { templateName: 'Honey', quantity: 0.33, unit: 'cup' },
      { templateName: 'Soy Sauce (Kikkoman)', quantity: 3, unit: 'tbsp' },
      { templateName: 'Garlic', quantity: 2, unit: 'clove', notes: 'minced' },
      { templateName: 'Ground Ginger', quantity: 0.5, unit: 'tsp', notes: 'fresh grated' },
      { templateName: 'Crushed Red Pepper', quantity: 0.125, unit: 'tsp', notes: 'plus more to taste' },
      { templateName: 'Cornstarch', quantity: 0.25, unit: 'tsp' },
      { templateName: 'Extra Virgin Olive Oil', quantity: 1, unit: 'tbsp', notes: 'or vegetable oil' },
      { templateName: 'Green Onions', quantity: 2, unit: 'stalk', notes: 'thinly sliced, for serving' },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction: 'Place the shrimp in a large bowl.',
      },
      {
        stepNumber: 2,
        instruction:
          'Combine the honey, soy sauce, garlic, ginger and crushed red pepper; whisk until smooth. Pour 3 tablespoons of the marinade over the shrimp and toss to coat. Marinate for at least 15 minutes at room temperature, or up to 1 hour in the fridge.',
      },
      {
        stepNumber: 3,
        instruction: 'Whisk the cornstarch with the remaining marinade and set aside.',
      },
      {
        stepNumber: 4,
        instruction: 'Lift the shrimp from the marinade and pat dry; discard any marinade remaining in the bowl.',
      },
      {
        stepNumber: 5,
        instruction:
          'Heat a skillet over medium-high. Add the oil, then arrange the shrimp in one layer. Cook for 2 minutes, flip, and cook for 1 more minute.',
      },
      {
        stepNumber: 6,
        instruction:
          'Add the reserved marinade and cook for 1 to 2 minutes, until the pan sauce thickens.',
      },
      {
        stepNumber: 7,
        instruction:
          'Transfer the shrimp and sauce to a serving dish, sprinkle with scallions and serve.',
      },
    ],
  },
  {
    name: 'Chicken and Red Lentil Soup With Lemony Yogurt',
    prepTime: 15,
    cookTime: 45,
    servings: 4,
    sourceType: 'seeded',
    tags: ['seeded'],
    ingredients: [
      { templateName: 'Extra Virgin Olive Oil', quantity: 3, unit: 'tbsp' },
      { templateName: 'Yellow Onion', quantity: 2, unit: 'ea', notes: 'thinly sliced' },
      { templateName: 'Garlic', quantity: 6, unit: 'clove', notes: 'thinly sliced' },
      { templateName: 'Chicken Thighs (Boneless, Skinless)', quantity: 1, unit: 'lb' },
      { templateName: 'Red Lentils', quantity: 1.5, unit: 'cup', notes: 'rinsed' },
      { templateName: 'Ground Turmeric', quantity: 1, unit: 'tsp' },
      { templateName: 'Salt', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Black Pepper', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Fresh Parsley', quantity: 0.33, unit: 'cup', notes: 'finely chopped' },
      { templateName: 'Fresh Dill', quantity: 0.33, unit: 'cup', notes: 'finely chopped' },
      { templateName: 'Fresh Mint', quantity: 0.33, unit: 'cup', notes: 'finely chopped' },
      { templateName: 'Plain Yogurt (Full Fat)', quantity: 1, unit: 'cup' },
      { templateName: 'Lemons', quantity: 2, unit: 'tbsp', notes: 'juice' },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction:
          'Heat oil in a large pot over medium-high. Add the onions and cook, stirring often, until deeply charred around the edges and tender, 10 to 12 minutes. Add the garlic and cook until softened, 2 to 3 minutes.',
      },
      {
        stepNumber: 2,
        instruction:
          'Add the chicken, lentils and turmeric, and season generously with salt and pepper. Toss so the turmeric coats the ingredients.',
      },
      {
        stepNumber: 3,
        instruction:
          'Pour in 8 cups water, bring to a boil, then reduce heat to medium-low and cook, stirring occasionally, until the lentils have collapsed and the chicken is cooked through, 20 to 25 minutes.',
      },
      {
        stepNumber: 4,
        instruction:
          'Remove the chicken, shred it, and return it to the pot. Stir in the herbs and adjust seasoning as needed.',
      },
      {
        stepNumber: 5,
        instruction:
          'Combine the yogurt and lemon juice in a small bowl and season with salt. Thin with water if needed.',
      },
      {
        stepNumber: 6,
        instruction:
          'Ladle the soup into bowls and spoon the lemony yogurt over before serving.',
      },
    ],
  },
  {
    name: 'One-Pot Beans, Greens and Grains',
    prepTime: 5,
    cookTime: 35,
    servings: 4,
    sourceType: 'seeded',
    tags: ['seeded', 'vegetarian'],
    ingredients: [
      { templateName: 'Quinoa', quantity: 1, unit: 'cup', notes: 'rinsed' },
      { templateName: 'Salt', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Black Pepper', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Canned Chickpeas', quantity: 14, unit: 'oz', notes: 'drained and rinsed' },
      { templateName: 'Garlic', quantity: 1, unit: 'clove', notes: 'finely grated' },
      { templateName: 'Extra Virgin Olive Oil', quantity: 2, unit: 'tbsp' },
      { templateName: 'Kale', quantity: 1, unit: 'bunch', notes: 'stems removed, chopped' },
      { templateName: 'Lemons', quantity: 1, unit: 'ea', notes: 'zested and juiced' },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction:
          'In a large pot or Dutch oven, bring the water, quinoa and a generous pinch each of salt and pepper to a boil over high. Cover, reduce heat to low and simmer for 13 minutes.',
      },
      {
        stepNumber: 2,
        instruction:
          'Drain and rinse the beans, then transfer to a small bowl. Finely grate the garlic over the beans, add the oil and a pinch each of salt and pepper, and stir to combine. Remove tough stems from the greens and roughly chop the leaves.',
      },
      {
        stepNumber: 3,
        instruction:
          'Arrange the greens on top of the quinoa and season well with salt and pepper. Cover and cook until the quinoa is tender, 5 to 7 minutes. Remove from heat, scrape the beans over the greens, cover and let sit for 5 minutes.',
      },
      {
        stepNumber: 4,
        instruction:
          'Grate some lemon zest over the beans and greens, then serve with lemon wedges, salt and pepper to taste.',
      },
    ],
  },
  {
    name: 'Smashed Beef Kebab With Cucumber Yogurt',
    prepTime: 15,
    cookTime: 10,
    servings: 4,
    sourceType: 'seeded',
    tags: ['seeded'],
    ingredients: [
      { templateName: 'Greek Yogurt (Plain)', quantity: 2, unit: 'cup' },
      { templateName: 'Mini Cucumbers', quantity: 2, unit: 'ea', notes: 'grated' },
      { templateName: 'Fresh Mint', quantity: 3, unit: 'tbsp', notes: 'chopped, plus leaves for serving' },
      { templateName: 'Garlic', quantity: 1, unit: 'clove', notes: 'finely grated' },
      { templateName: 'Ground Beef Lean', quantity: 1, unit: 'lb', notes: 'or ground lamb' },
      { templateName: 'Yellow Onion', quantity: 1, unit: 'ea', notes: 'grated' },
      { templateName: 'Ground Turmeric', quantity: 0.5, unit: 'tsp' },
      { templateName: 'Salt', quantity: 2, unit: 'tsp' },
      { templateName: 'Black Pepper', quantity: 1, unit: 'tsp', notes: 'to taste' },
      { templateName: 'Chopped Walnuts', quantity: 0.25, unit: 'cup' },
      { templateName: 'Raisins', quantity: 2, unit: 'tbsp', notes: 'or dried cranberries' },
      { templateName: 'Pomegranate Molasses', quantity: 1, unit: 'tbsp', notes: 'optional', isOptional: true },
      { templateName: 'Pita Bread (6-pack)', quantity: 1, unit: 'pkg', notes: 'warmed, for serving' },
    ],
    instructions: [
      {
        stepNumber: 1,
        instruction:
          'Mix the yogurt, cucumbers, chopped mint and garlic in a medium bowl. Chill until ready to serve.',
      },
      {
        stepNumber: 2,
        instruction:
          'Mix the beef, onion, turmeric, 1 teaspoon of salt and lots of black pepper in a medium bowl.',
      },
      {
        stepNumber: 3,
        instruction:
          'Heat a large cast-iron skillet over medium-high. Divide the beef into large chunks and add to the skillet. Cook until charred underneath and browned halfway up the sides, 6 to 8 minutes.',
      },
      {
        stepNumber: 4,
        instruction:
          'Toss the meat, breaking up large pieces. Add the walnuts and raisins and cook, stirring often, until the meat is cooked and the walnuts are toasted, 2 to 3 minutes more.',
      },
      {
        stepNumber: 5,
        instruction:
          'Season the yogurt with the remaining salt. Spread on a serving platter and top with the crispy meat. Drizzle with pomegranate molasses if using, garnish with mint leaves, and serve with warmed pita or rice.',
      },
    ],
  },
];

async function seed() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(dbName);
  const now = new Date();
  const omitUndefined = (value) =>
    Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
  const normalizeUnit = (unit) => {
    if (typeof unit !== 'string') {
      return { defaultUnit: unit };
    }
    const trimmed = unit.trim();
    const match = trimmed.match(/^(\d+(?:\.\d+)?)([a-zA-Z]+)(?:\s+(.*))?$/);
    if (!match) {
      return { defaultUnit: trimmed };
    }
    const packageQuantity = Number(match[1]);
    const packageUnit = match[2];
    const defaultUnit = match[3] ? match[3].trim() : packageUnit;
    return { defaultUnit, packageQuantity, packageUnit };
  };

  // Stores
  const storeDocs = STORES.map((store) => ({
    name: store.name,
    seededTag: 'seeded',
    location: {
      address: store.address,
      city: 'Montreal',
      state: 'QC',
      zipCode: 'H3A',
      coordinates: { type: 'Point', coordinates: store.coords },
    },
    hours: {
      monday: '8:00 AM - 10:00 PM',
      tuesday: '8:00 AM - 10:00 PM',
      wednesday: '8:00 AM - 10:00 PM',
      thursday: '8:00 AM - 10:00 PM',
      friday: '8:00 AM - 10:00 PM',
      saturday: '8:00 AM - 9:00 PM',
      sunday: '9:00 AM - 8:00 PM',
    },
    createdAt: now,
    updatedAt: now,
  }));

  await db.collection('groceryStores').deleteMany({ seededTag: 'seeded' });
  const storeResult = await db.collection('groceryStores').insertMany(storeDocs);
  const storeIds = Object.values(storeResult.insertedIds);
  const storeInfos = storeDocs.map((store, index) => ({
    id: storeIds[index],
    type: store.type,
  }));

  // Items
  const desiredItemCount = 100;
  const baseItemDocs = ITEM_TEMPLATES.map((template) => ({
    name: template.name,
    category: template.cat,
    subcategory: template.sub,
    averageShelfLife: template.shelf,
    ...normalizeUnit(template.unit),
    tags: ['seeded'],
    createdAt: now,
    updatedAt: now,
  }));

  const itemDocs = [...baseItemDocs];
  const itemNameSet = new Set(itemDocs.map((item) => item.name));
  let i = 0;
  while (itemDocs.length < desiredItemCount) {
    const template = ITEM_TEMPLATES[i % ITEM_TEMPLATES.length];
    const sizeVariation = i % 3 === 0 ? ' (Large)' : i % 3 === 1 ? ' (Value Pack)' : '';
    const brandVariation = i >= ITEM_TEMPLATES.length ? ` - Selection ${Math.floor(i / 10)}` : '';
    const name = `${template.name}${brandVariation}${sizeVariation}`;
    if (!itemNameSet.has(name)) {
      itemNameSet.add(name);
      itemDocs.push({
        name,
        category: template.cat,
        subcategory: template.sub,
        averageShelfLife: template.shelf,
        ...normalizeUnit(template.unit),
        tags: ['seeded'],
        createdAt: now,
        updatedAt: now,
      });
    }
    i += 1;
  }

  const itemNames = itemDocs.map((item) => item.name);
  const existingItems = await db.collection('items').find({ name: { $in: itemNames } }).toArray();
  const itemIdByName = new Map(existingItems.map((item) => [item.name, item._id]));
  const missingItemDocs = itemDocs.filter((item) => !itemIdByName.has(item.name));
  if (missingItemDocs.length > 0) {
    const insertResult = await db.collection('items').insertMany(missingItemDocs);
    missingItemDocs.forEach((item, index) => {
      itemIdByName.set(item.name, insertResult.insertedIds[index]);
    });
  }

  const itemIds = itemNames.map((name) => itemIdByName.get(name)).filter(Boolean);
  const templateNameToItemId = new Map();
  ITEM_TEMPLATES.forEach((template) => {
    const itemId = itemIdByName.get(template.name);
    if (!itemId) {
      throw new Error(`Missing item for template: ${template.name}`);
    }
    templateNameToItemId.set(template.name, itemId);
  });

  const resolveTemplateItemId = (templateName) => {
    const itemId = templateNameToItemId.get(templateName);
    if (!itemId) {
      throw new Error(`Missing item for template: ${templateName}`);
    }
    return itemId;
  };

  // Recipes
  await db.collection('recipes').deleteMany({ tags: 'seeded' });
  const recipeDocs = RECIPE_SEEDS.map((recipe) => ({
    name: recipe.name,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    servings: recipe.servings,
    sourceType: recipe.sourceType,
    tags: recipe.tags,
    ingredients: recipe.ingredients.map((ingredient) =>
      omitUndefined({
        itemId: resolveTemplateItemId(ingredient.templateName),
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        notes: ingredient.notes,
        isOptional: ingredient.isOptional,
      }),
    ),
    instructions: recipe.instructions.map((step) => ({
      stepNumber: step.stepNumber,
      instruction: step.instruction,
    })),
    isPublic: true,
    createdAt: now,
    updatedAt: now,
  }));

  if (recipeDocs.length > 0) {
    await db.collection('recipes').insertMany(recipeDocs);
  }

  // Household
  await db.collection('households').deleteMany({ name: 'Peel Street Household', seededTag: 'seeded' });
  await db.collection('households').insertOne({
    name: 'Peel Street Household',
    seededTag: 'seeded',
    location: {
      address: '3425 Peel St',
      city: 'Montreal',
      state: 'QC',
      zipCode: 'H3A 1W7',
      coordinates: { type: 'Point', coordinates: [-73.5771251, 45.5023081] },
    },
    preferredStores: [],
    fridgeItems: [],
    shoppingList: [],
    savedRecipes: [],
    createdAt: now,
    updatedAt: now,
  });

  // Store inventory
  await db.collection('storeInventory').deleteMany({ itemId: { $in: itemIds } });

  const inventoryDocs = [];
  const inventoryKeys = new Set();
  const templateByName = new Map(ITEM_TEMPLATES.map((template) => [template.name, template]));
  const relevantStoreTypesByCategory = new Map([
    [
      'Produce',
      new Set([
        'Full Grocery',
        'Discount/Quality',
        'Budget/Organic',
        'Specialty/Asian',
        'Asian Market',
        'Middle Eastern',
        'Middle Eastern/Convenience',
      ]),
    ],
    ['Meat', new Set(['Full Grocery', 'Discount/Quality'])],
    ['Dairy', new Set(['Full Grocery', 'Discount/Quality', 'Budget/Organic'])],
    [
      'Pantry',
      new Set([
        'Full Grocery',
        'Discount/Quality',
        'Budget/Organic',
        'Specialty/Asian',
        'Asian Market',
        'Middle Eastern',
        'Middle Eastern/Convenience',
      ]),
    ],
    ['Frozen', new Set(['Full Grocery', 'Discount/Quality', 'Budget/Organic'])],
    ['Beverages', new Set(['Full Grocery', 'Discount/Quality', 'Budget/Organic'])],
  ]);

  storeIds.forEach((storeId) => {
    const shuffled = [...itemIds].sort(() => 0.5 - Math.random()).slice(0, 60);
    shuffled.forEach((itemId, index) => {
      const template = ITEM_TEMPLATES[index % ITEM_TEMPLATES.length];
      const priceVariation = (Math.random() * 0.4) - 0.2;
      const storePrice = Number(Math.max(template.price + priceVariation, 0.01).toFixed(2));
      const key = `${storeId.toString()}-${itemId.toString()}`;
      inventoryKeys.add(key);

      inventoryDocs.push({
        storeId,
        itemId,
        price: storePrice,
        inStock: Math.random() > 0.05,
        onSale: Math.random() > 0.85,
        salePrice: Number((storePrice * 0.8).toFixed(2)),
        lastUpdated: now,
      });
    });
  });

  RECIPE_INGREDIENT_TEMPLATE_NAMES.forEach((templateName) => {
    const template = templateByName.get(templateName);
    const itemId = templateNameToItemId.get(templateName);
    if (!template || !itemId) return;
    const storeTypeSet =
      relevantStoreTypesByCategory.get(template.cat) ||
      new Set(['Full Grocery', 'Discount/Quality', 'Budget/Organic']);
    const targetStoreIds = storeInfos
      .filter((store) => storeTypeSet.has(store.type))
      .map((store) => store.id);

    targetStoreIds.forEach((storeId) => {
      const key = `${storeId.toString()}-${itemId.toString()}`;
      if (inventoryKeys.has(key)) return;
      inventoryKeys.add(key);

      const priceVariation = (Math.random() * 0.4) - 0.2;
      const storePrice = Number(Math.max(template.price + priceVariation, 0.01).toFixed(2));
      inventoryDocs.push({
        storeId,
        itemId,
        price: storePrice,
        inStock: true,
        onSale: Math.random() > 0.9,
        salePrice: Number((storePrice * 0.8).toFixed(2)),
        lastUpdated: now,
      });
    });
  });

  await db.collection('storeInventory').insertMany(inventoryDocs);

  // eslint-disable-next-line no-console
  console.log(`Success! Seeded ${storeDocs.length} stores, 100 items, and updated inventories.`);
  await client.close();
}

seed().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', error);
  process.exit(1);
});

# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Auth0 setup

Auth0 config lives in `app.json` under `expo.extra`. Set:

- `auth0Domain`
- `auth0ClientId`
- `apiBaseUrl` (your backend URL)

## Backend (Node/Express)

The backend lives in `backend/` and exposes a basic health check at `GET /health`.

1. Install backend dependencies

   ```bash
   cd backend
   npm install
   ```

2. Configure environment variables

   Copy `backend/.env.example` to `backend/.env` and fill in your database password.

3. Initialize the database schema and indexes

   ```bash
   npm run init-db
   ```

4. Seed the database with Montreal stores and common items

   ```bash
   npm run seed-db
   ```

5. Remove seeded produce items and stores

   ```bash
   npm run cleanup-seed
   ```

6. Start the backend

   ```bash
   npm start
   ```

The backend defaults to `http://localhost:3001` and can be changed with `PORT`.

## Backend routes

User

- `POST /users/auth0`
  - Body: `{ auth0UserId, email, firstName?, lastName?, auth0? }`
  - Response: user document

Households

- `POST /households`
  - Body: `{ name, userId }`
  - Response: `{ householdId, inviteCode }`
  - Notes: returns 409 if user already belongs to a household

- `POST /grocery-stores`
  - Body: `{ name, location, phone?, hours?, seededTag? }`
  - Response: `{ storeId }`

- `PATCH /grocery-stores/:storeId`
  - Body: any of `{ name, location, phone, hours }`
  - Response: updated store document

- `DELETE /grocery-stores/:storeId`
  - Response: 204

- `GET /grocery-stores/nearby?lat=...&lng=...&radius=3000&limit=20&name=...&city=...&state=...&zipCode=...&seededTag=...`
  - Response: array of store documents sorted by distance

- `GET /grocery-stores/items/search?query=...&storeId=...&category=...&subcategory=...&brand=...&onSale=...&inStock=...&minPrice=...&maxPrice=...&limit=50&sortBy=price|name|store|updated&sortOrder=asc|desc`
  - Response: array of inventory matches with item + store details

- `POST /households/join`
  - Body: `{ inviteCode, userId }`
  - Response: `{ householdId }`
  - Notes: returns 409 if user already belongs to a household

- `GET /households/:householdId`
  - Response: household document

- `PATCH /households/:householdId`
  - Body: any of `{ name, location, preferredStores, fridgeItems, shoppingList, savedRecipes }`
  - Response: updated household document

- `POST /households/:householdId/fridge-items`
  - Body: `{ itemId, quantity, unit, location, purchaseDate, expirationDate?, isOpen?, notes?, addedBy? }`
  - Response: `{ fridgeItemId, household }`

- `GET /households/:householdId/fridge-items?itemId=...&location=...&isOpen=...&addedBy=...&minQuantity=...&maxQuantity=...&purchaseBefore=...&purchaseAfter=...&expireBefore=...&expireAfter=...&sortBy=...&sortOrder=asc|desc`
  - Response: array of fridge items

- `PATCH /households/:householdId/fridge-items/:fridgeItemId`
  - Body: any of `{ quantity, unit, location, purchaseDate, expirationDate, isOpen, notes }`
  - Response: updated household document

- `DELETE /households/:householdId/fridge-items/:fridgeItemId`
  - Response: updated household document

Users

- `PATCH /users/:userId`
  - Body: any of `{ email, firstName, lastName, householdId, role, foodPreferences, notificationPreferences, auth0 }`
  - Response: updated user document
  - Notes: returns 409 if user already belongs to a different household

Images

- `POST /images`
  - Multipart form-data with field `image` (file)
  - Optional fields: `tags` (comma-separated)
  - Response: `{ imageId, url }`

Receipts

- `POST /households/:householdId/receipts`
  - Multipart form-data with field `receipt` (file)
  - Requires `RECEIPT_WEBHOOK_URL` env var
  - Response: `{ householdId, storeId, itemId, fridgeItemId, imageUrl }`

## Auth headers

All protected routes expect headers:

- `x-user-id`: MongoDB ObjectId of the authenticated user
- `x-household-id`: MongoDB ObjectId of the household (required for household-specific routes)

Routes exempt from auth:

- `GET /health`
- `POST /users/auth0`

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

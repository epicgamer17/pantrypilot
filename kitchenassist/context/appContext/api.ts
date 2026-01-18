export type HeadersBuilder = (
  includeJson?: boolean,
  explicitHouseholdId?: string | null,
) => Record<string, string>;

export const fetchItemsByIds = async (
  apiUrl: string,
  getHeaders: HeadersBuilder,
  userId: string | null,
  ids: string[],
) => {
  if (!userId || !ids.length) {
    return new Map<string, { name?: string; category?: string; packageQuantity?: number; packageUnit?: string }>();
  }
  try {
    const res = await fetch(`${apiUrl}/items/lookup?ids=${ids.join(',')}`, {
      headers: getHeaders(),
    });
    if (!res.ok) {
      return new Map<string, { name?: string; category?: string; packageQuantity?: number; packageUnit?: string }>();
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      return new Map<string, { name?: string; category?: string; packageQuantity?: number; packageUnit?: string }>();
    }
    return new Map(
      data.map(
        (item: {
          id?: string;
          _id?: string;
          name?: string;
          category?: string;
          packageQuantity?: number;
          packageUnit?: string;
        }) => [
          String(item.id ?? item._id),
          {
            name: item.name,
            category: item.category,
            packageQuantity: item.packageQuantity,
            packageUnit: item.packageUnit,
          },
        ],
      ),
    );
  } catch (error) {
    return new Map<string, { name?: string; category?: string; packageQuantity?: number; packageUnit?: string }>();
  }
};

export const fetchItemPrices = async (
  apiUrl: string,
  getHeaders: HeadersBuilder,
  userId: string | null,
  ids: string[],
) => {
  if (!userId || !ids.length) return new Map<string, number>();
  try {
    const res = await fetch(
      `${apiUrl}/grocery-stores/items/prices?ids=${ids.join(',')}`,
      { headers: getHeaders() },
    );
    if (!res.ok) return new Map<string, number>();
    const data = await res.json();
    if (!Array.isArray(data)) return new Map<string, number>();
    return new Map(
      data.map((item: { itemId: string; effectivePrice?: number }) => [
        String(item.itemId),
        Number(item.effectivePrice ?? 0),
      ]),
    );
  } catch (error) {
    return new Map<string, number>();
  }
};

export const fetchItemPriceLeaders = async (
  apiUrl: string,
  getHeaders: HeadersBuilder,
  userId: string | null,
  ids: string[],
) => {
  if (!userId || !ids.length) {
    return new Map<string, { price: number; storeName?: string; itemName?: string }>();
  }
  try {
    const res = await fetch(
      `${apiUrl}/grocery-stores/items/prices?ids=${ids.join(',')}`,
      { headers: getHeaders() },
    );
    if (!res.ok) {
      return new Map<string, { price: number; storeName?: string; itemName?: string }>();
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      return new Map<string, { price: number; storeName?: string; itemName?: string }>();
    }
    return new Map(
      data.map((item: { itemId: string; effectivePrice?: number; storeName?: string; itemName?: string }) => [
        String(item.itemId),
        { price: Number(item.effectivePrice ?? 0), storeName: item.storeName, itemName: item.itemName },
      ]),
    );
  } catch (error) {
    return new Map<string, { price: number; storeName?: string; itemName?: string }>();
  }
};

export const fetchClosestPrice = async (
  apiUrl: string,
  getHeaders: HeadersBuilder,
  userId: string | null,
  name: string,
) => {
  if (!userId || !name.trim()) return 0;
  try {
    const res = await fetch(
      `${apiUrl}/grocery-stores/items/search?query=${encodeURIComponent(
        name,
      )}&limit=1&sortBy=price&sortOrder=asc`,
      { headers: getHeaders() },
    );
    if (!res.ok) return 0;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return 0;
    const candidate = data[0];
    const price =
      candidate.onSale && candidate.salePrice
        ? Number(candidate.salePrice)
        : Number(candidate.price);
    return Number.isFinite(price) ? price : 0;
  } catch (error) {
    return 0;
  }
};

export const fetchClosestPriceWithStore = async (
  apiUrl: string,
  getHeaders: HeadersBuilder,
  userId: string | null,
  name: string,
) => {
  if (!userId || !name.trim()) return { price: 0 };
  try {
    const res = await fetch(
      `${apiUrl}/grocery-stores/items/search?query=${encodeURIComponent(
        name,
      )}&limit=1&sortBy=price&sortOrder=asc`,
      { headers: getHeaders() },
    );
    if (!res.ok) return { price: 0 };
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return { price: 0 };
    const candidate = data[0];
    const price =
      candidate.onSale && candidate.salePrice
        ? Number(candidate.salePrice)
        : Number(candidate.price);
    return {
      price: Number.isFinite(price) ? price : 0,
      storeName: candidate.store?.name,
      itemName: candidate.item?.name,
    };
  } catch (error) {
    return { price: 0 };
  }
};

export const ensureItemByName = async (
  apiUrl: string,
  getHeaders: HeadersBuilder,
  userId: string | null,
  name: string,
  category?: string,
) => {
  if (!userId) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  try {
    const searchRes = await fetch(
      `${apiUrl}/items?search=${encodeURIComponent(trimmed)}`,
      { headers: getHeaders() },
    );
    if (searchRes.ok) {
      const data = await searchRes.json();
      if (Array.isArray(data)) {
        const exact = data.find(
          (item: { name?: string }) =>
            item.name?.toLowerCase?.() === trimmed.toLowerCase(),
        );
        if (exact?.id || exact?._id) {
          return {
            id: String(exact.id ?? exact._id),
            name: exact.name,
            category: exact.category,
          };
        }
      }
    }
    const createRes = await fetch(`${apiUrl}/items`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ name: trimmed, category }),
    });
    if (!createRes.ok) return null;
    const created = await createRes.json();
    if (!created?.id && !created?._id) return null;
    return {
      id: String(created.id ?? created._id),
      name: created.name ?? trimmed,
      category: created.category,
    };
  } catch (error) {
    return null;
  }
};

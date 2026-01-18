import { GroceryItem } from '../../types';

export const resolveShoppingListIds = async (
  list: GroceryItem[],
  isValidObjectId: (value?: string | null) => boolean,
  ensureItemByName: (name: string, category?: string) => Promise<{
    id: string;
    name?: string;
    category?: string;
  } | null>,
) => {
  const resolvedList = [...list];
  for (let index = 0; index < resolvedList.length; index += 1) {
    const item = resolvedList[index];
    const candidateId = item.itemId ?? item.id;
    if (isValidObjectId(candidateId)) {
      resolvedList[index] = { ...item, itemId: candidateId, id: candidateId };
      continue;
    }
    if (!item.name) continue;
    const resolved = await ensureItemByName(item.name, item.aisle);
    if (resolved?.id) {
      resolvedList[index] = {
        ...item,
        id: resolved.id,
        itemId: resolved.id,
        name: resolved.name ?? item.name,
        aisle: resolved.category ?? item.aisle,
      };
    }
  }
  return resolvedList;
};

import { Types } from 'mongoose';
import { MenuCategory } from '../models/MenuCategory';
import { MenuItem } from '../models/MenuItem';
import { NotFoundError } from '../utils/errors';

export async function listCategories(tenantId: Types.ObjectId) {
  return MenuCategory.find({ tenantId }).sort({ sortOrder: 1, createdAt: 1 });
}

export async function createCategory(tenantId: Types.ObjectId, data: { name: string; sortOrder?: number }) {
  const count = await MenuCategory.countDocuments({ tenantId });
  return MenuCategory.create({ tenantId, name: data.name, sortOrder: data.sortOrder ?? count });
}

export async function updateCategory(
  tenantId: Types.ObjectId,
  id: string,
  data: Partial<{ name: string; sortOrder: number; isActive: boolean }>
) {
  const cat = await MenuCategory.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: data },
    { new: true }
  );
  if (!cat) throw new NotFoundError('Category');
  return cat;
}

export async function deleteCategory(tenantId: Types.ObjectId, id: string) {
  const cat = await MenuCategory.findOneAndDelete({ _id: id, tenantId });
  if (!cat) throw new NotFoundError('Category');
  await MenuItem.deleteMany({ tenantId, categoryId: id });
  return cat;
}

export async function reorderCategories(tenantId: Types.ObjectId, orderedIds: string[]) {
  const ops = orderedIds.map((id, i) =>
    MenuCategory.findOneAndUpdate({ _id: id, tenantId }, { sortOrder: i })
  );
  await Promise.all(ops);
}

export async function listItems(tenantId: Types.ObjectId, categoryId?: string) {
  const query: Record<string, unknown> = { tenantId };
  if (categoryId) query.categoryId = categoryId;
  return MenuItem.find(query).sort({ categoryId: 1, sortOrder: 1, createdAt: 1 }).populate('categoryId', 'name');
}

export async function createItem(
  tenantId: Types.ObjectId,
  data: {
    categoryId: string;
    name: string;
    description?: string;
    price: number;
    imageUrl?: string;
    isAvailable?: boolean;
    tags?: string[];
    sortOrder?: number;
  }
) {
  const cat = await MenuCategory.findOne({ _id: data.categoryId, tenantId });
  if (!cat) throw new NotFoundError('Category');
  const count = await MenuItem.countDocuments({ tenantId, categoryId: data.categoryId });
  return MenuItem.create({
    tenantId,
    categoryId: data.categoryId,
    name: data.name,
    description: data.description ?? '',
    price: data.price,
    imageUrl: data.imageUrl,
    isAvailable: data.isAvailable ?? true,
    tags: data.tags ?? [],
    sortOrder: data.sortOrder ?? count,
  });
}

export async function updateItem(
  tenantId: Types.ObjectId,
  id: string,
  data: Partial<{
    name: string;
    description: string;
    price: number;
    imageUrl: string;
    isAvailable: boolean;
    tags: string[];
    sortOrder: number;
    categoryId: string;
  }>
) {
  const item = await MenuItem.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: data },
    { new: true }
  );
  if (!item) throw new NotFoundError('MenuItem');
  return item;
}

export async function deleteItem(tenantId: Types.ObjectId, id: string) {
  const item = await MenuItem.findOneAndDelete({ _id: id, tenantId });
  if (!item) throw new NotFoundError('MenuItem');
  return item;
}

export async function setAvailability(tenantId: Types.ObjectId, id: string, isAvailable: boolean) {
  const item = await MenuItem.findOneAndUpdate(
    { _id: id, tenantId },
    { isAvailable },
    { new: true }
  );
  if (!item) throw new NotFoundError('MenuItem');
  return item;
}

export async function reorderItems(tenantId: Types.ObjectId, orderedIds: string[]) {
  const ops = orderedIds.map((id, i) =>
    MenuItem.findOneAndUpdate({ _id: id, tenantId }, { sortOrder: i })
  );
  await Promise.all(ops);
}

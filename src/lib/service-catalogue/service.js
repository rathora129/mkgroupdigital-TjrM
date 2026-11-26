import { and, asc, count, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { serviceCategories, services } from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import {
  DEFAULT_SERVICE_CATEGORIES,
  DEFAULT_SERVICES,
} from './defaults';

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const CATEGORY_SELECT = {
  id: serviceCategories.id,
  workspaceId: serviceCategories.workspaceId,
  name: serviceCategories.name,
  slug: serviceCategories.slug,
  description: serviceCategories.description,
  sortOrder: serviceCategories.sortOrder,
  status: serviceCategories.status,
  createdAt: serviceCategories.createdAt,
  updatedAt: serviceCategories.updatedAt,
};

const SERVICE_SELECT = {
  id: services.id,
  workspaceId: services.workspaceId,
  categoryId: services.categoryId,
  categoryName: serviceCategories.name,
  categorySlug: serviceCategories.slug,
  name: services.name,
  slug: services.slug,
  description: services.description,
  billingType: services.billingType,
  regulated: services.regulated,
  reviewProfession: services.reviewProfession,
  reviewNotes: services.reviewNotes,
  status: services.status,
  sortOrder: services.sortOrder,
  createdAt: services.createdAt,
  updatedAt: services.updatedAt,
};

// The starter catalogue is copied once per workspace. Every record is a normal
// editable row after that, and existing workspaces are never overwritten.
export async function ensureDefaultCatalogue(workspaceId, userId) {
  const [{ value }] = await getDb()
    .select({ value: count() })
    .from(serviceCategories)
    .where(eq(serviceCategories.workspaceId, workspaceId));

  if (Number(value || 0) > 0) return false;

  await getDb()
    .insert(serviceCategories)
    .values(
      DEFAULT_SERVICE_CATEGORIES.map((category) => ({
        workspaceId,
        name: category.name,
        slug: category.slug,
        description: category.description,
        sortOrder: category.sortOrder,
        createdByUserId: userId || null,
      })),
    )
    .onConflictDoNothing({
      target: [serviceCategories.workspaceId, serviceCategories.slug],
    });

  const categories = await getDb()
    .select({ id: serviceCategories.id, slug: serviceCategories.slug })
    .from(serviceCategories)
    .where(eq(serviceCategories.workspaceId, workspaceId));

  const categoryBySlug = new Map(
    categories.map((category) => [category.slug, category.id]),
  );

  const rows = DEFAULT_SERVICES.flatMap((service) => {
    const categoryId = categoryBySlug.get(service.category);
    if (!categoryId) return [];
    return [
      {
        workspaceId,
        categoryId,
        name: service.name,
        slug: service.slug,
        description: service.description,
        billingType: service.billingType,
        regulated: Boolean(service.regulated),
        reviewProfession: service.reviewProfession || null,
        reviewNotes: service.reviewNotes || null,
        sortOrder: service.sortOrder,
        createdByUserId: userId || null,
      },
    ];
  });

  const inserted = rows.length
    ? await getDb()
        .insert(services)
        .values(rows)
        .onConflictDoNothing({
          target: [services.workspaceId, services.slug],
        })
        .returning({ id: services.id })
    : [];

  await recordAudit({
    workspaceId,
    actorUserId: userId || null,
    action: 'service_catalogue.seed',
    resourceType: 'service_category',
    metadata: {
      categories: DEFAULT_SERVICE_CATEGORIES.length,
      services: inserted.length,
    },
  });

  return inserted.length > 0;
}

export async function listCatalogue(workspaceId, { includeArchived = false } = {}) {
  const categoryFilter = includeArchived
    ? eq(serviceCategories.workspaceId, workspaceId)
    : and(
        eq(serviceCategories.workspaceId, workspaceId),
        eq(serviceCategories.status, 'active'),
      );
  const serviceFilter = includeArchived
    ? eq(services.workspaceId, workspaceId)
    : and(eq(services.workspaceId, workspaceId), eq(services.status, 'active'));

  const [categories, serviceRows] = await Promise.all([
    getDb()
      .select(CATEGORY_SELECT)
      .from(serviceCategories)
      .where(categoryFilter)
      .orderBy(asc(serviceCategories.sortOrder), asc(serviceCategories.name)),
    getDb()
      .select(SERVICE_SELECT)
      .from(services)
      .innerJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
      .where(serviceFilter)
      .orderBy(asc(services.sortOrder), asc(services.name)),
  ]);

  const grouped = categories.map((category) => ({
    ...category,
    services: serviceRows.filter((service) => service.categoryId === category.id),
  }));

  return {
    categories: grouped,
    services: serviceRows,
    counts: {
      categories: categories.length,
      services: serviceRows.length,
      regulated: serviceRows.filter((service) => service.regulated).length,
      archived: includeArchived
        ? serviceRows.filter((service) => service.status === 'archived').length
        : 0,
    },
  };
}

export async function getCatalogueOptions(workspaceId) {
  return getDb()
    .select({
      id: services.id,
      name: services.name,
      categoryId: services.categoryId,
      categoryName: serviceCategories.name,
      regulated: services.regulated,
      reviewProfession: services.reviewProfession,
    })
    .from(services)
    .innerJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
    .where(and(eq(services.workspaceId, workspaceId), eq(services.status, 'active')))
    .orderBy(asc(serviceCategories.sortOrder), asc(services.sortOrder), asc(services.name));
}

export async function findService(workspaceId, serviceId) {
  if (!serviceId) return null;
  const rows = await getDb()
    .select(SERVICE_SELECT)
    .from(services)
    .innerJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
    .where(and(eq(services.workspaceId, workspaceId), eq(services.id, serviceId)))
    .limit(1);
  return rows[0] || null;
}

async function findCategory(workspaceId, categoryId) {
  const rows = await getDb()
    .select(CATEGORY_SELECT)
    .from(serviceCategories)
    .where(
      and(
        eq(serviceCategories.workspaceId, workspaceId),
        eq(serviceCategories.id, categoryId),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

async function assertUniqueSlug(workspaceId, slug) {
  const rows = await getDb()
    .select({ id: serviceCategories.id })
    .from(serviceCategories)
    .where(
      and(eq(serviceCategories.workspaceId, workspaceId), eq(serviceCategories.slug, slug)),
    )
    .limit(1);
  return !rows[0];
}

async function assertUniqueServiceSlug(workspaceId, slug) {
  const rows = await getDb()
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.workspaceId, workspaceId), eq(services.slug, slug)))
    .limit(1);
  return !rows[0];
}

export async function createCategory({ workspaceId, userId, data }) {
  const slug = slugify(data.name);
  if (!slug) {
    throw new ApiError(422, 'INVALID_NAME', 'Enter a category name.', {
      name: 'Enter a category name.',
    });
  }
  if (!(await assertUniqueSlug(workspaceId, slug))) {
    throw new ApiError(
      409,
      'CATEGORY_EXISTS',
      'A service category with this name already exists.',
      { name: 'Use a different category name.' },
    );
  }

  const rows = await getDb()
    .insert(serviceCategories)
    .values({
      workspaceId,
      name: data.name,
      slug,
      description: data.description ?? null,
      sortOrder: data.sortOrder ?? 0,
      status: data.status || 'active',
      createdByUserId: userId,
    })
    .returning(CATEGORY_SELECT);

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'service_category.create',
    resourceType: 'service_category',
    resourceId: rows[0].id,
    metadata: { name: rows[0].name },
  });

  return rows[0];
}

export async function updateCategory({ workspaceId, userId, categoryId, data }) {
  const current = await findCategory(workspaceId, categoryId);
  if (!current) return null;

  const changes = {};
  for (const key of ['name', 'description', 'sortOrder', 'status']) {
    if (data[key] !== undefined) changes[key] = data[key];
  }
  if (Object.keys(changes).length === 0) return current;

  if (changes.name && changes.name !== current.name) {
    const slug = slugify(changes.name);
    if (!slug) {
      throw new ApiError(422, 'INVALID_NAME', 'Enter a category name.', {
        name: 'Enter a category name.',
      });
    }
    if (!(await assertUniqueSlug(workspaceId, slug))) {
      throw new ApiError(
        409,
        'CATEGORY_EXISTS',
        'A service category with this name already exists.',
        { name: 'Use a different category name.' },
      );
    }
    changes.slug = slug;
  }

  const rows = await getDb()
    .update(serviceCategories)
    .set({ ...changes, updatedAt: new Date() })
    .where(
      and(
        eq(serviceCategories.workspaceId, workspaceId),
        eq(serviceCategories.id, categoryId),
      ),
    )
    .returning(CATEGORY_SELECT);

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'service_category.update',
    resourceType: 'service_category',
    resourceId: categoryId,
    metadata: { fields: Object.keys(changes) },
  });

  return rows[0] || null;
}

export async function createService({ workspaceId, userId, data }) {
  const category = await findCategory(workspaceId, data.categoryId);
  if (!category) {
    throw new ApiError(
      422,
      'CATEGORY_NOT_FOUND',
      'Choose a service category from this workspace.',
      { categoryId: 'Choose a valid category.' },
    );
  }

  const slug = slugify(data.name);
  if (!slug) {
    throw new ApiError(422, 'INVALID_NAME', 'Enter a service name.', {
      name: 'Enter a service name.',
    });
  }
  if (!(await assertUniqueServiceSlug(workspaceId, slug))) {
    throw new ApiError(
      409,
      'SERVICE_EXISTS',
      'A service with this name already exists in this workspace.',
      { name: 'Use a different service name.' },
    );
  }

  if (data.regulated && !data.reviewProfession) {
    throw new ApiError(
      422,
      'REVIEWER_REQUIRED',
      'Identify the qualified professional responsible for this regulated service.',
      { reviewProfession: 'Identify the responsible professional.' },
    );
  }

  const rows = await getDb()
    .insert(services)
    .values({
      workspaceId,
      categoryId: category.id,
      name: data.name,
      slug,
      description: data.description ?? null,
      billingType: data.billingType || 'custom',
      regulated: Boolean(data.regulated),
      reviewProfession: data.reviewProfession ?? null,
      reviewNotes: data.reviewNotes ?? null,
      status: data.status || 'active',
      sortOrder: data.sortOrder ?? 0,
      createdByUserId: userId,
    })
    .returning({ id: services.id });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'service.create',
    resourceType: 'service',
    resourceId: rows[0].id,
    metadata: { name: data.name, categoryId: category.id, regulated: Boolean(data.regulated) },
  });

  return findService(workspaceId, rows[0].id);
}

export async function updateService({ workspaceId, userId, serviceId, data }) {
  const current = await findService(workspaceId, serviceId);
  if (!current) return null;

  const changes = {};
  for (const key of [
    'name',
    'description',
    'billingType',
    'regulated',
    'reviewProfession',
    'reviewNotes',
    'status',
    'sortOrder',
  ]) {
    if (data[key] !== undefined) changes[key] = data[key];
  }

  if (data.categoryId !== undefined) {
    const category = await findCategory(workspaceId, data.categoryId);
    if (!category) {
      throw new ApiError(
        422,
        'CATEGORY_NOT_FOUND',
        'Choose a service category from this workspace.',
        { categoryId: 'Choose a valid category.' },
      );
    }
    changes.categoryId = category.id;
  }

  if (Object.keys(changes).length === 0) return current;

  if (changes.name && changes.name !== current.name) {
    const slug = slugify(changes.name);
    if (!slug) {
      throw new ApiError(422, 'INVALID_NAME', 'Enter a service name.', {
        name: 'Enter a service name.',
      });
    }
    if (!(await assertUniqueServiceSlug(workspaceId, slug))) {
      throw new ApiError(
        409,
        'SERVICE_EXISTS',
        'A service with this name already exists in this workspace.',
        { name: 'Use a different service name.' },
      );
    }
    changes.slug = slug;
  }

  const regulated = changes.regulated ?? current.regulated;
  const reviewProfession =
    changes.reviewProfession !== undefined
      ? changes.reviewProfession
      : current.reviewProfession;
  if (regulated && !reviewProfession) {
    throw new ApiError(
      422,
      'REVIEWER_REQUIRED',
      'Identify the qualified professional responsible for this regulated service.',
      { reviewProfession: 'Identify the responsible professional.' },
    );
  }

  await getDb()
    .update(services)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(services.workspaceId, workspaceId), eq(services.id, serviceId)));

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'service.update',
    resourceType: 'service',
    resourceId: serviceId,
    metadata: { fields: Object.keys(changes) },
  });

  return findService(workspaceId, serviceId);
}

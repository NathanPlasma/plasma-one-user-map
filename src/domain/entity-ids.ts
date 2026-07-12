export const CATEGORY_HEADER_NODE_ID_PREFIX = 'category-header:'

export function categoryHeaderNodeId(categoryId: string): string {
  return `${CATEGORY_HEADER_NODE_ID_PREFIX}${categoryId}`
}

export function isReservedWorkspaceEntityId(id: string): boolean {
  return id.startsWith(CATEGORY_HEADER_NODE_ID_PREFIX)
}

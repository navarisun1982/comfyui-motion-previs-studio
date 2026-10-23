/**
 * 3Dviz Pro Max Catalog Metadata & Knowledge Index Interface.
 * Direct bridge to the 440 Knowledge Records, 223 Recipes, 24 Directions, and 22 Blueprints.
 */

import catalogSummary from './catalog-summary.json';
import directions from './directions.json';
import manifest from './manifest.json';

export interface CatalogSummaryType {
  schema_version: number;
  version: string;
  catalog_hash: string;
  content_catalog_hash: string;
  layout_hash: string;
  hash_scope: string;
  recipes: number;
  knowledge: number;
  knowledge_by_kind: Record<string, number>;
  planned_directions: number;
  recipes_by_direction: Record<string, number>;
  status_counts: Record<string, number>;
}

export interface DirectionItem {
  id: string;
  summary: string;
}

export const CATALOG_SUMMARY: CatalogSummaryType = catalogSummary as CatalogSummaryType;
export const CATALOG_DIRECTIONS: DirectionItem[] = directions as DirectionItem[];
export const CATALOG_MANIFEST = manifest;

/**
 * Quick query helper to inspect knowledge record statistics by kind
 */
export function getKnowledgeRecordCountByKind(kind: string): number {
  return CATALOG_SUMMARY.knowledge_by_kind[kind] || 0;
}

/**
 * Quick query helper to get total recipe count by direction
 */
export function getRecipeCountByDirection(directionId: string): number {
  return CATALOG_SUMMARY.recipes_by_direction[directionId] || 0;
}

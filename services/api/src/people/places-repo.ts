import type { Insertable, Kysely, Selectable } from 'kysely';
import type { DB } from '../db/generated/db';

type Db = Kysely<DB>;
export type PlaceRow = Selectable<DB['places']>;

export function getPlaceByNormalizedName(
  db: Db,
  normalizedName: string,
  placeType: PlaceRow['place_type'] = 'settlement',
): Promise<PlaceRow | undefined> {
  return db
    .selectFrom('places')
    .selectAll()
    .where('normalized_name', '=', normalizedName)
    .where('place_type', '=', placeType)
    .executeTakeFirst();
}

/**
 * Find-or-create keyed on the NULLS NOT DISTINCT unique index
 * (normalized_name, place_type, parent_place_id) — concurrent callers
 * converge on a single row, never a duplicate.
 */
export async function getOrCreatePlace(
  db: Db,
  values: Insertable<DB['places']>,
): Promise<PlaceRow> {
  const inserted = await db
    .insertInto('places')
    .values(values)
    .onConflict((oc) =>
      oc.columns(['normalized_name', 'place_type', 'parent_place_id']).doNothing(),
    )
    .returningAll()
    .executeTakeFirst();
  if (inserted) return inserted;

  let query = db
    .selectFrom('places')
    .selectAll()
    .where('normalized_name', '=', values.normalized_name)
    .where('place_type', '=', (values.place_type ?? 'settlement') as PlaceRow['place_type']);
  query =
    values.parent_place_id == null
      ? query.where('parent_place_id', 'is', null)
      : query.where('parent_place_id', '=', values.parent_place_id);
  return query.executeTakeFirstOrThrow();
}

ALTER TABLE "stores" ADD COLUMN "store_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stores_store_code_unique_idx" ON "stores" USING btree ("store_code");--> statement-breakpoint
-- Post-v1 product feedback: backfill every pre-existing store with a 3-character code
-- (the new ticket-number prefix, replacing the old flat "SVC") derived from its own
-- name, since there's no other source for this value on rows that predate the field.
-- Base candidate = the name's first 3 letters, uppercased (punctuation/digits/spaces
-- stripped first), padded with "X" if the name has fewer than 3 letters at all. Where
-- two or more existing stores would land on the same base (this app's dev/test data has
-- plenty of near-identical seeded names), every store after the first in creation order
-- gets its row_number appended instead — still unique, just no longer exactly 3
-- characters for those disambiguated rows; new stores created going forward always get
-- an explicit, exactly-3-character code entered at creation (app/api/admin/stores/route.ts),
-- so this longer-than-3 shape is only ever seen on legacy backfilled duplicates.
WITH computed AS (
  SELECT
    id,
    CASE
      WHEN length(upper(regexp_replace(name, '[^A-Za-z]', '', 'g'))) < 3
        THEN rpad(upper(regexp_replace(name, '[^A-Za-z]', '', 'g')), 3, 'X')
      ELSE substring(upper(regexp_replace(name, '[^A-Za-z]', '', 'g')) FROM 1 FOR 3)
    END AS base,
    row_number() OVER (
      PARTITION BY
        CASE
          WHEN length(upper(regexp_replace(name, '[^A-Za-z]', '', 'g'))) < 3
            THEN rpad(upper(regexp_replace(name, '[^A-Za-z]', '', 'g')), 3, 'X')
          ELSE substring(upper(regexp_replace(name, '[^A-Za-z]', '', 'g')) FROM 1 FOR 3)
        END
      ORDER BY created_at
    ) AS rn
  FROM "stores"
)
UPDATE "stores" s
SET store_code = CASE WHEN c.rn = 1 THEN c.base ELSE c.base || c.rn::text END
FROM computed c
WHERE c.id = s.id;--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "store_code" SET NOT NULL;
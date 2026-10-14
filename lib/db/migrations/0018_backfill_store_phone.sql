-- Gives every store created before the mandatory Phone number (0017) a placeholder: a
-- random Indian mobile number, formatted "+91 9XXXX XXXXX" (first digit 6-9, as Indian
-- mobiles are). Stores that already have a phone are untouched. These are NOT the stores'
-- real numbers — replace each one from the Stores page before customers see it on
-- invoices and messages.
UPDATE "stores"
SET "phone" = '+91 ' || n.first5 || ' ' || n.last5
FROM (
  SELECT
    "id",
    (6 + floor(random() * 4))::int::text || lpad(floor(random() * 10000)::int::text, 4, '0') AS first5,
    lpad(floor(random() * 100000)::int::text, 5, '0') AS last5
  FROM "stores"
  WHERE "phone" IS NULL OR btrim("phone") = ''
) AS n
WHERE "stores"."id" = n."id";

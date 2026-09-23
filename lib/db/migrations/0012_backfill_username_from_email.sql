-- Post-002 product feedback: every existing account that predates the optional
-- username field (or was created without one) defaults to its own email as username,
-- so login-by-username works immediately without a Super Admin having to edit each
-- account by hand. Lower-cased to match how both email and username are normalized at
-- write time (app/api/auth/login/route.ts, app/api/auth/users/route.ts) — login itself
-- lower-cases the identifier it's given before comparing, so a stored value that wasn't
-- lower-cased would silently never match.
UPDATE "users"
SET "username" = lower("email")
WHERE "username" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" u2 WHERE u2."username" = lower("users"."email")
  );

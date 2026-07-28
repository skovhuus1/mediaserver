UPDATE "plan_versions" AS pv
SET
  "allow_video_transcode" = true,
  "snapshot" = jsonb_set(pv."snapshot", '{allowVideoTranscode}', 'true'::jsonb, true)
FROM "plans" AS p
WHERE p."id" = pv."plan_id"
  AND p."internal_code" = 'administrator';

UPDATE "plan_entitlements" AS pe
SET "snapshot" = jsonb_set(pe."snapshot", '{allowVideoTranscode}', 'true'::jsonb, true)
FROM "plan_versions" AS pv
JOIN "plans" AS p ON p."id" = pv."plan_id"
WHERE pe."plan_version_id" = pv."id"
  AND p."internal_code" = 'administrator';

UPDATE "subscription_snapshots" AS ss
SET "snapshot" = jsonb_set(ss."snapshot", '{entitlements,allowVideoTranscode}', 'true'::jsonb, true)
FROM "subscriptions" AS s
JOIN "plan_versions" AS pv ON pv."id" = s."plan_version_id"
JOIN "plans" AS p ON p."id" = pv."plan_id"
WHERE ss."subscription_id" = s."id"
  AND p."internal_code" = 'administrator';

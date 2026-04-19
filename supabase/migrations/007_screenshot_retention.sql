-- 007_screenshot_retention.sql
--
-- Screenshots are only needed while admins are reviewing. After approve/reject
-- they should age out of storage to save quota. We drop the NOT NULL so the
-- cleanup job can null out the path when the storage object is deleted — the
-- row itself stays for history.

ALTER TABLE regear_requests
  ALTER COLUMN screenshot_path DROP NOT NULL;

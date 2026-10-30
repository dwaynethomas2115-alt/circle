-- This is a bucket ceiling, not an upgrade to the project's storage plan.
-- The Storage service also applies the project's global/provider upload limit.
-- On a plan capped at 50 MB, larger files still require a different plan/provider.
update storage.buckets
set file_size_limit = 262144000
where id = 'circle-media';

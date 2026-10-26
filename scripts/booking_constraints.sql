
-- 1. Enable GiST support for equality comparisons on resource IDs.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Prevent overlapping active bookings for the same resource.
ALTER TABLE bookings
ADD CONSTRAINT no_overlapping_active_bookings
EXCLUDE USING GIST (
    resource_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
)
WHERE (status IN ('pending', 'confirmed'));

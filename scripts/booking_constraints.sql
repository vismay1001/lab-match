-- ==========================================================
-- LabMatch Booking Constraints
-- ==========================================================

-- 1. Enable GiST support for equality comparisons on resource IDs and user IDs.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Prevent overlapping active bookings for the same resource.
ALTER TABLE bookings
ADD CONSTRAINT no_overlapping_active_bookings
EXCLUDE USING GIST (
    resource_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
)
WHERE (status IN ('pending', 'confirmed'));

-- 3. Prevent a user from having overlapping active bookings.
ALTER TABLE bookings
ADD CONSTRAINT no_overlapping_user_bookings
EXCLUDE USING GIST (
    user_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
)
WHERE (status IN ('pending', 'confirmed'));

-- 4. Ensure each resource has at most one active (pending/confirmed) booking.
--    This enforces: "One resource can belong to only ONE person at a time."
CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking_per_resource
ON bookings (resource_id)
WHERE status IN ('pending', 'confirmed');
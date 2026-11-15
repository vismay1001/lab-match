-- ========================================
-- LabMatch Database Schema
-- ========================================

-- 1. Ensure btree_gist extension is available for EXCLUDE constraints.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Create the users table.
CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(20) NOT NULL DEFAULT 'student'
        CHECK (role IN ('student', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create the resources table.
CREATE TABLE IF NOT EXISTS resources (
    resource_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create the bookings table.
CREATE TABLE IF NOT EXISTS bookings (
    booking_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    resource_id BIGINT NOT NULL REFERENCES resources(resource_id),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_booking_time CHECK (end_time > start_time)
);

-- 5. Migrate existing data: remove duplicate active bookings per resource,
--    keeping the most recent booking (by created_at) for each resource.
--    This ensures the subsequent unique index can be created safely.
DO $$
DECLARE
    dup_count INTEGER;
BEGIN
    -- Delete duplicate active bookings per resource, keeping the one with
    -- the latest created_at per resource_id.
    DELETE FROM bookings
    WHERE booking_id NOT IN (
        SELECT MAX(booking_id)
        FROM bookings
        WHERE status IN ('pending', 'confirmed')
        GROUP BY resource_id
    )
    AND status IN ('pending', 'confirmed');

    GET DIAGNOSTIC dup_count = ROW_COUNT;
    RAISE NOTICE 'Removed % duplicate active bookings during migration.', dup_count;
END $$;

-- 6. Prevent overlapping active bookings for the same resource.
--    Uses EXCLUDE GIST to prevent time-range overlaps for pending/confirmed bookings.
ALTER TABLE bookings
ADD CONSTRAINT no_overlapping_active_bookings
EXCLUDE USING GIST (
    resource_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
)
WHERE (status IN ('pending', 'confirmed'));

-- 7. Prevent a user from having overlapping active bookings.
ALTER TABLE bookings
ADD CONSTRAINT no_overlapping_user_bookings
EXCLUDE USING GIST (
    user_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
)
WHERE (status IN ('pending', 'confirmed'));

-- 8. Ensure each resource has at most one active (pending/confirmed) booking.
--    This enforces the business rule: "One resource can belong to only ONE person at a time."
--    If a resource already has an active booking, any new attempt to book it
--    will be rejected at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking_per_resource
ON bookings (resource_id)
WHERE status IN ('pending', 'confirmed');

-- 9. Indexes for performance (created if not already present).
CREATE INDEX IF NOT EXISTS idx_bookings_resource_time
    ON bookings (resource_id, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_bookings_user
    ON bookings (user_id);
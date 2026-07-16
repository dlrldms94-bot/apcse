const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL 환경변수가 필요합니다.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS registrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type TEXT NOT NULL CHECK (type IN ('DOMESTIC', 'FOREIGNER')),
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      affiliation TEXT NOT NULL,
      contact TEXT NOT NULL,
      privacy_consent BOOLEAN NOT NULL DEFAULT FALSE,
      password_hash TEXT NOT NULL,
      nationality TEXT,
      passport_number TEXT,
      arrival_date TEXT,
      departure_date TEXT,
      dietary TEXT,
      accommodation BOOLEAN DEFAULT FALSE,
      accommodation_days INTEGER,
      vehicle_usage BOOLEAN DEFAULT FALSE,
      special_requests TEXT,
      payment_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED'
        CHECK (payment_status IN ('NOT_REQUIRED', 'PENDING', 'PAID', 'FAILED')),
      paypal_order_id TEXT,
      paypal_capture_id TEXT,
      amount NUMERIC(10, 2),
      currency TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id BIGSERIAL PRIMARY KEY,
      event TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('REGISTRATION', 'PAYMENT', 'MYPAGE')),
      status TEXT NOT NULL CHECK (status IN ('ATTEMPT', 'SUCCESS', 'FAILURE')),
      registration_type TEXT,
      registration_id UUID REFERENCES registrations(id) ON DELETE SET NULL,
      applicant_name TEXT,
      contact TEXT,
      error_message TEXT,
      status_code INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON activity_logs (created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS activity_logs_status_idx ON activity_logs (status)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS registrations_name_idx ON registrations (name)
  `);

  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS email TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS affiliation_type TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS affiliation_type_other TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS attendance_dates TEXT[]
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS teacher_document_needed BOOLEAN
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS given_name TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS family_name TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS preferred_name TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS whatsapp_id TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS visa_support_needed BOOLEAN
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS arrival_datetime TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS departure_datetime TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS arrival_flight_number TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS departure_flight_number TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS transportation_options TEXT[]
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS accommodation_type TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS check_in_date TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS check_out_date TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS dietary_preference TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS dietary_details TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS hotel_form_filename TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS hotel_form_mimetype TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS hotel_form_data BYTEA
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS passport_copy_filename TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS passport_copy_mimetype TEXT
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS passport_copy_data BYTEA
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS document_requests TEXT[]
  `);
  await pool.query(`
    ALTER TABLE registrations ADD COLUMN IF NOT EXISTS document_request_other TEXT
  `);
}

module.exports = { pool, initDatabase };

-- schema.sql — reference DDL for the patients table (already created in Supabase)

CREATE TYPE sex_enum AS ENUM ('Male', 'Female', 'Other', 'Decline to Answer');

CREATE TABLE patients (
  patient_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name          text NOT NULL,
  last_name           text NOT NULL,
  date_of_birth       date NOT NULL,
  sex                 sex_enum NOT NULL,
  phone_number        char(10) NOT NULL,
  email               text,
  address_line_1      text NOT NULL,
  address_line_2      text,
  city                text NOT NULL,
  state               char(2) NOT NULL,
  zip_code            text NOT NULL,
  insurance_provider  text,
  insurance_member_id text,
  preferred_language  text DEFAULT 'English',
  emergency_contact_name  text,
  emergency_contact_phone char(10),
  call_transcript     text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  deleted_at          timestamptz
);

-- Only one active (non-deleted) patient per phone number
CREATE UNIQUE INDEX idx_patients_phone_active
  ON patients (phone_number)
  WHERE deleted_at IS NULL;

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

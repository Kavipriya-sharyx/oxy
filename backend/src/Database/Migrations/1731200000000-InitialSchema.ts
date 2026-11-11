import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Full Plan section 6 + 6.1: PostgreSQL 16 schema (PostGIS + pgcrypto).
 * Tables: ops_users, customers, consents, conversations, messages, centres, needs,
 * eligibility, booking_requests, plan_catalog, activations, trigger_events,
 * follow_ups, tasks, audit_log.
 * Rules enforced here in the database: one open conversation, pending_confirmation
 * bookings, booking date window, one product per customer, unique wa_message_id.
 */
export class InitialSchema1731200000000 implements MigrationInterface {
  name = "InitialSchema1731200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
-- ============ Extensions ============
CREATE EXTENSION IF NOT EXISTS postgis;      -- centre radius search
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- encryption helpers

-- ============ Enums ============
CREATE TYPE product_type       AS ENUM ('oxxy', 'cut_medi_bills');
CREATE TYPE oxxy_plan          AS ENUM ('everyday', 'vital', 'thrive', 'infinity');
CREATE TYPE billing_cycle      AS ENUM ('monthly', 'yearly');
CREATE TYPE conversation_state AS ENUM (
  'new', 'intent_menu', 'need_discovery', 'oxxy_explain', 'service_or_escalation',
  'follow_up_time', 'discovery', 'routing', 'plan_fit', 'cut_medi_bills_fit',
  'centre_search', 'booking_capture', 'booking_recorded', 'activation',
  'awaiting_payment', 'follow_up', 'escalated', 'pause', 'closed', 'opted_out'
);
CREATE TYPE booking_status     AS ENUM ('pending_confirmation', 'confirmed', 'changed', 'not_possible', 'cancelled');
CREATE TYPE payment_status     AS ENUM ('link_sent', 'reported_done', 'verified', 'failed', 'cancelled');
CREATE TYPE activation_status  AS ENUM ('pending', 'active', 'cancelled', 'expired');
CREATE TYPE message_direction  AS ENUM ('inbound', 'outbound');
CREATE TYPE message_sender     AS ENUM ('customer', 'bot', 'human_agent', 'system');
CREATE TYPE task_type          AS ENUM ('confirm_booking', 'verify_activation', 'callback', 'escalation',
                                        'activation_follow_up', 'privacy_request', 'safety_event', 'directory_verification');
CREATE TYPE task_status        AS ENUM ('open', 'in_progress', 'done', 'cancelled');
CREATE TYPE task_priority      AS ENUM ('urgent', 'high', 'normal', 'low');
CREATE TYPE ops_role           AS ENUM ('agent', 'supervisor', 'admin');

-- ============ Console users ============
CREATE TABLE ops_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  role          ops_role NOT NULL DEFAULT 'agent',
  password_hash text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============ Customers and consent ============
CREATE TABLE customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_number      text NOT NULL UNIQUE,                      -- E.164, e.g. +9198xxxxxxxx
  first_name     text,
  language       text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi', 'hinglish')),
  timezone       text NOT NULL DEFAULT 'Asia/Kolkata',
  age            smallint CHECK (age BETWEEN 0 AND 130),
  active_product product_type,                              -- set only after verified activation
  active_plan    oxxy_plan,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (active_plan IS NULL OR active_product = 'oxxy')
);

CREATE TABLE consents (
  customer_id            uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  whatsapp_consent       boolean NOT NULL DEFAULT false,
  whatsapp_consent_at    timestamptz,
  consent_source         text,                              -- lead form, inbound chat, voice AI
  marketing_consent      boolean NOT NULL DEFAULT false,
  health_data_consent    boolean NOT NULL DEFAULT false,
  consent_notice_version text,
  opt_out_at             timestamptz,                       -- set = no automated or marketing sends
  privacy_request_at     timestamptz,
  retention_until        date,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ============ Conversations and messages ============
CREATE TABLE conversations (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id                  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  state                        conversation_state NOT NULL DEFAULT 'new',
  last_question                text,                      -- unfinished question to return to
  selected_product             product_type,
  recommended_plan             oxxy_plan,
  recommendation_reason        text,
  alternate_product_suppressed boolean NOT NULL DEFAULT false,
  value_check_passed           boolean,
  rescue_attempts              smallint NOT NULL DEFAULT 0 CHECK (rescue_attempts BETWEEN 0 AND 2),
  soft_activation_offered      boolean NOT NULL DEFAULT false,  -- only once per journey
  human_takeover_by            uuid REFERENCES ops_users(id),
  last_customer_message_at     timestamptz,               -- drives the 24-hour window
  journey_started_at           timestamptz NOT NULL DEFAULT now(),
  closed_at                    timestamptz,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  CHECK (recommended_plan IS NULL OR selected_product = 'oxxy')
);
CREATE UNIQUE INDEX one_open_conversation ON conversations (customer_id) WHERE closed_at IS NULL;

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction       message_direction NOT NULL,
  sender          message_sender NOT NULL,
  wa_message_id   text UNIQUE,                             -- dedupe of webhook retries
  body            text,
  template_name   text,
  payload         jsonb,                                   -- buttons, list rows, media
  status          text CHECK (status IN ('received', 'sent', 'delivered', 'read', 'failed')),
  error_code      text,
  sent_by         uuid REFERENCES ops_users(id),           -- when a human replied
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_by_conversation ON messages (conversation_id, created_at);

-- ============ Provider directory ============
CREATE TABLE centres (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  branch              text NOT NULL,
  locality            text NOT NULL,
  city                text NOT NULL,
  postcode            text,
  location            geography(Point, 4326) NOT NULL,
  centre_type         text NOT NULL CHECK (centre_type IN ('specialist', 'multispeciality', 'clinic', 'diagnostic')),
  specialisations     text[] NOT NULL DEFAULT '{}',
  is_private          boolean NOT NULL,
  verified            boolean NOT NULL DEFAULT false,
  verification_source text,
  verified_at         timestamptz,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, branch, city)
);
CREATE INDEX centres_location ON centres USING gist (location);
CREATE INDEX centres_specialisations ON centres USING gin (specialisations);

-- ============ Discovery answers and eligibility ============
CREATE TABLE needs (
  conversation_id          uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  beneficiary_relationship text,
  healthcare_need          text,
  specialisation           text,
  need_pattern             text CHECK (need_pattern IN ('ongoing', 'single_expense')),
  city                     text,
  locality                 text,
  postcode                 text,
  travel_radius_km         smallint CHECK (travel_radius_km BETWEEN 1 AND 200),
  service_date             date,
  urgency                  text,
  insurance_status         text,
  expected_bill            numeric(12,2),
  annual_medical_spend     numeric(12,2),
  condition_encrypted      bytea,                          -- voluntary health detail, encrypted
  preferred_centre_id      uuid REFERENCES centres(id),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE eligibility (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  centre_id         uuid NOT NULL REFERENCES centres(id),
  appointment_done  boolean NOT NULL DEFAULT false,       -- independent booking only
  registration_done boolean NOT NULL DEFAULT false,
  treatment_started boolean NOT NULL DEFAULT false,
  bill_status       text NOT NULL DEFAULT 'none' CHECK (bill_status IN ('none', 'generated', 'part_paid', 'paid')),
  eligible          boolean GENERATED ALWAYS AS (
                      NOT appointment_done AND NOT registration_done
                      AND NOT treatment_started AND bill_status = 'none') STORED,
  checked_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, centre_id)
);

-- ============ Booking requests ============
CREATE TABLE booking_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES customers(id),
  conversation_id  uuid NOT NULL REFERENCES conversations(id),
  centre_id        uuid NOT NULL REFERENCES centres(id),
  specialisation   text NOT NULL,
  preferred_date   date NOT NULL,
  preferred_time   text NOT NULL,                          -- time or window, e.g. '10:00-12:00'
  timezone         text NOT NULL DEFAULT 'Asia/Kolkata',
  status           booking_status NOT NULL DEFAULT 'pending_confirmation',
  selected_product product_type,
  confirmed_by     uuid REFERENCES ops_users(id),
  confirmed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'confirmed' OR confirmed_by IS NOT NULL)  -- only a human can confirm
);
CREATE INDEX bookings_open ON booking_requests (status, preferred_date) WHERE status = 'pending_confirmation';

-- Date window: today + 3 days to today + 6 months, in Asia/Kolkata (month-end handled by Postgres)
CREATE FUNCTION check_booking_window() RETURNS trigger AS $$
DECLARE today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NEW.preferred_date < today + 3
     OR NEW.preferred_date > (today + interval '6 months')::date THEN
    RAISE EXCEPTION 'preferred_date % is outside the booking window', NEW.preferred_date;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER booking_window BEFORE INSERT ON booking_requests
  FOR EACH ROW EXECUTE FUNCTION check_booking_window();

-- ============ Plan catalogue and activations ============
CREATE TABLE plan_catalog (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product            product_type NOT NULL,
  plan               oxxy_plan,                            -- NULL for Cut Medi Bills
  billing            billing_cycle NOT NULL,
  price              numeric(10,2) NOT NULL CHECK (price > 0),
  gst_rate           numeric(5,4) NOT NULL,                -- 0.1800 = 18% [CONFIRM]
  auto_renews        boolean NOT NULL,
  renewal_terms      text NOT NULL,
  max_saving_pct     numeric(5,2),                         -- 20, 25, 30, 40; NULL for Cut Medi Bills
  age_limit          smallint,                             -- NULL = no limit
  activation_time    text NOT NULL,                        -- e.g. '5 to 10 working days'
  activation_link    text NOT NULL,
  version            integer NOT NULL,
  valid_from         timestamptz NOT NULL DEFAULT now(),
  valid_to           timestamptz,
  approved_by        uuid REFERENCES ops_users(id),
  second_approver    uuid REFERENCES ops_users(id),        -- two-person rule for price changes
  UNIQUE NULLS NOT DISTINCT (product, plan, billing, version),  -- NULL plan (Cut Medi Bills) counts as equal
  CHECK ((product = 'oxxy') = (plan IS NOT NULL)),
  CHECK (second_approver IS NULL OR second_approver <> approved_by)
);

CREATE TABLE activations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       uuid NOT NULL REFERENCES customers(id),
  conversation_id   uuid REFERENCES conversations(id),
  catalog_id        uuid NOT NULL REFERENCES plan_catalog(id), -- exact price and link version sent
  product           product_type NOT NULL,
  plan              oxxy_plan,
  billing           billing_cycle NOT NULL,
  link_sent_at      timestamptz NOT NULL DEFAULT now(),
  payment_status    payment_status NOT NULL DEFAULT 'link_sent',
  payment_reference text,
  activation_status activation_status NOT NULL DEFAULT 'pending',
  activated_at      timestamptz,
  cancelled_at      timestamptz,
  verified_by       uuid REFERENCES ops_users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
-- One product per customer: at most one pending or active activation
CREATE UNIQUE INDEX one_product_per_customer ON activations (customer_id)
  WHERE activation_status IN ('pending', 'active');

-- ============ Triggers, follow-ups, tasks, audit ============
CREATE TABLE trigger_events (
  id                  bigserial PRIMARY KEY,
  conversation_id     uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  trigger_id          char(1) NOT NULL CHECK (trigger_id BETWEEN 'A' AND 'R'),
  trigger_reason      text NOT NULL,
  conversation_source text NOT NULL CHECK (conversation_source IN ('voice_ai', 'whatsapp_inbound', 'whatsapp_outbound', 'human_agent')),
  selected_product    product_type,
  asset_ids           text[] NOT NULL DEFAULT '{}',
  cta                 text,
  customer_response   text CHECK (customer_response IN ('clicked', 'replied', 'ignored', 'declined', 'opted_out', 'escalated')),
  next_state          conversation_state,
  suppression_reason  text CHECK (suppression_reason IN ('opt_out', 'active_complaint', 'active_product', 'emergency', 'duplicate', 'frequency_cap')),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trigger_events_dedupe ON trigger_events (conversation_id, trigger_id);

CREATE TABLE follow_ups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('agreed_follow_up', 'rescue', 'trigger_q', 'booking_update')),
  scheduled_for   timestamptz NOT NULL,
  template_name   text,
  status          text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'cancelled', 'skipped')),
  skip_reason     text,                                    -- opt_out, quiet_hours, frequency_cap ...
  bullmq_job_id   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX follow_ups_due ON follow_ups (scheduled_for) WHERE status = 'scheduled';

CREATE TABLE tasks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type               task_type NOT NULL,
  priority           task_priority NOT NULL DEFAULT 'normal',
  status             task_status NOT NULL DEFAULT 'open',
  customer_id        uuid NOT NULL REFERENCES customers(id),
  conversation_id    uuid REFERENCES conversations(id),
  booking_request_id uuid REFERENCES booking_requests(id),
  activation_id      uuid REFERENCES activations(id),
  reason             text NOT NULL,
  summary            text,                                 -- transcript summary, no health details
  callback_window    tstzrange,
  assignee_id        uuid REFERENCES ops_users(id),
  due_at             timestamptz,
  completed_at       timestamptz,
  outcome            text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_queue ON tasks (type, status, priority, due_at) WHERE status IN ('open', 'in_progress');

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  actor_id   uuid REFERENCES ops_users(id),                 -- NULL = system or bot
  action     text NOT NULL,                                -- e.g. takeover, confirm_booking, price_change
  entity     text NOT NULL,
  entity_id  text NOT NULL,
  details    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Extensions (postgis, pgcrypto) are left installed on purpose.
    await queryRunner.query(`
DROP TABLE IF EXISTS audit_log, tasks, follow_ups, trigger_events, activations, plan_catalog,
  booking_requests, eligibility, needs, centres, messages, conversations, consents, customers, ops_users CASCADE;
DROP FUNCTION IF EXISTS check_booking_window();
DROP TYPE IF EXISTS ops_role, task_priority, task_status, task_type, message_sender, message_direction,
  activation_status, payment_status, booking_status, conversation_state, billing_cycle, oxxy_plan, product_type;
`);
  }
}

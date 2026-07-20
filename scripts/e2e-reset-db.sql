-- Truncates all staging + canonical data between E2E specs (idea.md §23).
-- Schema and the migrations table are preserved; CASCADE clears child tables
-- (submission_people, person_names, union_partners, …).
TRUNCATE TABLE
  submissions,
  invites,
  people,
  places,
  family_unions,
  parent_child_relationships,
  sources,
  evidence,
  match_candidates,
  person_merge_history,
  audit_log,
  service_request_nonces,
  idempotency_keys
RESTART IDENTITY CASCADE;

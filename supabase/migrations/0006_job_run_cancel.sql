-- Soft-cancel for post_listings jobs + GitHub Actions run id linkage.

alter type job_status add value if not exists 'cancelled';

alter table job_runs
  add column if not exists cancel_requested boolean not null default false,
  add column if not exists github_run_id bigint null;

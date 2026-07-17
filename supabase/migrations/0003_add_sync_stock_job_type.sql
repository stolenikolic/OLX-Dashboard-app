-- Dodaj job tip za out-of-stock / unhide worker (PRD §9.1)
alter type job_type add value if not exists 'sync_stock';

-- Allow multi-group tournaments to have independent rounds per group.
-- Each group runs its own round 1, round 2, … so (tournament_id, round_number)
-- is no longer unique by itself.

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS pairing_group_id uuid REFERENCES pairing_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rounds_pairing_group ON rounds (pairing_group_id);

-- Replace the old unique constraint with two partial unique indexes:
--   • single-group tournaments: unique on (tournament_id, round_number) where group IS NULL
--   • multi-group tournaments : unique on (tournament_id, round_number, pairing_group_id)
ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_tournament_id_round_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS rounds_unique_no_group
  ON rounds (tournament_id, round_number)
  WHERE pairing_group_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rounds_unique_with_group
  ON rounds (tournament_id, round_number, pairing_group_id)
  WHERE pairing_group_id IS NOT NULL;

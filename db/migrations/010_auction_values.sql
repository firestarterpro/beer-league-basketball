-- ESPN's projected auction value for each player (for a standard $200 budget).
-- The practice draft scales it to this league's $500 budgets.
BEGIN;
ALTER TABLE players ADD COLUMN auction_value numeric;
COMMIT;

-- Phase A: strategy-driven autoplay columns
ALTER TABLE games ADD COLUMN seed INTEGER;
ALTER TABLE games ADD COLUMN blue_strategy TEXT;  -- JSON Strategy
ALTER TABLE games ADD COLUMN red_strategy TEXT;   -- JSON Strategy
ALTER TABLE games ADD COLUMN blue_readback TEXT;
ALTER TABLE games ADD COLUMN red_readback TEXT;

-- One investment (asset_type + asset_id) may link to at most one goal.
DELETE FROM goal_assets ga
WHERE ga.ctid NOT IN (
    SELECT DISTINCT ON (asset_type, asset_id) ctid
    FROM goal_assets
    ORDER BY asset_type, asset_id, goal_id
);

CREATE UNIQUE INDEX IF NOT EXISTS goal_assets_one_goal_per_asset
    ON goal_assets (asset_type, asset_id);

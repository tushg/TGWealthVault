package services

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/shopspring/decimal"
)

type GoalAsset struct {
	GoalID          uuid.UUID        `json:"goal_id"`
	GoalName        string           `json:"goal_name"`
	AssetType       string           `json:"asset_type"`
	AssetID         uuid.UUID        `json:"asset_id"`
	AssetName       string           `json:"asset_name"`
	AllocatedAmount *decimal.Decimal `json:"allocated_amount,omitempty"`
	AssetValue      *decimal.Decimal `json:"asset_value,omitempty"`
}

func (s *FinanceService) ListGoalAssets(ctx context.Context, goalID *uuid.UUID) ([]GoalAsset, error) {
	q := `
		SELECT ga.goal_id, g.name, ga.asset_type, ga.asset_id, ga.allocated_amount,
		       CASE
		         WHEN ga.asset_type='mf' THEN COALESCE(h.scheme_name,'Mutual Fund')
		         WHEN ga.asset_type='deposit' THEN
		           TRIM(CONCAT(
		             COALESCE(UPPER(d.type), 'DEPOSIT'), ' - ',
		             COALESCE(d.bank_name, 'Bank'),
		             CASE WHEN d.fd_number IS NOT NULL AND d.fd_number <> '' THEN CONCAT(' #', d.fd_number) ELSE '' END
		           ))
		         ELSE ga.asset_type
		       END AS asset_name,
		       CASE
		         WHEN ga.asset_type='mf' THEN COALESCE(h.current_value, h.invested_amount, 0)
		         WHEN ga.asset_type='deposit' THEN COALESCE(d.maturity_amount, d.principal)
		         ELSE NULL
		       END AS asset_value
		FROM goal_assets ga
		JOIN goals g ON g.id = ga.goal_id
		LEFT JOIN mf_holdings h ON ga.asset_type='mf' AND h.id = ga.asset_id
		LEFT JOIN deposits d ON ga.asset_type='deposit' AND d.id = ga.asset_id`
	args := []any{}
	if goalID != nil {
		q += ` WHERE ga.goal_id=$1`
		args = append(args, *goalID)
	}
	q += ` ORDER BY g.name, asset_name`

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []GoalAsset
	for rows.Next() {
		var a GoalAsset
		if err := rows.Scan(&a.GoalID, &a.GoalName, &a.AssetType, &a.AssetID, &a.AllocatedAmount, &a.AssetName, &a.AssetValue); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	if out == nil {
		out = []GoalAsset{}
	}
	return out, rows.Err()
}

func (s *FinanceService) LinkGoalAsset(ctx context.Context, goalID uuid.UUID, assetType string, assetID uuid.UUID, allocated *decimal.Decimal) (*GoalAsset, error) {
	if assetType != "mf" && assetType != "deposit" && assetType != "policy" && assetType != "cash" {
		return nil, fmt.Errorf("invalid asset_type")
	}
	var otherGoalName string
	err := s.pool.QueryRow(ctx, `
		SELECT g.name FROM goal_assets ga
		JOIN goals g ON g.id = ga.goal_id
		WHERE ga.asset_type = $1 AND ga.asset_id = $2 AND ga.goal_id <> $3
	`, assetType, assetID, goalID).Scan(&otherGoalName)
	if err == nil {
		return nil, fmt.Errorf("this investment is already linked to goal %q", otherGoalName)
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO goal_assets (goal_id, asset_type, asset_id, allocated_amount)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (goal_id, asset_type, asset_id)
		DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount
	`, goalID, assetType, assetID, allocated)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, fmt.Errorf("this investment is already linked to another goal")
		}
		return nil, err
	}
	_ = s.refreshGoalFunding(ctx, goalID)
	items, err := s.ListGoalAssets(ctx, &goalID)
	if err != nil {
		return nil, err
	}
	for i := range items {
		if items[i].AssetID == assetID && items[i].AssetType == assetType {
			return &items[i], nil
		}
	}
	return &GoalAsset{GoalID: goalID, AssetType: assetType, AssetID: assetID, AllocatedAmount: allocated}, nil
}

func (s *FinanceService) UnlinkGoalAsset(ctx context.Context, goalID uuid.UUID, assetType string, assetID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM goal_assets WHERE goal_id=$1 AND asset_type=$2 AND asset_id=$3
	`, goalID, assetType, assetID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("link not found")
	}
	_ = s.refreshGoalFunding(ctx, goalID)
	return nil
}

func (s *FinanceService) refreshGoalFunding(ctx context.Context, goalID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE goals g SET
			current_amount = COALESCE((
				SELECT SUM(
					COALESCE(ga.allocated_amount,
						CASE
							WHEN ga.asset_type='mf' THEN COALESCE(h.current_value, h.invested_amount, 0)
							WHEN ga.asset_type='deposit' THEN COALESCE(d.maturity_amount, d.principal)
							ELSE 0
						END)
				)
				FROM goal_assets ga
				LEFT JOIN mf_holdings h ON ga.asset_type='mf' AND h.id = ga.asset_id
				LEFT JOIN deposits d ON ga.asset_type='deposit' AND d.id = ga.asset_id
				WHERE ga.goal_id = g.id
			), 0),
			updated_at = NOW()
		WHERE g.id = $1
	`, goalID)
	return err
}

func (s *FinanceService) ListMFGoalLinks(ctx context.Context) (map[string][]GoalAsset, error) {
	items, err := s.ListGoalAssets(ctx, nil)
	if err != nil {
		return nil, err
	}
	out := map[string][]GoalAsset{}
	for _, a := range items {
		if a.AssetType != "mf" {
			continue
		}
		k := a.AssetID.String()
		out[k] = append(out[k], a)
	}
	return out, nil
}

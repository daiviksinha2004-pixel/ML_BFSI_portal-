from sqlalchemy.orm import Session
from sqlalchemy import func, case, extract, Date
from datetime import date
from typing import Optional, Literal
from app.models.insurance import LifeCampaignRecord

def calculate_life_kpis(db: Session, dataset_month: Optional[date], tenant_id):
    """Calculates all KPIs and Chart data for the Life Insurance Dashboard.
    Optimized to use a single aggregated query instead of N+1 queries."""
    
    # Single aggregated query for KPIs
    aggregated = db.query(
        func.count().label('total_policies'),
        func.sum(LifeCampaignRecord.outstanding_premium).label('total_premium'),
    ).filter(LifeCampaignRecord.tenant_id == tenant_id)
    
    if dataset_month:
        aggregated = aggregated.filter(LifeCampaignRecord.dataset_month == dataset_month)
    
    kpi_result = aggregated.first()
    total_policies = kpi_result.total_policies or 0
    total_premium = kpi_result.total_premium or 0.0
    
    # Separate query for propensity distribution (GROUP BY cannot be combined with simple aggregates)
    prop_query = db.query(
        LifeCampaignRecord.propensity,
        func.count(LifeCampaignRecord.id).label('count')
    ).filter(LifeCampaignRecord.tenant_id == tenant_id)
    
    if dataset_month:
        prop_query = prop_query.filter(LifeCampaignRecord.dataset_month == dataset_month)
    
    prop_query_result = prop_query.group_by(LifeCampaignRecord.propensity).all()

    return {
        "kpis": {
            "total_policies": total_policies,
            "total_outstanding_premium": round(total_premium, 2)
        },
        "charts": {
            "propensity_distribution": [{"name": r[0] or "Unknown", "value": r[1]} for r in prop_query_result]
        }
    }

def calculate_sourcing_channel_performance(
    db: Session, 
    tenant_id, 
    pmt_filter: Optional[Literal["paid", "unpaid", "all"]] = "all",
    dataset_month: Optional[date] = None
):
    """
    Calculates sourcing channel performance by grouping act_premium by channel.
    Returns premium, paid/unpaid breakdown, and policy count per channel.
    Uses SQL CASE expressions for a single efficient query.
    """

    paid_premium_expr = func.sum(
        case(
            (LifeCampaignRecord.pmt_flag.is_(True), LifeCampaignRecord.act_premium),
            else_=0
        )
    )
    unpaid_premium_expr = func.sum(
        case(
            (LifeCampaignRecord.pmt_flag.is_(False), LifeCampaignRecord.act_premium),
            else_=0
        )
    )

    # Base query with tenant filter
    query = db.query(
        LifeCampaignRecord.channel,
        func.sum(LifeCampaignRecord.act_premium).label('total_premium'),
        paid_premium_expr.label('paid_premium'),
        unpaid_premium_expr.label('unpaid_premium'),
        func.count(LifeCampaignRecord.id).label('policy_count'),
    ).filter(
        LifeCampaignRecord.tenant_id == tenant_id,
        LifeCampaignRecord.channel.isnot(None),
        LifeCampaignRecord.channel != "",
    )
    
    # Apply pmt_flag filter (only affects the rows included, not the breakdown)
    if pmt_filter == "paid":
        query = query.filter(LifeCampaignRecord.pmt_flag == True)
    elif pmt_filter == "unpaid":
        query = query.filter(LifeCampaignRecord.pmt_flag == False)
    
    # Apply dataset_month filter if provided
    if dataset_month:
        query = query.filter(LifeCampaignRecord.dataset_month == dataset_month)
    
    # Group by channel and order by premium descending
    query = (
        query
        .group_by(LifeCampaignRecord.channel)
        .order_by(func.sum(LifeCampaignRecord.act_premium).desc())
    )
    
    results = query.all()
    
    # Format results for horizontal bar chart
    channel_data = [
        {
            "channel": row.channel,
            "premium": float(row.total_premium or 0),
            "paid_premium": float(row.paid_premium or 0),
            "unpaid_premium": float(row.unpaid_premium or 0),
            "policy_count": int(row.policy_count or 0),
        }
        for row in results
        if row.total_premium and float(row.total_premium) > 0
    ]
    
    return {
        "data": channel_data,
        "filter": {
            "pmt_flag": pmt_filter,
            "dataset_month": dataset_month
        }
    }

def calculate_premium_cash_flow_trajectory(
    db: Session,
    tenant_id,
    granularity: Optional[Literal["month", "quarter"]] = "month",
    dataset_month: Optional[date] = None
):
    """
    Calculates premium cash flow trajectory (Revenue Curve).
    Groups by last paid date (Column 13) and sums premium amount (Column 23 - act_premium).
    Highlights seasonality in premium collections.
    """
    # Extract date from raw_data JSONB for last_paid_date (Column 13)
    # If not available in raw_data, use paid_to_date as fallback
    last_paid_date_expr = func.coalesce(
        func.cast(func.jsonb_extract_path_text(LifeCampaignRecord.raw_data, 'last_paid_date'), Date),
        LifeCampaignRecord.paid_to_date
    )

    # Group by month or quarter based on granularity
    if granularity == "month":
        date_group = func.date_trunc('month', last_paid_date_expr)
        date_label = func.to_char(last_paid_date_expr, 'Mon YYYY')
    else:  # quarter
        date_group = func.date_trunc('quarter', last_paid_date_expr)
        date_label = func.concat(
            'Q', extract('quarter', last_paid_date_expr),
            ' ', extract('year', last_paid_date_expr)
        )

    # Base query with tenant filter
    query = db.query(
        date_group.label('period'),
        date_label.label('period_label'),
        func.sum(LifeCampaignRecord.act_premium).label('total_premium'),
        func.count(LifeCampaignRecord.id).label('policy_count'),
    ).filter(
        LifeCampaignRecord.tenant_id == tenant_id,
        last_paid_date_expr.isnot(None),
    )

    # Apply dataset_month filter if provided
    if dataset_month:
        query = query.filter(LifeCampaignRecord.dataset_month == dataset_month)

    # Group by period and order chronologically
    query = query.group_by(date_group, date_label).order_by(date_group)

    results = query.all()

    # Format results for area chart
    trajectory_data = [
        {
            "period": row.period.strftime('%Y-%m-%d') if row.period else None,
            "period_label": row.period_label or "Unknown",
            "premium": float(row.total_premium or 0),
            "policy_count": int(row.policy_count or 0),
        }
        for row in results
        if row.total_premium and float(row.total_premium) > 0
    ]

    return {
        "data": trajectory_data,
        "filter": {
            "granularity": granularity,
            "dataset_month": dataset_month
        }
    }

def calculate_lapse_hazard_curve_by_payment_frequency(
    db: Session,
    tenant_id,
    pmt_filter: Optional[Literal["paid", "unpaid", "all"]] = "all",
    granularity: Optional[Literal["month", "quarter"]] = "month",
    dataset_month: Optional[date] = None
):
    """
    Calculates lapse hazard curve by payment frequency.
    Plots the rate at which policies fail, split by payment frequency (1=Annual, 3=Quarterly, 6=Half-Yearly, 12=Monthly).
    Uses policy_lapse_date for timeline and counts policies where status = 'Lapse'.
    Can filter by pmt_flag to show paid/unpaid status.
    """
    # Group by month or quarter based on granularity
    if granularity == "month":
        date_group = func.date_trunc('month', LifeCampaignRecord.policy_lapse_date)
        date_label = func.to_char(LifeCampaignRecord.policy_lapse_date, 'Mon YYYY')
    else:  # quarter
        date_group = func.date_trunc('quarter', LifeCampaignRecord.policy_lapse_date)
        date_label = func.concat(
            'Q', extract('quarter', LifeCampaignRecord.policy_lapse_date),
            ' ', extract('year', LifeCampaignRecord.policy_lapse_date)
        )

    # Map payment frequency to readable labels
    # 1 = Annual, 3 = Quarterly, 6 = Half-Yearly, 12 = Monthly
    frequency_label = case(
        (LifeCampaignRecord.policy_paying_frequency == 1, 'Annual'),
        (LifeCampaignRecord.policy_paying_frequency == 3, 'Quarterly'),
        (LifeCampaignRecord.policy_paying_frequency == 6, 'Half-Yearly'),
        (LifeCampaignRecord.policy_paying_frequency == 12, 'Monthly'),
        else_='Unknown'
    )

    # Base query with tenant filter and lapse status
    query = db.query(
        date_group.label('period'),
        date_label.label('period_label'),
        LifeCampaignRecord.policy_paying_frequency.label('frequency_code'),
        frequency_label.label('frequency_label'),
        func.count(LifeCampaignRecord.id).label('lapse_count'),
    ).filter(
        LifeCampaignRecord.tenant_id == tenant_id,
        LifeCampaignRecord.policy_status == 'Lapse',
        LifeCampaignRecord.policy_lapse_date.isnot(None),
        LifeCampaignRecord.policy_paying_frequency.isnot(None),
    )

    # Apply pmt_flag filter
    if pmt_filter == "paid":
        query = query.filter(LifeCampaignRecord.pmt_flag == True)
    elif pmt_filter == "unpaid":
        query = query.filter(LifeCampaignRecord.pmt_flag == False)

    # Apply dataset_month filter if provided
    if dataset_month:
        query = query.filter(LifeCampaignRecord.dataset_month == dataset_month)

    # Group by period and payment frequency, order chronologically
    query = query.group_by(
        date_group,
        date_label,
        LifeCampaignRecord.policy_paying_frequency,
        frequency_label
    ).order_by(date_group, LifeCampaignRecord.policy_paying_frequency)

    results = query.all()

    # Format results for multi-line chart
    # Structure: [{ period: '2026-01-01', period_label: 'Jan 2026', Annual: 150, Quarterly: 80, Half-Yearly: 45, Monthly: 200 }]
    period_map = {}
    for row in results:
        period_key = row.period.strftime('%Y-%m-%d') if row.period else None
        if period_key not in period_map:
            period_map[period_key] = {
                'period': period_key,
                'period_label': row.period_label or 'Unknown',
                'Annual': 0,
                'Quarterly': 0,
                'Half-Yearly': 0,
                'Monthly': 0,
            }
        # Map the lapse count to the appropriate frequency column
        freq_label = row.frequency_label or 'Unknown'
        if freq_label in period_map[period_key]:
            period_map[period_key][freq_label] = int(row.lapse_count or 0)

    # Convert to sorted list
    trajectory_data = sorted(period_map.values(), key=lambda x: x['period'] or '')

    return {
        "data": trajectory_data,
        "filter": {
            "pmt_flag": pmt_filter,
            "granularity": granularity,
            "dataset_month": dataset_month
        }
    }

def calculate_cumulative_value_vs_discontinuation_spike(
    db: Session,
    tenant_id,
    granularity: Optional[Literal["month", "quarter"]] = "month",
    dataset_month: Optional[date] = None
):
    """
    Calculates cumulative premium value vs discontinuation spike.
    Contrasts accumulation of premium wealth against volume of surrendered/discontinued policies.
    Uses policy_issue_date (Vintage) for X-axis, cumulative sum of premium for primary Y-axis,
    and count of status = 'Discontinue' or 'Lapse' for secondary Y-axis.
    """
    # Group by month or quarter based on granularity using policy_issue_date (Vintage - Column 16)
    if granularity == "month":
        date_group = func.date_trunc('month', LifeCampaignRecord.policy_issue_date)
        date_label = func.to_char(LifeCampaignRecord.policy_issue_date, 'Mon YYYY')
    else:  # quarter
        date_group = func.date_trunc('quarter', LifeCampaignRecord.policy_issue_date)
        date_label = func.concat(
            'Q', extract('quarter', LifeCampaignRecord.policy_issue_date),
            ' ', extract('year', LifeCampaignRecord.policy_issue_date)
        )

    # Query for cumulative premium (all policies)
    premium_query = db.query(
        date_group.label('period'),
        date_label.label('period_label'),
        func.sum(LifeCampaignRecord.act_premium).label('premium_sum'),
        func.count(LifeCampaignRecord.id).label('total_policies'),
    ).filter(
        LifeCampaignRecord.tenant_id == tenant_id,
        LifeCampaignRecord.policy_issue_date.isnot(None),
    )

    # Apply dataset_month filter if provided
    if dataset_month:
        premium_query = premium_query.filter(LifeCampaignRecord.dataset_month == dataset_month)

    premium_query = premium_query.group_by(date_group, date_label).order_by(date_group)
    premium_results = premium_query.all()

    # Query for discontinuation count (status = 'Discontinue' or 'Lapse')
    discontinuation_query = db.query(
        date_group.label('period'),
        func.count(LifeCampaignRecord.id).label('discontinuation_count'),
    ).filter(
        LifeCampaignRecord.tenant_id == tenant_id,
        LifeCampaignRecord.policy_issue_date.isnot(None),
        LifeCampaignRecord.policy_status.in_(['Discontinue', 'Lapse']),
    )

    # Apply dataset_month filter if provided
    if dataset_month:
        discontinuation_query = discontinuation_query.filter(LifeCampaignRecord.dataset_month == dataset_month)

    discontinuation_query = discontinuation_query.group_by(date_group).order_by(date_group)
    discontinuation_results = discontinuation_query.all()

    # Create a map for discontinuation counts
    discontinuation_map = {
        row.period.strftime('%Y-%m-%d') if row.period else None: int(row.discontinuation_count or 0)
        for row in discontinuation_results
    }

    # Calculate cumulative premium and merge with discontinuation data
    cumulative_premium = 0
    trajectory_data = []
    for row in premium_results:
        period_key = row.period.strftime('%Y-%m-%d') if row.period else None
        cumulative_premium += float(row.premium_sum or 0)
        
        trajectory_data.append({
            'period': period_key,
            'period_label': row.period_label or 'Unknown',
            'cumulative_premium': cumulative_premium,
            'premium_sum': float(row.premium_sum or 0),
            'discontinuation_count': discontinuation_map.get(period_key, 0),
            'total_policies': int(row.total_policies or 0),
        })

    return {
        "data": trajectory_data,
        "filter": {
            "granularity": granularity,
            "dataset_month": dataset_month
        }
    }
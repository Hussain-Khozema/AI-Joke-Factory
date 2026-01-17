import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../context';
import { Button, Card, RoleLayout, Modal } from '../components';
import { Play, RefreshCw, Settings, Clock, StopCircle, GripVertical, Users, CheckCircle, Maximize2, X, Trash2 } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, Legend, ScatterChart, Scatter, LabelList
} from 'recharts';
import { Role } from '../types';

// Expanded Palette for more teams
const PALETTE = [
    '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', 
    '#6366F1', '#EC4899', '#14B8A6', '#F97316', '#64748B',
    '#0EA5E9', '#A855F7', '#22C55E', '#EAB308', '#F43F5E'
];

const INSTRUCTOR_HIDDEN_CHARTS_SESSION_KEY = 'joke_factory_instructor_hidden_charts_v1';
const CHART_KEYS = ['sales', 'sequence_quality', 'unrated_jokes'] as const;
type ChartKey = typeof CHART_KEYS[number];

const Instructor: React.FC = () => {
  const { 
    config, updateConfig, setGameActive, setRound, resetGame, toggleTeamPopup,
    roster, teamNames, updateTeamName, updateUser,
    calculateValidCustomerOptions, formTeams, resetToLobby
    , instructorStats
    , instructorStatsRound1
    , instructorStatsRound2
    , endRound
    , deleteUser
    , marketItems
  } = useGame();

  const [localBatchSize, setLocalBatchSize] = useState(config.round1BatchSize);
  const [localBudget, setLocalBudget] = useState(config.customerBudget);
  const [localMarketPrice, setLocalMarketPrice] = useState(config.marketPrice);
  const [localCostOfPublishing, setLocalCostOfPublishing] = useState(config.costOfPublishing);
  const [selectedCustomerCount, setSelectedCustomerCount] = useState<number | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showEndRound1Confirm, setShowEndRound1Confirm] = useState(false);

  // Expanded Chart State
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  const [salesTab, setSalesTab] = useState<'R1' | 'R2' | 'BOTH'>('R2');
  const [sequenceTab, setSequenceTab] = useState<'R1' | 'R2' | 'BOTH'>('R2');
  const [unratedTab, setUnratedTab] = useState<'R1' | 'R2' | 'BOTH'>('R2');
  const [salesTeamFilter, setSalesTeamFilter] = useState<string>('ALL');
  const [sequenceTeamFilter, setSequenceTeamFilter] = useState<string>('ALL');
  const [unratedTeamFilter, setUnratedTeamFilter] = useState<string>('ALL');
  const [hoveredSalesSeriesKey, setHoveredSalesSeriesKey] = useState<string | null>(null);
  const [hoveredSequenceSeriesKey, setHoveredSequenceSeriesKey] = useState<string | null>(null);
  const [hoveredUnratedSeriesKey, setHoveredUnratedSeriesKey] = useState<string | null>(null);
  const [leaderboardRoundTab, setLeaderboardRoundTab] = useState<1 | 2>((config.round === 2 ? 2 : 1) as 1 | 2);
  const leaderboardRoundTouchedRef = useRef(false);
  const [scatterXMetric, setScatterXMetric] = useState<string>('total_sales');
  const [scatterYMode, setScatterYMode] = useState<'metric' | 'ratio'>('metric');
  const [scatterYMetric, setScatterYMetric] = useState<string>('profit');
  const [scatterNumerator, setScatterNumerator] = useState<string>('profit');
  const [scatterDenominator, setScatterDenominator] = useState<string>('total_jokes');
  const [scatterRoundMode, setScatterRoundMode] = useState<'R1' | 'R2' | 'BOTH'>('R2');

  // Session-only chart visibility (defaults back on new browser session)
  const [hiddenCharts, setHiddenCharts] = useState<ChartKey[]>([]);
  const [deletingUserIds, setDeletingUserIds] = useState<string[]>([]);
  const [leaderboardSortKey, setLeaderboardSortKey] = useState<
    'team' | 'rated_batches' | 'accepted_jokes' | 'unaccepted_jokes' | 'unsold_jokes' | 'total_jokes' | 'avg_score_overall' | 'total_sales' | 'profit'
  >('profit');
  const [leaderboardSortDir, setLeaderboardSortDir] = useState<'asc' | 'desc'>('desc');
  const [rankUpTeamIds, setRankUpTeamIds] = useState<string[]>([]);
  const prevLeaderboardPosRef = useRef<Record<string, number> | null>(null);
  const rankUpTimersRef = useRef<Record<string, number>>({});
  const [marketSortKey, setMarketSortKey] = useState<'id' | 'sales'>('id');
  const [marketSortDir, setMarketSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedMarketJokeIds, setExpandedMarketJokeIds] = useState<Record<string, boolean>>({});
  const [wasteChartMode, setWasteChartMode] = useState<'count' | 'rate'>('count');
  const [round2ResumeHint, setRound2ResumeHint] = useState(false);
  const [localSalesOverTime, setLocalSalesOverTime] = useState<
    Array<{ event_index: number; timestamp: string; team_id: number; team_name: string; total_sales: number }>
  >([]);
  const lastSalesTotalsRef = useRef<Record<string, number> | null>(null);
  const salesEventIndexRef = useRef<number>(0);

  // Keep local inputs aligned with server-driven config changes (polling/reset).
  useEffect(() => setLocalBatchSize(config.round1BatchSize), [config.round1BatchSize]);
  useEffect(() => setLocalBudget(config.customerBudget), [config.customerBudget]);
  useEffect(() => setLocalMarketPrice(config.marketPrice), [config.marketPrice]);
  useEffect(() => setLocalCostOfPublishing(config.costOfPublishing), [config.costOfPublishing]);

  const handleDeleteUser = async (userId: string, displayName?: string) => {
    const label = displayName ? `${displayName} (${userId})` : `user ${userId}`;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setDeletingUserIds(prev => (prev.includes(userId) ? prev : [...prev, userId]));
    try {
      await deleteUser(userId);
    } finally {
      setDeletingUserIds(prev => prev.filter(id => id !== userId));
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(INSTRUCTOR_HIDDEN_CHARTS_SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const filtered = parsed.filter((k: any): k is ChartKey =>
        (CHART_KEYS as readonly string[]).includes(String(k))
      ) as ChartKey[];
      setHiddenCharts(filtered);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (hiddenCharts.length === 0) {
        window.sessionStorage.removeItem(INSTRUCTOR_HIDDEN_CHARTS_SESSION_KEY);
      } else {
        window.sessionStorage.setItem(INSTRUCTOR_HIDDEN_CHARTS_SESSION_KEY, JSON.stringify(hiddenCharts));
      }
    } catch {
      // ignore
    }
  }, [hiddenCharts]);

  const isChartHidden = (key: ChartKey) => hiddenCharts.includes(key);

  const hideChart = (key: ChartKey) => {
    setHiddenCharts(prev => (prev.includes(key) ? prev : [...prev, key]));
    if (expandedChart === key) setExpandedChart(null);
  };

  const restoreAllCharts = () => setHiddenCharts([]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

// Config edit rules:
// - While a round is active: config is not editable.
// - In round 2: only customer budget + pricing are editable.
  const canEditBatchSize = !config.isActive && config.round === 1;
  const canEditBudget = !config.isActive && (config.round === 1 || config.round === 2);
  const canEditPricing = !config.isActive && (config.round === 1 || config.round === 2);

  const hasPendingConfigChanges =
    (canEditBatchSize && localBatchSize !== config.round1BatchSize) ||
    (canEditBudget && localBudget !== config.customerBudget) ||
    (canEditPricing && (localMarketPrice !== config.marketPrice || localCostOfPublishing !== config.costOfPublishing));

  const handleUpdateSettings = () => {
    const updates: any = {};
    if (canEditBatchSize && localBatchSize !== config.round1BatchSize) updates.round1BatchSize = localBatchSize;
    if (canEditBudget && localBudget !== config.customerBudget) updates.customerBudget = localBudget;
    if (canEditPricing && localMarketPrice !== config.marketPrice) updates.marketPrice = localMarketPrice;
    if (canEditPricing && localCostOfPublishing !== config.costOfPublishing) updates.costOfPublishing = localCostOfPublishing;
    if (Object.keys(updates).length === 0) return;
    updateConfig(updates);
  };

  // --- Lobby Logic ---
  const validCustomerOptions = calculateValidCustomerOptions();
  const connectedPairs = roster.filter(u => u.role !== Role.INSTRUCTOR).length;
  
  const handleFormTeams = () => {
      if (selectedCustomerCount === null) return;
      formTeams(selectedCustomerCount);
  };


  // --- Data Processing ---

  // Keep tab defaults aligned to current round (but only when user hasn't explicitly selected otherwise).
  useEffect(() => {
    const r = (config.round === 2 ? 2 : 1) as 1 | 2;
    setSalesTab(prev => (prev === 'BOTH' ? prev : (r === 1 ? 'R1' : 'R2')));
    setSequenceTab(prev => (prev === 'BOTH' ? prev : (r === 1 ? 'R1' : 'R2')));
    setUnratedTab(prev => (prev === 'BOTH' ? prev : (r === 1 ? 'R1' : 'R2')));
    if (!leaderboardRoundTouchedRef.current) setLeaderboardRoundTab(r);
  }, [config.round]);

  // Clear "resume" hint once Round 2 becomes active or user switches away from Round 2.
  useEffect(() => {
    if (config.isActive || config.round !== 2) setRound2ResumeHint(false);
  }, [config.isActive, config.round]);

  const shouldShowRound2Resume =
    config.round === 2 &&
    !config.isActive &&
    (round2ResumeHint || Boolean(instructorStatsRound2?.round_id));

  const statsR1 = instructorStatsRound1 ?? null;
  const statsR2 = instructorStatsRound2 ?? null;
  const leaderboardStatsSelected = (leaderboardRoundTab === 1 ? statsR1 : statsR2) ?? instructorStats ?? null;

  const mapLeaderboard = (rows: any[]) => {
    return (rows || []).map(row => {
      const teamId = Number(row.team.id);
      const teamName = teamNames[String(teamId)] || row.team.name;
      return {
        team_id: teamId,
        team_name: teamName,
        rated_batches: Number(row.batches_rated ?? 0),
        accepted_jokes: Number(row.accepted_jokes ?? 0),
        unaccepted_jokes: Number(row.unaccepted_jokes ?? 0),
        unsold_jokes: Number(row.unsold_jokes ?? 0),
        total_jokes: Number(row.total_jokes ?? 0),
        avg_score_overall: Number(row.avg_score_overall ?? 0),
        total_sales: Number(row.total_sales ?? 0),
        profit: Number(row.profit ?? 0),
      };
    });
  };

  const leaderboardBase = useMemo(() => {
    return mapLeaderboard(leaderboardStatsSelected?.leaderboard || []);
  }, [leaderboardStatsSelected?.leaderboard, teamNames]);

  const leaderboardBaseR1 = useMemo(() => {
    return mapLeaderboard(statsR1?.leaderboard || []);
  }, [statsR1?.leaderboard, teamNames]);

  const leaderboardBaseR2 = useMemo(() => {
    return mapLeaderboard(statsR2?.leaderboard || []);
  }, [statsR2?.leaderboard, teamNames]);

  // Metrics that must be displayed as integers (joke counts, batches, sales)
  const integerMetricKeys = new Set([
    'total_sales',
    'accepted_jokes',
    'unaccepted_jokes',
    'unsold_jokes',
    'total_jokes',
    'rated_batches',
  ]);

  const scatterBaseMetrics = [
    { key: 'total_sales', label: 'Total Sales' },
    { key: 'accepted_jokes', label: 'Accepted Jokes' },
    { key: 'unaccepted_jokes', label: 'Wasted Jokes' },
    { key: 'unsold_jokes', label: 'Unsold Jokes' },
    { key: 'total_jokes', label: 'Total Jokes' },
    { key: 'rated_batches', label: 'Rated Batches' },
    { key: 'avg_score_overall', label: 'Avg Score' },
    { key: 'profit', label: 'Profit' },
  ];
  const scatterRatioMetrics = [
    { key: 'ratio:waste_rate', label: 'Waste Rate (Wasted / Total)' },
    { key: 'ratio:accept_rate', label: 'Accept Rate (Accepted / Total)' },
    { key: 'ratio:marketing_efficiency', label: 'Mkt Efficiency (Sales / Accepted)' },
    { key: 'ratio:marketing_inefficiency', label: 'Mkt Inefficiency (Unsold / Accepted)' },
  ];
  const scatterMetrics = [...scatterBaseMetrics, ...scatterRatioMetrics];

  const metricLabel = (key: string) =>
    scatterMetrics.find(m => m.key === key)?.label ?? key;

  const metricValue = (row: any, key: string) => {
    if (key.startsWith('ratio:')) {
      const pick = (k: string) => {
        const v = Number(row?.[k] ?? 0);
        return Number.isFinite(v) ? v : 0;
      };
      switch (key) {
        case 'ratio:waste_rate': {
          const den = pick('total_jokes');
          return den === 0 ? 0 : pick('unaccepted_jokes') / den;
        }
        case 'ratio:accept_rate': {
          const den = pick('total_jokes');
          return den === 0 ? 0 : pick('accepted_jokes') / den;
        }
        case 'ratio:marketing_efficiency': {
          const den = pick('accepted_jokes');
          return den === 0 ? 0 : pick('total_sales') / den;
        }
        case 'ratio:marketing_inefficiency': {
          const den = pick('accepted_jokes');
          return den === 0 ? 0 : pick('unsold_jokes') / den;
        }
        default:
          return 0;
      }
    }
    const val = Number(row?.[key] ?? 0);
    return Number.isFinite(val) ? val : 0;
  };

  const isRatioMetricSelected = scatterYMetric.startsWith('ratio:');
  const isRatioYAxis = scatterYMode === 'ratio' || isRatioMetricSelected;
  const yAxisLabel =
    scatterYMode === 'ratio'
      ? `${metricLabel(scatterNumerator)} / ${metricLabel(scatterDenominator)}`
      : metricLabel(scatterYMetric);

  const scatterData = useMemo(() => {
    const buildPoints = (rows: any[], roundLabel: 'R1' | 'R2') =>
      rows.map(row => {
        const xVal = metricValue(row, scatterXMetric);
        const yVal =
          scatterYMode === 'ratio'
            ? (() => {
                const num = metricValue(row, scatterNumerator);
                const den = metricValue(row, scatterDenominator);
                return den === 0 ? 0 : num / den;
              })()
            : metricValue(row, scatterYMetric);
        return {
          team_name: row.team_name,
          round: roundLabel,
          x: xVal,
          y: yVal,
          xLabel: metricLabel(scatterXMetric),
          yLabel: yAxisLabel,
          xRaw: xVal,
          yRaw: yVal,
        };
      });

    if (scatterRoundMode === 'R1') return buildPoints(leaderboardBaseR1, 'R1');
    if (scatterRoundMode === 'R2') return buildPoints(leaderboardBaseR2, 'R2');
    return [
      ...buildPoints(leaderboardBaseR1, 'R1'),
      ...buildPoints(leaderboardBaseR2, 'R2'),
    ];
  }, [
    leaderboardBaseR1,
    leaderboardBaseR2,
    scatterXMetric,
    scatterYMode,
    scatterYMetric,
    scatterNumerator,
    scatterDenominator,
    scatterRoundMode,
  ]);

  // Utility to format scatter value: integer if it's an integer-type metric, else 2 decimals
  const formatScatterValue = (val: number, isInteger: boolean) =>
    isInteger ? Math.round(val).toString() : Number(val).toFixed(2);

  // Determine if the Y metric should display as integer
  const isYMetricInteger = scatterYMode === 'metric' && integerMetricKeys.has(scatterYMetric);
  const isXMetricInteger = integerMetricKeys.has(scatterXMetric);

  // Round-based colors: R1 = slate, R2 = blue
  const SCATTER_R1_COLOR = '#64748b'; // slate-500
  const SCATTER_R2_COLOR = '#2563eb'; // blue-600

  // Custom scatter dot renderer with round-based coloring (only when BOTH rounds selected)
  const renderScatterDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload) return null;
    const isR1 = payload.round === 'R1';
    // Only differentiate colors when BOTH rounds are selected; otherwise always blue
    const color = scatterRoundMode === 'BOTH' && isR1 ? SCATTER_R1_COLOR : SCATTER_R2_COLOR;
    // When both rounds shown, R1 points are faded
    const opacity = scatterRoundMode === 'BOTH' && isR1 ? 0.35 : 1;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill={color}
        fillOpacity={opacity}
        stroke={color}
        strokeOpacity={opacity}
        strokeWidth={1}
      />
    );
  };

  const renderScatterLabel = (props: any) => {
    const { x, y, payload, viewBox } = props;
    if (x == null || y == null || !payload) return null;
    const valueText = formatScatterValue(payload.yRaw, isYMetricInteger);
    const roundSuffix = scatterRoundMode === 'BOTH' ? ` • ${payload.round}` : '';
    const vbY = viewBox?.y ?? 0;
    const vbH = viewBox?.height ?? 0;
    const maxY = vbY + vbH;
    const offset = 16;
    let labelY = y - offset;
    if (labelY < vbY + 10) labelY = y + offset;
    if (labelY > maxY - 6) labelY = y - offset;
    // Only differentiate colors when BOTH rounds selected; otherwise always blue
    const isR1 = payload.round === 'R1';
    const labelColor = scatterRoundMode === 'BOTH' && isR1 ? SCATTER_R1_COLOR : SCATTER_R2_COLOR;
    const labelOpacity = scatterRoundMode === 'BOTH' && isR1 ? 0.5 : 1;
    return (
      <text x={x} y={labelY} textAnchor="middle" dominantBaseline="central" fontSize={10} fill={labelColor} fillOpacity={labelOpacity}>
        {payload.team_name}{roundSuffix}: {valueText}
      </text>
    );
  };

  const avgQualityByTeamId = useMemo(() => {
    const out: Record<string, number> = {};
    leaderboardBase.forEach(t => {
      out[String(t.team_id)] = Number(t.avg_score_overall ?? 0);
    });
    return out;
  }, [leaderboardBase]);

  const avgQualityR1ByTeamId = useMemo(() => {
    const out: Record<string, number> = {};
    (statsR1?.leaderboard ?? []).forEach(row => {
      out[String(row.team.id)] = Number(row.avg_score_overall ?? 0);
    });
    return out;
  }, [statsR1?.leaderboard]);

  const wasteChartData = useMemo(() => {
    const r1Data = (statsR1?.rejection_by_team as any[]) ?? [];
    const r2Data = (statsR2?.rejection_by_team as any[]) ?? [];
    
    // Collect all unique team IDs from both rounds
    const allTeamIds = new Set<number>();
    r1Data.forEach((row: any) => allTeamIds.add(Number(row.team_id)));
    r2Data.forEach((row: any) => allTeamIds.add(Number(row.team_id)));
    
    // Create lookup maps
    const r1Map: Record<string, any> = {};
    const r2Map: Record<string, any> = {};
    r1Data.forEach((row: any) => { r1Map[String(row.team_id)] = row; });
    r2Data.forEach((row: any) => { r2Map[String(row.team_id)] = row; });
    
    // Sort by team ID numerically (Team 1, Team 2, ..., Team N)
    const sortedTeamIds = Array.from(allTeamIds).sort((a, b) => a - b);
    
    return sortedTeamIds.map(teamId => {
      const tid = String(teamId);
      const r1Row = r1Map[tid];
      const r2Row = r2Map[tid];
      return {
        team_id: tid,
        team_name: teamNames[tid] || r1Row?.team_name || r2Row?.team_name || `Team ${teamId}`,
        r1_wasted: Number(r1Row?.unaccepted_jokes ?? 0),
        r1_rate: Number(r1Row?.rejection_rate ?? 0),
        r2_wasted: Number(r2Row?.unaccepted_jokes ?? 0),
        r2_rate: Number(r2Row?.rejection_rate ?? 0),
      };
    });
  }, [statsR1?.rejection_by_team, statsR2?.rejection_by_team, teamNames]);
  const avgQualityR2ByTeamId = useMemo(() => {
    const out: Record<string, number> = {};
    (statsR2?.leaderboard ?? []).forEach(row => {
      out[String(row.team.id)] = Number(row.avg_score_overall ?? 0);
    });
    return out;
  }, [statsR2?.leaderboard]);

  // If the backend doesn't provide sales-over-time, build a local event series based on changes
  // in `leaderboard.total_sales` (which moves up/down on buy/return).
  useEffect(() => {
    // Reset when round changes
    setLocalSalesOverTime([]);
    lastSalesTotalsRef.current = null;
    salesEventIndexRef.current = 0;
  }, [instructorStats?.round_id]);

  useEffect(() => {
    const backendHasSeries = (instructorStats?.cumulative_sales?.length ?? 0) > 0;
    if (backendHasSeries) return;
    // Track sales deltas using the "current round" leaderboard (independent of the UI-only leaderboard round toggle).
    const trackingStats = (config.round === 2 ? statsR2 : statsR1) ?? instructorStats ?? null;
    const trackingLeaderboard = (trackingStats?.leaderboard || []).map((row: any) => ({
      team_id: Number(row.team.id),
      team_name: String(teamNames[String(row.team.id)] || row.team.name),
      total_sales: Number(row.total_sales ?? 0),
    }));
    if (trackingLeaderboard.length === 0) return;

    const curr: Record<string, number> = {};
    trackingLeaderboard.forEach(t => {
      curr[String(t.team_id)] = Number(t.total_sales ?? 0);
    });

    const prev = lastSalesTotalsRef.current;
    const changed =
      !prev ||
      Object.keys(curr).some(id => prev[id] !== curr[id]);
    if (!changed) return;

    salesEventIndexRef.current += 1;
    const eventIndex = salesEventIndexRef.current;
    const ts = new Date().toISOString();

    setLocalSalesOverTime(prevEvents => [
      ...prevEvents,
      ...trackingLeaderboard.map(t => ({
        event_index: eventIndex,
        timestamp: ts,
        team_id: Number(t.team_id),
        team_name: String(t.team_name),
        total_sales: Number(t.total_sales ?? 0),
      })),
    ]);

    lastSalesTotalsRef.current = curr;
  }, [config.round, statsR1?.leaderboard, statsR2?.leaderboard, instructorStats?.leaderboard, instructorStats?.cumulative_sales, teamNames]);

  const leaderboardSorted = useMemo(() => {
    return [...leaderboardBase].sort((a, b) => {
    const dir = leaderboardSortDir === 'asc' ? 1 : -1;
    if (leaderboardSortKey === 'team') {
      return dir * a.team_name.localeCompare(b.team_name);
    }
    const av = a[leaderboardSortKey] ?? 0;
    const bv = b[leaderboardSortKey] ?? 0;
    return dir * (av - bv);
  });
  }, [leaderboardBase, leaderboardSortKey, leaderboardSortDir]);

  // Flash a colorful highlight when a team moves up in the currently displayed ranking.
  useEffect(() => {
    const currPos: Record<string, number> = {};
    leaderboardSorted.forEach((row, idx) => {
      currPos[String(row.team_id)] = idx;
    });

    const prevPos = prevLeaderboardPosRef.current;
    if (prevPos) {
      const movedUpIds = Object.keys(currPos).filter(id => {
        const prev = prevPos[id];
        const curr = currPos[id];
        return typeof prev === 'number' && curr < prev;
      });

      if (movedUpIds.length) {
        setRankUpTeamIds(prev => {
          const s = new Set(prev);
          movedUpIds.forEach(id => s.add(id));
          return Array.from(s);
        });

        movedUpIds.forEach(id => {
          const existing = rankUpTimersRef.current[id];
          if (existing) window.clearTimeout(existing);
          rankUpTimersRef.current[id] = window.setTimeout(() => {
            setRankUpTeamIds(prev => prev.filter(x => x !== id));
            delete rankUpTimersRef.current[id];
          }, 1400);
        });
      }
    }

    prevLeaderboardPosRef.current = currPos;
  }, [leaderboardSorted]);

  const activeTeamIds = Array.from(new Set([
    ...leaderboardBase.map(t => String(t.team_id)),
    ...(statsR1?.leaderboard ?? []).map(r => String(r.team.id)),
    ...(statsR2?.leaderboard ?? []).map(r => String(r.team.id)),
    ...Object.keys(teamNames).filter(id => roster.some(u => u.team === id)),
  ])).sort((a, b) => Number(a) - Number(b));

  // Demo constraint: cap the displayed teams to 20.
  const visibleTeamIds = activeTeamIds.slice(0, 20);

  // Team filters (All Teams or a single selected team).
  const salesTeamIds = useMemo(() => {
    if (salesTeamFilter === 'ALL') return visibleTeamIds;
    if (!visibleTeamIds.includes(String(salesTeamFilter))) return visibleTeamIds;
    return [String(salesTeamFilter)];
  }, [salesTeamFilter, visibleTeamIds]);
  const sequenceTeamIds = useMemo(() => {
    if (sequenceTeamFilter === 'ALL') return visibleTeamIds;
    if (!visibleTeamIds.includes(String(sequenceTeamFilter))) return visibleTeamIds;
    return [String(sequenceTeamFilter)];
  }, [sequenceTeamFilter, visibleTeamIds]);
  const unratedTeamIds = useMemo(() => {
    if (unratedTeamFilter === 'ALL') return visibleTeamIds;
    if (!visibleTeamIds.includes(String(unratedTeamFilter))) return visibleTeamIds;
    return [String(unratedTeamFilter)];
  }, [unratedTeamFilter, visibleTeamIds]);

  useEffect(() => {
    if (salesTeamFilter !== 'ALL' && !visibleTeamIds.includes(String(salesTeamFilter))) setSalesTeamFilter('ALL');
  }, [salesTeamFilter, visibleTeamIds]);
  useEffect(() => {
    if (sequenceTeamFilter !== 'ALL' && !visibleTeamIds.includes(String(sequenceTeamFilter))) setSequenceTeamFilter('ALL');
  }, [sequenceTeamFilter, visibleTeamIds]);
  useEffect(() => {
    if (unratedTeamFilter !== 'ALL' && !visibleTeamIds.includes(String(unratedTeamFilter))) setUnratedTeamFilter('ALL');
  }, [unratedTeamFilter, visibleTeamIds]);

  const buildDenseSalesSeries = (
    events: any[],
    teamIds: string[],
    keyPrefix: string,
  ): any[] => {
    const byEvent: Record<number, Record<string, number>> = {};
    for (const ev of events) {
      const idx = Number((ev as any).event_index);
      if (!Number.isFinite(idx)) continue;
      if (!byEvent[idx]) byEvent[idx] = {};
      byEvent[idx][`${keyPrefix}${String(ev.team_id)}`] = Number((ev as any).total_sales ?? 0);
    }
    const eventIndices = Object.keys(byEvent).map(n => Number(n)).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
    const last: Record<string, number> = {};
    teamIds.forEach(tid => { last[`${keyPrefix}${tid}`] = 0; });
    const rows: any[] = [];
    const base: any = { index: 0 };
    teamIds.forEach(tid => { base[`${keyPrefix}${tid}`] = 0; });
    rows.push(base);
    for (const idx of eventIndices) {
      const updates = byEvent[idx] || {};
      for (const k of Object.keys(updates)) last[k] = updates[k];
      const row: any = { index: idx };
      teamIds.forEach(tid => { row[`${keyPrefix}${tid}`] = last[`${keyPrefix}${tid}`] ?? 0; });
      rows.push(row);
    }
    return rows;
  };

  const buildDenseUnratedSeries = (
    events: any[],
    teamIds: string[],
    keyPrefix: string,
  ): any[] => {
    const byEvent: Record<number, Record<string, number>> = {};
    for (const ev of events) {
      const idx = Number((ev as any).team_event_index ?? (ev as any).event_index);
      if (!Number.isFinite(idx)) continue;
      if (!byEvent[idx]) byEvent[idx] = {};
      byEvent[idx][`${keyPrefix}${String(ev.team_id)}`] = Number((ev as any).queue_count ?? 0);
    }
    const eventIndices = Object.keys(byEvent).map(n => Number(n)).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
    const last: Record<string, number> = {};
    teamIds.forEach(tid => { last[`${keyPrefix}${tid}`] = 0; });
    const rows: any[] = [];
    const base: any = { index: 0 };
    teamIds.forEach(tid => { base[`${keyPrefix}${tid}`] = 0; });
    rows.push(base);
    for (const idx of eventIndices) {
      const updates = byEvent[idx] || {};
      for (const k of Object.keys(updates)) last[k] = updates[k];
      const row: any = { index: idx };
      teamIds.forEach(tid => { row[`${keyPrefix}${tid}`] = last[`${keyPrefix}${tid}`] ?? 0; });
      rows.push(row);
    }
    return rows;
  };

  const mergeByIndex = (a: any[], b: any[]): any[] => {
    const m = new Map<number, any>();
    for (const row of a) m.set(Number(row.index), { ...(m.get(Number(row.index)) ?? {}), ...row });
    for (const row of b) m.set(Number(row.index), { ...(m.get(Number(row.index)) ?? {}), ...row });
    return Array.from(m.values()).sort((x, y) => Number(x.index) - Number(y.index));
  };

  const cumulativeSalesData = (() => {
    const eventsR1 = statsR1?.cumulative_sales ?? [];
    const eventsR2 = statsR2?.cumulative_sales ?? [];
    const fallbackEvents =
      (instructorStats?.cumulative_sales && instructorStats.cumulative_sales.length > 0)
        ? instructorStats.cumulative_sales
        : localSalesOverTime;
    const ids = salesTeamIds;
    if (salesTab === 'BOTH') {
      const s1 = buildDenseSalesSeries(eventsR1, ids, 'r1-');
      const s2 = buildDenseSalesSeries(eventsR2, ids, 'r2-');
      return mergeByIndex(s1, s2);
    }
    if (salesTab === 'R1') return buildDenseSalesSeries(eventsR1, ids, '');
    if (salesTab === 'R2') return buildDenseSalesSeries(eventsR2, ids, '');
    return buildDenseSalesSeries(fallbackEvents, ids, '');
  })();

  const unratedJokesOverTimeData = (() => {
    const eventsR1 = statsR1?.unrated_jokes_over_time ?? [];
    const eventsR2 = statsR2?.unrated_jokes_over_time ?? [];
    const fallbackEvents =
      (instructorStats?.unrated_jokes_over_time && instructorStats.unrated_jokes_over_time.length > 0)
        ? instructorStats.unrated_jokes_over_time
        : [];
    const ids = unratedTeamIds;
    const r1Events = eventsR1.length === 0 && config.round === 1 ? fallbackEvents : eventsR1;
    const r2Events = eventsR2.length === 0 && config.round === 2 ? fallbackEvents : eventsR2;
    if (unratedTab === 'BOTH') {
      const s1 = buildDenseUnratedSeries(r1Events, ids, 'r1-');
      const s2 = buildDenseUnratedSeries(r2Events, ids, 'r2-');
      return mergeByIndex(s1, s2);
    }
    if (unratedTab === 'R1') return buildDenseUnratedSeries(r1Events, ids, '');
    if (unratedTab === 'R2') return buildDenseUnratedSeries(r2Events, ids, '');
    return buildDenseUnratedSeries(fallbackEvents, ids, '');
  })();

  const buildDenseSequenceSeries = (points: any[], teamIds: string[], keyPrefix: string): any[] => {
    const grouped: Record<number, any> = {};
    points.forEach((p: any) => {
      const seq = Number(p.batch_order);
      if (!Number.isFinite(seq)) return;
      if (!grouped[seq]) grouped[seq] = { seq };
      grouped[seq][`${keyPrefix}${String(p.team_id)}`] = Number(p.avg_score ?? 0);
    });
    const rows = Object.values(grouped).sort((a: any, b: any) => a.seq - b.seq);
    // Forward fill, but do NOT invent values for teams that never appear in the stats.
    // This prevents phantom points/lines (e.g. Round 2 not started yet).
    const last: Record<string, number | null> = {};
    teamIds.forEach(tid => { last[`${keyPrefix}${tid}`] = null; });
    return rows.map((row: any) => {
      const out: any = { ...row };
      teamIds.forEach(tid => {
        const k = `${keyPrefix}${tid}`;
        if (out[k] == null) {
          out[k] = last[k];
        } else {
          last[k] = out[k];
        }
      });
      return out;
    });
  };

  const sequenceVsQualityData = (() => {
    const ids = sequenceTeamIds;
    const p1 = statsR1?.learning_curve ?? [];
    const p2 = statsR2?.learning_curve ?? [];
    if (sequenceTab === 'BOTH') {
      const s1 = buildDenseSequenceSeries(p1, ids, 'r1-');
      const s2 = buildDenseSequenceSeries(p2, ids, 'r2-');
      // merge by seq
      const m = new Map<number, any>();
      for (const row of s1) m.set(Number(row.seq), { ...(m.get(Number(row.seq)) ?? {}), ...row });
      for (const row of s2) m.set(Number(row.seq), { ...(m.get(Number(row.seq)) ?? {}), ...row });
      const merged = Array.from(m.values()).sort((a, b) => Number(a.seq) - Number(b.seq));
      return merged.length ? merged : [{ seq: 0 }];
    }
    if (sequenceTab === 'R1') {
      const s = buildDenseSequenceSeries(p1, ids, '');
      return s.length ? s : [{ seq: 0 }];
    }
    if (sequenceTab === 'R2') {
      const s = buildDenseSequenceSeries(p2, ids, '');
      return s.length ? s : [{ seq: 0 }];
    }
    const s = buildDenseSequenceSeries((instructorStats?.learning_curve ?? []), ids, '');
    return s.length ? s : [{ seq: 0 }];
  })();

  const rosterByTeam: Record<string, typeof roster> = {};
  roster.forEach(u => {
    if (u.role === Role.INSTRUCTOR || u.role === Role.CUSTOMER || u.role === Role.UNASSIGNED) return;
    if (!rosterByTeam[u.team]) rosterByTeam[u.team] = [];
    rosterByTeam[u.team].push(u);
  });
  
  // Drag and Drop Logic
  const handleDragStart = (e: React.DragEvent, userId: string) => {
    e.dataTransfer.setData('userId', userId);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const handleDrop = (e: React.DragEvent, targetType: 'TEAM' | 'CUSTOMER' | 'LOBBY', targetId?: string) => {
    e.preventDefault();
    const userId = e.dataTransfer.getData('userId');
    if (!userId) return;

    const user = roster.find(u => u.id === userId);
    if (!user) return;

    if (targetType === 'CUSTOMER') {
        updateUser(userId, { role: Role.CUSTOMER, team: 'N/A' });
    } else if (targetType === 'LOBBY') {
        updateUser(userId, { role: Role.UNASSIGNED, team: 'N/A' });
    } else if (targetType === 'TEAM' && targetId) {
        const currentRole = (user.role === Role.JOKE_MAKER || user.role === Role.QUALITY_CONTROL) 
                          ? user.role 
                          : Role.JOKE_MAKER;
        updateUser(userId, { team: targetId, role: currentRole });
    }
  };

  const toggleUserRole = (userId: string, currentRole: Role) => {
      const newRole = currentRole === Role.JOKE_MAKER ? Role.QUALITY_CONTROL : Role.JOKE_MAKER;
      updateUser(userId, { role: newRole });
  };

  const renderLeaderboardTable = (opts: { maxHeightClass: string; isExpanded?: boolean }) => {
    const isExpanded = Boolean(opts.isExpanded);
    return (
      <div className={`overflow-x-auto ${opts.maxHeightClass} overflow-y-auto`}>
        <table className={`min-w-full ${isExpanded ? 'text-base' : 'text-sm'}`}>
          <thead className="sticky top-0 bg-white shadow-sm z-10">
            <tr className="bg-gray-50 border-b">
              <th className="px-3 py-2 text-left font-medium text-gray-500">Rank</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                    setLeaderboardSortKey('team');
                    setLeaderboardSortDir(prev => (leaderboardSortKey === 'team' ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
                  }}
                  title="Sort by Team"
                >
                  <span>Team</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'team' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                    setLeaderboardSortKey('rated_batches');
                    setLeaderboardSortDir(prev => (leaderboardSortKey === 'rated_batches' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                  }}
                  title="Sort by Rated Batches"
                >
                  <span>Rated Batches</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'rated_batches' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                    setLeaderboardSortKey('accepted_jokes');
                    setLeaderboardSortDir(prev => (leaderboardSortKey === 'accepted_jokes' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                  }}
                  title="Sort by Accepted Jokes"
                >
                  <span>Accepted Jokes</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'accepted_jokes' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                  setLeaderboardSortKey('unaccepted_jokes');
                  setLeaderboardSortDir(prev => (leaderboardSortKey === 'unaccepted_jokes' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                  }}
                  title="Sort by Wasted Jokes"
                >
                  <span>Wasted Jokes</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'unaccepted_jokes' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                    setLeaderboardSortKey('unsold_jokes');
                    setLeaderboardSortDir(prev => (leaderboardSortKey === 'unsold_jokes' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                  }}
                  title="Sort by Unsold Jokes"
                >
                  <span>Unsold Jokes</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'unsold_jokes' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                    setLeaderboardSortKey('total_jokes');
                    setLeaderboardSortDir(prev => (leaderboardSortKey === 'total_jokes' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                  }}
                  title="Sort by Total Jokes"
                >
                  <span>Total Jokes</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'total_jokes' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                    setLeaderboardSortKey('avg_score_overall');
                    setLeaderboardSortDir(prev => (leaderboardSortKey === 'avg_score_overall' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                  }}
                  title="Sort by Average Score"
                >
                  <span>Avg Score</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'avg_score_overall' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                    setLeaderboardSortKey('total_sales');
                    setLeaderboardSortDir(prev => (leaderboardSortKey === 'total_sales' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                  }}
                  title="Sort by Total Sales"
                >
                  <span>Total Sales</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'total_sales' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">
                <button
                  type="button"
                  className="inline-flex items-center hover:text-gray-800"
                  onClick={() => {
                    setLeaderboardSortKey('profit');
                    setLeaderboardSortDir(prev => (leaderboardSortKey === 'profit' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
                  }}
                  title="Sort by Profit"
                >
                  <span>Profit</span>
                  <span className="ml-1 w-3 text-center">
                    {leaderboardSortKey === 'profit' ? (leaderboardSortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leaderboardSorted.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-gray-400 italic">
                  No leaderboard data yet.
                </td>
              </tr>
            )}
            {leaderboardSorted.map((row, idx) => (
              <tr
                key={String(row.team_id)}
                className={`hover:bg-gray-50 ${rankUpTeamIds.includes(String(row.team_id)) ? 'jf-leaderboard-rankup' : ''}`}
              >
                <td className="px-3 py-2 font-mono text-gray-700">{idx + 1}</td>
                <td className="px-3 py-2 font-semibold text-gray-900">{row.team_name}</td>
                <td className="px-3 py-2 text-right text-gray-800">{row.rated_batches}</td>
                <td className="px-3 py-2 text-right text-gray-800">{row.accepted_jokes}</td>
                <td className="px-3 py-2 text-right text-gray-800">{row.unaccepted_jokes}</td>
                <td className="px-3 py-2 text-right text-gray-800">{row.unsold_jokes}</td>
                <td className="px-3 py-2 text-right text-gray-800">{row.total_jokes}</td>
                <td className="px-3 py-2 text-right text-gray-800">{row.avg_score_overall.toFixed(1)}</td>
                <td className="px-3 py-2 text-right text-gray-800">{row.total_sales}</td>
                <td className={`px-3 py-2 text-right font-bold ${Number(row.profit) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {Number(row.profit).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Render Charts Helper
  const renderChart = (type: string, opts?: { isExpanded?: boolean }) => {
    const isExpandedView = Boolean(opts?.isExpanded);
    switch(type) {
        case 'sales': {
            const isExpanded = isExpandedView;
            const teamIds = salesTeamIds;
            const eventsR1 = statsR1?.cumulative_sales ?? [];
            const eventsR2 = statsR2?.cumulative_sales ?? [];
            const teamsWithSalesR1 = new Set<string>(eventsR1.map((e: any) => String(e.team_id)));
            const teamsWithSalesR2 = new Set<string>(eventsR2.map((e: any) => String(e.team_id)));
            // If backend doesn't provide cumulative series, allow the local fallback ONLY for the current round.
            if (teamsWithSalesR1.size === 0 && config.round === 1 && localSalesOverTime.length > 0) {
              localSalesOverTime.forEach(ev => teamsWithSalesR1.add(String(ev.team_id)));
            }
            if (teamsWithSalesR2.size === 0 && config.round === 2 && localSalesOverTime.length > 0) {
              localSalesOverTime.forEach(ev => teamsWithSalesR2.add(String(ev.team_id)));
            }
            const seriesDisplayName = (rawKey: string) => {
              const isR1 = rawKey.startsWith('r1-');
              const isR2 = rawKey.startsWith('r2-');
              const teamId = isR1 || isR2 ? rawKey.slice(3) : rawKey;
              const baseRaw = String(teamNames[teamId] ?? `Team ${teamId}`);
              const base = baseRaw.length > 18 ? `${baseRaw.slice(0, 16)}…` : baseRaw;
              if (!isExpanded) return base;
              // When BOTH rounds are shown, we label only R2 lines by default (less crowded),
              // so suffix is only needed for R1 lines when we choose to render them.
              if (salesTab === 'BOTH') return base;
              return base;
            };
            const colorForTeamId = (tid: string) => {
              const idx = visibleTeamIds.indexOf(String(tid));
              return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length];
            };
            const labelSeriesKeys = (() => {
              if (!isExpanded) return [] as string[];
              if (salesTab !== 'BOTH') return teamIds.map(tid => String(tid));
              // Smart: if lots of teams, label only R2 to keep it readable.
              return teamIds.length > 8
                ? teamIds.map(tid => `r2-${tid}`)
                : teamIds.flatMap(tid => [`r1-${tid}`, `r2-${tid}`]);
            })();
            const lastIndexBySeriesKey: Record<string, number> = {};
            if (isExpanded) {
              for (const k of labelSeriesKeys) {
                for (let i = cumulativeSalesData.length - 1; i >= 0; i--) {
                  const row: any = (cumulativeSalesData as any[])[i];
                  const yv = Number(row?.[k]);
                  if (Number.isFinite(yv)) {
                    lastIndexBySeriesKey[k] = i;
                    break;
                  }
                }
              }
            }
            // If multiple series end at the same y-value, offset their labels so they don't overlap.
            const labelYOffsetBySeriesKey: Record<string, number> = {};
            if (isExpanded) {
              const groups = new Map<string, string[]>();
              for (const k of labelSeriesKeys) {
                const idx = lastIndexBySeriesKey[k];
                if (idx == null) continue;
                const row: any = (cumulativeSalesData as any[])[idx];
                const yv = Number(row?.[k]);
                if (!Number.isFinite(yv)) continue;
                // group with tolerance by rounding (sales are integers anyway)
                const gk = String(Math.round(yv * 100) / 100);
                const arr = groups.get(gk) ?? [];
                arr.push(k);
                groups.set(gk, arr);
              }
              for (const arr of groups.values()) {
                if (arr.length <= 1) continue;
                const reachIndex = (seriesKey: string) => {
                  const lastIdx = lastIndexBySeriesKey[seriesKey];
                  if (lastIdx == null) return Number.POSITIVE_INFINITY;
                  const lastRow: any = (cumulativeSalesData as any[])[lastIdx];
                  const finalY = Number(lastRow?.[seriesKey]);
                  if (!Number.isFinite(finalY)) return Number.POSITIVE_INFINITY;
                  for (let i = 0; i <= lastIdx; i++) {
                    const row: any = (cumulativeSalesData as any[])[i];
                    const yv = Number(row?.[seriesKey]);
                    if (Number.isFinite(yv) && yv === finalY) return i;
                  }
                  return lastIdx;
                };
                // Earlier achiever gets a more negative offset (label above), matching desired "on top" ordering.
                arr.sort((a, b) => {
                  const ra = reachIndex(a);
                  const rb = reachIndex(b);
                  if (ra !== rb) return ra - rb;
                  return a.localeCompare(b);
                });
                const step = 14;
                const mid = (arr.length - 1) / 2;
                arr.forEach((k, i) => {
                  labelYOffsetBySeriesKey[k] = (i - mid) * step;
                });
              }
            }
            const makeEndLabel = (seriesKey: string, labelText: string, color: string) => (p: any) => {
              if (!isExpanded) return null;
              if (p?.index !== lastIndexBySeriesKey[seriesKey]) return null;
              const x = Number(p?.x);
              const y = Number(p?.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
              const isR1 = seriesKey.startsWith('r1-');
              const labelOpacity = salesTab === 'BOTH' && isR1 ? 0.45 : 1;
              const dyOffset = labelYOffsetBySeriesKey[seriesKey] ?? 0;
              return (
                <text
                  x={x - 6}
                  y={y + dyOffset}
                  dy={4}
                  textAnchor="end"
                  fontSize={12}
                  fontWeight={800}
                  fill="#111827"
                  opacity={labelOpacity}
                  paintOrder="stroke"
                  stroke="#ffffff"
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                >
                  <tspan fill={color}>● </tspan>
                  <tspan fill="#111827">{labelText}</tspan>
                </text>
              );
            };
            const shouldShowEndLabel = (seriesKey: string) => labelSeriesKeys.includes(seriesKey);

            // Render order: low final value first (bottom), high final value last (top).
            // If tied, the one that reached the final value LATER is rendered first, so the "earlier achiever" is on top.
            const computeSeriesPriority = (seriesKey: string) => {
              let lastIdx = -1;
              let finalY = -Infinity;
              for (let i = cumulativeSalesData.length - 1; i >= 0; i--) {
                const row: any = (cumulativeSalesData as any[])[i];
                const yv = Number(row?.[seriesKey]);
                if (Number.isFinite(yv)) {
                  finalY = yv;
                  lastIdx = i;
                  break;
                }
              }
              let reachIdx = lastIdx;
              if (Number.isFinite(finalY) && lastIdx >= 0) {
                for (let i = 0; i <= lastIdx; i++) {
                  const row: any = (cumulativeSalesData as any[])[i];
                  const yv = Number(row?.[seriesKey]);
                  if (Number.isFinite(yv) && yv === finalY) {
                    reachIdx = i;
                    break;
                  }
                }
              }
              return { finalY, reachIdx };
            };
            const sortSeriesKeysForRender = (keys: string[]) => {
              const enriched = keys.map(k => ({ k, ...computeSeriesPriority(k) }));
              enriched.sort((a, b) => {
                if (a.finalY !== b.finalY) return a.finalY - b.finalY; // low first
                if (a.reachIdx !== b.reachIdx) return b.reachIdx - a.reachIdx; // later reach first, earlier reach last (on top)
                return a.k.localeCompare(b.k);
              });
              return enriched.map(x => x.k);
            };

            return (
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={cumulativeSalesData} margin={{ top: 12, bottom: 20, left: 48, right: isExpanded ? 24 : 16 }}>
                   <CartesianGrid strokeDasharray="3 3" />
                   <XAxis dataKey="index" label={{ value: 'Time Elapsed', position: 'insideBottom', offset: -10 }} />
                   <YAxis
                     width={44}
                      allowDecimals={false}
                     domain={[
                       0,
                       (dataMax: number) => {
                         const m = Number.isFinite(dataMax) ? dataMax : 0;
                         return Math.max(1, Math.ceil(m * 1.1));
                       },
                     ]}
                     padding={{ top: 10, bottom: 4 }}
                     label={{ value: 'Cum. Sales', angle: -90, position: 'insideLeft', dx: -10 }}
                   />
                    <Tooltip
                      shared={false}
                      content={(props: any) => {
                        const active = Boolean(props?.active);
                        const payload = Array.isArray(props?.payload) ? props.payload : [];
                        if (!active || payload.length === 0) return null;
                        const hoveredKey = hoveredSalesSeriesKey;
                        const p =
                          (hoveredKey
                            ? payload.find((it: any) => String(it?.dataKey ?? '') === hoveredKey)
                            : undefined) ??
                          payload[0] ??
                          {};
                        const rawKey = String(p.dataKey ?? '');
                        const isR1 = rawKey.startsWith('r1-');
                        const isR2 = rawKey.startsWith('r2-');
                        const teamId = isR1 || isR2 ? rawKey.slice(3) : rawKey;
                        const roundLabel = isR1 ? 'Round 1' : isR2 ? 'Round 2' : '';
                        const teamName = String(teamNames[teamId] ?? `Team ${teamId}`);
                        const sales = Number(p.value ?? 0);
                        const avg =
                          isR1
                            ? avgQualityR1ByTeamId[teamId]
                            : isR2
                              ? avgQualityR2ByTeamId[teamId]
                              : salesTab === 'R1'
                                ? avgQualityR1ByTeamId[teamId]
                                : salesTab === 'R2'
                                  ? avgQualityR2ByTeamId[teamId]
                                  : avgQualityByTeamId[teamId];
                        const label = Number(props?.label);
                        return (
                          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
                            <div className="text-xs font-bold text-gray-500">Event {Number.isFinite(label) ? label : ''}</div>
                            <div className="text-sm font-bold text-gray-900">{teamName}</div>
                            {roundLabel && <div className="text-xs font-bold text-gray-500">{roundLabel}</div>}
                            <div className="mt-1 text-sm text-gray-700">
                              <div className="flex justify-between gap-4">
                                <span className="font-medium">Sales</span>
                                <span className="font-mono font-bold text-emerald-700">{Number.isFinite(sales) ? sales : 0}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="font-medium">Avg Score</span>
                                <span className="font-mono font-bold text-indigo-700">
                                  {Number.isFinite(avg) ? avg.toFixed(1) : '—'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    {salesTab === 'BOTH' ? (
                      <>
                        {sortSeriesKeysForRender(
                          visibleTeamIds.filter(tid => teamsWithSalesR1.has(String(tid))).map(tid => `r1-${tid}`)
                        ).map((seriesKey) => {
                          const teamId = seriesKey.slice(3);
                          const color = colorForTeamId(teamId);
                          return (
                          <Line
                            key={seriesKey}
                            type="monotone"
                            dataKey={seriesKey}
                            name={`${teamNames[teamId] || `Team ${teamId}`} (R1)`}
                            stroke={color}
                            strokeWidth={2}
                            strokeOpacity={0.25}
                            strokeDasharray="6 4"
                            dot={false}
                            isAnimationActive={!isExpanded}
                            activeDot={hoveredSalesSeriesKey === seriesKey ? { r: 4 } : false}
                            label={
                              isExpanded && shouldShowEndLabel(seriesKey)
                                ? makeEndLabel(seriesKey, seriesDisplayName(seriesKey), color)
                                : false
                            }
                            onMouseEnter={() => setHoveredSalesSeriesKey(seriesKey)}
                            onMouseLeave={() => setHoveredSalesSeriesKey(null)}
                          />
                          );
                        })}
                        {sortSeriesKeysForRender(
                          visibleTeamIds.filter(tid => teamsWithSalesR2.has(String(tid))).map(tid => `r2-${tid}`)
                        ).map((seriesKey) => {
                          const teamId = seriesKey.slice(3);
                          const color = colorForTeamId(teamId);
                          return (
                          <Line
                            key={seriesKey}
                            type="monotone"
                            dataKey={seriesKey}
                            name={`${teamNames[teamId] || `Team ${teamId}`} (R2)`}
                            stroke={color}
                            strokeWidth={3}
                            strokeOpacity={1}
                            dot={false}
                            isAnimationActive={!isExpanded}
                            activeDot={hoveredSalesSeriesKey === seriesKey ? { r: 4 } : false}
                            label={
                              isExpanded && shouldShowEndLabel(seriesKey)
                                ? makeEndLabel(seriesKey, seriesDisplayName(seriesKey), color)
                                : false
                            }
                            onMouseEnter={() => setHoveredSalesSeriesKey(seriesKey)}
                            onMouseLeave={() => setHoveredSalesSeriesKey(null)}
                          />
                          );
                        })}
                      </>
                    ) : (
                      <>
                   {sortSeriesKeysForRender(
                      (salesTab === 'R1'
                        ? visibleTeamIds.filter(tid => teamsWithSalesR1.has(String(tid)))
                        : salesTab === 'R2'
                          ? visibleTeamIds.filter(tid => teamsWithSalesR2.has(String(tid)))
                          : visibleTeamIds
                      ).map(tid => String(tid))
                    ).map((teamId) => {
                      const color = colorForTeamId(teamId);
                      return (
                      <Line 
                        key={teamId} 
                        type="monotone" 
                        dataKey={teamId} 
                        name={teamNames[teamId] || `Team ${teamId}`} 
                        stroke={color} 
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={!isExpanded}
                        activeDot={hoveredSalesSeriesKey === String(teamId) ? { r: 4 } : false}
                        label={
                          isExpanded && shouldShowEndLabel(String(teamId))
                            ? makeEndLabel(String(teamId), seriesDisplayName(String(teamId)), color)
                            : false
                        }
                        onMouseEnter={() => setHoveredSalesSeriesKey(String(teamId))}
                        onMouseLeave={() => setHoveredSalesSeriesKey(null)}
                      />
                      );
                    })}
                      </>
                    )}
                 </LineChart>
               </ResponsiveContainer>
            );
        }
        case 'sequence_quality': {
            const isExpanded = isExpandedView;
            const teamIds = sequenceTeamIds;
            const pointsR1 = statsR1?.learning_curve ?? [];
            const pointsR2 = statsR2?.learning_curve ?? [];
            const teamsWithSeqR1 = new Set<string>(pointsR1.map((p: any) => String(p.team_id)));
            const teamsWithSeqR2 = new Set<string>(pointsR2.map((p: any) => String(p.team_id)));

            const seriesDisplayName = (rawKey: string) => {
              const isR1 = rawKey.startsWith('r1-');
              const isR2 = rawKey.startsWith('r2-');
              const teamId = isR1 || isR2 ? rawKey.slice(3) : rawKey;
              const baseRaw = String(teamNames[teamId] ?? `Team ${teamId}`);
              const base = baseRaw.length > 18 ? `${baseRaw.slice(0, 16)}…` : baseRaw;
              if (!isExpanded) return base;
              if (sequenceTab === 'BOTH') return base;
              return base;
            };
            const colorForTeamId = (tid: string) => {
              const idx = visibleTeamIds.indexOf(String(tid));
              return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length];
            };
            const labelSeriesKeys = (() => {
              if (!isExpanded) return [] as string[];
              if (sequenceTab !== 'BOTH') return teamIds.map(tid => String(tid));
              // Smart: if lots of teams, label only R2 to keep it readable.
              return teamIds.length > 8
                ? teamIds.map(tid => `r2-${tid}`)
                : teamIds.flatMap(tid => [`r1-${tid}`, `r2-${tid}`]);
            })();

            const lastIndexBySeriesKey: Record<string, number> = {};
            if (isExpanded) {
              for (const k of labelSeriesKeys) {
                for (let i = sequenceVsQualityData.length - 1; i >= 0; i--) {
                  const row: any = (sequenceVsQualityData as any[])[i];
                  const yv = Number(row?.[k]);
                  if (Number.isFinite(yv)) {
                    lastIndexBySeriesKey[k] = i;
                    break;
                  }
                }
              }
            }

            // If multiple series end at the same y-value, offset their labels so they don't overlap.
            const labelYOffsetBySeriesKey: Record<string, number> = {};
            if (isExpanded) {
              const groups = new Map<string, string[]>();
              for (const k of labelSeriesKeys) {
                const idx = lastIndexBySeriesKey[k];
                if (idx == null) continue;
                const row: any = (sequenceVsQualityData as any[])[idx];
                const yv = Number(row?.[k]);
                if (!Number.isFinite(yv)) continue;
                // group with tolerance by rounding to 2 decimals
                const gk = String(Math.round(yv * 100) / 100);
                const arr = groups.get(gk) ?? [];
                arr.push(k);
                groups.set(gk, arr);
              }
              for (const arr of groups.values()) {
                if (arr.length <= 1) continue;
                const reachIndex = (seriesKey: string) => {
                  const lastIdx = lastIndexBySeriesKey[seriesKey];
                  if (lastIdx == null) return Number.POSITIVE_INFINITY;
                  const lastRow: any = (sequenceVsQualityData as any[])[lastIdx];
                  const finalY = Number(lastRow?.[seriesKey]);
                  if (!Number.isFinite(finalY)) return Number.POSITIVE_INFINITY;
                  for (let i = 0; i <= lastIdx; i++) {
                    const row: any = (sequenceVsQualityData as any[])[i];
                    const yv = Number(row?.[seriesKey]);
                    if (Number.isFinite(yv) && yv === finalY) return i;
                  }
                  return lastIdx;
                };
                arr.sort((a, b) => {
                  const ra = reachIndex(a);
                  const rb = reachIndex(b);
                  if (ra !== rb) return ra - rb;
                  return a.localeCompare(b);
                });
                const step = 14;
                const mid = (arr.length - 1) / 2;
                arr.forEach((k, i) => {
                  labelYOffsetBySeriesKey[k] = (i - mid) * step;
                });
              }
            }

            const makeEndLabel = (seriesKey: string, labelText: string, color: string) => (p: any) => {
              if (!isExpanded) return null;
              if (p?.seq !== lastIndexBySeriesKey[seriesKey]) return null;
              const x = Number(p?.x);
              const y = Number(p?.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
              const isR1 = seriesKey.startsWith('r1-');
              const labelOpacity = sequenceTab === 'BOTH' && isR1 ? 0.45 : 1;
              const dyOffset = labelYOffsetBySeriesKey[seriesKey] ?? 0;
              return (
                <text
                  x={x - 6}
                  y={y + dyOffset}
                  dy={4}
                  textAnchor="end"
                  fontSize={12}
                  fontWeight={800}
                  fill="#111827"
                  opacity={labelOpacity}
                  paintOrder="stroke"
                  stroke="#ffffff"
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                >
                  <tspan fill={color}>● </tspan>
                  <tspan fill="#111827">{labelText}</tspan>
                </text>
              );
            };
            const shouldShowEndLabel = (seriesKey: string) => labelSeriesKeys.includes(seriesKey);

            const computeSeriesPriority = (seriesKey: string) => {
              let lastIdx = -1;
              let finalY = -Infinity;
              for (let i = sequenceVsQualityData.length - 1; i >= 0; i--) {
                const row: any = (sequenceVsQualityData as any[])[i];
                const yv = Number(row?.[seriesKey]);
                if (Number.isFinite(yv)) {
                  finalY = yv;
                  lastIdx = i;
                  break;
                }
              }
              let reachIdx = lastIdx;
              if (Number.isFinite(finalY) && lastIdx >= 0) {
                for (let i = 0; i <= lastIdx; i++) {
                  const row: any = (sequenceVsQualityData as any[])[i];
                  const yv = Number(row?.[seriesKey]);
                  if (Number.isFinite(yv) && yv === finalY) {
                    reachIdx = i;
                    break;
                  }
                }
              }
              return { finalY, reachIdx };
            };
            const sortSeriesKeysForRender = (keys: string[]) => {
              const enriched = keys.map(k => ({ k, ...computeSeriesPriority(k) }));
              enriched.sort((a, b) => {
                if (a.finalY !== b.finalY) return a.finalY - b.finalY;
                if (a.reachIdx !== b.reachIdx) return b.reachIdx - a.reachIdx;
                return a.k.localeCompare(b.k);
              });
              return enriched.map(x => x.k);
            };

            return (
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={sequenceVsQualityData} margin={{ top: 12, bottom: 20, left: 48, right: isExpanded ? 24 : 16 }}>
                   <CartesianGrid strokeDasharray="3 3" />
                   <XAxis dataKey="seq" label={{ value: 'Batch Sequence', position: 'insideBottom', offset: -10 }} />
                   <YAxis
                     width={44}
                    // Add headroom without changing the axis max label (keep max at 5).
                    domain={[0, 5]}
                     padding={{ top: 12, bottom: 6 }}
                     label={{ value: 'Avg Score', angle: -90, position: 'insideLeft', dx: -10 }}
                   />
                   <Tooltip
                     shared={false}
                     content={(props: any) => {
                       const active = Boolean(props?.active);
                       const payload = Array.isArray(props?.payload) ? props.payload : [];
                       if (!active || payload.length === 0) return null;

                       const hoveredKey = hoveredSequenceSeriesKey;
                       const p =
                         (hoveredKey
                           ? payload.find((it: any) => String(it?.dataKey ?? '') === hoveredKey)
                           : undefined) ??
                         payload[0] ??
                         {};

                       const rawKey = String(p.dataKey ?? '');
                       const isR1 = rawKey.startsWith('r1-');
                       const isR2 = rawKey.startsWith('r2-');
                       const teamId = isR1 || isR2 ? rawKey.slice(3) : rawKey;
                       const roundLabel = isR1 ? 'Round 1' : isR2 ? 'Round 2' : '';
                       const teamName = String(teamNames[teamId] ?? `Team ${teamId}`);
                       const quality = Number(p.value ?? NaN);
                       const label = Number(props?.label);

                       return (
                         <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
                           <div className="text-xs font-bold text-gray-500">
                             Batch {Number.isFinite(label) ? label : ''}
                           </div>
                           <div className="text-sm font-bold text-gray-900">{teamName}</div>
                           {roundLabel && <div className="text-xs font-bold text-gray-500">{roundLabel}</div>}
                           <div className="mt-1 text-sm text-gray-700">
                             <div className="flex justify-between gap-4">
                               <span className="font-medium">Avg Score</span>
                               <span className="font-mono font-bold text-indigo-700">
                                 {Number.isFinite(quality) ? quality.toFixed(1) : '—'}
                               </span>
                             </div>
                           </div>
                         </div>
                       );
                     }}
                   />
                   {sequenceTab === 'BOTH' ? (
                     <>
                       {sortSeriesKeysForRender(
                         teamIds.filter(tid => teamsWithSeqR1.has(String(tid))).map(tid => `r1-${tid}`)
                       ).map((seriesKey) => {
                         const teamId = seriesKey.slice(3);
                         const color = colorForTeamId(teamId);
                         return (
                         <Line
                           key={seriesKey}
                           type="monotone"
                           dataKey={seriesKey}
                           name={`${teamNames[teamId] || `Team ${teamId}`} (R1)`}
                           stroke={color}
                           strokeWidth={2}
                           strokeOpacity={0.25}
                           strokeDasharray="6 4"
                           connectNulls
                           dot={false}
                           isAnimationActive={!isExpanded}
                           activeDot={hoveredSequenceSeriesKey === seriesKey ? { r: 4 } : false}
                           label={
                             isExpanded && shouldShowEndLabel(seriesKey)
                               ? makeEndLabel(seriesKey, seriesDisplayName(seriesKey), color)
                               : false
                           }
                           onMouseEnter={() => setHoveredSequenceSeriesKey(seriesKey)}
                           onMouseLeave={() => setHoveredSequenceSeriesKey(null)}
                         />
                         );
                       })}
                       {sortSeriesKeysForRender(
                         teamIds.filter(tid => teamsWithSeqR2.has(String(tid))).map(tid => `r2-${tid}`)
                       ).map((seriesKey) => {
                         const teamId = seriesKey.slice(3);
                         const color = colorForTeamId(teamId);
                         return (
                         <Line
                           key={seriesKey}
                           type="monotone"
                           dataKey={seriesKey}
                           name={`${teamNames[teamId] || `Team ${teamId}`} (R2)`}
                           stroke={color}
                           strokeWidth={3}
                           strokeOpacity={1}
                           connectNulls
                           dot={false}
                           isAnimationActive={!isExpanded}
                           activeDot={hoveredSequenceSeriesKey === seriesKey ? { r: 4 } : false}
                           label={
                             isExpanded && shouldShowEndLabel(seriesKey)
                               ? makeEndLabel(seriesKey, seriesDisplayName(seriesKey), color)
                               : false
                           }
                           onMouseEnter={() => setHoveredSequenceSeriesKey(seriesKey)}
                           onMouseLeave={() => setHoveredSequenceSeriesKey(null)}
                         />
                         );
                       })}
                     </>
                   ) : (
                     <>
                   {sortSeriesKeysForRender(
                      (sequenceTab === 'R1'
                        ? teamIds.filter(tid => teamsWithSeqR1.has(String(tid)))
                        : sequenceTab === 'R2'
                          ? teamIds.filter(tid => teamsWithSeqR2.has(String(tid)))
                          : teamIds
                      ).map(tid => String(tid))
                    ).map((teamId) => {
                      const color = colorForTeamId(teamId);
                      return (
                      <Line 
                        key={teamId} 
                        type="monotone" 
                        dataKey={teamId} 
                        name={teamNames[teamId] || `Team ${teamId}`} 
                        stroke={color} 
                        strokeWidth={2}
                        connectNulls
                        dot={false}
                        isAnimationActive={!isExpanded}
                        activeDot={hoveredSequenceSeriesKey === String(teamId) ? { r: 4 } : false}
                        label={
                          isExpanded && shouldShowEndLabel(String(teamId))
                            ? makeEndLabel(String(teamId), seriesDisplayName(String(teamId)), color)
                            : false
                        }
                        onMouseEnter={() => setHoveredSequenceSeriesKey(String(teamId))}
                        onMouseLeave={() => setHoveredSequenceSeriesKey(null)}
                      />
                      );
                    })}
                     </>
                   )}
                 </LineChart>
               </ResponsiveContainer>
            );
        }
        case 'unrated_jokes': {
            const isExpanded = isExpandedView;
            const teamIds = unratedTeamIds;
            const eventsR1 = statsR1?.unrated_jokes_over_time ?? [];
            const eventsR2 = statsR2?.unrated_jokes_over_time ?? [];
            const fallbackEvents = (instructorStats?.unrated_jokes_over_time ?? []);
            const teamsWithUnratedR1 = new Set<string>(eventsR1.map((e: any) => String(e.team_id)));
            const teamsWithUnratedR2 = new Set<string>(eventsR2.map((e: any) => String(e.team_id)));
            // If per-round cache is empty, allow current-round fallback data to show up.
            if (teamsWithUnratedR1.size === 0 && config.round === 1 && fallbackEvents.length > 0) {
              fallbackEvents.forEach((e: any) => teamsWithUnratedR1.add(String(e.team_id)));
            }
            if (teamsWithUnratedR2.size === 0 && config.round === 2 && fallbackEvents.length > 0) {
              fallbackEvents.forEach((e: any) => teamsWithUnratedR2.add(String(e.team_id)));
            }

            const seriesDisplayName = (rawKey: string) => {
              const isR1 = rawKey.startsWith('r1-');
              const isR2 = rawKey.startsWith('r2-');
              const teamId = isR1 || isR2 ? rawKey.slice(3) : rawKey;
              const baseRaw = String(teamNames[teamId] ?? `Team ${teamId}`);
              const base = baseRaw.length > 18 ? `${baseRaw.slice(0, 16)}…` : baseRaw;
              if (!isExpanded) return base;
              if (unratedTab === 'BOTH') return base;
              return base;
            };
            const colorForTeamId = (tid: string) => {
              const idx = visibleTeamIds.indexOf(String(tid));
              return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length];
            };
            const labelSeriesKeys = (() => {
              if (!isExpanded) return [] as string[];
              if (unratedTab !== 'BOTH') return teamIds.map(tid => String(tid));
              return teamIds.length > 8
                ? teamIds.map(tid => `r2-${tid}`)
                : teamIds.flatMap(tid => [`r1-${tid}`, `r2-${tid}`]);
            })();

            const lastIndexBySeriesKey: Record<string, number> = {};
            if (isExpanded) {
              for (const k of labelSeriesKeys) {
                for (let i = unratedJokesOverTimeData.length - 1; i >= 0; i--) {
                  const row: any = (unratedJokesOverTimeData as any[])[i];
                  const yv = Number(row?.[k]);
                  if (Number.isFinite(yv)) {
                    lastIndexBySeriesKey[k] = i;
                    break;
                  }
                }
              }
            }
            const labelYOffsetBySeriesKey: Record<string, number> = {};
            if (isExpanded) {
              const groups = new Map<string, string[]>();
              for (const k of labelSeriesKeys) {
                const idx = lastIndexBySeriesKey[k];
                if (idx == null) continue;
                const row: any = (unratedJokesOverTimeData as any[])[idx];
                const yv = Number(row?.[k]);
                if (!Number.isFinite(yv)) continue;
                const gk = String(Math.round(yv * 100) / 100);
                const arr = groups.get(gk) ?? [];
                arr.push(k);
                groups.set(gk, arr);
              }
              for (const arr of groups.values()) {
                if (arr.length <= 1) continue;
                const reachIndex = (seriesKey: string) => {
                  const lastIdx = lastIndexBySeriesKey[seriesKey];
                  if (lastIdx == null) return Number.POSITIVE_INFINITY;
                  const lastRow: any = (unratedJokesOverTimeData as any[])[lastIdx];
                  const finalY = Number(lastRow?.[seriesKey]);
                  if (!Number.isFinite(finalY)) return Number.POSITIVE_INFINITY;
                  for (let i = 0; i <= lastIdx; i++) {
                    const row: any = (unratedJokesOverTimeData as any[])[i];
                    const yv = Number(row?.[seriesKey]);
                    if (Number.isFinite(yv) && yv === finalY) return i;
                  }
                  return lastIdx;
                };
                arr.sort((a, b) => {
                  const ra = reachIndex(a);
                  const rb = reachIndex(b);
                  if (ra !== rb) return ra - rb;
                  return a.localeCompare(b);
                });
                const step = 14;
                const mid = (arr.length - 1) / 2;
                arr.forEach((k, i) => {
                  labelYOffsetBySeriesKey[k] = (i - mid) * step;
                });
              }
            }
            const makeEndLabel = (seriesKey: string, labelText: string, color: string) => (p: any) => {
              if (!isExpanded) return null;
              if (p?.index !== lastIndexBySeriesKey[seriesKey]) return null;
              const x = Number(p?.x);
              const y = Number(p?.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
              const isR1 = seriesKey.startsWith('r1-');
              const labelOpacity = unratedTab === 'BOTH' && isR1 ? 0.45 : 1;
              const dyOffset = labelYOffsetBySeriesKey[seriesKey] ?? 0;
              return (
                <text
                  x={x - 6}
                  y={y + dyOffset}
                  dy={4}
                  textAnchor="end"
                  fontSize={12}
                  fontWeight={800}
                  fill="#111827"
                  opacity={labelOpacity}
                  paintOrder="stroke"
                  stroke="#ffffff"
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                >
                  <tspan fill={color}>● </tspan>
                  <tspan fill="#111827">{labelText}</tspan>
                </text>
              );
            };
            const shouldShowEndLabel = (seriesKey: string) => labelSeriesKeys.includes(seriesKey);
            const computeSeriesPriority = (seriesKey: string) => {
              let lastIdx = -1;
              let finalY = -Infinity;
              for (let i = unratedJokesOverTimeData.length - 1; i >= 0; i--) {
                const row: any = (unratedJokesOverTimeData as any[])[i];
                const yv = Number(row?.[seriesKey]);
                if (Number.isFinite(yv)) {
                  finalY = yv;
                  lastIdx = i;
                  break;
                }
              }
              let reachIdx = lastIdx;
              if (Number.isFinite(finalY) && lastIdx >= 0) {
                for (let i = 0; i <= lastIdx; i++) {
                  const row: any = (unratedJokesOverTimeData as any[])[i];
                  const yv = Number(row?.[seriesKey]);
                  if (Number.isFinite(yv) && yv === finalY) {
                    reachIdx = i;
                    break;
                  }
                }
              }
              return { finalY, reachIdx };
            };
            const sortSeriesKeysForRender = (keys: string[]) => {
              const enriched = keys.map(k => ({ k, ...computeSeriesPriority(k) }));
              enriched.sort((a, b) => {
                if (a.finalY !== b.finalY) return a.finalY - b.finalY;
                if (a.reachIdx !== b.reachIdx) return b.reachIdx - a.reachIdx;
                return a.k.localeCompare(b.k);
              });
              return enriched.map(x => x.k);
            };

            return (
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={unratedJokesOverTimeData} margin={{ top: 12, bottom: 20, left: 48, right: isExpanded ? 24 : 16 }}>
                   <CartesianGrid strokeDasharray="3 3" />
                   <XAxis dataKey="index" label={{ value: 'Batch Sequence', position: 'insideBottom', offset: -10 }} />
                   <YAxis
                     width={44}
                     allowDecimals={false}
                     domain={[
                       0,
                       (dataMax: number) => {
                         const m = Number.isFinite(dataMax) ? dataMax : 0;
                         return Math.max(1, Math.ceil(m * 1.1));
                       },
                     ]}
                     padding={{ top: 10, bottom: 4 }}
                     label={{ value: 'Unrated Jokes', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, dx: -10, dy: 20 }}
                   />
                   <Tooltip
                     shared={false}
                     content={(props: any) => {
                       const active = Boolean(props?.active);
                       const payload = Array.isArray(props?.payload) ? props.payload : [];
                       if (!active || payload.length === 0) return null;
                       const hoveredKey = hoveredUnratedSeriesKey;
                       const p =
                         (hoveredKey
                           ? payload.find((it: any) => String(it?.dataKey ?? '') === hoveredKey)
                           : undefined) ??
                         payload[0] ??
                         {};
                       const rawKey = String(p.dataKey ?? '');
                       const isR1 = rawKey.startsWith('r1-');
                       const isR2 = rawKey.startsWith('r2-');
                       const teamId = isR1 || isR2 ? rawKey.slice(3) : rawKey;
                       const roundLabel = isR1 ? 'Round 1' : isR2 ? 'Round 2' : '';
                       const teamName = String(teamNames[teamId] ?? `Team ${teamId}`);
                       const queueCount = Number(p.value ?? 0);
                       const label = Number(props?.label);
                       return (
                         <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
                           <div className="text-xs font-bold text-gray-500">Batch {Number.isFinite(label) ? label : ''}</div>
                           <div className="text-sm font-bold text-gray-900">{teamName}</div>
                           {roundLabel && <div className="text-xs font-bold text-gray-500">{roundLabel}</div>}
                           <div className="mt-1 text-sm text-gray-700">
                             <div className="flex justify-between gap-4">
                               <span className="font-medium">Unrated</span>
                               <span className="font-mono font-bold text-indigo-700">{Number.isFinite(queueCount) ? queueCount : 0}</span>
                             </div>
                           </div>
                         </div>
                       );
                     }}
                   />
                   {unratedTab === 'BOTH' ? (
                     <>
                       {sortSeriesKeysForRender(
                         visibleTeamIds.filter(tid => teamsWithUnratedR1.has(String(tid))).map(tid => `r1-${tid}`)
                       ).map((seriesKey) => {
                         const teamId = seriesKey.slice(3);
                         const color = colorForTeamId(teamId);
                         return (
                         <Line
                           key={seriesKey}
                           type="monotone"
                           dataKey={seriesKey}
                           name={`${teamNames[teamId] || `Team ${teamId}`} (R1)`}
                           stroke={color}
                           strokeWidth={2}
                           strokeOpacity={0.25}
                           strokeDasharray="6 4"
                           dot={false}
                           isAnimationActive={!isExpanded}
                           activeDot={hoveredUnratedSeriesKey === seriesKey ? { r: 4 } : false}
                           label={
                             isExpanded && shouldShowEndLabel(seriesKey)
                               ? makeEndLabel(seriesKey, seriesDisplayName(seriesKey), color)
                               : false
                           }
                           onMouseEnter={() => setHoveredUnratedSeriesKey(seriesKey)}
                           onMouseLeave={() => setHoveredUnratedSeriesKey(null)}
                         />
                         );
                       })}
                       {sortSeriesKeysForRender(
                         visibleTeamIds.filter(tid => teamsWithUnratedR2.has(String(tid))).map(tid => `r2-${tid}`)
                       ).map((seriesKey) => {
                         const teamId = seriesKey.slice(3);
                         const color = colorForTeamId(teamId);
                         return (
                         <Line
                           key={seriesKey}
                           type="monotone"
                           dataKey={seriesKey}
                           name={`${teamNames[teamId] || `Team ${teamId}`} (R2)`}
                           stroke={color}
                           strokeWidth={3}
                           strokeOpacity={1}
                           dot={false}
                           isAnimationActive={!isExpanded}
                           activeDot={hoveredUnratedSeriesKey === seriesKey ? { r: 4 } : false}
                           label={
                             isExpanded && shouldShowEndLabel(seriesKey)
                               ? makeEndLabel(seriesKey, seriesDisplayName(seriesKey), color)
                               : false
                           }
                           onMouseEnter={() => setHoveredUnratedSeriesKey(seriesKey)}
                           onMouseLeave={() => setHoveredUnratedSeriesKey(null)}
                         />
                         );
                       })}
                     </>
                   ) : (
                     <>
                   {sortSeriesKeysForRender(
                      (unratedTab === 'R1'
                        ? teamIds.filter(tid => teamsWithUnratedR1.has(String(tid)))
                        : unratedTab === 'R2'
                          ? teamIds.filter(tid => teamsWithUnratedR2.has(String(tid)))
                          : teamIds
                      ).map(tid => String(tid))
                    ).map((teamId) => {
                      const color = colorForTeamId(teamId);
                      return (
                      <Line
                        key={teamId}
                        type="monotone"
                        dataKey={teamId}
                        name={teamNames[teamId] || `Team ${teamId}`}
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={!isExpanded}
                        activeDot={hoveredUnratedSeriesKey === String(teamId) ? { r: 4 } : false}
                        label={
                          isExpanded && shouldShowEndLabel(String(teamId))
                            ? makeEndLabel(String(teamId), seriesDisplayName(String(teamId)), color)
                            : false
                        }
                        onMouseEnter={() => setHoveredUnratedSeriesKey(String(teamId))}
                        onMouseLeave={() => setHoveredUnratedSeriesKey(null)}
                      />
                      );
                    })}
                     </>
                   )}
                 </LineChart>
               </ResponsiveContainer>
            );
        }
        default: return null;
    }
  };


  return (
    <RoleLayout>
      <div className="space-y-8">
        {/* Reset Confirm Modal */}
        <Modal
          isOpen={showResetConfirm}
          onClose={() => setShowResetConfirm(false)}
          title="Reset Game"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              This will clear all game data. Are you sure you want to reset?
            </p>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowResetConfirm(false)} className="w-full">
                Cancel
              </Button>
              <Button
                variant="danger"
                className="w-full font-bold"
                onClick={async () => {
                  setShowResetConfirm(false);
                  const ok = await resetGame();
                  if (!ok) return;

                  // Reset leaderboard UI state (data is cleared in resetGame()).
                  leaderboardRoundTouchedRef.current = false;
                  setLeaderboardRoundTab(1);
                  setLeaderboardSortKey('profit');
                  setLeaderboardSortDir('desc');
                  setRankUpTeamIds([]);
                  prevLeaderboardPosRef.current = null;
                  (Object.values(rankUpTimersRef.current) as number[]).forEach(t => window.clearTimeout(t));
                  rankUpTimersRef.current = {};

                  // Reset local chart series derived from leaderboard changes.
                  setLocalSalesOverTime([]);
                  lastSalesTotalsRef.current = null;
                  salesEventIndexRef.current = 0;
                  setExpandedChart(null);
                }}
              >
                Yes, Reset
              </Button>
            </div>
          </div>
        </Modal>

        {/* End Round 1 Confirm Modal */}
        <Modal
          isOpen={showEndRound1Confirm}
          onClose={() => setShowEndRound1Confirm(false)}
          title="End Round 1"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              End Round 1 now? This will advance the game to Round 2.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowEndRound1Confirm(false)} className="w-full">
                Cancel
              </Button>
              <Button
                variant="danger"
                className="w-full font-bold"
                onClick={() => {
                  setShowEndRound1Confirm(false);
                  endRound();
                }}
              >
                Yes, End Round
              </Button>
            </div>
          </div>
        </Modal>
        
        {/* Expanded Chart Modal */}
        <Modal 
            isOpen={!!expandedChart} 
            onClose={() => setExpandedChart(null)} 
            title={
              expandedChart === 'leaderboard'
                ? 'Leaderboard'
                : expandedChart === 'sales'
                  ? 'Cumulative Sales Over Time'
                  : expandedChart === 'sequence_quality'
                    ? 'Batch Sequence vs Quality'
                    : expandedChart === 'unrated_jokes'
                      ? 'Unrated Jokes Over Time'
                      : 'Expanded'
            }
            maxWidth="max-w-[90vw]"
        >
            {expandedChart === 'leaderboard' ? (
              <div className="h-[75vh] w-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
                      {[1, 2].map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => {
                            leaderboardRoundTouchedRef.current = true;
                            setLeaderboardRoundTab(r as 1 | 2);
                          }}
                          className={`px-3 py-1.5 rounded text-sm font-bold ${
                            leaderboardRoundTab === r ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                          }`}
                          title={r === 1 ? 'Round 1 leaderboard' : 'Round 2 leaderboard'}
                        >
                          {r === 1 ? 'Round 1' : 'Round 2'}
                        </button>
                      ))}
                    </div>
                  <div className="flex items-center space-x-2 bg-slate-100 px-4 py-2 rounded-lg text-slate-700 font-mono text-xl">
                    <Clock size={20} />
                    <span>{formatTime(config.elapsedTime)}</span>
                  </div>
                </div>
                {renderLeaderboardTable({ maxHeightClass: 'max-h-[65vh]', isExpanded: true })}
              </div>
            ) : (
            <div className="h-[75vh] w-full flex flex-col">
              {(expandedChart === 'sales' || expandedChart === 'sequence_quality' || expandedChart === 'unrated_jokes') && (
                <div className="mb-3 flex justify-end items-center gap-4 pr-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Team Filter:</span>
                    <select
                      value={
                        expandedChart === 'sales'
                          ? salesTeamFilter
                          : expandedChart === 'sequence_quality'
                            ? sequenceTeamFilter
                            : unratedTeamFilter
                      }
                      onChange={(e) => {
                        if (expandedChart === 'sales') setSalesTeamFilter(e.target.value);
                        else if (expandedChart === 'sequence_quality') setSequenceTeamFilter(e.target.value);
                        else setUnratedTeamFilter(e.target.value);
                      }}
                      className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-700 hover:border-gray-300 focus:outline-none"
                    >
                      <option value="ALL">All Teams</option>
                      {visibleTeamIds.map(tid => (
                        <option key={tid} value={tid}>{teamNames[tid] || `Team ${tid}`}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
                    {(['R1', 'R2', 'BOTH'] as const).map(k => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          if (expandedChart === 'sales') setSalesTab(k);
                          else if (expandedChart === 'sequence_quality') setSequenceTab(k);
                          else setUnratedTab(k);
                        }}
                        className={`px-3 py-1.5 rounded text-sm font-bold ${
                          (expandedChart === 'sales'
                            ? salesTab
                            : expandedChart === 'sequence_quality'
                              ? sequenceTab
                              : unratedTab
                          ) === k
                            ? 'bg-gray-900 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                        title={k === 'BOTH' ? 'Compare both rounds' : (k === 'R1' ? 'Round 1' : 'Round 2')}
                      >
                        {k === 'R1' ? 'Round 1' : k === 'R2' ? 'Round 2' : 'Compare Rounds'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex-1">
                {expandedChart && renderChart(expandedChart, { isExpanded: true })}
              </div>
            </div>
            )}
        </Modal>

        {/* Lobby Management Panel */}
        {config.status === 'LOBBY' && (
            <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center">
                            <Users className="mr-2" /> Lobby Management
                        </h2>
                        <p className="text-sm text-gray-600 mt-1">Wait for all participants to join before forming teams.</p>
                        <div className="flex gap-4 mt-4">
                            <div className="bg-white px-4 py-3 rounded-lg border shadow-sm text-center min-w-[140px]">
                                <span className="block text-4xl font-extrabold text-blue-600">{connectedPairs}</span>
                                <span className="text-xs uppercase font-bold text-gray-500 tracking-wider">Total Pairs</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 w-full md:w-auto bg-white p-4 rounded shadow-sm border border-gray-200 min-w-[300px]">
                        <label className="text-sm font-semibold text-gray-700">Select Customer Pairs:</label>
                        <select 
                            className="p-2 border rounded bg-gray-50 text-gray-800 font-medium w-full"
                            value={selectedCustomerCount ?? ''}
                            onChange={(e) => setSelectedCustomerCount(Number(e.target.value))}
                        >
                            <option value="">-- Choose Valid Count --</option>
                            {validCustomerOptions.length === 0 && <option disabled>Waiting for more pairs...</option>}
                            {validCustomerOptions.map(opt => {
                                const remaining = connectedPairs - opt;
                                return (
                                    <option key={opt} value={opt}>
                                        {opt} Customer Pairs ({remaining} Prod. Pairs &rarr; {remaining/2} Teams)
                                    </option>
                                );
                            })}
                        </select>
                        <Button 
                            onClick={handleFormTeams} 
                            disabled={selectedCustomerCount === null}
                            className="w-full flex justify-center items-center gap-2"
                        >
                            <CheckCircle size={16} /> Auto-Assign
                        </Button>
                    </div>
                </div>
            </Card>
        )}

        {/* Top Controls Bar */}
        <Card className="border-t-4 border-t-blue-500">
          <div className="flex flex-col space-y-4">
            {/* Row 1: Game Flow */}
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center space-x-4">
                 <div className="flex items-center bg-gray-100 rounded-lg p-1.5">
                   <button 
                     className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${config.round === 1 ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
                     onClick={() => setRound(1)}
                   >
                     Round 1
                   </button>
                   <button 
                     className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${config.round === 2 ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
                     onClick={() => setRound(2)}
                   >
                     Round 2
                   </button>
                 </div>
                 
                 <div className="flex items-center space-x-2 bg-slate-100 px-4 py-2 rounded-lg text-slate-700 font-mono text-xl">
                    <Clock size={20} />
                    <span>{formatTime(config.elapsedTime)}</span>
                 </div>
              </div>

              <div className="flex items-center space-x-2">
                 {!config.isActive ? (
                 <Button 
                    onClick={async () => {
                      // When starting Round 2, force-close team popups and sync the toggle state.
                      if (config.round === 2) {
                        await toggleTeamPopup(false);
                      }
                      await setGameActive(true);
                    }}
                     variant="success"
                   className="w-32 flex justify-center items-center gap-2"
                 >
                     <Play size={16} /> {shouldShowRound2Resume ? 'Resume' : 'Start'}
                 </Button>
                 ) : (
                   <Button
                     disabled
                     variant="secondary"
                     className="w-32 flex justify-center items-center gap-2"
                     title="Round is active"
                   >
                     Active
                   </Button>
                 )}
                 
                 <Button 
                  onClick={async () => {
                    if (config.round === 1) {
                      setShowEndRound1Confirm(true);
                      return;
                    }
                    // Round 2 end => immediately show "Resume" (backend supports resuming Round 2).
                    if (config.round === 2) setRound2ResumeHint(true);
                    await endRound();
                  }}
                   disabled={!config.isActive}
                   variant="danger"
                   className="bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:bg-gray-400 disabled:cursor-not-allowed"
                 >
                   <StopCircle size={16} className="mr-1 inline" /> End Round
                 </Button>
                 
                 <div className="w-px h-8 bg-gray-300 mx-2"></div>
                 
                <Button onClick={() => setShowResetConfirm(true)} variant="danger" className="p-2" title="Reset Game (Clear All)">
                   <RefreshCw size={16} />
                 </Button>
                 
              </div>
            </div>

            {/* Row 2: Round 2 Controls */}
            {config.round === 2 && (
              <div className="flex items-center justify-center p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                <span className="text-indigo-900 font-medium mr-4">Round 2 Setup:</span>
                <Button 
                   onClick={() => toggleTeamPopup(!config.showTeamPopup)}
                   variant={config.showTeamPopup ? 'danger' : 'primary'}
                   className="shadow-sm"
                >
                  {config.showTeamPopup ? 'Hide Team Members (Close Popups)' : 'Show Team Members (Open Popups)'}
                </Button>
              </div>
            )}
            
            {/* Row 3: Configurations (single line, wrap on narrow screens) */}
            <div className="flex flex-wrap items-center gap-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="flex items-center space-x-3">
                <Settings size={16} className="text-gray-400" />
                <span className="text-sm font-bold text-gray-700 uppercase">Config:</span>
              </div>
              <div className="flex items-center space-x-3">
                <label className="text-sm text-gray-600 whitespace-nowrap">R1 Batch Size:</label>
                <input
                  type="number"
                  value={localBatchSize}
                  onChange={e => setLocalBatchSize(Number(e.target.value))}
                  disabled={!canEditBatchSize}
                  className={`w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${!canEditBatchSize ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
              <div className="flex items-center space-x-3">
                <label className="text-sm text-gray-600 whitespace-nowrap">Cust. Budget:</label>
                <input
                  type="number"
                  value={localBudget}
                  onChange={e => setLocalBudget(Number(e.target.value))}
                  disabled={!canEditBudget}
                  className={`w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${!canEditBudget ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
              <div className="flex items-center space-x-3">
                <label className="text-sm text-gray-600 whitespace-nowrap">Market Price (p):</label>
                <input
                  type="number"
                  step="0.10"
                  min="0"
                  value={localMarketPrice}
                  onChange={e => setLocalMarketPrice(Number(e.target.value))}
                  disabled={!canEditPricing}
                  className={`w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${!canEditPricing ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
              <div className="flex items-center space-x-3">
                <label className="text-sm text-gray-600 whitespace-nowrap">Cost of Publishing (c):</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={localCostOfPublishing}
                  onChange={e => setLocalCostOfPublishing(Number(e.target.value))}
                  disabled={!canEditPricing}
                  className={`w-20 p-1 border border-gray-300 rounded !text-center appearance-none [-moz-appearance:textfield] bg-white text-black ${!canEditPricing ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
              <Button
                type="button"
                onClick={handleUpdateSettings}
                variant="secondary"
                disabled={!hasPendingConfigChanges}
                className={
                  `px-4 py-1 text-xs font-semibold transition-colors ` +
                  (hasPendingConfigChanges
                    ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 ring-2 ring-amber-200'
                    : 'opacity-60')
                }
              >
                Apply
              </Button>
            </div>
          </div>
        </Card>

        {/* Dashboard Charts */}
        {hiddenCharts.length > 0 && (
          <div className="flex justify-end">
            <button
              onClick={restoreAllCharts}
              className="text-xs font-bold text-blue-600 underline hover:text-blue-700"
              title="Restore all charts for this session"
            >
              Show all charts
            </button>
          </div>
        )}


        {/* Dashboard grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Team Management (full width) */}
          <Card className="xl:col-span-2 border-t-4 border-t-purple-500" title="Team Management (Drag to Move, Click to Switch Role)">
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Two columns of production teams (JM/QC) */}
                  {[0, 1].map((colIdx) => {
                    const colTeamIds = visibleTeamIds.filter((_, idx) => idx % 2 === colIdx);
                    return (
                      <div key={colIdx} className="space-y-3">
                        {colTeamIds.map((teamId) => (
                          <div
                            key={teamId}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, 'TEAM', teamId)}
                            className="rounded-lg border border-gray-200 bg-white p-3 hover:bg-blue-50/30 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <input
                                  type="text"
                                  value={teamNames[teamId]}
                                  onChange={(e) => updateTeamName(teamId, e.target.value)}
                                  className="font-bold text-gray-800 bg-transparent border-b border-dashed border-gray-300 focus:border-blue-500 outline-none w-full"
                                />
                                <span className="text-xs text-gray-400 block mt-1">ID: {teamId}</span>
                              </div>
                              {/* JM/QC Team label removed for cleaner UI */}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {(rosterByTeam[teamId]?.length ?? 0) > 0 ? (
                                rosterByTeam[teamId]!.map((u) => (
                                  <div
                                    key={u.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, u.id)}
                                    onClick={() => toggleUserRole(u.id, u.role)}
                                    title="Drag to move, Click to toggle Role"
                                    className={`cursor-pointer inline-flex items-center px-2 py-1 rounded text-xs border hover:shadow-md transition-all active:scale-95 select-none ${
                                      u.role === Role.JOKE_MAKER
                                        ? 'bg-blue-50 text-blue-700 border-blue-100'
                                        : 'bg-purple-50 text-purple-700 border-purple-100'
                                    }`}
                                  >
                                    <GripVertical size={10} className="mr-1 opacity-50" />
                                    <span className="font-bold">{u.name}</span>
                                    <span className="ml-1 opacity-70">({u.role === Role.JOKE_MAKER ? 'JM' : 'QC'})</span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleDeleteUser(u.id, u.name);
                                      }}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      }}
                                      disabled={deletingUserIds.includes(u.id)}
                                      className="ml-2 p-1 rounded hover:bg-white/60 text-gray-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                      title="Delete user"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <span className="text-gray-400 text-xs italic">No members. Drag users here.</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}

                {/* Customers column */}
                <div
                  className="rounded-lg border border-amber-200 bg-amber-50/40 p-3"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, 'CUSTOMER')}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-amber-800">Customers</div>
                    <div className="text-xs font-bold text-amber-700/70">{roster.filter(u => u.role === Role.CUSTOMER).length}</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {roster.filter(u => u.role === Role.CUSTOMER).map(u => (
                      <div
                        key={u.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, u.id)}
                        className="cursor-move inline-flex items-center px-2 py-1 rounded text-xs bg-amber-100 text-amber-800 border border-amber-200 hover:shadow-md"
                      >
                        <GripVertical size={10} className="mr-1 opacity-50" />
                        {u.name}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteUser(u.id, u.name);
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          disabled={deletingUserIds.includes(u.id)}
                          className="ml-2 p-1 rounded hover:bg-white/60 text-amber-700/70 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete user"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {roster.filter(u => u.role === Role.CUSTOMER).length === 0 && (
                      <span className="text-gray-400 text-xs italic">Drag users here to make them Customers</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Lobby / Unassigned (full width) */}
              <div
                className="rounded-lg border border-gray-200 bg-gray-100/50 p-3"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'LOBBY')}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-gray-600">Unassigned (Lobby)</div>
                  <div className="text-xs font-bold text-gray-500">{roster.filter(u => u.role === Role.UNASSIGNED).length}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {roster.filter(u => u.role === Role.UNASSIGNED).map(u => (
                    <div
                      key={u.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, u.id)}
                      className="cursor-move inline-flex items-center px-2 py-1 rounded text-xs bg-gray-200 text-gray-800 border border-gray-300 hover:shadow-md"
                    >
                      <GripVertical size={10} className="mr-1 opacity-50" />
                      {u.name}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteUser(u.id, u.name);
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        disabled={deletingUserIds.includes(u.id)}
                        className="ml-2 p-1 rounded hover:bg-white/60 text-gray-600 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete user"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {roster.filter(u => u.role === Role.UNASSIGNED).length === 0 && (
                    <span className="text-gray-400 text-xs italic">All users assigned</span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Leaderboard (full width) */}
          <Card
            className="xl:col-span-2"
            title="Leaderboard"
            action={
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
                  {[1, 2].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        leaderboardRoundTouchedRef.current = true;
                        setLeaderboardRoundTab(r as 1 | 2);
                      }}
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        leaderboardRoundTab === r ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                      title={r === 1 ? 'Round 1 leaderboard' : 'Round 2 leaderboard'}
                    >
                      {r === 1 ? 'R1' : 'R2'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setExpandedChart('leaderboard')}
                  className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                  title="Expand leaderboard"
                >
                  <Maximize2 size={18} />
                </button>
              </div>
            }
          >
            {renderLeaderboardTable({ maxHeightClass: 'max-h-80' })}
          </Card>
          
          {!isChartHidden('sales') && (
            <Card
              title="Cumulative Sales Over Time"
              action={
                <div className="flex items-center gap-2">
                  <select
                    value={salesTeamFilter}
                    onChange={(e) => setSalesTeamFilter(e.target.value)}
                    className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-700 hover:border-gray-300 focus:outline-none"
                    title="Filter by Team"
                  >
                    <option value="ALL">All Teams</option>
                    {visibleTeamIds.map(tid => (
                      <option key={tid} value={tid}>{teamNames[tid] || `Team ${tid}`}</option>
                    ))}
                  </select>
                  <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
                    {(['R1', 'R2', 'BOTH'] as const).map(k => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setSalesTab(k)}
                        className={`px-2 py-1 rounded text-xs font-bold ${
                          salesTab === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                        title={k === 'BOTH' ? 'Compare both rounds' : (k === 'R1' ? 'Round 1' : 'Round 2')}
                      >
                        {k === 'R1' ? 'R1' : k === 'R2' ? 'R2' : 'Both'}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setExpandedChart('sales')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                    title="Expand chart"
                  >
                    <Maximize2 size={18} />
                  </button>
                  <button
                    onClick={() => hideChart('sales')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                    title="Hide chart (this session only)"
                  >
                    <X size={18} />
                  </button>
                </div>
              }
            >
              <div className="h-72 w-full">
                {renderChart('sales')}
              </div>
            </Card>
          )}

          {/* 3) Batch Sequence vs Quality */}
          {!isChartHidden('sequence_quality') && (
            <Card
              title="Batch Sequence vs Quality"
              action={
                <div className="flex items-center gap-2">
                  <select
                    value={sequenceTeamFilter}
                    onChange={(e) => setSequenceTeamFilter(e.target.value)}
                    className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-700 hover:border-gray-300 focus:outline-none"
                    title="Filter by Team"
                  >
                    <option value="ALL">All Teams</option>
                    {visibleTeamIds.map(tid => (
                      <option key={tid} value={tid}>{teamNames[tid] || `Team ${tid}`}</option>
                    ))}
                  </select>
                  <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
                    {(['R1', 'R2', 'BOTH'] as const).map(k => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setSequenceTab(k)}
                        className={`px-2 py-1 rounded text-xs font-bold ${
                          sequenceTab === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                        title={k === 'BOTH' ? 'Compare both rounds' : (k === 'R1' ? 'Round 1' : 'Round 2')}
                      >
                        {k === 'R1' ? 'R1' : k === 'R2' ? 'R2' : 'Both'}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setExpandedChart('sequence_quality')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                    title="Expand chart"
                  >
                    <Maximize2 size={18} />
                  </button>
                  <button
                    onClick={() => hideChart('sequence_quality')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                    title="Hide chart (this session only)"
                  >
                    <X size={18} />
                  </button>
                </div>
              }
            >
              <div className="h-72 w-full">
                {renderChart('sequence_quality')}
              </div>
            </Card>
          )}

          {/* Wasted Jokes / Rejection Rate (full width) - R1/R2 side by side */}
          <Card
            title="Wasted Jokes"
            action={
              <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
                <button
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    wasteChartMode === 'count' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  onClick={() => setWasteChartMode('count')}
                >
                  Count
                </button>
                <button
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    wasteChartMode === 'rate' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  onClick={() => setWasteChartMode('rate')}
                >
                  Rejection Rate
                </button>
              </div>
            }
            className="xl:col-span-2"
          >
            <div className="h-80">
              <ResponsiveContainer>
                <BarChart
                  data={wasteChartData.map(item => ({
                    team: item.team_name,
                    R1: wasteChartMode === 'count' ? item.r1_wasted : item.r1_rate,
                    R2: wasteChartMode === 'count' ? item.r2_wasted : item.r2_rate,
                  }))}
                  margin={{ top: 10, right: 20, left: wasteChartMode === 'rate' ? 50 : 30, bottom: 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="team" angle={-15} textAnchor="end" height={50} />
                  <YAxis
                    label={{
                      value: wasteChartMode === 'rate' ? 'Rejection Rate' : 'Wasted Jokes',
                      angle: -90,
                      position: 'insideLeft',
                      style: { textAnchor: 'middle' },
                      dx: wasteChartMode === 'rate' ? -15 : -5,
                    }}
                    tickFormatter={(v) => wasteChartMode === 'rate' ? `${Math.round(v * 100)}%` : v}
                    width={wasteChartMode === 'rate' ? 45 : 35}
                    domain={(() => {
                      const maxVal = Math.max(
                        ...wasteChartData.map(d => wasteChartMode === 'count' ? Math.max(d.r1_wasted, d.r2_wasted) : Math.max(d.r1_rate, d.r2_rate)),
                        0
                      );
                      if (maxVal <= 0) return wasteChartMode === 'rate' ? [0, 0.25] : [0, 25];
                      const targetMax = maxVal * 1.25;
                      const step = wasteChartMode === 'rate' ? 0.05 : 5;
                      const roundedMax = Math.ceil(targetMax / step) * step;
                      return [0, roundedMax];
                    })()}
                    ticks={(() => {
                      const maxVal = Math.max(
                        ...wasteChartData.map(d => wasteChartMode === 'count' ? Math.max(d.r1_wasted, d.r2_wasted) : Math.max(d.r1_rate, d.r2_rate)),
                        0
                      );
                      const max = (() => {
                        if (maxVal <= 0) return wasteChartMode === 'rate' ? 0.25 : 25;
                        const targetMax = maxVal * 1.25;
                        const step = wasteChartMode === 'rate' ? 0.05 : 5;
                        return Math.ceil(targetMax / step) * step;
                      })();
                      const step = wasteChartMode === 'rate' ? 0.05 : 5;
                      const ticks: number[] = [];
                      for (let t = 0; t <= max; t += step) ticks.push(t);
                      return ticks;
                    })()}
                  />
                  <Tooltip formatter={(v: any) => wasteChartMode === 'rate' ? `${(Number(v) * 100).toFixed(1)}%` : v} />
                  <Legend />
                  <Bar dataKey="R1" name="Round 1" fill="#3B82F6" />
                  <Bar dataKey="R2" name="Round 2" fill="#F97316" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Scatter Plots */}
          <Card title="Scatter Plots" className="xl:col-span-2">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 uppercase">Round</span>
                <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
                  {(['R1', 'R2', 'BOTH'] as const).map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setScatterRoundMode(k)}
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        scatterRoundMode === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                      title={k === 'BOTH' ? 'Compare both rounds' : (k === 'R1' ? 'Round 1' : 'Round 2')}
                    >
                      {k === 'R1' ? 'R1' : k === 'R2' ? 'R2' : 'Both'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 uppercase">X-Axis</span>
                <select
                  className="border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                  value={scatterXMetric}
                  onChange={(e) => setScatterXMetric(e.target.value)}
                >
                  {scatterBaseMetrics.map(m => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 uppercase">Y-Axis</span>
                <div className="inline-flex items-center gap-2">
                  <select
                    className="border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                    value={scatterYMode}
                    onChange={(e) => setScatterYMode(e.target.value as 'metric' | 'ratio')}
                  >
                    <option value="metric">Metric</option>
                    <option value="ratio">Ratio</option>
                  </select>
                  {scatterYMode === 'metric' ? (
                    <select
                      className="border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                      value={scatterYMetric}
                      onChange={(e) => setScatterYMetric(e.target.value)}
                    >
                      {scatterMetrics.map(m => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <select
                        className="border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                        value={scatterNumerator}
                        onChange={(e) => setScatterNumerator(e.target.value)}
                      >
                        {scatterMetrics.map(m => (
                          <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                      </select>
                      <span className="text-sm text-slate-500">/</span>
                      <select
                        className="border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                        value={scatterDenominator}
                        onChange={(e) => setScatterDenominator(e.target.value)}
                      >
                        {scatterMetrics.map(m => (
                          <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="h-80">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 10, right: 20, left: 44, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="x"
                    label={{
                      value: metricLabel(scatterXMetric),
                      angle: 0,
                      position: 'insideBottom',
                      offset: -5,
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="y"
                    width={50}
                    tickMargin={6}
                    padding={{ top: 10, bottom: 10 }}
                    label={{
                      value: yAxisLabel,
                      angle: -90,
                      position: 'insideLeft',
                      style: { textAnchor: 'middle' },
                      dx: -20,
                    }}
                    domain={isRatioYAxis ? [0, 1] : undefined}
                    ticks={isRatioYAxis ? [0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1] : undefined}
                    tickFormatter={(v) => {
                      if (isRatioYAxis) {
                        return [0.2, 0.4, 0.6, 0.8].includes(Number(v)) ? v.toFixed(1) : '';
                      }
                      // For integer metrics, show integers; for decimals, show 2 places
                      return isYMetricInteger ? Math.round(v).toString() : Number(v).toFixed(2);
                    }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={(props: any) => {
                      const { active, payload } = props;
                      if (!active || !payload || payload.length === 0) return null;
                      const p = payload[0]?.payload;
                      if (!p) return null;
                      const xFormatted = formatScatterValue(p.xRaw, isXMetricInteger);
                      const yFormatted = formatScatterValue(p.yRaw, isYMetricInteger);
                      const roundInfo = scatterRoundMode === 'BOTH' ? ` (${p.round})` : '';
                      return (
                        <div className="bg-white border border-gray-200 rounded shadow-lg px-3 py-2 text-sm">
                          <div className="font-semibold text-gray-900 mb-1">{p.team_name}{roundInfo}</div>
                          <div className="text-gray-600">
                            <span className="font-medium">{p.xLabel}:</span> {xFormatted}
                          </div>
                          <div className="text-gray-600">
                            <span className="font-medium">{p.yLabel}:</span> {yFormatted}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData} shape={renderScatterDot}>
                    <LabelList content={renderScatterLabel} />
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {!isChartHidden('unrated_jokes') && (
            <Card
              title="Unrated Jokes Over Time"
              className="xl:col-span-2"
              action={
                <div className="flex items-center gap-2">
                  <select
                    value={unratedTeamFilter}
                    onChange={(e) => setUnratedTeamFilter(e.target.value)}
                    className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-700 hover:border-gray-300 focus:outline-none"
                    title="Filter by Team"
                  >
                    <option value="ALL">All Teams</option>
                    {visibleTeamIds.map(tid => (
                      <option key={tid} value={tid}>{teamNames[tid] || `Team ${tid}`}</option>
                    ))}
                  </select>
                  <div className="flex items-center rounded-md border border-gray-200 bg-white p-0.5">
                    {(['R1', 'R2', 'BOTH'] as const).map(k => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setUnratedTab(k)}
                        className={`px-2 py-1 rounded text-xs font-bold ${
                          unratedTab === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                        title={k === 'BOTH' ? 'Compare both rounds' : (k === 'R1' ? 'Round 1' : 'Round 2')}
                      >
                        {k === 'R1' ? 'R1' : k === 'R2' ? 'R2' : 'Both'}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setExpandedChart('unrated_jokes')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                    title="Expand chart"
                  >
                    <Maximize2 size={18} />
                  </button>
                  <button
                    onClick={() => hideChart('unrated_jokes')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                    title="Hide chart (this session only)"
                  >
                    <X size={18} />
                  </button>
                </div>
              }
            >
              <div className="h-72 w-full">
                {renderChart('unrated_jokes')}
              </div>
            </Card>
          )}

          {/* Live Market (Instructor view) */}
          <Card title="Live Market" className="xl:col-span-2 mb-8">
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto pb-6">
              <table className="min-w-full text-sm table-fixed">
                <thead className="sticky top-0 bg-white shadow-sm z-10">
                  <tr className="bg-gray-50 border-b">
                    <th className="px-3 py-2 text-left font-medium text-gray-500 w-[72%]">
                      <button 
                        type="button"
                        onClick={() => {
                          if (marketSortKey === 'id') {
                            setMarketSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
                          } else {
                            setMarketSortKey('id');
                            setMarketSortDir('desc');
                          }
                        }}
                        className="inline-flex items-center hover:text-gray-800"
                      >
                        Joke
                        {marketSortKey === 'id' && (
                          <span className="ml-1">{marketSortDir === 'desc' ? '▼' : '▲'}</span>
                        )}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 w-[14%]">Team</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500 w-[14%]">
                      <button
                        type="button"
                        onClick={() => {
                          if (marketSortKey === 'sales') {
                            setMarketSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
                          } else {
                            setMarketSortKey('sales');
                            setMarketSortDir('desc');
                          }
                        }}
                        className="inline-flex items-center justify-end w-full hover:text-gray-800"
                        title="Sort by total sales (purchase count)"
                      >
                        <span>Total Sales</span>
                        <span className="ml-1 w-3 text-center">
                          {marketSortKey === 'sales' ? (marketSortDir === 'desc' ? '▼' : '▲') : ''}
                        </span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(() => {
                    const rows = (marketItems ?? []).map(it => ({
                      joke_id: Number((it as any).joke_id),
                      joke_title: String((it as any).joke_title ?? '').trim(),
                      joke_text: String((it as any).joke_text ?? ''),
                      team_id: Number((it as any).team?.id ?? 0),
                      team_name: String((it as any).team?.name ?? ''),
                      bought_count: Number((it as any).bought_count ?? (it as any).boughtCount ?? 0),
                      sold_jokes_count: Number((it as any).team?.sold_jokes_count ?? 0),
                      accepted_jokes: Number((it as any).team?.accepted_jokes ?? 0),
                    }));

                    rows.sort((a, b) => {
                      const dir = marketSortDir === 'asc' ? 1 : -1;
                      if (marketSortKey === 'sales') {
                        // Secondary sort by ID desc if sales are equal
                        if (a.bought_count === b.bought_count) {
                            return b.joke_id - a.joke_id;
                        }
                        return dir * (a.bought_count - b.bought_count);
                      }
                      // Default sort by ID (Newest = desc)
                      return dir * (a.joke_id - b.joke_id);
                    });

                    const pageSize = 20;
                    const [page] = [Math.max(1, Math.min(pageSize, pageSize))]; // placeholder to avoid lint
                    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
                    const [currentPage, setCurrentPage] = React.useState(1);
                    const paged = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

                    if (rows.length === 0) {
                      return (
                        <tr>
                          <td colSpan={3} className="px-3 py-6 text-center text-gray-400 italic">
                            Market is empty.
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <>
                        {paged.map(r => {
                      const id = String(r.joke_id);
                      const isExpanded = Boolean(expandedMarketJokeIds[id]);
                      const isLong = r.joke_text.trim().length > 180;
                      return (
                        <tr key={id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-900">
                            <div className="font-extrabold text-sm text-blue-900 mb-1">
                              {r.joke_title || 'Untitled Joke'}
                            </div>
                            <div className={`whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-3'}`}>
                              {r.joke_text}
                            </div>
                            {isLong && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedMarketJokeIds(prev => ({ ...prev, [id]: !Boolean(prev[id]) }))
                                }
                                className="mt-1 text-xs font-bold text-blue-600 underline hover:text-blue-700"
                              >
                                {isExpanded ? 'Show less' : 'Show more'}
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-800 whitespace-nowrap truncate align-top">
                            <div>
                              {r.team_name ? r.team_name : `Team ${r.team_id || ''}`}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5" title="Team Stats: Sold / Accepted">
                              Sold: {r.sold_jokes_count}/{r.accepted_jokes}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-900 align-top">
                            {r.bought_count}
                          </td>
                        </tr>
                        );
                        })}
                        {totalPages > 1 && (
                          <tr>
                            <td colSpan={3} className="px-3 py-3">
                              <div className="flex items-center justify-between text-xs text-gray-600">
                                <button
                                  type="button"
                                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                  disabled={currentPage === 1}
                                  className="px-2 py-1 rounded border border-gray-300 bg-white disabled:opacity-50"
                                >
                                  Prev
                                </button>
                                <span className="font-semibold">
                                  Page {currentPage} / {totalPages}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                  disabled={currentPage === totalPages}
                                  className="px-2 py-1 rounded border border-gray-300 bg-white disabled:opacity-50"
                                >
                                  Next
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </Card>

        </div>
      </div>
    </RoleLayout>
  );
};

export default Instructor;
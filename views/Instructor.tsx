import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../context';
import { Button, Card, RoleLayout, Modal } from '../components';
import { Play, RefreshCw, Settings, Clock, StopCircle, GripVertical, Users, CheckCircle, Maximize2, X, Trash2 } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, ScatterChart, Scatter, Legend
} from 'recharts';
import { Role } from '../types';

// Expanded Palette for more teams
const PALETTE = [
    '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', 
    '#6366F1', '#EC4899', '#14B8A6', '#F97316', '#64748B',
    '#0EA5E9', '#A855F7', '#22C55E', '#EAB308', '#F43F5E'
];

const INSTRUCTOR_HIDDEN_CHARTS_SESSION_KEY = 'joke_factory_instructor_hidden_charts_v1';
const CHART_KEYS = ['sales', 'sequence_quality', 'size_quality'] as const;
type ChartKey = typeof CHART_KEYS[number];

const Instructor: React.FC = () => {
  const { 
    config, updateConfig, setGameActive, setRound, resetGame, toggleTeamPopup,
    roster, teamNames, updateTeamName, updateUser,
    calculateValidCustomerOptions, formTeams, resetToLobby
    , instructorStats
    , endRound
    , deleteUser
  } = useGame();

  const [localBatchSize, setLocalBatchSize] = useState(config.round1BatchSize);
  const [localBudget, setLocalBudget] = useState(config.customerBudget);
  const [selectedCustomerCount, setSelectedCustomerCount] = useState<number | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Expanded Chart State
  const [expandedChart, setExpandedChart] = useState<string | null>(null);

  // Session-only chart visibility (defaults back on new browser session)
  const [hiddenCharts, setHiddenCharts] = useState<ChartKey[]>([]);
  const [deletingUserIds, setDeletingUserIds] = useState<string[]>([]);
  const [leaderboardSortKey, setLeaderboardSortKey] = useState<
    'team' | 'rated_batches' | 'accepted_jokes' | 'total_jokes' | 'avg_score_overall' | 'total_sales'
  >('total_sales');
  const [leaderboardSortDir, setLeaderboardSortDir] = useState<'asc' | 'desc'>('desc');
  const [rankUpTeamIds, setRankUpTeamIds] = useState<string[]>([]);
  const prevLeaderboardPosRef = useRef<Record<string, number> | null>(null);
  const rankUpTimersRef = useRef<Record<string, number>>({});
  const [localSalesOverTime, setLocalSalesOverTime] = useState<
    Array<{ event_index: number; timestamp: string; team_id: number; team_name: string; total_sales: number }>
  >([]);
  const lastSalesTotalsRef = useRef<Record<string, number> | null>(null);
  const salesEventIndexRef = useRef<number>(0);

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
  // - In round 2: only customer budget is editable.
  const canEditBatchSize = !config.isActive && config.round === 1;
  const canEditBudget = !config.isActive && (config.round === 1 || config.round === 2);

  const hasPendingConfigChanges =
    (canEditBatchSize && localBatchSize !== config.round1BatchSize) ||
    (canEditBudget && localBudget !== config.customerBudget);

  const handleUpdateSettings = () => {
    const updates: any = {};
    if (canEditBatchSize && localBatchSize !== config.round1BatchSize) updates.round1BatchSize = localBatchSize;
    if (canEditBudget && localBudget !== config.customerBudget) updates.customerBudget = localBudget;
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

  const leaderboardBase = useMemo(() => {
    return (instructorStats?.leaderboard || []).map(row => {
      const teamId = Number(row.team.id);
      const teamName = teamNames[String(teamId)] || row.team.name;
      return {
        team_id: teamId,
        team_name: teamName,
        rated_batches: Number(row.batches_rated ?? 0),
        accepted_jokes: Number(row.accepted_jokes ?? 0),
        total_jokes: Number(row.total_jokes ?? 0),
        avg_score_overall: Number(row.avg_score_overall ?? 0),
        total_sales: Number(row.total_sales ?? 0),
      };
    });
  }, [instructorStats?.leaderboard, teamNames]);

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
    if (leaderboardBase.length === 0) return;

    const curr: Record<string, number> = {};
    leaderboardBase.forEach(t => {
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
      ...leaderboardBase.map(t => ({
        event_index: eventIndex,
        timestamp: ts,
        team_id: Number(t.team_id),
        team_name: String(t.team_name),
        total_sales: Number(t.total_sales ?? 0),
      })),
    ]);

    lastSalesTotalsRef.current = curr;
  }, [leaderboardBase, instructorStats?.cumulative_sales]);

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
    ...Object.keys(teamNames).filter(id => roster.some(u => u.team === id)),
  ])).sort((a, b) => Number(a) - Number(b));

  // Demo constraint: cap the displayed teams to 20.
  const visibleTeamIds = activeTeamIds.slice(0, 20);

  const cumulativeSalesData = (() => {
    const events =
      (instructorStats?.cumulative_sales && instructorStats.cumulative_sales.length > 0)
        ? instructorStats.cumulative_sales
        : localSalesOverTime;
    // Build a dense series so ALL teams have a value at every event_index.
    // This ensures every team line is visible even if the backend only emits events for some teams.
    const byEvent: Record<number, Record<string, number>> = {};
    for (const ev of events) {
      const idx = Number((ev as any).event_index);
      if (!Number.isFinite(idx)) continue;
      if (!byEvent[idx]) byEvent[idx] = {};
      byEvent[idx][String(ev.team_id)] = Number(ev.total_sales ?? 0);
    }

    const eventIndices = Object.keys(byEvent).map(n => Number(n)).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
    if (eventIndices.length === 0) {
      // still render a baseline so lines can appear once data arrives
      const base: any = { index: 0 };
      visibleTeamIds.forEach(tid => { base[String(tid)] = 0; });
      return [base];
    }

    const last: Record<string, number> = {};
    visibleTeamIds.forEach(tid => { last[String(tid)] = 0; });

    const rows: any[] = [];
    // Baseline at 0 so single-point series are still visible as a flat line.
    const base: any = { index: 0 };
    visibleTeamIds.forEach(tid => { base[String(tid)] = 0; });
    rows.push(base);

    for (const idx of eventIndices) {
      const updates = byEvent[idx] || {};
      for (const tid of Object.keys(updates)) {
        last[tid] = updates[tid];
      }
      const row: any = { index: idx };
      visibleTeamIds.forEach(tid => { row[String(tid)] = last[String(tid)] ?? 0; });
      rows.push(row);
    }
    return rows;
  })();

  const sizeVsQualityData = (instructorStats?.batch_quality_by_size || []).map(item => ({
    size: item.batch_size,
    quality: item.avg_score,
    team: String(item.team_id),
    name: item.team_name,
  }));

  const sequenceVsQualityData = (() => {
    const points = instructorStats?.learning_curve || [];
    const grouped: Record<number, any> = {};
    points.forEach(p => {
      if (!grouped[p.batch_order]) grouped[p.batch_order] = { seq: p.batch_order };
      grouped[p.batch_order][String(p.team_id)] = p.avg_score;
    });
    return Object.values(grouped).sort((a: any, b: any) => a.seq - b.seq);
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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leaderboardSorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400 italic">
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
                <td className="px-3 py-2 text-right text-gray-800">{row.total_jokes}</td>
                <td className="px-3 py-2 text-right text-gray-800">{row.avg_score_overall.toFixed(1)}</td>
                <td className="px-3 py-2 text-right font-bold text-emerald-700">{row.total_sales}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Render Charts Helper
  const renderChart = (type: string) => {
    switch(type) {
        case 'sales':
            return (
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={cumulativeSalesData} margin={{ top: 12, bottom: 20, left: 48, right: 16 }}>
                   <CartesianGrid strokeDasharray="3 3" />
                   <XAxis dataKey="index" label={{ value: 'Event Sequence', position: 'insideBottom', offset: -10 }} />
                   <YAxis
                     width={44}
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
                   <Tooltip />
                   {visibleTeamIds.map((teamId, index) => (
                      <Line 
                        key={teamId} 
                        type="monotone" 
                        dataKey={teamId} 
                        name={teamNames[teamId] || `Team ${teamId}`} 
                        stroke={PALETTE[index % PALETTE.length]} 
                        strokeWidth={2}
                        dot={false}
                      />
                   ))}
                 </LineChart>
               </ResponsiveContainer>
            );
        case 'size_quality':
            return (
               <ResponsiveContainer width="100%" height="100%">
                 <ScatterChart margin={{ bottom: 20, left: 48, right: 16 }}>
                   <CartesianGrid strokeDasharray="3 3" />
                   <XAxis type="number" dataKey="size" name="Batch Size" unit=" jokes" />
                   <YAxis
                     width={44}
                     type="number"
                     dataKey="quality"
                     name="Avg Quality"
                     domain={[0, 5]}
                    padding={{ top: 12, bottom: 6 }}
                     label={{ value: 'Avg Quality', angle: -90, position: 'insideLeft', dx: -10 }}
                   />
                   <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter name="Batches" data={sizeVsQualityData} fill="#8884d8" />
                 </ScatterChart>
               </ResponsiveContainer>
            );
        case 'sequence_quality':
            return (
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={sequenceVsQualityData} margin={{ top: 12, bottom: 20, left: 48, right: 16 }}>
                   <CartesianGrid strokeDasharray="3 3" />
                   <XAxis dataKey="seq" label={{ value: 'Batch Sequence', position: 'insideBottom', offset: -10 }} />
                   <YAxis
                     width={44}
                    // Add headroom without changing the axis max label (keep max at 5).
                    domain={[0, 5]}
                     padding={{ top: 12, bottom: 6 }}
                     label={{ value: 'Avg Quality', angle: -90, position: 'insideLeft', dx: -10 }}
                   />
                   <Tooltip />
                   {visibleTeamIds.map((teamId, index) => (
                      <Line 
                        key={teamId} 
                        type="monotone" 
                        dataKey={teamId} 
                        name={teamNames[teamId] || `Team ${teamId}`} 
                        stroke={PALETTE[index % PALETTE.length]} 
                        strokeWidth={2}
                        connectNulls
                      />
                   ))}
                 </LineChart>
               </ResponsiveContainer>
            );
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
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setShowResetConfirm(false);
                  resetGame();
                }}
              >
                Yes, Reset
              </Button>
            </div>
          </div>
        </Modal>
        
        {/* Expanded Chart Modal */}
        <Modal 
            isOpen={!!expandedChart} 
            onClose={() => setExpandedChart(null)} 
            title={expandedChart === 'leaderboard' ? 'Leaderboard' : 'Expanded Chart View'}
            maxWidth="max-w-[90vw]"
        >
            {expandedChart === 'leaderboard' ? (
              <div className="h-[75vh] w-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2 bg-slate-100 px-4 py-2 rounded-lg text-slate-700 font-mono text-xl">
                    <Clock size={20} />
                    <span>{formatTime(config.elapsedTime)}</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    Sorted by <span className="font-semibold text-gray-700">{leaderboardSortKey}</span> ({leaderboardSortDir})
                  </div>
                </div>
                {renderLeaderboardTable({ maxHeightClass: 'max-h-[65vh]', isExpanded: true })}
              </div>
            ) : (
              <div className="h-[75vh] w-full">
                {expandedChart && renderChart(expandedChart)}
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
        <Card className="border-t-4 border-t-slate-800">
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
                     onClick={() => setGameActive(true)}
                     variant="success"
                     className="w-32 flex justify-center items-center gap-2"
                   >
                     <Play size={16} /> Start
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
                   onClick={() => endRound()}
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
            
            {/* Row 3: Configurations */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
               <div className="flex items-center space-x-2">
                 <Settings size={16} className="text-gray-400" />
                 <span className="text-sm font-bold text-gray-700 uppercase">Config:</span>
               </div>
               <div className="flex items-center space-x-2">
                 <label className="text-sm text-gray-600">R1 Batch Size:</label>
                 <input 
                   type="number" 
                   value={localBatchSize} 
                   onChange={e => setLocalBatchSize(Number(e.target.value))}
                   disabled={!canEditBatchSize}
                   className={`w-16 p-1 border border-gray-300 rounded text-center bg-white text-black ${!canEditBatchSize ? 'opacity-50 cursor-not-allowed' : ''}`}
                 />
               </div>
               <div className="flex items-center gap-2">
                 <label className="text-sm text-gray-600">Cust. Budget:</label>
                 <input 
                   type="number" 
                   value={localBudget} 
                   onChange={e => setLocalBudget(Number(e.target.value))}
                   disabled={!canEditBudget}
                   className={`w-16 p-1 border border-gray-300 rounded text-center bg-white text-black ${!canEditBudget ? 'opacity-50 cursor-not-allowed' : ''}`}
                 />
                 <Button
                   type="button"
                   onClick={handleUpdateSettings}
                   variant="secondary"
                   disabled={!hasPendingConfigChanges}
                   className={
                     `ml-5 px-4 py-1 text-xs font-semibold transition-colors ` +
                     (hasPendingConfigChanges
                       ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 ring-2 ring-amber-200'
                       : 'opacity-60')
                   }
                 >
                   Apply
                 </Button>
               </div>
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
          <Card className="xl:col-span-2" title="Team Management (Drag to Move, Click to Switch Role)">
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-white shadow-sm z-10">
                  <tr className="bg-gray-50 border-b">
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Team Name</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Members</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleTeamIds.map(teamId => (
                    <tr 
                      key={teamId} 
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, 'TEAM', teamId)}
                      className="hover:bg-blue-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 align-top w-1/4">
                        <input 
                          type="text" 
                          value={teamNames[teamId]}
                          onChange={(e) => updateTeamName(teamId, e.target.value)}
                          className="font-bold text-gray-800 bg-transparent border-b border-dashed border-gray-300 focus:border-blue-500 outline-none w-full"
                        />
                        <span className="text-xs text-gray-400 block mt-1">ID: {teamId}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {rosterByTeam[teamId]?.map(u => (
                            <div 
                              key={u.id} 
                              draggable
                              onDragStart={(e) => handleDragStart(e, u.id)}
                              onClick={() => toggleUserRole(u.id, u.role)}
                              title="Drag to move, Click to toggle Role"
                              className={`cursor-pointer inline-flex items-center px-2 py-1 rounded text-xs border hover:shadow-md transition-all active:scale-95 select-none ${u.role === Role.JOKE_MAKER ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-purple-50 text-purple-700 border-purple-100'}`}
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
                          )) || <span className="text-gray-400 italic">No members. Drag users here.</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr 
                    className="bg-amber-50/50"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'CUSTOMER')}
                  >
                    <td className="px-4 py-3 font-bold text-amber-800">Customers</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
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
                        {roster.filter(u => u.role === Role.CUSTOMER).length === 0 && <span className="text-gray-400 text-xs italic">Drag users here to make them Customers</span>}
                      </div>
                    </td>
                  </tr>
                   <tr 
                     className="bg-gray-100/50"
                     onDragOver={handleDragOver}
                     onDrop={(e) => handleDrop(e, 'LOBBY')}
                   >
                    <td className="px-4 py-3 font-bold text-gray-600">Unassigned (Lobby)</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
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
                        {roster.filter(u => u.role === Role.UNASSIGNED).length === 0 && <span className="text-gray-400 text-xs italic">All users assigned</span>}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Leaderboard (full width) */}
          <Card
            className="xl:col-span-2"
            title="Leaderboard"
            action={
              <div className="flex items-center gap-1">
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
          
          {/* 2) Cumulative Sales Over Time */}
          {!isChartHidden('sales') && (
            <Card
              title="Cumulative Sales Over Time"
              action={
                <div className="flex items-center gap-1">
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
                <div className="flex items-center gap-1">
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

          {/* 4) Batch Size vs Average Quality */}
          {!isChartHidden('size_quality') && (
            <Card
              title="Batch Size vs Average Quality"
              action={
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setExpandedChart('size_quality')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                    title="Expand chart"
                  >
                    <Maximize2 size={18} />
                  </button>
                  <button
                    onClick={() => hideChart('size_quality')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                    title="Hide chart (this session only)"
                  >
                    <X size={18} />
                  </button>
                </div>
              }
            >
              <div className="h-72 w-full">
                {renderChart('size_quality')}
              </div>
            </Card>
          )}

        </div>
      </div>
    </RoleLayout>
  );
};

export default Instructor;
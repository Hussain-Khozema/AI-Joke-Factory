import React, { useEffect, useState } from 'react';
import { useGame } from '../context';
import { Button, Card, RoleLayout, Modal } from '../components';
import { Play, Pause, RefreshCw, Settings, Clock, StopCircle, GripVertical, Users, CheckCircle, Maximize2, X, Trash2 } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, ScatterChart, Scatter, Legend
} from 'recharts';
import { Role } from '../types';

interface TeamStat {
  team: string;
  batches: number;
  totalScore: number;
  accepted: number;
  jokeCount: number;
  revenue: number;
}

// Expanded Palette for more teams
const PALETTE = [
    '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', 
    '#6366F1', '#EC4899', '#14B8A6', '#F97316', '#64748B',
    '#0EA5E9', '#A855F7', '#22C55E', '#EAB308', '#F43F5E'
];

const CustomScatterTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 border border-gray-200 shadow-md rounded text-sm z-50">
        <p className="font-bold text-gray-800 border-b pb-1 mb-1">{data.name}</p>
        <div className="space-y-1">
            <p className="text-gray-600">Jokes Submitted: <span className="font-semibold text-blue-600">{data.output}</span></p>
            <p className="text-gray-600">Rejection Rate: <span className="font-semibold text-red-500">{data.rejectionRate}%</span></p>
        </div>
      </div>
    );
  }
  return null;
};

const INSTRUCTOR_HIDDEN_CHARTS_SESSION_KEY = 'joke_factory_instructor_hidden_charts_v1';
const CHART_KEYS = ['revenue', 'leaderboard', 'sales', 'quality', 'learning', 'misalignment'] as const;
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

  const hasPendingConfigChanges =
    localBatchSize !== config.round1BatchSize || localBudget !== config.customerBudget;

  const handleUpdateSettings = () => {
    updateConfig({ round1BatchSize: localBatchSize, customerBudget: localBudget });
  };

  // --- Lobby Logic ---
  const validCustomerOptions = calculateValidCustomerOptions();
  const connectedPairs = roster.filter(u => u.role !== Role.INSTRUCTOR).length;
  
  const handleFormTeams = () => {
      if (selectedCustomerCount === null) return;
      formTeams(selectedCustomerCount);
  };


  // --- Data Processing ---
  
  const leaderboard = instructorStats?.leaderboard || [];
  const activeTeamIds = Array.from(new Set([
    ...leaderboard.map(t => String(t.team.id)),
    ...Object.keys(teamNames).filter(id => roster.some(u => u.team === id)),
  ])).sort((a, b) => Number(a) - Number(b));

  // Demo constraint: cap the displayed teams to 20.
  const visibleTeamIds = activeTeamIds.slice(0, 20);

  const barChartData = (instructorStats?.revenue_vs_acceptance || []).map(item => ({
    name: teamNames[String(item.team_id)] || item.team_name,
    Revenue: item.total_sales,
    Accepted: item.accepted_jokes,
    AcceptanceRate: (item.acceptance_rate ?? 0) * 100,
  }));

  const cumulativeSalesData = (() => {
    const events = instructorStats?.cumulative_sales || [];
    const grouped: Record<number, any> = {};
    events.forEach(ev => {
      if (!grouped[ev.event_index]) grouped[ev.event_index] = { index: ev.event_index };
      grouped[ev.event_index][String(ev.team_id)] = ev.total_sales;
    });
    return Object.values(grouped).sort((a: any, b: any) => a.index - b.index);
  })();

  const sizeVsQualityData = (instructorStats?.batch_quality_by_size || []).map(item => ({
    size: item.batch_size,
    quality: item.avg_score,
    team: String(item.team_id),
    name: item.team_name,
  }));

  const learningCurveData = (() => {
    const points = instructorStats?.learning_curve || [];
    const grouped: Record<number, any> = {};
    points.forEach(p => {
      if (!grouped[p.batch_order]) grouped[p.batch_order] = { seq: p.batch_order };
      grouped[p.batch_order][String(p.team_id)] = p.avg_score;
    });
    return Object.values(grouped).sort((a: any, b: any) => a.seq - b.seq);
  })();

  const misalignmentData = (instructorStats?.output_vs_rejection || []).map((item, idx) => ({
    team: String(item.team_id),
    name: teamNames[String(item.team_id)] || item.team_name,
    output: item.total_jokes,
    rejectionRate: (item.rejection_rate ?? 0) * 100,
    fill: PALETTE[idx % PALETTE.length],
  }));

  const leaderboardChartData = (instructorStats?.leaderboard || []).map(item => ({
    name: teamNames[String(item.team.id)] || item.team.name,
    Points: item.points,
    Sales: item.total_sales,
  }));

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

  // Render Charts Helper
  const renderChart = (type: string) => {
    switch(type) {
        case 'revenue':
            return (
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={barChartData} margin={{ left: 20 }}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} />
                     <XAxis dataKey="name" />
                    <YAxis yAxisId="left" orientation="left" stroke="#10B981" />
                    <YAxis yAxisId="right" orientation="right" stroke="#6366F1" />
                     <Tooltip />
                     <Bar yAxisId="left" dataKey="Revenue" fill="#10B981" name="Revenue ($)" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="Accepted" fill="#6366F1" name="Accepted Jokes" radius={[4, 4, 0, 0]} />
                   </BarChart>
                 </ResponsiveContainer>
            );
        case 'sales':
            return (
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={cumulativeSalesData} margin={{ bottom: 20, left: 20 }}>
                   <CartesianGrid strokeDasharray="3 3" />
                   <XAxis dataKey="index" label={{ value: 'Event Sequence', position: 'insideBottom', offset: -10 }} />
                   <YAxis label={{ value: 'Cumulative Sales ($)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }} />
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
        case 'quality':
            return (
               <ResponsiveContainer width="100%" height="100%">
                 <ScatterChart margin={{ bottom: 20, left: 20 }}>
                   <CartesianGrid strokeDasharray="3 3" />
                   <XAxis type="number" dataKey="size" name="Batch Size" unit=" jokes" />
                   <YAxis type="number" dataKey="quality" name="Avg Quality" domain={[0, 5]} label={{ value: 'Avg Quality', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }} />
                   <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter name="Batches" data={sizeVsQualityData} fill="#8884d8" />
                 </ScatterChart>
               </ResponsiveContainer>
            );
        case 'learning':
            return (
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={learningCurveData} margin={{ bottom: 20, left: 20 }}>
                   <CartesianGrid strokeDasharray="3 3" />
                   <XAxis dataKey="seq" label={{ value: 'Batch Order (1st, 2nd...)', position: 'insideBottom', offset: -10 }} />
                   <YAxis domain={[0, 5]} label={{ value: 'Avg Quality', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }} />
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
        case 'misalignment':
            return (
               <ResponsiveContainer width="100%" height="100%">
                 <ScatterChart margin={{ bottom: 20, left: 20 }}>
                   <CartesianGrid strokeDasharray="3 3" />
                   <XAxis type="number" dataKey="output" name="Jokes Submitted" label={{ value: 'Total Jokes Submitted', position: 'insideBottom', offset: -10 }} />
                   <YAxis type="number" dataKey="rejectionRate" name="Rejection Rate" unit="%" label={{ value: 'Rejection Rate (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }} />
                   <Tooltip content={<CustomScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                   <Scatter name="Teams" data={misalignmentData} fill="#82ca9d" />
                 </ScatterChart>
               </ResponsiveContainer>
            );
        case 'leaderboard':
            return (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leaderboardChartData} margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Points" fill="#0ea5e9" radius={[4,4,0,0]} />
                  <Bar dataKey="Sales" fill="#10b981" radius={[4,4,0,0]} />
                </BarChart>
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
            title="Expanded Chart View"
            maxWidth="max-w-[90vw]"
        >
            <div className="h-[75vh] w-full">
                {expandedChart && renderChart(expandedChart)}
            </div>
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
                            <CheckCircle size={16} /> Auto-Assign & Start
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
                 <Button 
                   onClick={() => { if (!config.isActive) setGameActive(true); }}
                   disabled={config.isActive}
                   variant={config.isActive ? 'secondary' : 'success'}
                   className="w-32 flex justify-center items-center gap-2"
                 >
                  {config.isActive ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Start</>}
                 </Button>
                 
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
                 {config.status === 'PLAYING' && (
                     <button onClick={resetToLobby} className="text-xs text-blue-600 underline ml-2">
                         Back to Lobby
                     </button>
                 )}
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
                   className="w-16 p-1 border border-gray-300 rounded text-center bg-white text-black"
                 />
               </div>
               <div className="flex items-center gap-2">
                 <label className="text-sm text-gray-600">Cust. Budget:</label>
                 <input 
                   type="number" 
                   value={localBudget} 
                   onChange={e => setLocalBudget(Number(e.target.value))}
                   className="w-16 p-1 border border-gray-300 rounded text-center bg-white text-black"
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

        {!instructorStats && (
          <div className="text-sm text-gray-500">
            Charts will appear once instructor stats are available. If you’re expecting data but see nothing, make sure
            you’re running in backend mode (set <code className="px-1 py-0.5 bg-gray-100 rounded">VITE_API_BASE_URL</code>)
            and that the round has started / produced events.
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          
          {/* Chart 1: Revenue vs Acceptance */}
          {!isChartHidden('revenue') && (
            <Card 
              title="Revenue vs Acceptance"
              action={
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setExpandedChart('revenue')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                    title="Expand chart"
                  >
                    <Maximize2 size={18} />
                  </button>
                  <button
                    onClick={() => hideChart('revenue')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                    title="Hide chart (this session only)"
                  >
                    <X size={18} />
                  </button>
                </div>
              }
            >
              <div className="h-72 w-full">
                {renderChart('revenue')}
              </div>
            </Card>
          )}

          {/* Widget 2: Team Management */}
          <Card title="Team Management (Drag to Move, Click to Switch Role)">
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
          
          {/* Leaderboard */}
          {!isChartHidden('leaderboard') && (
            <Card 
              title="Leaderboard"
              action={
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setExpandedChart('leaderboard')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                    title="Expand chart"
                  >
                    <Maximize2 size={18} />
                  </button>
                  <button
                    onClick={() => hideChart('leaderboard')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                    title="Hide chart (this session only)"
                  >
                    <X size={18} />
                  </button>
                </div>
              }
            >
              <div className="h-72 w-full">
                {renderChart('leaderboard')}
              </div>
            </Card>
          )}


          {/* Chart 2/3: Cumulative Sales */}
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

          {/* Chart 3: Batch Size vs Quality */}
          {!isChartHidden('quality') && (
            <Card 
              title="Batch Size vs Average Quality"
              action={
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setExpandedChart('quality')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                    title="Expand chart"
                  >
                    <Maximize2 size={18} />
                  </button>
                  <button
                    onClick={() => hideChart('quality')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                    title="Hide chart (this session only)"
                  >
                    <X size={18} />
                  </button>
                </div>
              }
            >
              <div className="h-72 w-full">
                {renderChart('quality')}
              </div>
            </Card>
          )}

          {/* Chart 4: Learning Curve */}
          {!isChartHidden('learning') && (
            <Card 
              title="Learning Curve: Quality by Batch Order"
              action={
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setExpandedChart('learning')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                    title="Expand chart"
                  >
                    <Maximize2 size={18} />
                  </button>
                  <button
                    onClick={() => hideChart('learning')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                    title="Hide chart (this session only)"
                  >
                    <X size={18} />
                  </button>
                </div>
              }
            >
              <div className="h-72 w-full">
                {renderChart('learning')}
              </div>
            </Card>
          )}

           {/* Chart 5: Process Misalignment */}
          {!isChartHidden('misalignment') && (
            <Card 
              title="JM Output vs QC Rejection Rate"
              action={
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setExpandedChart('misalignment')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                    title="Expand chart"
                  >
                    <Maximize2 size={18} />
                  </button>
                  <button
                    onClick={() => hideChart('misalignment')}
                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                    title="Hide chart (this session only)"
                  >
                    <X size={18} />
                  </button>
                </div>
              }
            >
              <div className="h-72 w-full">
                {renderChart('misalignment')}
              </div>
            </Card>
          )}

        </div>
      </div>
    </RoleLayout>
  );
};

export default Instructor;
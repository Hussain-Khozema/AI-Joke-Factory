import React, { useState } from 'react';
import { useGame } from '../context';
import { Button, Card, RoleLayout, Modal } from '../components';
import { Play, Pause, RefreshCw, Settings, Clock, StopCircle, GripVertical, Users, CheckCircle, Maximize2 } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, ScatterChart, Scatter
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

const Instructor: React.FC = () => {
  const { 
    config, updateConfig, setGameActive, setRound, resetGame, toggleTeamPopup,
    roster, teamNames, updateTeamName, updateUser,
    calculateValidCustomerOptions, formTeams, resetToLobby
    , instructorStats
    , endRound
  } = useGame();

  const [localBatchSize, setLocalBatchSize] = useState(config.round1BatchSize);
  const [localBudget, setLocalBudget] = useState(config.customerBudget);
  const [selectedCustomerCount, setSelectedCustomerCount] = useState<number | null>(null);

  // Expanded Chart State
  const [expandedChart, setExpandedChart] = useState<string | null>(null);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

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
  
  const teamStats = (instructorStats?.teams || []).reduce<Record<string, TeamStat>>((acc, t) => {
    const teamId = String(t.team.id);
    acc[teamId] = {
      team: teamId,
      batches: t.batches_rated,
      totalScore: t.avg_score_overall * Math.max(1, t.batches_rated),
      accepted: t.accepted_jokes,
      jokeCount: Math.max(1, t.batches_rated),
      revenue: t.total_sales,
    };
    return acc;
  }, {});

  const activeTeamIds = Array.from(new Set([
    ...(instructorStats?.teams || []).map(t => String(t.team.id)),
    ...Object.keys(teamNames).filter(id => roster.some(u => u.team === id)),
  ])).sort((a, b) => Number(a) - Number(b));

  // Demo constraint: cap the displayed teams to 20.
  const visibleTeamIds = activeTeamIds.slice(0, 20);

  // Chart 1: Bar
  const barChartData = visibleTeamIds.map((teamId) => {
    const stat = teamStats[teamId] || { revenue: 0, accepted: 0, batches: 0, totalScore: 0, jokeCount: 1 };
    return {
      name: teamNames[teamId] || `Team ${teamId}`,
      Revenue: stat.revenue,
      Accepted: stat.accepted,
      Quality: stat.batches > 0 ? (stat.totalScore / stat.jokeCount).toFixed(2) : 0,
    };
  });

  // Chart 2: Cumulative Sales
  // API stats doesn't provide time-series; synthesize a simple progression by batches_rated.
  const maxEvents = Math.max(
    1,
    ...visibleTeamIds.map(tid => {
      const s = instructorStats?.teams?.find(t => String(t.team.id) === tid);
      return s?.batches_rated ?? 1;
    }),
  );

  const cumulativeSalesData: any[] = Array.from({ length: maxEvents }).map((_, idx) => {
    const dataPoint: any = { index: idx + 1 };
    visibleTeamIds.forEach(tid => {
      const s = instructorStats?.teams?.find(t => String(t.team.id) === tid);
      const batchesRated = s?.batches_rated ?? 0;
      const totalSales = s?.total_sales ?? 0;
      const frac = batchesRated > 0 ? Math.min(1, (idx + 1) / batchesRated) : 0;
      dataPoint[tid] = Math.round(totalSales * frac);
    });
    return dataPoint;
  });

  // Chart 3: Scatter Size vs Quality
  const sizeVsQualityData = (instructorStats?.teams || [])
    .filter(t => visibleTeamIds.includes(String(t.team.id)))
    .map(t => ({
      size: t.batches_rated,
      quality: t.avg_score_overall || 0,
      round: config.round,
      team: String(t.team.id),
      fill: config.round === 1 ? '#3B82F6' : '#EF4444',
    }));

  // Chart 4: Learning Curve
  const learningCurveData: any[] = Array.from({ length: maxEvents }).map((_, idx) => {
    const point: any = { seq: idx + 1 };
    visibleTeamIds.forEach(tid => {
      const s = instructorStats?.teams?.find(t => String(t.team.id) === tid);
      const batchesRated = s?.batches_rated ?? 0;
      point[tid] = idx < batchesRated ? (s?.avg_score_overall ?? 0) : null;
    });
    return point;
  });

  // Chart 5: Misalignment
  const misalignmentData = visibleTeamIds.map((teamId, idx) => {
    const s = instructorStats?.teams?.find(t => String(t.team.id) === teamId);
    // Stats API doesn't include total output/rejected; approximate with accepted_jokes and 0% rejection.
    return {
      team: teamId,
      name: teamNames[teamId],
      output: s?.accepted_jokes ?? 0,
      rejectionRate: 0,
      fill: PALETTE[idx % PALETTE.length],
    };
  });

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
                   <Scatter name="Batches (Blue=R1, Red=R2)" data={sizeVsQualityData} fill="#8884d8" />
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
        default: return null;
    }
  };


  return (
    <RoleLayout>
      <div className="space-y-8">
        
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
                 
                 <Button onClick={resetGame} variant="danger" className="p-2" title="Reset Game (Clear All)">
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
               <div className="flex items-center space-x-2">
                 <label className="text-sm text-gray-600">Cust. Budget:</label>
                 <input 
                   type="number" 
                   value={localBudget} 
                   onChange={e => setLocalBudget(Number(e.target.value))}
                   className="w-16 p-1 border border-gray-300 rounded text-center bg-white text-black"
                 />
                 <button onClick={handleUpdateSettings} className="text-blue-600 text-xs font-bold underline ml-2">Apply</button>
               </div>
            </div>
          </div>
        </Card>

        {/* Dashboard Charts */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          
          {/* Chart 1: Revenue vs Acceptance */}
          <Card 
            title="Revenue vs Acceptance"
            action={<button onClick={() => setExpandedChart('revenue')} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Maximize2 size={18} /></button>}
          >
             <div className="h-72 w-full">
               {renderChart('revenue')}
             </div>
          </Card>

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
                           <span 
                             key={u.id} 
                             draggable
                             onDragStart={(e) => handleDragStart(e, u.id)}
                             className="cursor-move inline-flex items-center px-2 py-1 rounded text-xs bg-amber-100 text-amber-800 border border-amber-200 hover:shadow-md"
                           >
                             <GripVertical size={10} className="mr-1 opacity-50" />
                             {u.name}
                           </span>
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
                           <span 
                             key={u.id} 
                             draggable
                             onDragStart={(e) => handleDragStart(e, u.id)}
                             className="cursor-move inline-flex items-center px-2 py-1 rounded text-xs bg-gray-200 text-gray-800 border border-gray-300 hover:shadow-md"
                           >
                             <GripVertical size={10} className="mr-1 opacity-50" />
                             {u.name}
                           </span>
                        ))}
                        {roster.filter(u => u.role === Role.UNASSIGNED).length === 0 && <span className="text-gray-400 text-xs italic">All users assigned</span>}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
          
          {/* Chart 2: Cumulative Sales */}
          <Card 
            title="Cumulative Sales Over Time"
            action={<button onClick={() => setExpandedChart('sales')} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Maximize2 size={18} /></button>}
          >
             <div className="h-72 w-full">
               {renderChart('sales')}
             </div>
          </Card>

          {/* Chart 3: Batch Size vs Quality */}
          <Card 
            title="Batch Size vs Average Quality"
            action={<button onClick={() => setExpandedChart('quality')} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Maximize2 size={18} /></button>}
          >
             <div className="h-72 w-full">
               {renderChart('quality')}
             </div>
          </Card>

          {/* Chart 4: Learning Curve */}
          <Card 
            title="Learning Curve: Quality by Batch Order"
            action={<button onClick={() => setExpandedChart('learning')} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Maximize2 size={18} /></button>}
          >
             <div className="h-72 w-full">
               {renderChart('learning')}
             </div>
          </Card>

           {/* Chart 5: Process Misalignment */}
           <Card 
             title="JM Output vs QC Rejection Rate"
             action={<button onClick={() => setExpandedChart('misalignment')} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Maximize2 size={18} /></button>}
           >
             <div className="h-72 w-full">
               {renderChart('misalignment')}
             </div>
          </Card>

        </div>
      </div>
    </RoleLayout>
  );
};

export default Instructor;
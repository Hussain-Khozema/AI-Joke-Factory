import React, { useEffect, useState } from 'react';
import { useGame } from '../context';
import { Button, Card, StatBox, RoleLayout, Modal } from '../components';
import { Plus, Trash2, Send, CheckCircle, AlertCircle, MessageSquare } from 'lucide-react';
import { Role, Batch } from '../types';

const JokeMaker: React.FC = () => {
  const { user, roster, batches, addBatch, config, teamSummary } = useGame();
  
  const [currentJokes, setCurrentJokes] = useState<string[]>([]);
  const [jokeInput, setJokeInput] = useState('');
  const [complianceChecked, setComplianceChecked] = useState(false);
  const [dismissedTeamPopup, setDismissedTeamPopup] = useState(false);
  
  // Feedback Modal State
  const [feedbackBatch, setFeedbackBatch] = useState<Batch | null>(null);

  // 1. Stats (API-driven)
  const myBatches = batches.filter(b => b.team === user?.team);
  const totalBatches = teamSummary?.batches_created ?? myBatches.length;
  const avgScore = teamSummary ? teamSummary.avg_score_overall.toFixed(1) : 'N/A';
  const mySales = teamSummary?.total_sales ?? 0;
  const myRank = teamSummary?.rank ?? '-';

  const isRound1 = config.round === 1;
  // Before Round 1 starts, backend may still report a placeholder batch size (often 1).
  // For JM UX, show a sensible default (5) while paused, then switch to the real config once active.
  const defaultRound1BatchSize = 5;
  const round1BatchSizeForUi = (isRound1 && !config.isActive) ? defaultRound1BatchSize : config.round1BatchSize;
  const targetBatchSize = isRound1 ? round1BatchSizeForUi : null;
  const maxBatchSize = isRound1 ? round1BatchSizeForUi : config.round2BatchLimit;
  const isInputDisabled = currentJokes.length >= maxBatchSize || !config.isActive;

  const handleAddJoke = () => {
    if (!jokeInput.trim()) return;
    if (currentJokes.length >= maxBatchSize) return;
    setCurrentJokes([...currentJokes, jokeInput.trim()]);
    setJokeInput('');
  };

  const handleSubmitBatch = () => {
    if (isRound1 && currentJokes.length !== targetBatchSize) return;
    if (!complianceChecked) return;
    addBatch(currentJokes);
    setCurrentJokes([]);
    setComplianceChecked(false);
  };

  const removeJoke = (index: number) => {
    const newJokes = [...currentJokes];
    newJokes.splice(index, 1);
    setCurrentJokes(newJokes);
  };

  // Helper to aggregate tags
  const getBatchTags = (batch: Batch) => {
    if (batch.tagSummary && batch.tagSummary.length > 0) {
      return [...batch.tagSummary].sort((a, b) => b.count - a.count).map(ts => [ts.tag, ts.count] as const);
    }
    const counts: Record<string, number> = {};
    batch.jokes.forEach(j => {
      (j.tags || []).forEach(t => {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    return Object.entries(counts).sort(([, a], [, b]) => b - a);
  };

  const formatTagLabel = (tag: string) => {
    const normalized = tag.replace(/_/g, ' ').toLowerCase();
    return normalized.replace(/\b\w/g, c => c.toUpperCase());
  };

  useEffect(() => {
    // If instructor closes popups server-side, allow it to show again next time it opens.
    if (!config.showTeamPopup) setDismissedTeamPopup(false);
  }, [config.showTeamPopup]);

  return (
    <RoleLayout>
      {/* Round 2: Team popup (backend-controlled via is_popped_active) */}
      <Modal
        isOpen={config.round === 2 && config.showTeamPopup && !dismissedTeamPopup}
        onClose={() => setDismissedTeamPopup(true)}
        title="Meet Your Team"
        showCloseButton={false}
      >
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Great job! Go sit with your team members:
          </p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded">
            {(roster.length ? roster : (user ? [user] : [])).map(m => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2">
                <span className="font-medium text-gray-900">{m.name}</span>
                <span className="text-xs font-bold text-gray-500">{m.role.replace('_', ' ')}</span>
              </div>
            ))}
          </div>

        </div>
      </Modal>

      {/* QC Feedback Modal */}
      <Modal 
        isOpen={!!feedbackBatch} 
        onClose={() => setFeedbackBatch(null)} 
        title={`QC Feedback: Batch #${feedbackBatch?.id.slice(-4)}`}
      >
         <div className="space-y-4">
            {feedbackBatch && (
                <>
                    <div>
                        <h4 className="text-sm font-bold text-gray-500 uppercase mb-2">Tag Summary</h4>
                        <div className="flex flex-wrap gap-2">
                            {getBatchTags(feedbackBatch).length > 0 ? (
                                getBatchTags(feedbackBatch).map(([tag, count]) => (
                                    <span key={tag} className="px-3 py-1 bg-gray-900 text-white rounded-full text-sm border border-gray-700">
                                        {formatTagLabel(tag)} <span className="font-bold text-gray-300 ml-1">x{count}</span>
                                    </span>
                                ))
                            ) : (
                                <span className="text-sm text-gray-400 italic">No tags provided.</span>
                            )}
                        </div>
                    </div>
                    
                    {feedbackBatch.feedback && (
                        <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-lg">
                            <h4 className="text-sm font-bold text-yellow-800 uppercase mb-1">Written Feedback</h4>
                            <p className="text-gray-800 text-sm whitespace-pre-wrap">{feedbackBatch.feedback}</p>
                        </div>
                    )}
                     {!feedbackBatch.feedback && (
                        <p className="text-sm text-gray-400 italic border-t pt-2">No written feedback for this batch.</p>
                    )}
                </>
            )}
         </div>
      </Modal>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Input Area */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Production Line" className="border-t-4 border-t-blue-500">
            <div className="space-y-4">
              {!config.isActive && (
                <div className="bg-yellow-50 text-yellow-800 p-3 rounded text-sm font-medium border border-yellow-200">
                  Game is currently paused. Wait for instructor to start.
                </div>
              )}
              
              <div className="bg-blue-50 p-4 rounded-md text-sm text-blue-800 flex items-start">
                <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
                <div>
                  <strong>Instructions:</strong> 
                  {isRound1 
                    ? ` Round 1 requires exactly ${targetBatchSize} jokes per batch.` 
                    : ` Round 2 allows flexible batches up to ${maxBatchSize} jokes.`}
                </div>
              </div>

              {/* Joke Input - Converted to Textarea */}
              <div className="flex flex-col gap-2">
                <textarea
                  value={jokeInput}
                  onChange={(e) => setJokeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddJoke();
                    }
                  }}
                  placeholder="Paste or type a joke here..."
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none resize-none placeholder-gray-400"
                  rows={3}
                  disabled={isInputDisabled}
                />
                <Button 
                  onClick={handleAddJoke} 
                  disabled={!jokeInput.trim() || isInputDisabled}
                  variant="secondary"
                  className="self-end"
                >
                  <span className="flex items-center gap-1"><Plus size={16} /> Add to Batch</span>
                </Button>
              </div>

              {/* Current Batch Staging */}
              <div className="bg-gray-50 rounded-md p-4 min-h-[200px] border border-gray-200">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Current Batch ({currentJokes.length}/{maxBatchSize})</h4>
                {currentJokes.length === 0 ? (
                  <div className="text-center text-gray-400 py-8 italic">No jokes in production yet</div>
                ) : (
                  <ul className="space-y-2">
                    {currentJokes.map((joke, idx) => (
                      <li key={idx} className="bg-white p-2 rounded border border-gray-200 flex justify-between items-center group">
                        <span className="truncate max-w-[80%] whitespace-pre-wrap text-gray-900">{joke}</span>
                        <button onClick={() => removeJoke(idx)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Compliance & Submit */}
              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={complianceChecked}
                    onChange={e => setComplianceChecked(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                    disabled={!config.isActive}
                  />
                  <span className="text-sm text-gray-700">I certify these jokes are not offensive.</span>
                </label>
                
                <Button 
                  onClick={handleSubmitBatch}
                  disabled={
                    !config.isActive ||
                    !complianceChecked || 
                    (isRound1 && currentJokes.length !== targetBatchSize) ||
                    currentJokes.length === 0
                  }
                  className="flex items-center space-x-2"
                >
                  <span className="font-bold">Submit Batch</span>
                  <Send size={16} />
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Dashboard & History */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <StatBox label="Current Rank" value={myRank} color="bg-green-100 text-green-900 border-2 border-green-400 shadow-md" />
            <StatBox label="Batches Created" value={totalBatches} />
            <StatBox label="Avg Score" value={avgScore} color="bg-indigo-50 text-indigo-700" />
            <StatBox label="Total Sales" value={mySales} color="bg-amber-50 text-amber-700" />
          </div>

          <Card title="Submitted Batches">
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {[...myBatches].reverse().map(batch => (
                <div key={batch.id} className="border-b border-gray-100 pb-3 last:border-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-mono text-gray-500">#{batch.id.slice(-4)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      batch.status === 'RATED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {batch.status === 'RATED' ? 'Completed' : 'Processing'}
                    </span>
                  </div>
                  <div className="my-2 bg-gray-50 p-2 rounded border border-gray-200">
                    {batch.jokes.map(joke => (
                      <p key={joke.id} className="text-xs text-gray-700 mb-1 last:mb-0 line-clamp-2">
                        • {joke.content}
                      </p>
                    ))}
                  </div>
                  {batch.status === 'RATED' && (
                    <div className="flex items-center justify-between mt-2">
                        <div className="flex text-xs space-x-3">
                            <span className="flex items-center text-green-600 font-bold">
                                <CheckCircle size={12} className="mr-1" />
                                {batch.acceptedCount} Passed
                            </span>
                            <span className="text-gray-600 font-medium">Avg: {batch.avgRating?.toFixed(1)}/5</span>
                        </div>
                        <button 
                            onClick={() => setFeedbackBatch(batch)}
                            className="text-xs flex items-center bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 transition-colors"
                        >
                            <MessageSquare size={12} className="mr-1" /> Show Feedback
                        </button>
                    </div>
                  )}
                </div>
              ))}
              {myBatches.length === 0 && <p className="text-center text-gray-400 text-sm py-4">No batches yet.</p>}
            </div>
          </Card>
        </div>
      </div>
    </RoleLayout>
  );
};

export default JokeMaker;
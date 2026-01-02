import React, { useEffect, useState } from 'react';
import { useGame } from '../context';
import { Button, Card, StatBox, RoleLayout, Modal } from '../components';
import { Star, CheckCircle, Clock, Tag, AlertTriangle } from 'lucide-react';
import { Batch } from '../types';

const TAG_OPTIONS = [
  { label: "Excellent / standout", tooltip: "Memorable, high-quality, clearly above average." },
  { label: "Genuinely funny", tooltip: "Would repeat to friends or classmates." },
  { label: "Made me smile", tooltip: "Some humor, mild positive reaction." },
  { label: "Original idea", tooltip: "Fresh or creative concept, even if execution wasn’t perfect." },
  { label: "Polite smile", tooltip: "Safe and understandable, but weak or forgettable." },
  { label: "Didn't land", tooltip: "Clearly intended as a joke, but not funny." },
  { label: "Not acceptable", tooltip: "Offensive, inappropriate, confusing, or unsafe." },
  { label: "Other", tooltip: "Does not fit the categories above (requires written explanation)." }
];

const QualityControl: React.FC = () => {
  const { user, roster, batches, rateBatch, config, qcQueue, teamSummary } = useGame();
  
  // API queue provides the next SUBMITTED batch; local state keeps rated history for this session.
  const pendingBatches: Batch[] = qcQueue ? [{
    batch_id: qcQueue.batch.batch_id,
    round_id: qcQueue.batch.round_id,
    team_id: qcQueue.batch.team_id,
    status: 'SUBMITTED',
    submitted_at: qcQueue.batch.submitted_at,
    jokes: qcQueue.jokes.map(j => ({
      joke_id: j.joke_id,
      joke_text: j.joke_text,
      id: String(j.joke_id),
      content: j.joke_text,
    })),
    // UI aliases
    id: String(qcQueue.batch.batch_id),
    team: String(qcQueue.batch.team_id),
    round: config.round,
    submittedAt: Date.parse(qcQueue.batch.submitted_at),
  }] : [];

  const completedBatches = batches.filter(b => b.team === user?.team && b.status === 'RATED');
  
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [currentRatings, setCurrentRatings] = useState<{ [jokeId: string]: number }>({});
  const [currentTags, setCurrentTags] = useState<{ [jokeId: string]: string[] }>({});
  const [batchFeedback, setBatchFeedback] = useState("");
  const [dismissedTeamPopup, setDismissedTeamPopup] = useState(false);
  const activeBatch = pendingBatches.find(b => b.id === activeBatchId) || pendingBatches[0];

  // Stats (rated history + live summary)
  const summary = teamSummary ?? { rank: null, points: null, avg_score_overall: null };
  const totalAccepted = completedBatches.reduce((sum, b) => sum + (b.acceptedCount || 0), 0);
  const avgScore = summary.avg_score_overall !== null
    ? summary.avg_score_overall.toFixed(1)
    : (completedBatches.length > 0 
      ? (completedBatches.reduce((sum, b) => sum + (b.avgRating || 0), 0) / completedBatches.length).toFixed(1) 
      : 'N/A');
  const totalPoints = summary.points ?? totalAccepted * 1; 
  const myRank = summary.rank !== null ? String(summary.rank) : '-';

  const handleRate = (jokeId: string, rating: number) => {
    setCurrentRatings(prev => ({ ...prev, [jokeId]: rating }));
  };

  const toggleTag = (jokeId: string, tagLabel: string) => {
    setCurrentTags(prev => {
      const current = prev[jokeId] || [];
      // Only one tag allowed per joke: replace selection; clicking same tag clears.
      const next = current.includes(tagLabel) ? [] : [tagLabel];
      return { ...prev, [jokeId]: next };
    });
  };


  const needsFeedback = Object.values(currentTags).flat().includes("Other");

  const submitBatchRating = () => {
    if (!activeBatch) return;
    rateBatch(activeBatch.id, currentRatings, currentTags, batchFeedback);
    setCurrentRatings({});
    setCurrentTags({});
    setBatchFeedback("");
    setActiveBatchId(null);
  };

  const isBatchFullyRated = (batch: Batch) => {
    const allRated = batch.jokes.every(j => currentRatings[j.id] !== undefined);
    const allTagged = batch.jokes.every(j => currentTags[j.id] && currentTags[j.id].length > 0);
    const feedbackValid = !needsFeedback || (batchFeedback.trim().length > 0);
    return allRated && allTagged && feedbackValid;
  };

  useEffect(() => {
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Queue & Active Rating */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Inspection Station" className="border-t-4 border-t-purple-500">
            {activeBatch ? (
              <div className="space-y-6">
                 <div className="flex justify-between items-center border-b pb-2">
                    <h3 className="font-bold text-gray-700">Batch #{activeBatch.id.slice(-4)}</h3>
                    <span className="text-sm text-gray-500">{activeBatch.jokes.length} items to inspect</span>
                 </div>

                 <div className="space-y-6">
                   {activeBatch.jokes.map((joke) => (
                     <div key={joke.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                       <p className="mb-3 text-gray-800 font-medium text-lg">{joke.content}</p>
                       
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {/* Rating Section */}
                           <div>
                               <span className="text-xs font-bold text-gray-400 uppercase block mb-1">Rating (1-5)</span>
                               <div className="flex items-center space-x-2">
                                   {[1, 2, 3, 4, 5].map((star) => (
                                   <button
                                       key={star}
                                       onClick={() => handleRate(joke.id, star)}
                                       className={`p-1 transition-transform hover:scale-110 ${
                                       (currentRatings[joke.id] || 0) >= star ? 'text-yellow-400' : 'text-gray-300'
                                       }`}
                                   >
                                       <Star size={24} fill="currentColor" />
                                   </button>
                                   ))}
                               </div>
                           </div>

                           {/* Tagging Section */}
                           <div>
                                <span className="text-xs font-bold text-gray-400 uppercase block mb-1">Feedback Tags (Req.)</span>
                                <div className="flex flex-wrap gap-2">
                                    {TAG_OPTIONS.map(tag => {
                                        const isSelected = (currentTags[joke.id] || []).includes(tag.label);
                                        return (
                                            <button
                                                key={tag.label}
                                                onClick={() => toggleTag(joke.id, tag.label)}
                                                title={tag.tooltip}
                                                className={`text-xs px-2 py-1 rounded border transition-colors ${
                                                    isSelected 
                                                    ? 'bg-purple-600 text-white border-purple-600' 
                                                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                                                }`}
                                            >
                                                {tag.label}
                                            </button>
                                        );
                                    })}
                                </div>
                           </div>
                       </div>
                     </div>
                   ))}
                 </div>

                 {/* Conditional Feedback Area */}
                 {needsFeedback && (
                    <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 animate-in fade-in">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle size={18} className="text-yellow-600" />
                            <span className="font-bold text-sm text-yellow-800">Written Feedback Required</span>
                        </div>
                        <p className="text-xs text-yellow-700 mb-2">You selected "Other" for one or more jokes. Please explain your feedback for this batch.</p>
                        <textarea 
                            value={batchFeedback}
                            onChange={(e) => setBatchFeedback(e.target.value)}
                            className="w-full p-2 text-sm border border-yellow-300 rounded focus:ring-2 focus:ring-yellow-500 outline-none bg-white text-gray-900"
                            rows={3}
                            placeholder="Type your feedback here..."
                        />
                    </div>
                 )}

                 <div className="flex justify-end pt-4 border-t">
                   <Button 
                     onClick={submitBatchRating}
                     disabled={!isBatchFullyRated(activeBatch)}
                     variant="success"
                     className="w-full md:w-auto"
                   >
                     Submit Inspection Results
                   </Button>
                 </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="bg-green-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="text-green-500" size={32} />
                </div>
                <h3 className="text-lg font-medium text-gray-900">All Clear!</h3>
                <p className="text-gray-500">Waiting for Joke Maker to submit new batches.</p>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Stats & Queue List */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <StatBox label="Current Rank" value={myRank} color="bg-green-100 text-green-900 border-2 border-green-400 shadow-md" />
            <StatBox label="Queue" value={qcQueue?.queue_size ?? pendingBatches.length} color="bg-purple-50 text-purple-700" />
            <StatBox label="Avg Quality" value={avgScore} color="bg-indigo-50 text-indigo-700" />
            <StatBox label="Total Sales" value={totalPoints} color="bg-amber-50 text-amber-700" />
          </div>

          <Card title="Incoming Queue">
             <div className="space-y-2 max-h-[250px] overflow-y-auto">
               {pendingBatches.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Queue is empty</p>}
               {pendingBatches.map(b => (
                 <div 
                   key={b.id} 
                   className={`p-3 rounded border cursor-pointer transition-colors flex justify-between items-center ${
                     b.id === activeBatch?.id ? 'bg-purple-50 border-purple-300' : 'bg-white border-gray-200 hover:bg-gray-50'
                   }`}
                   onClick={() => setActiveBatchId(b.id)}
                 >
                   <span className="font-mono text-sm">Batch #{b.id.slice(-4)}</span>
                   <span className="flex items-center text-xs text-gray-500">
                     <Clock size={12} className="mr-1" />
                     Waiting
                   </span>
                 </div>
               ))}
             </div>
          </Card>
          
          <Card title="Inspection History">
             <div className="space-y-3 max-h-[300px] overflow-y-auto">
               {completedBatches.length === 0 && <p className="text-gray-400 text-sm text-center py-4">No batches rated yet</p>}
               {[...completedBatches].reverse().map(b => (
                 <div key={b.id} className="p-3 bg-gray-50 rounded border border-gray-200">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-mono text-xs text-gray-500">#{b.id.slice(-4)}</span>
                      <span className="text-xs text-green-600 font-bold flex items-center">
                        <CheckCircle size={10} className="mr-1"/> 
                        Rated
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-white p-1 rounded text-center border">
                        <span className="block text-gray-500 text-[10px] uppercase">Avg Score</span>
                        <span className="font-bold text-blue-600">{b.avgRating?.toFixed(1)}</span>
                      </div>
                      <div className="bg-white p-1 rounded text-center border">
                        <span className="block text-gray-500 text-[10px] uppercase">Accepted</span>
                        <span className="font-bold text-green-600">{b.acceptedCount}</span>
                      </div>
                    </div>
                 </div>
               ))}
             </div>
          </Card>
        </div>
      </div>
    </RoleLayout>
  );
};

export default QualityControl;
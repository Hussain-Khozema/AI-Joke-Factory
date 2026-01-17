import React, { useState } from 'react';
import { useGame } from '../context';
import { Button, Card, RoleLayout } from '../components';
import { ShoppingBag, RotateCcw, DollarSign, TrendingUp } from 'lucide-react';

const performanceBadge = (raw: unknown): { label: string; className: string } | null => {
  const key = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '_');

  // Backend variants: HIGH_PERFORMING / HIGH PERFORMING, AVG/AVERAGE, LOW_PERFORMING, etc.
  if (key === 'HIGH_PERFORMING' || key === 'HIGH') {
    return {
      label: 'Best Seller',
      className: 'bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-900 ring-1 ring-emerald-200',
    };
  }
  if (
    key === 'AVERAGE_PERFORMING' ||
    key === 'AVG_PERFORMING' ||
    key === 'AVERAGE' ||
    key === 'AVG'
  ) {
    return {
      label: 'Trending',
      className: 'bg-gradient-to-r from-blue-50 to-indigo-50 text-indigo-900 ring-1 ring-indigo-200/50',
    };
  }
  if (key === 'LOW_PERFORMING' || key === 'LOW') {
    return null;
  }
  return {
    label: 'Standard',
    className: 'bg-gradient-to-r from-slate-50 to-slate-100 text-slate-900 ring-1 ring-slate-200',
  };
};

const Customer: React.FC = () => {
  const { user, buyJoke, returnJoke, config, marketItems } = useGame();
  const [expandedJokeIds, setExpandedJokeIds] = useState<Record<string, boolean>>({});
  
  if (!user) return null;

  // API-driven market (old → new, top → bottom)
  const marketJokes = [...marketItems]
    .sort((a, b) => Number(a.joke_id) - Number(b.joke_id))
    .map(item => ({
    id: String(item.joke_id),
      title: String((item as any).joke_title ?? '').trim(),
    content: item.joke_text,
    teamName: item.team?.name ? String(item.team.name) : `Team ${String(item.team?.id ?? '')}`,
    teamPerfLabel: (item.team as any)?.performance_label ?? null,
    soldCount: Number((item.team as any)?.sold_jokes_count ?? 0),
    acceptedCount: Number((item.team as any)?.accepted_jokes ?? 0),
    batchId: String(item.joke_id), // placeholder to preserve UI (API does not include batch_id)
    isBoughtByMe: item.is_bought_by_me,
    }));

  const purchasedSet = new Set(user.purchasedJokes);
  const marketPrice = Number.isFinite(config.marketPrice) && config.marketPrice > 0 ? config.marketPrice : 1;
  const priceDisplay = `$${marketPrice.toFixed(2)}`;

  const handleBuy = (jokeId: string) => {
    // Purchase => fold (collapse) all expanded jokes immediately.
    setExpandedJokeIds({});
    buyJoke(jokeId, marketPrice);
  };

  const handleReturn = (jokeId: string) => {
    returnJoke(jokeId, marketPrice);
  };

  return (
    <RoleLayout>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Wallet Widget */}
        <div className="md:col-span-1">
          <div className="sticky top-24 space-y-4">
             <Card className="bg-gradient-to-br from-gray-900 to-gray-800 text-white border-none shadow-lg">
                <div className="flex flex-col items-center py-4">
                   <div className="p-3 bg-white/10 rounded-full mb-3">
                     <DollarSign size={24} className="text-green-400" />
                   </div>
                   <h2 className="text-sm uppercase tracking-wider opacity-70">Budget Remaining</h2>
                   <div className="text-4xl font-bold mt-1">${user.wallet}</div>
                </div>
             </Card>
             
             <Card title="My Purchases">
               <div className="max-h-[300px] overflow-y-auto space-y-3">
                 {marketJokes.filter(j => purchasedSet.has(j.id)).length === 0 && (
                   <p className="text-gray-400 text-sm text-center">No purchases yet.</p>
                 )}
                 {marketJokes.filter(j => purchasedSet.has(j.id)).map(j => (
                   <div key={j.id} className="text-sm bg-gray-50 p-2 rounded border flex justify-between items-center text-gray-900">
                     <span className="truncate w-2/3 font-medium">{j.content}</span>
                     <button 
                       onClick={() => handleReturn(j.id)}
                       className="text-red-500 hover:text-red-700 text-xs font-bold underline"
                     >
                       Return
                     </button>
                   </div>
                 ))}
               </div>
             </Card>
          </div>
        </div>

        {/* Market Feed */}
        <div className="md:col-span-3">
           <div className="mb-6">
             <h1 className="text-2xl font-bold text-gray-800">Joke Market</h1>
             <p className="text-gray-600">Buy what makes you laugh. You can always return it.</p>
           </div>
           
           <div className="grid grid-cols-1 gap-4">
             {marketJokes.length === 0 ? (
               <div className="text-center py-20 bg-white rounded-lg border border-dashed border-gray-300">
                 <p className="text-gray-500 text-lg">The market is currently empty.</p>
                 <p className="text-sm text-gray-400">Waiting for teams to produce high-quality content.</p>
               </div>
             ) : (
               marketJokes.map(joke => {
                 const isOwned = purchasedSet.has(joke.id);
                 const isExpanded = Boolean(expandedJokeIds[joke.id]);
                 const isLongJoke = joke.content.trim().length > 180;
                 const perf = joke.soldCount > 0 ? performanceBadge(joke.teamPerfLabel) : null;
                 const teamBadgeText = perf ? `${joke.teamName} – ${perf.label}` : joke.teamName;
                return (
                  <Card key={joke.id} className="rounded-xl border border-slate-200 hover:shadow-md transition-shadow">
                    <div className="-m-4 flex flex-col h-full">
                      <div className="px-5 py-4 flex flex-col gap-3 flex-grow">
                        <div className="relative pr-36">
                          <div className="flex items-center gap-3">
                            <span
                              className={
                                `inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold tracking-wide ` +
                                (perf ? perf.className : 'bg-gray-100 text-gray-700 border border-gray-200')
                              }
                              title={String(joke.teamPerfLabel ?? '')}
                            >
                              {teamBadgeText}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500" title="Team sold / published">
                              <TrendingUp size={12} className="text-slate-400" />
                              {joke.soldCount} sold / {joke.acceptedCount} published
                            </span>
                          </div>
                          <div className="absolute right-0 top-0 flex items-center gap-2">
                            {isOwned && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400">
                                <RotateCcw size={12} />
                                Owned
                              </span>
                            )}
                            {isOwned ? (
                              <Button
                                onClick={() => handleReturn(joke.id)}
                                variant="secondary"
                                className="h-10 w-32 text-sm flex items-center justify-center space-x-1.5 text-blue-600 border border-blue-200 bg-white hover:bg-blue-50"
                              >
                                <RotateCcw size={16} />
                                <span>Return {priceDisplay}</span>
                              </Button>
                            ) : (
                              <Button
                                onClick={() => handleBuy(joke.id)}
                                disabled={user.wallet <= 0 || !config.isActive}
                                className="h-11 w-36 text-base flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700"
                              >
                                <ShoppingBag size={16} />
                                <span>Buy {priceDisplay}</span>
                              </Button>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-[17px] font-extrabold text-blue-900 tracking-tight">
                            {joke.title || 'Untitled Joke'}
                          </div>
                          <div
                            className={
                              `mt-2 border-l-2 border-blue-200 pl-3 text-base text-slate-700 italic leading-relaxed whitespace-pre-wrap ` +
                              (isExpanded ? '' : 'line-clamp-3')
                            }
                          >
                            "{joke.content}"
                          </div>
                          {isLongJoke && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedJokeIds(prev => ({ ...prev, [joke.id]: !Boolean(prev[joke.id]) }))
                              }
                              className="mt-2 text-sm font-bold text-blue-600 underline hover:text-blue-700"
                            >
                              {isExpanded ? 'Read Less' : 'Read More'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Footer removed: keep card clean under content */}
                    </div>
                  </Card>
                );
               })
             )}
           </div>
        </div>
      </div>
    </RoleLayout>
  );
};

export default Customer;
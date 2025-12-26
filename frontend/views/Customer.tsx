import React from 'react';
import { useGame } from '../context';
import { Button, Card, RoleLayout } from '../components';
import { ShoppingBag, RotateCcw, DollarSign } from 'lucide-react';

const Customer: React.FC = () => {
  const { user, buyJoke, returnJoke, config, marketItems } = useGame();
  
  if (!user) return null;

  // API-driven market
  const marketJokes = marketItems.map(item => ({
    id: String(item.joke_id),
    content: item.joke_text,
    team: String(item.team.id),
    batchId: String(item.joke_id), // placeholder to preserve UI (API does not include batch_id)
    isBoughtByMe: item.is_bought_by_me,
  }));

  const purchasedSet = new Set(user.purchasedJokes);

  const handleBuy = (jokeId: string) => {
    buyJoke(jokeId, 1);
  };

  const handleReturn = (jokeId: string) => {
    returnJoke(jokeId, 1);
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
             <p className="text-gray-600">Premium quality jokes, verified by QA experts.</p>
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
                 return (
                   <Card key={joke.id} className="transition hover:shadow-md">
                     <div className="flex justify-between items-start h-full">
                       <div className="flex-1 pr-4 min-w-0">
                         <div className="flex items-center space-x-2 mb-2">
                           <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded uppercase">
                             {joke.team}
                           </span>
                         </div>
                         <div className="h-32 overflow-y-auto pr-2">
                             <p className="text-lg text-gray-800 font-medium leading-relaxed">"{joke.content}"</p>
                         </div>
                       </div>
                       
                       <div className="shrink-0 ml-4">
                         {isOwned ? (
                           <Button 
                             onClick={() => handleReturn(joke.id)} 
                             variant="secondary"
                             className="flex items-center space-x-2 text-red-600 border border-gray-200"
                           >
                             <RotateCcw size={16} />
                             <span>Return ($1)</span>
                           </Button>
                         ) : (
                           <Button 
                             onClick={() => handleBuy(joke.id)} 
                             disabled={user.wallet <= 0 || !config.isActive}
                             className="flex items-center space-x-2 w-32 justify-center"
                           >
                             <ShoppingBag size={16} />
                             <span>Buy ($1)</span>
                           </Button>
                         )}
                       </div>
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
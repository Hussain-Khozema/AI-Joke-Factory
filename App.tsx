import React, { useState } from 'react';
import { GameProvider, useGame } from './context';
import { Role } from './types';
import JokeMaker from './views/JokeMaker';
import QualityControl from './views/QualityControl';
import Customer from './views/Customer';
import Instructor from './views/Instructor';
import { Button } from './components';
import { Loader2, Bug } from 'lucide-react';

const DebugPanel: React.FC = () => {
    const { login, updateUser, user } = useGame();
    const [isOpen, setIsOpen] = useState(false);

    const handleSwitch = async (role: Role, team: string = 'N/A') => {
        if (user) {
            await updateUser(user.id, { role, team });
        } else {
            // Debug-only: join session (role assignment is controlled by instructor/round state).
            await login("Dev User", role);
        }
    };

    if (!isOpen) {
        return (
            <div className="fixed top-4 right-4 z-50">
                <button 
                    onClick={() => setIsOpen(true)}
                    className="bg-gray-900 text-white p-2 rounded-full shadow-lg opacity-50 hover:opacity-100 transition-opacity"
                    title="Open Debug Panel"
                >
                    <Bug size={20} />
                </button>
            </div>
        );
    }

    return (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white p-4 rounded-xl shadow-2xl w-56 border border-gray-700 animate-in fade-in slide-in-from-top-5">
            <div className="flex justify-between items-center border-b border-gray-700 pb-2 mb-3">
                <span className="font-bold text-xs uppercase tracking-wider text-gray-400">Debug Controls</span>
                <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white hover:bg-gray-800 rounded-full p-1">✕</button>
            </div>
            
            <div className="space-y-1">
                <p className="text-[10px] text-gray-500 mb-2 uppercase font-bold">Switch View (Current User)</p>
                <button onClick={() => handleSwitch(Role.INSTRUCTOR)} className="w-full text-left text-xs font-medium hover:bg-blue-600 hover:text-white p-2 rounded transition-colors flex items-center">
                    <span className="w-2 h-2 rounded-full bg-blue-400 mr-2"></span> Instructor
                </button>
                <button onClick={() => handleSwitch(Role.JOKE_MAKER, '1')} className="w-full text-left text-xs font-medium hover:bg-green-600 hover:text-white p-2 rounded transition-colors flex items-center">
                    <span className="w-2 h-2 rounded-full bg-green-400 mr-2"></span> JM (Team 1)
                </button>
                <button onClick={() => handleSwitch(Role.QUALITY_CONTROL, '1')} className="w-full text-left text-xs font-medium hover:bg-purple-600 hover:text-white p-2 rounded transition-colors flex items-center">
                    <span className="w-2 h-2 rounded-full bg-purple-400 mr-2"></span> QC (Team 1)
                </button>
                <button onClick={() => handleSwitch(Role.CUSTOMER)} className="w-full text-left text-xs font-medium hover:bg-amber-600 hover:text-white p-2 rounded transition-colors flex items-center">
                    <span className="w-2 h-2 rounded-full bg-amber-400 mr-2"></span> Customer
                </button>
                <button onClick={() => handleSwitch(Role.UNASSIGNED, 'N/A')} className="w-full text-left text-xs font-medium hover:bg-gray-700 hover:text-white p-2 rounded transition-colors flex items-center">
                    <span className="w-2 h-2 rounded-full bg-gray-400 mr-2"></span> Lobby
                </button>
                 <button onClick={() => window.location.reload()} className="w-full text-left text-xs font-medium text-red-400 hover:bg-red-900/50 p-2 rounded transition-colors border-t border-gray-700 mt-2 flex items-center">
                    Reload App
                </button>
            </div>
            {user && (
                 <div className="mt-3 pt-2 border-t border-gray-700">
                    <p className="text-[10px] text-gray-500">User: <span className="text-gray-300">{user.name}</span></p>
                    <p className="text-[10px] text-gray-500">Role: <span className="text-gray-300">{user.role}</span></p>
                    <p className="text-[10px] text-gray-500">Team: <span className="text-gray-300">{user.team}</span></p>
                 </div>
            )}
        </div>
    );
};

const LoginScreen: React.FC = () => {
  const { login, instructorLogin } = useGame();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [activeTab, setActiveTab] = useState<'STUDENT' | 'INSTRUCTOR'>('STUDENT');

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      // Students join as UNASSIGNED pairs initially
      await login(name, Role.UNASSIGNED);
    }
  };

  const handleInstructorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await instructorLogin(displayName, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 font-sans text-gray-900">
      <div className="w-full max-w-md bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="px-8 pt-10 pb-2 flex flex-col items-center justify-center bg-white">
          <img 
            src="https://www.anderson.ucla.edu/themes/custom/ucla_anderson/logo.svg" 
            alt="UCLA Anderson School of Management" 
            className="w-full max-w-[280px] h-auto object-contain"
          />
        </div>
        <div className="px-8 py-4 border-b border-gray-200 bg-white text-center">
          <h2 className="text-xl font-bold text-gray-900 mt-2">The Joke Factory</h2>
          <p className="text-sm text-gray-500">Operation Management Simulation</p>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-gray-200">
           <button 
             className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'STUDENT' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:text-gray-700'}`}
             onClick={() => setActiveTab('STUDENT')}
           >
             Student Pair Login
           </button>
           <button 
             className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'INSTRUCTOR' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:text-gray-700'}`}
             onClick={() => setActiveTab('INSTRUCTOR')}
           >
             Instructor Login
           </button>
        </div>

        <div className="p-8 bg-gray-50/50">
          {activeTab === 'STUDENT' ? (
            <form onSubmit={handleStudentLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Your Names (Pair)</label>
                <input 
                  required
                  type="text" 
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all placeholder-gray-400"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. John, Joe"
                />
                <p className="text-xs text-gray-500 mt-1">Enter both students who will share this role.</p>
              </div>
              <Button type="submit" className="w-full justify-center py-3 text-base font-semibold">Join Lobby</Button>
            </form>
          ) : (
            <form onSubmit={handleInstructorLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Display Name</label>
                <input 
                  required
                  type="text" 
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="professor_1"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Admin Password</label>
                <input 
                  required
                  type="password" 
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                />
              </div>
              <Button type="submit" className="w-full justify-center py-3 text-base font-semibold">Login as Instructor</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

const WaitingRoom: React.FC = () => {
    const { user } = useGame();
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center space-y-6">
                <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                    <Loader2 size={40} className="text-blue-600 animate-spin" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Waiting Room</h2>
                    <p className="text-gray-500 mt-2">Welcome, <span className="font-semibold">{user?.name}</span>.</p>
                    <p className="text-gray-500 text-sm mt-1">
                      {user?.role === Role.UNASSIGNED 
                        ? "You are currently unassigned." 
                        : `You have been assigned: ${user?.role.replace('_', ' ')}`
                      }
                    </p>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-sm text-yellow-800">
                    <p>Waiting for the Instructor to balance teams and assign customers. Please stay on this screen.</p>
                </div>
                {/* Back button removed as requested */}
            </div>
        </div>
    );
};

const GameRouter: React.FC = () => {
  const { user } = useGame();

  if (!user) return <LoginScreen />;
  
  // If instructor, always show instructor view
  if (user.role === Role.INSTRUCTOR) return <Instructor />;

  // If user is explicitly UNASSIGNED, show waiting room
  if (user.role === Role.UNASSIGNED) {
      return <WaitingRoom />;
  }
  
  // Note: We removed the check for config.status === 'LOBBY' here.
  // This allows the DebugPanel to force a view (JM/QC/Customer) even if the game status is LOBBY.
  // In normal flow, users only get a role != UNASSIGNED when the Instructor starts the game (status -> PLAYING).

  // Fallback for team N/A if role is assigned but something glitched, though formTeams handles this.
  if (user.team === 'N/A' && user.role !== Role.CUSTOMER) {
      return <WaitingRoom />;
  }

  switch (user.role) {
    case Role.JOKE_MAKER:
      return <JokeMaker />;
    case Role.QUALITY_CONTROL:
      return <QualityControl />;
    case Role.CUSTOMER:
      return <Customer />;
    default:
      return <div>Unknown Role</div>;
  }
};

const App: React.FC = () => {
  return (
    <GameProvider>
      <GameRouter />
      <DebugPanel />
    </GameProvider>
  );
};

export default App;
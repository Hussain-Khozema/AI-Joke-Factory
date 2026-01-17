import React, { useState } from 'react';
import { GameProvider, useGame } from './context';
import { Role } from './types';
import JokeMaker from './views/JokeMaker';
import QualityControl from './views/QualityControl';
import Customer from './views/Customer';
import Instructor from './views/Instructor';
import { Button } from './components';
import { Loader2 } from 'lucide-react';

const LoginScreen: React.FC = () => {
  const { login, instructorLogin } = useGame();
  const [member1, setMember1] = useState('');
  const [member2, setMember2] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [activeTab, setActiveTab] = useState<'STUDENT' | 'INSTRUCTOR'>('STUDENT');

  const normalizeTeamName = (a: string, b: string) =>
    [a, b]
      .map(n => n.trim().toLowerCase())
      .filter(Boolean)
      .sort((x, y) => x.localeCompare(y))
      .join('_');

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeTeamName(member1, member2);
    if (!normalized) return;
    // Students join as UNASSIGNED pairs initially
    await login(normalized, Role.UNASSIGNED);
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
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Team Members</label>
                  <input
                    required
                    type="text"
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all placeholder-gray-400"
                    value={member1}
                    onChange={e => setMember1(e.target.value)}
                    placeholder="Member 1 (e.g. Joe)"
                  />
                </div>
                <div>
                  <input
                    required
                    type="text"
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all placeholder-gray-400"
                    value={member2}
                    onChange={e => setMember2(e.target.value)}
                    placeholder="Member 2 (e.g. John)"
                  />
                </div>
                <p className="text-xs text-gray-500">
                    You and your partner will share one role (JM or QC)
                </p>
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
                  placeholder="Instructor Name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Admin Password</label>
                <div className="relative">
                  <input 
                    required
                    type={showPassword ? "text" : "password"} 
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all pr-10"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
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
    </GameProvider>
  );
};

export default App;
import React from 'react';
import { LogOut, User as UserIcon, X } from 'lucide-react';
import { useGame } from './context';
import { Role } from './types';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'success' }> = ({ 
  children, variant = 'primary', className = '', ...props 
}) => {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800',
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
  };
  return (
    <button 
      className={`px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string; title?: string; action?: React.ReactNode }> = ({ children, className = '', title, action }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${className}`}>
    {(title || action) && (
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-semibold text-gray-700 flex justify-between items-center">
        <span>{title}</span>
        {action && <div>{action}</div>}
      </div>
    )}
    <div className="p-4">{children}</div>
  </div>
);

export const StatBox: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color = 'bg-blue-50 text-blue-700' }) => (
  <div className={`p-4 rounded-lg flex flex-col items-center justify-center ${color}`}>
    <span className="text-3xl font-bold">{value}</span>
    <span className="text-sm uppercase tracking-wide opacity-80 mt-1">{label}</span>
  </div>
);

export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; maxWidth?: string }> = ({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={`bg-white rounded-xl shadow-2xl w-full ${maxWidth} overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]`}>
        <div className="flex justify-between items-center p-4 border-b border-gray-100 shrink-0">
          <h3 className="text-xl font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

export const RoleLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, config, teamNames } = useGame();
  
  if (!user) return null;

  const showTeamBadge = user.role !== Role.CUSTOMER && user.role !== Role.INSTRUCTOR;
  // Use the registry name if available, else fallback to "Team X"
  const displayTeamName = teamNames[user.team] || `Team ${user.team}`;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
             <div className="flex flex-col">
               <span className="font-bold text-lg text-gray-800">The Joke Factory</span>
               <span className="text-xs text-gray-500">Round {config.round} • {config.isActive ? 'Active' : 'Paused'}</span>
             </div>
          </div>
          
          <div className="flex items-center space-x-6">
             {showTeamBadge && (
               <div className="flex items-center space-x-2 bg-gray-100 px-3 py-1 rounded-full">
                 <span className="text-xs font-bold text-gray-500 uppercase">Team</span>
                 <span className="font-semibold text-blue-600">{displayTeamName}</span>
               </div>
             )}
             
             {/* UCLA Logo next to User Icon */}
             <img 
               src="https://www.anderson.ucla.edu/themes/custom/ucla_anderson/logo.svg" 
               alt="UCLA Anderson" 
               className="h-10 w-auto object-contain hidden sm:block"
             />

             <div className="flex items-center space-x-2">
                <UserIcon size={16} className="text-gray-400" />
                <span className="text-sm font-medium">{user.name} ({user.role.replace('_', ' ')})</span>
             </div>
             <button onClick={logout} className="text-gray-400 hover:text-red-500 transition-colors" title="Logout">
               <LogOut size={18} />
             </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};
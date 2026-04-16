// components/ComboCard.tsx
import React from 'react';

interface Match {
  league: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
}

interface Combo {
  id: string;
  title: string;
  totalOdds: number;
  price: number;
  platform: string;
  matches: Match[];
}

const platformColors: Record<string, string> = {
  '1xbet': 'bg-blue-600',
  'betpawa': 'bg-lime-500 text-black',
  'premierbet': 'bg-green-700 text-yellow-400',
  'default': 'bg-slate-700'
};

export default function ComboCard({ combo }: { combo: Combo }) {
  const brandClass = platformColors[combo.platform.toLowerCase()] || platformColors.default;

  return (
    <div className="group bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl hover:border-yellow-500/50 transition-all duration-300">
      
      {/* Platform & Odds Banner */}
      <div className={`px-4 py-2 flex justify-between items-center ${brandClass}`}>
        <span className="text-[10px] font-black uppercase tracking-widest">{combo.platform}</span>
        <span className="font-bold text-lg">{combo.totalOdds.toFixed(2)} ODDS</span>
      </div>

      <div className="p-4">
        <h3 className="text-white font-bold text-sm mb-4 truncate uppercase tracking-tight">
          {combo.title}
        </h3>

        {/* Match List */}
        <div className="space-y-4 mb-6">
          {combo.matches.map((match, idx) => (
            <div key={idx} className="relative flex justify-between items-center border-b border-slate-800/50 pb-3 last:border-0 last:pb-0">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-medium">
                    {match.league}
                  </span>
                  <span className="text-[9px] text-slate-500 font-bold">{match.startTime}</span>
                </div>
                <p className="text-slate-200 text-sm font-semibold">
                  {match.homeTeam} <span className="text-slate-500 mx-1">vs</span> {match.awayTeam}
                </p>
              </div>

              {/* The "Teaser" Box - Blurred Prediction */}
              <div className="ml-4">
                <div className="bg-slate-950 px-3 py-1.5 rounded-md border border-slate-800 flex flex-col items-center">
                  <span className="text-[8px] text-slate-500 font-bold uppercase mb-0.5">Tip</span>
                  <div className="w-8 h-3 bg-slate-700 blur-[4px] rounded-sm" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Section */}
        <button 
          className="w-full group/btn relative overflow-hidden bg-yellow-500 hover:bg-yellow-400 p-4 rounded-xl transition-all active:scale-95"
          onClick={() => alert('Trigger Payment Flow')}
        >
          <div className="relative z-10 flex justify-between items-center">
            <div className="text-left">
              <p className="text-[10px] text-slate-900 font-black uppercase leading-none mb-1">Unlock Full Combo</p>
              <p className="text-slate-950 font-black text-xl leading-none italic">REVEAL CODES</p>
            </div>
            <div className="bg-slate-950 text-white px-3 py-2 rounded-lg font-black text-sm shadow-inner">
              {combo.price} <span className="text-[10px]">XAF</span>
            </div>
          </div>
          
          {/* Subtle Shine Effect */}
          <div className="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover/btn:animate-shine" />
        </button>

        <p className="text-[9px] text-center text-slate-500 mt-3 font-medium">
          Instant reveal after MTN or Orange Money payment
        </p>
      </div>
    </div>
  );
}
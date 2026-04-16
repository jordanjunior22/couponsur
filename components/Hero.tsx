// components/Hero.tsx
export default function Hero() {
  return (
    <section className="relative bg-slate-950 pt-12 pb-8 px-4 overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-yellow-500/10 blur-[100px]" />
      
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <div className="inline-block bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[10px] font-black px-3 py-1 rounded-full mb-4">
          90% WIN RATE THIS WEEK
        </div>
        
        <h1 className="text-4xl md:text-6xl font-black text-white mb-4 leading-tight">
          STOP LOSING. <br/> <span className="text-yellow-500">START WINNING.</span>
        </h1>
        
        <p className="text-slate-400 text-sm md:text-base max-w-lg mx-auto mb-8">
          Join thousands of winners in Cameroon. Get high-probability booking codes for 1xBet & Betpawa instantly.
        </p>

        {/* Promocode Card */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-2xl shadow-2xl max-w-sm mx-auto border border-blue-400/30">
          <p className="text-white/80 text-xs font-bold uppercase mb-2">1xBet 200% Bonus Code</p>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl py-3 px-6 flex justify-between items-center">
            <span className="text-2xl font-black text-white tracking-widest">SHOPICI</span>
            <button className="text-[10px] bg-white text-blue-700 font-black px-3 py-1 rounded-md">COPY</button>
          </div>
          <p className="text-[10px] text-blue-100 mt-3 font-medium italic">Use this code during registration for double your deposit!</p>
        </div>
      </div>
    </section>
  );
}
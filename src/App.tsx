/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { MealLog, WaterLog, DailyGoals, NotificationSchedule, WeightLog } from "./types";
import { 
  Flame, 
  Droplet, 
  Footprints, 
  Settings,
  Plus, 
  Trash2, 
  Camera,
  Activity,
  ChevronRight,
  TrendingDown,
  AlertCircle
} from "lucide-react";
import CalorieScanner from "./components/CalorieScanner";

// Mobile simulated bottom tabs
type TabType = "steps" | "water" | "food" | "settings";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>("food");

  // Goals Engine
  const [goals, setGoals] = useState<DailyGoals>(() => {
    const saved = localStorage.getItem("vitalsync_goals_v2");
    return saved ? JSON.parse(saved) : {
      calorieTarget: 2000,
      waterTargetMl: 4000, // 4 Liters
      stepTarget: 15000 // High volume walking
    };
  });

  // Weights Engine (Plateau Adaptation)
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>(() => {
    const saved = localStorage.getItem("vitalsync_weights");
    return saved ? JSON.parse(saved) : [
      { timestamp: new Date().toISOString(), weightKg: 115.0 }
    ];
  });

  // Data Stores
  const [mealLogs, setMealLogs] = useState<MealLog[]>(() => {
    const saved = localStorage.getItem("vitalsync_meals_v2");
    return saved ? JSON.parse(saved) : [];
  });
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>(() => {
    const saved = localStorage.getItem("vitalsync_water_v2");
    return saved ? JSON.parse(saved) : [];
  });
  const [todaySteps, setTodaySteps] = useState<number>(() => {
    const saved = localStorage.getItem("vitalsync_steps_v2");
    return saved ? Number(saved) : 0;
  });

  // App Hooks
  const [stepsActiveSensor, setStepsActiveSensor] = useState(false);
  const [lastAcceleration, setLastAcceleration] = useState({ x: 0, y: 0, z: 0 });
  const [nagModalOpen, setNagModalOpen] = useState(false);
  const waterFileRef = useRef<HTMLInputElement>(null);

  // Ask for Push Notification Permissions (iOS 16.4+ Web Push)
  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        alert("Push Notifications enabled via browser. (Ensure you added this to Homescreen on iOS).");
      }
    }
  };

  const triggerPushNotification = (title: string, body: string) => {
    // If DND is on, iOS will handle suppression natively.
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  };

  // Ask for Accelerometer permission (iOS requires explicit user action)
  const requestMotionPermission = async () => {
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const permissionState = await (DeviceMotionEvent as any).requestPermission();
        if (permissionState === 'granted') {
          setStepsActiveSensor(true);
        } else {
          alert('Motion access denied. Steps will not track automatically.');
        }
      } catch (error) {
        console.error(error);
      }
    } else {
      // Non-iOS 13+ devices
      setStepsActiveSensor(true);
    }
  };

  // Aggressive Water Nagging Simulation & Push
  useEffect(() => {
    // Background cron job check (checks every 60 seconds)
    const timer = setInterval(() => {
      const todayStr = new Date().toDateString();
      const numDrinksToday = waterLogs.filter(w => new Date(w.timestamp).toDateString() === todayStr).length;
      
      const currentHour = new Date().getHours();
      let expectedDrinks = 0;
      if (currentHour >= 9) expectedDrinks = 2; // Morning block 1L
      if (currentHour >= 12) expectedDrinks = 4; // Lunch block 2L
      if (currentHour >= 15) expectedDrinks = 6; // Afternoon block 3L
      if (currentHour >= 18) expectedDrinks = 8; // Evening block 4L

      if (numDrinksToday < expectedDrinks && !nagModalOpen) {
        setNagModalOpen(true);
        triggerPushNotification(
          "Hydration Warning", 
          "You are falling behind your water target. Open app and upload empty bottle picture."
        );
      }
    }, 60000); 
    return () => clearInterval(timer);
  }, [waterLogs, nagModalOpen]);

  // Accelerometer steps polling
  useEffect(() => {
    if (!stepsActiveSensor) return;
    const THRESHOLD = 12.0; 
    let lastUpdate = 0;
    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const currTime = Date.now();
      if ((currTime - lastUpdate) > 120) { 
        const diffTime = currTime - lastUpdate;
        lastUpdate = currTime;
        const x = acc.x || 0;
        const y = acc.y || 0;
        const z = acc.z || 0;
        const delta = Math.sqrt((x - lastAcceleration.x) ** 2 + (y - lastAcceleration.y) ** 2 + (z - lastAcceleration.z) ** 2);
        if (delta > THRESHOLD) {
          setTodaySteps(prev => prev + 1);
        }
        setLastAcceleration({ x, y, z });
      }
    };
    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [stepsActiveSensor, lastAcceleration]);

  // Daily Reset check
  useEffect(() => {
    const lastReset = localStorage.getItem("vitalsync_last_reset");
    const todayStr = new Date().toDateString();
    if (lastReset !== todayStr) {
      // Midnight reset triggered. (We keep logs, but UI filters by today. Steps counter needs reset).
      setTodaySteps(0);
      localStorage.setItem("vitalsync_last_reset", todayStr);
    }
  }, []);

  // Persist State
  useEffect(() => { localStorage.setItem("vitalsync_goals_v2", JSON.stringify(goals)); }, [goals]);
  useEffect(() => { localStorage.setItem("vitalsync_weights", JSON.stringify(weightLogs)); }, [weightLogs]);
  useEffect(() => { localStorage.setItem("vitalsync_meals_v2", JSON.stringify(mealLogs)); }, [mealLogs]);
  useEffect(() => { localStorage.setItem("vitalsync_water_v2", JSON.stringify(waterLogs)); }, [waterLogs]);
  useEffect(() => { localStorage.setItem("vitalsync_steps_v2", todaySteps.toString()); }, [todaySteps]);

  // Adaptation Engine logic
  const verifyWeightPlateau = () => {
    if (weightLogs.length < 7) return;
    const sorted = [...weightLogs].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const last7 = sorted.slice(0, 7);
    const maxDiff = Math.abs(last7[0].weightKg - last7[6].weightKg);
    // If difference across last 7 logs is less than 0.2kg, drop calories
    if (maxDiff < 0.2 && goals.calorieTarget > 1200) {
      setGoals(prev => ({ ...prev, calorieTarget: prev.calorieTarget - 100 }));
      alert("⚠️ PLATEAU DETECTED. Adaptation Engine triggered. Daily calorie allowance slashed by -100kcal. Stay hard.");
    }
  };

  const handleManualWaterPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Simulate photo verification
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const newW: WaterLog = {
        id: "w_" + Date.now(),
        timestamp: new Date().toISOString(),
        amountMl: 500, // Fixed 500ml blocks
        verifiedImageUrl: dataUrl
      };
      setWaterLogs(prev => [...prev, newW]);
      setNagModalOpen(false);
    };
    reader.readAsDataURL(file);
  };

  const todayStr = new Date().toDateString();
  const todayMeals = mealLogs.filter(m => new Date(m.timestamp).toDateString() === todayStr);
  const totalCals = todayMeals.reduce((sum, item) => sum + item.calories, 0);
  const todayWater = waterLogs.filter(w => new Date(w.timestamp).toDateString() === todayStr).reduce((s, x) => s + x.amountMl, 0);

  return (
    <div className="bg-[#0A0A0A] w-full min-h-[100dvh] flex flex-col font-sans text-white overflow-hidden max-w-md mx-auto shadow-2xl relative">
      
      {/* Aggressive Water Nagging View */}
      {nagModalOpen && (
        <div className="absolute inset-0 z-50 bg-[#0A0A0A]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-pulse">
          <AlertCircle className="w-20 h-20 text-[#dc2626] mb-4" />
          <h2 className="text-3xl font-black uppercase text-[#dc2626] tracking-tighter">Hydration Required.</h2>
          <p className="text-xl mt-4 font-mono text-[#a3a3a3]">You are falling behind protocol.</p>
          <div className="w-full bg-[#171717] rounded-xl border border-[#dc2626] p-6 mt-8">
            <p className="text-sm uppercase tracking-widest text-white mb-6">Upload empty 500ml bottle immediately to dismiss.</p>
            <input type="file" accept="image/*" capture="environment" ref={waterFileRef} onChange={handleManualWaterPhoto} className="hidden" />
            <button onClick={() => waterFileRef.current?.click()} className="w-full py-4 bg-[#dc2626] hover:bg-red-700 text-white font-black text-xl tracking-wider rounded-lg shadow-[0_0_20px_rgba(220,38,38,0.5)] flex items-center justify-center gap-2">
              <Camera className="w-6 h-6" /> SUBMIT EVIDENCE
            </button>
            <button onClick={() => setNagModalOpen(false)} className="mt-6 text-[#737373] text-sm uppercase underline decoration-[#dc2626]/30">Skip (Will re-alert in 60s)</button>
          </div>
        </div>
      )}

      {/* Main Viewport */}
      <div className="flex-1 overflow-y-auto pb-24 custom-scroll">
        
        {/* === MEALS TAB === */}
        {activeTab === "food" && (
          <div className="p-4 space-y-6 animate-fadeIn">
            <div className="mt-8 mb-6 text-center">
              <h1 className="text-4xl font-extrabold tracking-tighter uppercase text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">Food</h1>
              <p className="text-[#a3a3a3] text-sm font-mono mt-1">Daily Log</p>
            </div>
            
            {/* Dark Metrix Calorie Ring */}
            <div className="bg-[#171717] rounded-2xl p-6 border border-[#262626] flex items-center justify-between">
              <div>
                <span className="text-[#737373] uppercase tracking-widest text-[10px] font-bold block mb-1">Calories Consumed</span>
                <span className="text-4xl font-black font-mono text-white">{totalCals}</span>
                <span className="text-[#737373] ml-1 text-sm">/ {goals.calorieTarget}</span>
              </div>
              <div className="w-20 h-20 rounded-full border-[6px] border-[#262626] relative flex items-center justify-center shadow-[0_0_15px_rgba(147,51,234,0.3)]">
                <svg className="absolute inset-0 w-20 h-20 transform -rotate-90">
                  <circle cx="40" cy="40" r="34" stroke="#9333ea" strokeWidth="6" fill="transparent" strokeDasharray={213} strokeDashoffset={Math.max(213 - ((totalCals / goals.calorieTarget) * 213), 0)} />
                </svg>
                <Flame className="w-6 h-6 text-[#9333ea]" />
              </div>
            </div>

            <CalorieScanner 
              mealLogs={mealLogs} 
              onAddMeal={(m) => setMealLogs(p => [{...m, id: "m_"+Date.now(), timestamp: new Date().toISOString()}, ...p])} 
              onDeleteMeal={id => setMealLogs(p => p.filter(x => x.id !== id))} 
            />
          </div>
        )}

        {/* === WATER TAB === */}
        {activeTab === "water" && (
          <div className="p-4 space-y-6 animate-fadeIn">
            <div className="mt-8 mb-6 text-center">
              <h1 className="text-4xl font-extrabold tracking-tighter uppercase text-white drop-shadow-[0_0_10px_rgba(37,99,235,0.2)]">Water</h1>
              <p className="text-[#a3a3a3] text-sm font-mono mt-1">Goal: 4L minimum</p>
            </div>

            <div className="bg-[#171717] rounded-2xl p-6 border border-[#262626] text-center">
              <Droplet className="w-12 h-12 text-[#2563eb] mx-auto mb-2" />
              <span className="text-5xl font-black font-mono text-white tracking-tighter">{(todayWater/1000).toFixed(1)}L</span>
              <span className="text-[#737373] text-sm font-bold uppercase tracking-widest block mt-1">out of {(goals.waterTargetMl/1000).toFixed(1)}L</span>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {Array.from({length: 8}).map((_, i) => {
                const isDrunk = todayWater >= (i+1)*500;
                return (
                  <div key={i} className={`aspect-square rounded-xl flex items-center justify-center border transition-all ${isDrunk ? 'bg-[#2563eb]/20 border-[#2563eb] shadow-[0_0_15px_rgba(37,99,235,0.3)]' : 'bg-[#0A0A0A] border-[#262626]'}`}>
                    {isDrunk ? (
                       <Droplet className="w-6 h-6 text-[#2563eb]" />
                    ) : (
                       <span className="text-[#404040] font-mono text-xs font-bold uppercase block text-center leading-tight">500<br/>mL</span>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 flex gap-4">
              <button onClick={() => setNagModalOpen(true)} className="flex-1 py-3 bg-[#0A0A0A] border border-[#262626] hover:border-[#2563eb] rounded-lg text-[#2563eb] font-bold text-sm uppercase tracking-wider">Trigger Camera Verification</button>
            </div>
          </div>
        )}

        {/* === STEPS TAB === */}
        {activeTab === "steps" && (
          <div className="p-4 space-y-6 animate-fadeIn">
            <div className="mt-8 mb-6 text-center">
              <h1 className="text-4xl font-extrabold tracking-tighter uppercase text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">Steps</h1>
              <p className="text-[#a3a3a3] text-sm font-mono mt-1">Daily Activity Tracker</p>
            </div>

            <div className="bg-[#171717] rounded-2xl p-6 border border-[#262626] flex flex-col items-center">
              <Footprints className="w-12 h-12 text-[#a3a3a3] mb-4 opacity-50" />
              <div className="w-full bg-[#0A0A0A] border border-[#262626] rounded-full h-8 overflow-hidden mb-6 relative">
                 <div className="h-full bg-white transition-all shadow-[0_0_15px_rgba(255,255,255,0.3)]" style={{width: `${Math.min((todaySteps/goals.stepTarget)*100, 100)}%`}}></div>
                 <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-bold mix-blend-difference text-white uppercase tracking-widest">{Math.min(Math.round((todaySteps/goals.stepTarget)*100), 100)}% Completed</div>
              </div>
              <span className="text-5xl font-black font-mono tracking-tighter">{todaySteps.toLocaleString()}</span>
              <span className="text-[#737373] text-sm font-bold mt-1 uppercase tracking-widest">/ {goals.stepTarget.toLocaleString()} steps</span>
            </div>

            <div className="bg-[#171717] rounded-xl border border-[#262626] p-4 flex flex-col gap-4">
               <button onClick={requestMotionPermission} className="w-full py-3 bg-[#0A0A0A] border border-[#262626] hover:border-white rounded-lg text-white font-bold text-sm uppercase tracking-wider">
                 {stepsActiveSensor ? "Tracking Active" : "Enable iPhone Step Tracking"}
               </button>
               <button onClick={() => setTodaySteps(p => p+1000)} className="w-full py-3 bg-transparent border border-dashed border-[#262626] text-[#737373] hover:text-white rounded-lg font-bold text-xs uppercase tracking-wider">
                 Manual Add (+1,000)
               </button>
            </div>
          </div>
        )}

        {/* === SETTINGS TAB === */}
        {activeTab === "settings" && (
          <div className="p-4 space-y-6 animate-fadeIn">
            <div className="mt-8 mb-6 text-center">
              <h1 className="text-4xl font-extrabold tracking-tighter uppercase text-white">Settings</h1>
              <p className="text-[#a3a3a3] text-sm font-mono mt-1">Configure your metrics</p>
            </div>

            <div className="bg-[#171717] rounded-2xl p-6 border border-[#262626] space-y-6">
              <div>
                <label className="text-[#737373] text-xs font-bold uppercase tracking-widest block mb-2">Daily Calorie Goal</label>
                <input 
                  type="number" 
                  value={goals.calorieTarget} 
                  onChange={(e) => setGoals(p => ({...p, calorieTarget: Number(e.target.value)}))}
                  className="w-full bg-[#0A0A0A] border border-[#262626] text-white font-mono rounded-lg px-4 py-3 text-lg focus:border-[#9333ea] focus:outline-none"
                />
              </div>
              
              <div className="pt-4 border-t border-[#262626]">
                <label className="text-[#737373] text-xs font-bold uppercase tracking-widest block mb-2">Log New Weight (kg)</label>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    id="weightIn"
                    className="flex-1 bg-[#0A0A0A] border border-[#262626] text-white font-mono rounded-lg px-4 py-3 text-lg focus:outline-none focus:border-white"
                  />
                  <button onClick={() => {
                     const el = document.getElementById("weightIn") as HTMLInputElement;
                     if(el.value) {
                       setWeightLogs(p => [...p, {timestamp: new Date().toISOString(), weightKg: Number(el.value)}]);
                       verifyWeightPlateau();
                       el.value = "";
                     }
                  }} className="px-6 bg-white text-[#0A0A0A] font-bold rounded-lg uppercase tracking-wider">Log</button>
                </div>
              </div>

              <div>
                <label className="text-[#737373] text-xs font-bold uppercase tracking-widest block mb-4">Weight History</label>
                <div className="space-y-2">
                  {weightLogs.slice(-5).reverse().map((w,i) => (
                    <div key={i} className="flex justify-between items-center bg-[#0A0A0A] p-3 rounded-lg border border-[#262626]">
                      <span className="text-sm font-mono text-[#a3a3a3]">{new Date(w.timestamp).toLocaleDateString()}</span>
                      <span className="text-lg font-bold text-white font-mono">{w.weightKg} kg</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-[#262626]">
                 <button onClick={requestNotificationPermission} className="w-full py-3 bg-[#2563eb] hover:bg-blue-600 rounded-lg text-white font-bold text-sm uppercase tracking-wider">
                   Enable Push Notifications
                 </button>
                 <p className="text-xs text-[#737373] text-center mt-2 font-mono">Requires iOS 16.4+ via Save to Homescreen.</p>
              </div>

            </div>
          </div>
        )}

      </div>

      {/* Dark Mobile Bottom Nav Bar */}
      <nav className="absolute bottom-0 w-full bg-[#0A0A0A]/95 backdrop-blur-xl border-t border-[#262626] flex items-center justify-around pb-6 pt-3 px-4 z-40 supports-[padding-bottom:env(safe-area-inset-bottom)]:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button onClick={() => setActiveTab("steps")} className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'steps' ? 'text-white' : 'text-[#737373]'}`}>
          <Activity className="w-5 h-5" />
          <span className="text-[10px] font-bold tracking-widest">Steps</span>
        </button>
        <button onClick={() => setActiveTab("water")} className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'water' ? 'text-white' : 'text-[#737373]'}`}>
          <Droplet className="w-5 h-5" />
          <span className="text-[10px] font-bold tracking-widest">Water</span>
        </button>
        <button onClick={() => setActiveTab("food")} className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'food' ? 'text-white' : 'text-[#737373]'}`}>
          <Flame className="w-5 h-5" />
          <span className="text-[10px] font-bold tracking-widest">Food</span>
        </button>
        <button onClick={() => setActiveTab("settings")} className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'settings' ? 'text-white' : 'text-[#737373]'}`}>
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-bold tracking-widest">Settings</span>
        </button>
      </nav>
    </div>
  );
}


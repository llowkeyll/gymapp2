/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { MealLog } from "../types";
import { Camera, Loader2, Salad, Info, Check, AlertCircle } from "lucide-react";

interface CalorieScannerProps {
  mealLogs: MealLog[];
  onAddMeal: (meal: Omit<MealLog, "id" | "timestamp">) => void;
  onDeleteMeal: (id: string) => void;
}

export default function CalorieScanner({ mealLogs, onAddMeal, onDeleteMeal }: CalorieScannerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<Omit<MealLog, "id" | "timestamp"> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processAndCompressImage = (file: File): Promise<{ base64: string; compressedUrl: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 480;
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("err")); return; }
          ctx.drawImage(img, 0, 0, width, height);
          const compressedUrl = canvas.toDataURL("image/jpeg", 0.65);
          resolve({ base64: compressedUrl.split(",")[1], compressedUrl });
        };
        img.onerror = () => reject(new Error("Unable to parse image"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Failure to read file"));
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true); setError(null); setScanResult(null);

    // Determine type by checking what is missing
    const todayStr = new Date().toDateString();
    const todayMeals = mealLogs.filter(m => new Date(m.timestamp).toDateString() === todayStr);
    const hasBreakfast = todayMeals.some(m => m.mealType === "Breakfast");
    const mealChoice = hasBreakfast ? "Lunch" : "Breakfast";

    if (todayMeals.length >= 2) {
      setError("Protocol strictly dictates 2 meals maximum (Breakfast/Lunch). Fasting window closed.");
      setIsLoading(false);
      return;
    }

    try {
      const { base64, compressedUrl } = await processAndCompressImage(file);
      setPreviewUrl(compressedUrl);

      const response = await fetch("/api/analyze-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType: "image/jpeg" }),
      });

      if (!response.ok) throw new Error("Vision Engine Failure.");

      const info = await response.json();
      
      setScanResult({
        name: info.foodName || "Scan Result",
        calories: Number(info.calories) || 0,
        protein: Number(info.proteinGrams) || 0,
        carbs: Number(info.carbGrams) || 0,
        fat: Number(info.fatGrams) || 0,
        servingSize: info.servingSize || "1 portion",
        confidence: Number(info.confidence) || 80,
        explanation: info.explanation || "",
        isManual: false,
        imageUrl: compressedUrl,
        mealType: mealChoice
      });
    } catch (err: any) {
      setError(err.message || "Execution failure.");
    } finally {
      setIsLoading(false);
    }
  };

  const logScannedMeal = () => {
    if (!scanResult) return;
    onAddMeal(scanResult);
    setScanResult(null);
    setPreviewUrl(null);
  };

  const todayStr = new Date().toDateString();
  const todayMeals = mealLogs.filter((m) => new Date(m.timestamp).toDateString() === todayStr);

  return (
    <div className="w-full flex justify-center">
      <div className="w-full space-y-6">

        {/* Vision Scanner Section */}
        <div className="bg-[#171717] border border-[#262626] rounded-2xl p-6 text-center shadow-lg relative min-h-[220px] flex flex-col justify-center">
          {isLoading ? (
            <div className="space-y-4 flex flex-col items-center animate-pulse">
              <Loader2 className="w-10 h-10 text-[#9333ea] animate-spin" />
              <h4 className="text-sm font-bold text-white uppercase tracking-widest">Processing Image Pattern...</h4>
            </div>
          ) : scanResult ? (
            <div className="space-y-4 text-left">
              {previewUrl && (
                <div className="w-full h-32 rounded-xl overflow-hidden mb-2 border border-[#262626]">
                  <img src={previewUrl} alt="Meal scanned" className="w-full h-full object-cover" />
                </div>
              )}
              
              <div>
                <div className="flex justify-between items-start gap-2">
                  <div>
                     <span className="text-[10px] text-[#9333ea] uppercase font-black tracking-widest block mb-0.5">{scanResult.mealType} Verification</span>
                     <h3 className="text-lg font-bold text-white tracking-tight">{scanResult.name}</h3>
                  </div>
                  <span className="px-2 py-1 bg-[#0A0A0A] text-[10px] text-[#737373] font-mono font-bold rounded border border-[#262626]">
                    ACC: {scanResult.confidence}%
                  </span>
                </div>
                <p className="text-xs text-[#a3a3a3] font-mono mt-1">{scanResult.servingSize}</p>
              </div>

              <div className="grid grid-cols-4 gap-2 bg-[#0A0A0A] p-3 rounded-xl border border-[#262626]">
                <div className="text-center p-1">
                  <span className="text-[9px] font-bold text-[#737373] uppercase tracking-widest block">Kcal</span>
                  <span className="text-sm font-black text-white font-mono block mt-1">{scanResult.calories}</span>
                </div>
                <div className="text-center p-1 border-l border-[#171717]">
                  <span className="text-[9px] font-bold text-[#737373] uppercase tracking-widest block">Pro</span>
                  <span className="text-sm font-semibold text-[#a3a3a3] font-mono block mt-1">{scanResult.protein}g</span>
                </div>
                <div className="text-center p-1 border-l border-[#171717]">
                  <span className="text-[9px] font-bold text-[#737373] uppercase tracking-widest block">Carb</span>
                  <span className="text-sm font-semibold text-[#a3a3a3] font-mono block mt-1">{scanResult.carbs}g</span>
                </div>
                <div className="text-center p-1 border-l border-[#171717]">
                  <span className="text-[9px] font-bold text-[#737373] uppercase tracking-widest block">Fat</span>
                  <span className="text-sm font-semibold text-[#a3a3a3] font-mono block mt-1">{scanResult.fat}g</span>
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button onClick={() => { setScanResult(null); setPreviewUrl(null); }} className="flex-1 py-3 px-4 text-xs font-bold uppercase tracking-widest text-white bg-[#0A0A0A] hover:bg-[#262626] border border-[#262626] rounded-lg transition-colors text-center">
                  Discard
                </button>
                <button onClick={logScannedMeal} className="flex-1 py-3 px-4 text-xs font-bold uppercase tracking-widest text-white bg-white/10 border border-white hover:bg-white hover:text-black rounded-lg transition-colors text-center shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                  Log Data
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 flex flex-col items-center">
              <Camera className="w-12 h-12 text-[#737373] mb-2" />
              <div>
                <h4 className="text-sm font-black text-white uppercase tracking-widest">Verify Meal</h4>
                <p className="text-xs text-[#a3a3a3] mt-2 max-w-xs mx-auto leading-relaxed font-mono">
                  Upload visual proof via camera. Strictly 2 scans allocated (Breakfast & Lunch). Dinner fasting window absolute.
                </p>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileSelection} accept="image/*" capture="environment" className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="mt-4 px-6 py-3 text-xs font-black uppercase text-white bg-[#9333ea] hover:bg-purple-700 rounded-lg shadow-[0_0_15px_rgba(147,51,234,0.4)] flex items-center justify-center gap-2 w-full max-w-[200px] border border-purple-500">
                <Camera className="w-4 h-4" /> Snap Photo
              </button>
            </div>
          )}

          {error && (
            <div className="absolute top-2 left-2 right-2 p-3 bg-[#dc2626] border border-red-400 text-white font-mono text-xs rounded-lg flex items-center z-10 shadow-[0_0_15px_rgba(220,38,38,0.5)]">
              <AlertCircle className="w-4 h-4 shrink-0 mr-2" />
              <span className="flex-1 text-left">{error}</span>
              <button onClick={() => setError(null)} className="font-bold underline ml-2">X</button>
            </div>
          )}
        </div>

        {/* Meal Verification List */}
        <div>
          <h3 className="text-xs font-black text-[#737373] uppercase tracking-widest mb-3 flex items-center gap-2">
            <span>Verified Feed</span>
          </h3>

          <div className="space-y-3">
            {todayMeals.map((meal) => (
              <div key={meal.id} className="flex bg-[#171717] rounded-xl border border-[#262626] overflow-hidden items-stretch">
                <div className="w-2 relative bg-[#0A0A0A] border-r border-[#262626]">
                   <div className="absolute top-0 bottom-0 left-0 right-0 bg-[#9333ea]/30"></div>
                </div>
                {meal.imageUrl && (
                  <div className="w-20 shrink-0 bg-[#0A0A0A] border-r border-[#262626]">
                    <img src={meal.imageUrl} alt={meal.name} className="w-full h-full object-cover opacity-80 mix-blend-luminosity grayscale" />
                  </div>
                )}
                <div className="flex-1 p-4 flex justify-between items-center bg-[#0A0A0A]/50">
                   <div>
                     <span className="text-[9px] uppercase tracking-widest font-black text-[#9333ea] block">{meal.mealType}</span>
                     <p className="text-sm font-bold text-white leading-tight">{meal.name}</p>
                     <p className="text-[10px] text-[#737373] font-mono mt-1">{meal.servingSize}</p>
                   </div>
                   <div className="text-right flex flex-col items-end">
                      <span className="text-xl font-black font-mono text-white">{meal.calories}</span>
                      <span className="text-[9px] text-[#737373] uppercase tracking-widest block font-bold">Kcal</span>
                   </div>
                </div>
              </div>
            ))}
            
            {todayMeals.length === 0 && (
               <div className="w-full py-8 border border-dashed border-[#262626] rounded-xl flex items-center justify-center">
                  <span className="text-[#404040] font-mono text-xs uppercase font-bold tracking-widest">No verified fuel blocks.</span>
               </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

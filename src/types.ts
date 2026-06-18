/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MealLog {
  id: string;
  timestamp: string; // ISO string
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: string;
  confidence: number;
  isManual: boolean;
  imageUrl?: string; // compressed base64 or objectUrl
  explanation?: string;
  mealType: "Breakfast" | "Lunch";
}

export interface WaterLog {
  id: string;
  timestamp: string; // ISO string
  amountMl: number;
  verifiedImageUrl?: string;
}

export interface StepLog {
  id: string;
  timestamp: string; // ISO string or simple date string
  stepsCount: number;
}

export interface WeightLog {
  timestamp: string;
  weightKg: number;
}

export interface DailyGoals {
  calorieTarget: number;
  waterTargetMl: number;
  stepTarget: number;
}

export interface NotificationSchedule {
  enabled: boolean;
  intervalMinutes: number;
  lastTriggered?: string;
}

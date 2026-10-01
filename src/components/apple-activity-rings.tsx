"use client";

import { Apple } from "lucide-react";
import type { AppleHealthRings as AppleHealthRingsType } from "@/lib/domain";

export function AppleActivityRings({
  rings,
  onOpenSync,
  compact = false
}: {
  rings: AppleHealthRingsType;
  onOpenSync?: () => void;
  compact?: boolean;
}) {
  const moveGoal = Math.max(1, rings.moveGoal || 500);
  const exerciseGoal = Math.max(1, rings.exerciseGoal || 30);
  const standGoal = Math.max(1, rings.standGoal || 12);

  const moveCurrent = Math.max(0, rings.moveCalories || 0);
  const exerciseCurrent = Math.max(0, rings.exerciseMinutes || 0);
  const standCurrent = Math.max(0, rings.standHours || 0);

  // Circumferences for circles:
  // Ring 1 (Move): r = 50 -> 2 * PI * 50 = 314.159
  // Ring 2 (Exercise): r = 38 -> 2 * PI * 38 = 238.761
  // Ring 3 (Stand): r = 26 -> 2 * PI * 26 = 163.363
  const cMove = 314.159;
  const cExercise = 238.761;
  const cStand = 163.363;

  const moveProg = Math.max(0, Math.min(1, moveCurrent / moveGoal));
  const exerciseProg = Math.max(0, Math.min(1, exerciseCurrent / exerciseGoal));
  const standProg = Math.max(0, Math.min(1, standCurrent / standGoal));

  const moveOffset = cMove * (1 - moveProg);
  const exerciseOffset = cExercise * (1 - exerciseProg);
  const standOffset = cStand * (1 - standProg);

  return (
    <div
      className={`apple-rings-widget ${compact ? "compact" : ""}`}
      onClick={onOpenSync}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onOpenSync) {
          e.preventDefault();
          onOpenSync();
        }
      }}
      title="Apple Health Aktivitätsringe · Tippen für Details & Synchronisation"
    >
      <div className="apple-rings-graphic">
        <svg
          viewBox="0 0 120 120"
          className="apple-rings-svg"
          aria-label="Apple Health Aktivitätsringe"
        >
          <defs>
            <linearGradient id="moveGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fa114f" />
              <stop offset="100%" stopColor="#ff4569" />
            </linearGradient>
            <linearGradient id="exerciseGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a1ff00" />
              <stop offset="100%" stopColor="#82e600" />
            </linearGradient>
            <linearGradient id="standGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f0ff" />
              <stop offset="100%" stopColor="#00c8e0" />
            </linearGradient>
          </defs>

          {/* Background tracks */}
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="#fa114f"
            strokeWidth="9"
            opacity="0.18"
          />
          <circle
            cx="60"
            cy="60"
            r="38"
            fill="none"
            stroke="#a1ff00"
            strokeWidth="9"
            opacity="0.18"
          />
          <circle
            cx="60"
            cy="60"
            r="26"
            fill="none"
            stroke="#00f0ff"
            strokeWidth="9"
            opacity="0.18"
          />

          {/* Active progress rings */}
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="url(#moveGradient)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={cMove}
            strokeDashoffset={moveOffset}
            transform="rotate(-90 60 60)"
            className="ring-progress ring-move"
          />
          <circle
            cx="60"
            cy="60"
            r="38"
            fill="none"
            stroke="url(#exerciseGradient)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={cExercise}
            strokeDashoffset={exerciseOffset}
            transform="rotate(-90 60 60)"
            className="ring-progress ring-exercise"
          />
          <circle
            cx="60"
            cy="60"
            r="26"
            fill="none"
            stroke="url(#standGradient)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={cStand}
            strokeDashoffset={standOffset}
            transform="rotate(-90 60 60)"
            className="ring-progress ring-stand"
          />
        </svg>

        <div className="apple-rings-glyph">
          <Apple size={18} />
        </div>
      </div>

      <div className="apple-rings-legend">
        <div className="rings-header-row">
          <span className="rings-apple-badge">
            <Apple size={12} />
            <span>Apple Health</span>
          </span>
          {rings.lastSyncedAt ? (
            <span className="rings-status live" title="Zuletzt mit Apple Health synchronisiert">Live</span>
          ) : (
            <span className="rings-status auto" title="Aus heutigen Trainingseinheiten berechnet">Heute</span>
          )}
        </div>

        <div className="ring-row move">
          <span className="ring-dot move" />
          <div className="ring-label-box">
            <span className="ring-title">BEWEGEN</span>
            <strong>
              {Math.round(moveCurrent)}
              <small>/ {Math.round(moveGoal)} kcal</small>
            </strong>
          </div>
        </div>

        <div className="ring-row exercise">
          <span className="ring-dot exercise" />
          <div className="ring-label-box">
            <span className="ring-title">TRAINIEREN</span>
            <strong>
              {Math.round(exerciseCurrent)}
              <small>/ {Math.round(exerciseGoal)} Min.</small>
            </strong>
          </div>
        </div>

        <div className="ring-row stand">
          <span className="ring-dot stand" />
          <div className="ring-label-box">
            <span className="ring-title">STEHEN</span>
            <strong>
              {Math.round(standCurrent)}
              <small>/ {Math.round(standGoal)} Std.</small>
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}

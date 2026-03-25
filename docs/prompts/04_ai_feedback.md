# Living Heros --- Prompt #4: Player Command UX & AI Feedback System (FULL --- Phaser 3 + TypeScript)

## CONTEXT

You are extending the Living Heros project after Prompt #3.

Current system includes: - Phaser battle system - Hero AI
(personality-driven) - Scheduler + Summary + Decision + Executor - Basic
UI shell (React + Phaser overlay)

Your task is to build the **Player Command UX + AI Feedback Layer**

This system is CRITICAL because it determines whether: - AI feels
"smart" - or AI feels "random"

------------------------------------------------------------------------

## DOCUMENT PRIORITY

1.  TDD → architecture
2.  PRD → scope
3.  GDD → player experience
4.  This prompt → execution

------------------------------------------------------------------------

## GOAL

Build a UX system where:

-   Player understands what heroes are doing
-   Player understands WHY decisions happen
-   Player sees relationship between command → decision → action
-   AI behavior becomes readable and trustworthy

------------------------------------------------------------------------

## CORE PRINCIPLE

👉 If player cannot understand AI → system fails

------------------------------------------------------------------------

# SYSTEM OVERVIEW

``` text
Player Input
  ↓
Command State
  ↓
Hero Interpretation (AI)
  ↓
Decision (intent + rationale)
  ↓
UI Feedback Layer
```

------------------------------------------------------------------------

## STEP 1 --- COMMAND UI (REACT)

Create a **Command Panel** component.

### Features:

-   Buttons:
    -   Protect
    -   Hold
    -   Advance
    -   Focus

### Behavior:

-   Clicking sets global `PlayerCommand`
-   Emits event to game layer

------------------------------------------------------------------------

## STEP 2 --- COMMAND STATE

Create central command state:

``` ts
type PlayerCommand = {
  type: "protect" | "hold" | "advance" | "focus"
  targetId?: string
}
```

Requirements: - Stored centrally - Observable by HeroScheduler -
Triggers AI update

------------------------------------------------------------------------

## STEP 3 --- HERO INTENT DISPLAY

Display current hero intent in UI.

Example:

``` text
Hero: Alden
Intent: Protecting Archers
```

Must include: - intent label - rationaleTag

------------------------------------------------------------------------

## STEP 4 --- RATIONALE VISIBILITY

Display WHY decision was made.

Examples: - "Protecting archers (player command)" - "Retreating (low
HP)" - "Advancing (enemy weak)"

Use `rationaleTag`.

------------------------------------------------------------------------

## STEP 5 --- FEEDBACK TIMELINE (IMPORTANT)

Add simple decision log:

``` text
[12.3s] Protect Archers
[15.1s] Hold Position
[18.7s] Advance
```

This helps player track behavior.

------------------------------------------------------------------------

## STEP 6 --- VISUAL FEEDBACK (PHASER)

Inside BattleScene:

-   Highlight hero target
-   Show movement arrow
-   Optional: small text above hero

Example: - "Protecting" - "Retreating"

------------------------------------------------------------------------

## STEP 7 --- SELECTION SYSTEM

Allow selecting: - hero - units

React panel updates based on selection.

------------------------------------------------------------------------

## STEP 8 --- DEBUG PANEL (DEV MODE)

Display:

-   current summary snapshot
-   candidate scores
-   chosen decision
-   recheck timer

Toggleable.

------------------------------------------------------------------------

## STEP 9 --- EVENT FLOW

``` text
Player clicks command
→ update PlayerCommand
→ HeroScheduler triggers
→ AI decision
→ UI updates
```

------------------------------------------------------------------------

## STEP 10 --- ERROR HANDLING

If no decision: - fallback to "Hold Position" - display fallback reason

------------------------------------------------------------------------

## WHAT NOT TO DO

-   Do NOT add new gameplay systems
-   Do NOT modify AI logic
-   Do NOT overdesign UI
-   Do NOT hide decision logic

------------------------------------------------------------------------

## SUCCESS CRITERIA

System is successful if:

-   Player understands AI decisions
-   Player sees cause-effect clearly
-   Player can trust behavior
-   AI no longer feels random

------------------------------------------------------------------------

## FINAL INSTRUCTION

Make AI **visible, understandable, and trustworthy**.

Clarity \> complexity

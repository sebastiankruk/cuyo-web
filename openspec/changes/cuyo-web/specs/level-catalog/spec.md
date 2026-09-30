## Purpose

Defines the set of levels the game offers, the level tracks that group them, the
difficulty dimension, how a specific versioned definition is selected for the
active difficulty and track, and how per-level availability and progress are
tracked and persisted.

## ADDED Requirements

### Requirement: Level inventory

The game SHALL offer the levels defined by the original level set, including the
"Standard" track and the full set, each with its display name, author and
description.

#### Scenario: Standard track contents

- **WHEN** the Standard track is listed
- **THEN** it contains the 48 levels designated as standard in the original level
  summary

#### Scenario: Level metadata is available

- **WHEN** any level is listed
- **THEN** its display name, author and description are available for display

### Requirement: Level tracks

Levels SHALL be groupable into the original tracks - Standard, All levels, Games,
Extremes, No FX, Weird and Contributions - and the player SHALL be able to choose
the track to play.

#### Scenario: Track membership

- **WHEN** the Games track is selected
- **THEN** only levels designated as game-like simulations are offered

#### Scenario: Track as a version dimension

- **WHEN** a level defines a value only for a specific track
- **THEN** that value applies when that track is active and the unqualified
  definition applies otherwise

### Requirement: Difficulty

The game SHALL offer the Easy, Normal and Hard difficulty settings, and the active
difficulty SHALL participate in version selection for level definitions.

#### Scenario: Easy reduces the explode threshold

- **WHEN** a level defines `numexplode = 5` and `numexplode[easy] = 4`
- **THEN** the threshold is 4 on Easy and 5 on Normal and Hard

#### Scenario: Easy and Hard are mutually exclusive

- **WHEN** the player selects Easy
- **THEN** no Hard-specific definition applies

### Requirement: Single-player version selection

The game SHALL run as single-player, and the single-player dimension SHALL
participate in version selection.

#### Scenario: Single-player override applies

- **WHEN** a level defines `numexplode = 8` and `numexplode[1] = 6`
- **THEN** the threshold is 6

#### Scenario: Two-player-only definitions are inert

- **WHEN** a level defines `numexplode[2] = 6` and the game runs single-player
- **THEN** the unqualified definition is used

### Requirement: Level availability

Levels SHALL be gated by a track or a version so that levels requiring an
unsupported mode are not offered.

#### Scenario: Unsupported mode is not offered

- **WHEN** a level is defined only for a two-player mode that the game does not
  support
- **THEN** the level is not listed as playable and is skipped rather than failing
  to load

### Requirement: Progress tracking

The game SHALL record, per level and per difficulty, whether the level has been
completed and the best score achieved, and SHALL use completion to unlock
subsequent levels in the ordered tracks.

#### Scenario: First completion unlocks the next level

- **WHEN** a level is completed for the first time
- **THEN** the next level in that track becomes playable

#### Scenario: Best score is kept

- **WHEN** a level is completed with a lower score than a previous completion
- **THEN** the stored best score remains the higher value

#### Scenario: Progress is per difficulty

- **WHEN** a level is completed on Easy but not on Hard
- **THEN** the Hard record for that level is still incomplete

### Requirement: Level introduction

Starting a level SHALL show its name, author and description before play begins,
and SHALL wait for the player to begin.

#### Scenario: Introduction precedes play

- **WHEN** a level is chosen
- **THEN** the introduction is shown and the simulation does not advance until the
  player confirms

#### Scenario: Introduction can be skipped

- **WHEN** the player has previously seen a level's introduction
- **THEN** the introduction MAY be skipped on subsequent attempts

### Requirement: Level restart

A level SHALL be restartable from its introduction and from the pause menu,
returning to the same level with a fresh board and a fresh random sequence.

#### Scenario: Restart from pause

- **WHEN** the player restarts a level from the pause menu
- **THEN** the board is reset to the level's initial layout, the score and step
  counter are zero, and play resumes from the beginning

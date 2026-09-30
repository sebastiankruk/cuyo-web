## Purpose

Defines the headless simulation of a Cuyo game board: how pieces fall and are
steered, how blobs connect and form components, when they explode, how grey and
goal blobs behave, how the chase border threatens the player, and how a level is
won, lost and scored. This capability is independent of rendering and of any
particular presentation, so that the rules can be exercised by tests alone.

## ADDED Requirements

### Requirement: Fixed-step simulation tick

The simulation SHALL advance in discrete steps of 80 milliseconds, and the
outcome of a step SHALL depend only on the state at the start of that step and
the player's input during it, never on wall-clock time.

#### Scenario: Step duration

- **WHEN** the simulation has been running for one second of wall-clock time
- **THEN** exactly 12 or 13 steps have been executed
- **AND** the board state after N steps is identical regardless of how the
  elapsed real time was distributed between those steps

#### Scenario: A backgrounded game does not fast-forward

- **WHEN** the game is suspended or its animation frames stop for a long interval
  and then resumes
- **THEN** the catch-up is bounded and the surplus elapsed time is discarded
- **AND** the board does not advance by hundreds of steps in a single frame

#### Scenario: Pause halts progress

- **WHEN** the game is paused
- **THEN** no step is executed and the board state is unchanged until unpaused

### Requirement: Board geometry

The play area SHALL be a grid 10 cells wide and 20 cells tall. Each cell holds at
most one blob. A cell that holds no blob is an empty blob.

#### Scenario: Grid dimensions

- **WHEN** a level is started
- **THEN** the board has exactly 10 columns and exactly 20 rows addressable by
  (x, y) with x in 0..9 and y in 0..19 and y increasing downward

### Requirement: Falling piece composition and spawn

A falling piece SHALL consist of exactly two blobs. It SHALL spawn horizontally
centred at column 4 (the fifth column), with the left blob at column 4 and the
right blob at column 5, just above the chase border.

#### Scenario: Spawn position

- **WHEN** a new falling piece appears
- **THEN** its two blobs occupy the positions that, once lowered onto the border,
  are columns 4 and 5 of the same row
- **AND** each blob has a kind drawn from the level's falling-blob
  distribution

#### Scenario: No room to spawn

- **WHEN** the cells the new piece would occupy are not all free
- **THEN** the player loses the level immediately

### Requirement: Steering the falling piece

The player SHALL be able to move the falling piece one cell left, one cell right,
rotate it between horizontal and vertical, and toggle fast falling. A move SHALL
be rejected, leaving the piece unchanged, if the destination cells are not all
free.

#### Scenario: Move left

- **WHEN** the player moves the piece left and both destination cells are free
- **THEN** the piece is now one column to the left

#### Scenario: Move rejected when blocked

- **WHEN** the player moves the piece left and a destination cell is occupied
- **THEN** the piece does not move

#### Scenario: Rotation swaps orientation

- **WHEN** the player rotates a horizontal piece whose two vertically-stacked
  destination cells are free
- **THEN** the piece becomes vertical, with the blob order chosen so that the
  rotation appears clockwise to the player

#### Scenario: Rotation blocked

- **WHEN** the player rotates a piece and the destination cells are not free
- **THEN** the piece keeps its current orientation

#### Scenario: Fast fall is a toggle

- **WHEN** the player activates fast falling and later activates it again
- **THEN** the piece falls at the fast speed in between and at the normal speed
  after the second activation

### Requirement: Falling speed

The falling piece SHALL descend by 6 pixels per step at normal speed and by 32
pixels per step (one full cell) while fast falling, and SHALL never descend past
the chase border.

#### Scenario: Normal descent rate

- **WHEN** a falling piece descends one step at normal speed
- **THEN** it has moved down by exactly 6 pixels

### Requirement: Landing and partial landing

When a falling piece can no longer descend, each of its blobs that is resting on
support SHALL become a permanent board blob. If only one blob can land, the
remaining blob SHALL continue falling on its own until it lands.

#### Scenario: Both blobs land

- **WHEN** both blobs of a horizontal piece are resting on support
- **THEN** both become board blobs and no falling piece remains

#### Scenario: One blob of a horizontal piece lands first

- **WHEN** only the left blob of a horizontal piece is resting on support
- **THEN** the left blob becomes a board blob
- **AND** the remaining blob continues to fall, and the piece is no longer
  steerable

#### Scenario: Vertical piece lands as a unit

- **WHEN** a vertical piece is resting on support
- **THEN** both blobs become board blobs, with the lower blob fixed first

### Requirement: Kind-based connection rules

Two adjacent blobs SHALL be connected only when both have the same kind, when the
level's neighbour mode includes the direction between them, and when neither blob
has that direction inhibited. Each level's neighbour mode SHALL be one of:
rectangular (up, down, left, right); horizontal only; vertical only; diagonal
only; queen (rectangular plus diagonal); knight moves; hex six; hex four; and
three-dimensional hex.

#### Scenario: Rectangular connection

- **WHEN** in a rectangular-neighbour level two same-kind blobs are horizontally
  adjacent and a third same-kind blob is diagonally adjacent to one of them
- **THEN** the first two are in the same component and the diagonal one is not

#### Scenario: Diagonal connection

- **WHEN** in a diagonal-neighbour level two same-kind blobs are diagonally
  adjacent
- **THEN** they are in the same component

#### Scenario: Hex offset

- **WHEN** a level uses a hex neighbour mode
- **THEN** odd-numbered columns are drawn offset half a cell downward relative to
  even-numbered columns, and the four diagonal directions connect to the offset
  rows accordingly

#### Scenario: Different kinds never connect

- **WHEN** two blobs of different kinds are adjacent in every direction allowed
  by the level's neighbour mode
- **THEN** they are not connected

#### Scenario: Inhibition breaks a connection

- **WHEN** a blob has a direction inhibited
- **THEN** it is not connected to a blob in that direction, even when the level's
  neighbour mode would allow it

### Requirement: Component size and weight

Every blob in the same component SHALL see the component's `size` equal to the
sum of the `weight` values of all its members. The default weight is 1.

#### Scenario: Weighted component size

- **WHEN** three blobs with weights 2, 3 and 1 form one component
- **THEN** each of them reports a size of 6

### Requirement: Size-triggered explosions

A component SHALL explode when its size is greater than or equal to the
`numexplode` value of its kind and that kind is configured to explode on size.
Explosion SHALL remove the blobs from the board and award 1 point per exploded
blob, or 20 points per exploded goal blob.

#### Scenario: Component reaches the threshold

- **WHEN** in a level with `numexplode` 4 a component of four same-kind blobs
  forms
- **THEN** all four blobs explode and 4 points are awarded

#### Scenario: Component below the threshold

- **WHEN** a component of three blobs forms in a level with `numexplode` 4
- **THEN** no blob explodes and no points are awarded

### Requirement: Explosion propagation to goal and grey blobs

A goal (grass) blob SHALL explode when it neighbours a size-triggered explosion.
When the level sets `chaingrass`, a goal blob SHALL instead require that the
triggering explosion is part of a chain reaction. A grey blob SHALL explode when
it neighbours a size-triggered explosion, whether or not that explosion is part of
a chain reaction.

#### Scenario: Grass explodes without chain reaction

- **WHEN** in a level without `chaingrass` an explosion occurs directly above a
  goal blob
- **THEN** the goal blob explodes and 20 points are awarded

#### Scenario: Chain-grass resists a first explosion

- **WHEN** in a level with `chaingrass` a single explosion occurs directly above
  a goal blob and no chain reaction follows
- **THEN** the goal blob does not explode

#### Scenario: Chain-grass yields to a chain reaction

- **WHEN** in a level with `chaingrass` a goal blob neighbours a second or later
  explosion of the same resolution pass
- **THEN** the goal blob explodes

#### Scenario: Grey blobs always propagate

- **WHEN** a grey blob neighbours a size-triggered explosion
- **THEN** the grey blob explodes

### Requirement: Chain reactions

When an explosion causes further explosions during the same resolution, the pass
SHALL be treated as a chain reaction. A chain reaction SHALL award an additional
10 points.

#### Scenario: Cascade awards the chain bonus once

- **WHEN** one size-triggered explosion causes three grey blobs to explode
- **THEN** the player receives the points for all exploded blobs plus a single
  chain-reaction bonus of 10

### Requirement: Grey blob generation from explosions

Each resolution that explodes something SHALL schedule a number of grey blobs
equal to one, plus five more if the resolution was a chain reaction, plus the
total size of the components that exploded, minus the largest `numexplode`
threshold among the kinds that exploded. Scheduled grey blobs SHALL be dropped
into free cells at the top of the board, above the chase border, distributed
randomly across columns, one blob per free cell at most.

#### Scenario: Single explosion yields grey blobs

- **WHEN** a single component of four blobs explodes in a level with
  `numexplode` 4
- **THEN** exactly one grey blob is scheduled to appear

#### Scenario: Chain reaction yields extra grey blobs

- **WHEN** a chain reaction explodes a total component size of 10 in a level with
  `numexplode` 4
- **THEN** 1 + 5 + 10 - 4 = 12 grey blobs are scheduled

### Requirement: Random grey blobs

A level may request grey blobs at random. When it does, the system SHALL schedule
an additional grey blob with the configured expected number of steps between
arrivals.

#### Scenario: Random greys are rare

- **WHEN** a level requests one grey blob every 500 steps
- **THEN** roughly one grey blob is scheduled per 500 steps over a long run

### Requirement: Gravity and floating blobs

After a resolution pass, every blob that has empty space below it SHALL fall down
by one cell, repeating until nothing moves, unless it is marked as floating. Empty
blobs are unaffected by gravity.

#### Scenario: Blobs settle after an explosion

- **WHEN** a blob is removed from the middle of a column
- **THEN** all blobs above it fall down until the column is packed at the bottom

#### Scenario: Floating blobs stay put

- **WHEN** a blob is marked as floating and the cell below it is empty
- **THEN** the blob does not fall

### Requirement: The chase border

The board SHALL have a chase border that starts at the top and descends one pixel
every `toptime` steps, where `toptime` defaults to 50. The player SHALL lose when
the border reaches a row that contains a blob.

#### Scenario: Default descent rate

- **WHEN** a level does not set `toptime`
- **THEN** the border descends one pixel every 50 steps, i.e. one cell every 1600
  steps

#### Scenario: Border causes loss

- **WHEN** the border descends onto a row containing a non-empty blob
- **THEN** the player loses the level immediately

### Requirement: New pieces only after the field settles

A new falling piece SHALL only be introduced once pending grey blobs have fallen
far enough that the piece has room, and not while the previously falling piece is
still finishing its landing animation.

#### Scenario: Piece is held back by tall grey stacks

- **WHEN** grey blobs are still falling and have not descended past the spawn
  safety margin
- **THEN** no new falling piece is introduced

### Requirement: Win condition

A level SHALL be won when the board contains no goal blobs. Once the board has
settled, the remaining chase-border height SHALL be converted into a time bonus by
running a bonus animation, with the points awarded per step as defined by the
Scoring requirement.

#### Scenario: Clearing all goal blobs wins

- **WHEN** the last goal blob explodes and no goal blobs remain
- **THEN** the level is won and the time bonus animation runs

#### Scenario: Higher remaining border yields a larger bonus

- **WHEN** two runs of the same level finish with different remaining chase-border
  heights
- **THEN** the run with more remaining height awards more time-bonus points

#### Scenario: The bonus animation ends when the border reaches its rest row

- **WHEN** the time-bonus animation runs until the chase border has descended to
  `hetzrandStop` cells above the bottom
- **THEN** the level becomes won, having paid out 10 points for every step of the
  animation including the one that lands the border there

The animation advances the border by one cell per step, so it lasts at most one
step per board row: winning with the border still at the top pays out 200
points, and any `hetzrandStop` above zero shortens it.

### Requirement: Scoring

The score SHALL increase by 1 per exploded non-goal blob, 20 per exploded goal
blob, 10 per chain reaction and 10 per time-bonus step. Score SHALL never
decrease during a level.

#### Scenario: Mixed explosion scoring

- **WHEN** a single resolution explodes two normal blobs and one goal blob
- **THEN** the score increases by 22

#### Scenario: Time bonus accrues over the animation

- **WHEN** the time-bonus animation runs to completion with the chase border
  still at the top of a board whose `hetzrandStop` is 0
- **THEN** the player's score increases by 200, one step of 10 points for each of
  the 20 rows the border descends

### Requirement: Deterministic randomness

All random choices - falling piece kinds, grey blob kinds, grey blob placement,
random grey arrivals and Cual's random operators - SHALL be drawn from a single
seeded random source, so that a given seed and input sequence always produces the
same game.

#### Scenario: Same seed reproduces a game

- **WHEN** two games are played with the same seed and the same player inputs
- **THEN** the two games produce identical board states at every step

### Requirement: Explosion animation

An exploding blob SHALL remain part of the board for 8 steps before its cell
becomes empty, during which it still participates in neighbour queries. The
simulation SHALL expose its progress through the blob's `exploding` value, which
SHALL run from 1 to 8. How that value is drawn is outside the scope of this
capability.

#### Scenario: Explosion duration

- **WHEN** a blob starts exploding
- **THEN** it reports itself as exploding for 8 subsequent steps

#### Scenario: Exploding blobs still answer neighbour queries

- **WHEN** a blob is in its exploding state
- **THEN** other blobs still resolve it as occupying its cell for the purposes of
  connection and explosion propagation

### Requirement: Level lifecycle

A level SHALL progress through a defined sequence: introduction screen, running,
and a terminal state of won, lost, or time-bonus-complete. The simulation SHALL
support restarting a level with the same level definition and a fresh board.

#### Scenario: Restart resets the board

- **WHEN** a level is restarted
- **THEN** the board matches the level's initial layout and the score and step
  counter are reset

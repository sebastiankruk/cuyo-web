## Purpose

Defines how the game is drawn: the board layout on screen, how Cual's draw
commands are turned into visible pixels, the new art set that replaces the
original spritesheets, the animation and effects applied to board state, and the
rendering of the heads-up display and all text.

## ADDED Requirements

### Requirement: Board rendering

The board SHALL be rendered from the simulation state each frame, with one cell per
board position, blobs drawn over the level's background and empty cells.

#### Scenario: Board matches simulation state

- **WHEN** the simulation advances a step
- **THEN** the rendered board shows the blobs and empty cells of the state at the
  end of that step

#### Scenario: Hex offset is visible

- **WHEN** a level uses a hex neighbour mode
- **THEN** odd columns are rendered offset half a cell downward relative to even
  columns

#### Scenario: Mirrored levels

- **WHEN** a level sets `mirror = 1`
- **THEN** the board is rendered upside down

### Requirement: Scale and crispness

The board SHALL scale to fill the available screen area while preserving the 1:2
column-to-row proportion of a 10x20 board, and SHALL render without smoothing so
that art stays crisp at any scale.

#### Scenario: Fills a portrait phone

- **WHEN** the game runs on a tall narrow screen
- **THEN** the board occupies the largest centred rectangle that fits the available
  area while keeping its proportions

#### Scenario: Art stays crisp

- **WHEN** the board is scaled to more than one device pixel per art pixel
- **THEN** image smoothing is disabled and art edges remain sharp

### Requirement: Draw command rendering

Each Cual draw command SHALL be rendered at the addressed cell with the addressed
file and icon index, and quarter-restricted draws SHALL be rendered as the correct
sub-rectangle of the icon.

#### Scenario: Icon selection is honoured

- **WHEN** a blob's code sets `file` and `pos` and draws
- **THEN** the icon at that index in that file is rendered in the blob's cell

#### Scenario: Quarter draws are clipped

- **WHEN** a blob's code draws with `qu = Q_BL`
- **THEN** only the bottom-left quarter of the selected icon is rendered

#### Scenario: Cross-cell draws are ordered

- **WHEN** several blobs draw into the same neighbouring cell in one step
- **THEN** own-cell drawings are composited first, then before-pass cross-cell
  drawings, then after-pass cross-cell drawings, in a stable order between steps

### Requirement: New art set

Blobs, the level background, the chase border, particles and interface chrome
SHALL be drawn from a new visual asset set authored for this project, rather than
from the original XPM spritesheets.

#### Scenario: Original sprites are not shipped

- **WHEN** the production build is inspected
- **THEN** it contains no file copied from the original `data/pics` directory

#### Scenario: Icons cover the declared index range

- **WHEN** a kind declares a picture file with N icons
- **THEN** every icon index the level's Cual code can select has artwork

### Requirement: Level-consistent colours

The level's declared background, text and chase-border colours SHALL be used for
the areas they name.

#### Scenario: Level background colour

- **WHEN** a level declares `bgcolor = 0, 0, 0`
- **THEN** empty board cells are drawn in black

#### Scenario: Chase border colour

- **WHEN** a level declares `topcolor = 200, 200, 200`
- **THEN** the chase border is drawn in that colour

### Requirement: Chase border presentation

The chase border SHALL be drawn at its current descending position, with any
level-specific border artwork drawn relative to it.

#### Scenario: Border descends visually

- **WHEN** the simulation's border position moves down
- **THEN** the rendered border moves down correspondingly

#### Scenario: Border overlap

- **WHEN** a level declares `topoverlap`
- **THEN** the border artwork is positioned relative to the border line by that
  many pixels

### Requirement: Explosion and landing effects

Blobs in the exploding state SHALL be rendered with an explosion effect, and the
effect SHALL progress through the blob's 8-step explosion animation.

#### Scenario: Explosion animation plays

- **WHEN** a blob begins exploding
- **THEN** the rendered explosion advances over 8 steps before the cell is drawn
  empty

### Requirement: Heads-up display

The game SHALL display the current score, the level name, the next falling piece
preview, and the counts of grey and goal blobs still present.

#### Scenario: Score is shown

- **WHEN** the player scores points
- **THEN** the displayed score increases accordingly

#### Scenario: Grey count decreases as they explode

- **WHEN** grey blobs explode
- **THEN** the displayed grey count decreases

#### Scenario: Goal count decreases as they are cleared

- **WHEN** goal blobs are destroyed
- **THEN** the displayed goal count decreases and reaches zero

### Requirement: Next piece preview

The next falling piece SHALL be shown before it enters play, using the same
rendering path as the board.

#### Scenario: Preview matches the next piece

- **WHEN** a new piece is generated
- **THEN** the preview shows exactly the kinds of the piece that will enter play
  next

#### Scenario: Preview counts as informational

- **WHEN** a level's Cual code tests the `informational` constant for a blob
- **THEN** it evaluates to true in the preview

### Requirement: Informational blobs

The informational indicators for grey count, goal count, connection mode and
chain-reaction mode SHALL be displayed alongside the board when the level provides
artwork for them.

#### Scenario: Connection mode indicator

- **WHEN** a level uses a non-rectangular neighbour mode
- **THEN** the connection-mode indicator depicts that mode

#### Scenario: Chain-reaction indicator

- **WHEN** a level sets `chaingrass`
- **THEN** the chain-reaction indicator shows that goal blobs need a chain
  reaction

### Requirement: Message and result text

Blinking messages raised by level code SHALL be drawn over the board, and level
completion or failure SHALL be presented with the final score and, on completion,
the time bonus breakdown.

#### Scenario: Message blinks and clears

- **WHEN** a message is raised
- **THEN** it is visible for the configured number of steps, revealed and then
  hidden by a wipe, before disappearing

#### Scenario: Result screen shows the score

- **WHEN** a level ends, whether won or lost
- **THEN** the result is shown with the final score

#### Scenario: Completion shows the time bonus

- **WHEN** a level is completed
- **THEN** the result shows the level name, the time bonus points and the total
  score

### Requirement: Text rendering

All text SHALL be rendered with a bundled font and SHALL scale with the board so
that it stays legible on small screens.

#### Scenario: Legible at small sizes

- **WHEN** the game runs on a small phone screen
- **THEN** all interface text is rendered at a readable size

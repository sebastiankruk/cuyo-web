## Purpose

Defines how the game is operated on a phone or tablet: touch and gesture input,
navigation between the menu, level select and the game, the installable offline
application shell, layout behaviour across screen sizes and orientations,
accessibility options, and how settings and progress are persisted locally.

## ADDED Requirements

### Requirement: Touch controls for gameplay

While a level is running, the game SHALL accept touch input that can move the
falling piece left and right, rotate it, and toggle fast falling. Input SHALL be
delivered through dedicated on-screen controls, through gestures, or both.

#### Scenario: On-screen buttons drive the piece

- **WHEN** the player presses the left control
- **THEN** the falling piece moves one cell left, or does nothing if blocked

#### Scenario: Drag gesture steers continuously

- **WHEN** the player drags a finger horizontally across the board
- **THEN** the falling piece moves by one cell for each cell of drag distance

#### Scenario: Tap rotates

- **WHEN** the player taps the board without dragging
- **THEN** the falling piece is rotated

#### Scenario: Swipe down drops fast

- **WHEN** the player swipes down
- **THEN** fast falling is engaged for the duration of the gesture

#### Scenario: Controls reachable one-handed

- **WHEN** the game runs on a phone in portrait orientation
- **THEN** all gameplay controls are reachable within thumb range of the bottom of
  the screen

### Requirement: Input timing behaviour

Held movement controls SHALL repeat after an initial delay and then at a steady
rate, so that holding a direction moves the piece at a usable speed.

#### Scenario: Delayed auto-repeat

- **WHEN** the player holds the right control
- **THEN** the piece moves once immediately, pauses for the initial delay, and
  then repeats at the repeat rate

#### Scenario: Opposite direction cancels repeat

- **WHEN** the player holds right and then presses left
- **THEN** the piece moves left and no further right repeat is scheduled

### Requirement: Menu navigation

The game SHALL provide screens for the main menu, settings, level select, level
introduction, the running game, pause, and results, and SHALL allow moving between
them and back without a page reload.

#### Scenario: Main menu entry points

- **WHEN** the game starts
- **THEN** the main menu offers play, level select, settings and, where the level
  supports it, level restart

#### Scenario: Back navigation

- **WHEN** the player navigates back from a submenu
- **THEN** the previous screen is shown and no game state is lost

#### Scenario: Pause during play

- **WHEN** the player opens the pause menu during a level
- **THEN** the simulation is halted and the level can be resumed, restarted or
  abandoned

### Requirement: Level select presentation

Level select SHALL present the levels of the chosen track with their name,
completion state and best score, and SHALL indicate which levels are locked.

#### Scenario: Locked levels are not selectable

- **WHEN** a level has not been unlocked
- **THEN** it is displayed as locked and cannot be started

#### Scenario: Completed levels show their record

- **WHEN** a level has been completed
- **THEN** level select shows that it is complete and shows its best score

### Requirement: Responsive layout

The interface SHALL be usable in both portrait and landscape orientation and across
phone and tablet sizes, without requiring horizontal scrolling and with controls
that do not overlap the board.

#### Scenario: Landscape repositioning

- **WHEN** the device is rotated to landscape during play
- **THEN** the board and controls remain fully visible and usable

#### Scenario: Small and large screens

- **WHEN** the game runs on a small phone and then on a large tablet
- **THEN** in both cases the board is as large as the available space allows and
  no element is clipped

### Requirement: Safe-area and system-UI awareness

The interface SHALL keep controls clear of notches, rounded corners and system
gesture bars.

#### Scenario: Controls clear of the home indicator

- **WHEN** the device reports a bottom safe-area inset
- **THEN** the gameplay controls are positioned above that inset

### Requirement: Installable offline application

The game SHALL be installable to the device home screen and SHALL run with no
network connection after installation, including playing every bundled level.

#### Scenario: Installable

- **WHEN** the user chooses to add the game to the home screen
- **THEN** it installs and launches in its own window

#### Scenario: Fully offline

- **WHEN** the installed game is launched with no network connectivity
- **THEN** it starts, loads all bundled levels and plays without error

#### Scenario: No runtime network access

- **WHEN** the game is played
- **THEN** it issues no network requests and contacts no server

### Requirement: Orientation lock preference

The player SHALL be able to choose whether the game locks to portrait orientation.

#### Scenario: Portrait lock enabled

- **WHEN** portrait lock is enabled
- **THEN** the game requests portrait orientation on start

#### Scenario: Rotation allowed

- **WHEN** portrait lock is disabled
- **THEN** the game follows the device orientation

### Requirement: Accessibility options

The game SHALL offer options to reduce motion, and SHALL expose gameplay actions
that do not depend on precise timing.

#### Scenario: Reduced motion

- **WHEN** reduced motion is enabled
- **THEN** non-essential animations such as blob idle animations and menu
  transitions are suppressed or shortened while gameplay information is preserved

#### Scenario: Keyboard controls on desktop

- **WHEN** the game runs on a device with a physical keyboard
- **THEN** the arrow keys move, rotate and drop the piece and Escape opens the
  pause menu

### Requirement: Persistence of settings and progress

Settings, per-level completion records and best scores SHALL be stored locally on
the device and restored on the next launch.

#### Scenario: Settings persist

- **WHEN** a setting is changed and the game is closed and reopened
- **THEN** the setting has the value last chosen

#### Scenario: Progress persists

- **WHEN** a level is completed and the game is closed and reopened
- **THEN** the completion and best score are still recorded

#### Scenario: Corrupt stored data

- **WHEN** stored data cannot be read
- **THEN** the game starts with defaults instead of failing to launch

### Requirement: Audio feedback

The game SHALL provide sound effects for landing, rotating, exploding, level
completion and failure, and SHALL provide a volume or mute control.

#### Scenario: Muted

- **WHEN** audio is muted
- **THEN** no sound effect is played

#### Scenario: Audio requires user interaction

- **WHEN** the game starts before any user interaction
- **THEN** audio is suspended and resumes after the first interaction, in line
  with browser autoplay rules

## Purpose

Defines the Cuyo Animation Language: the language in which every blob's
appearance and behaviour is written, comprising its syntax, the rules by which
code reads and writes the variables of itself and of other blobs, the scheduling
and control-flow constructs including "busyness", the drawing commands, and the
event handlers. Without this capability the original levels cannot run.

## ADDED Requirements

### Requirement: Cual syntax

Cual source SHALL support procedure definitions, variable declarations with
defaults, `default` redefinition of existing variables, procedure calls, `busy`,
assignment and compound assignment to variables, scoping blocks of the form
`[var = expr] code`, conditional `if`/`else`, `switch`, comma-separated command
sequences, the drawing commands, `bonus`, `message`, `explode`, `lose` and
`sound`.

#### Scenario: Procedure definition and call

- **WHEN** a blob's program defines `blink = { A*, B*, C*; }` and then executes
  `blink`
- **THEN** the definition is accepted and the procedure advances one step per
  invocation

#### Scenario: Variable declaration with default

- **WHEN** a kind declares `var count = 3;` and a blob of that kind is created
- **THEN** the blob's `count` starts at 3

#### Scenario: Reapply on kind change

- **WHEN** a variable is declared with the reapply marker and the blob's kind
  changes to a different kind
- **THEN** the variable is reset to that kind's default for it

#### Scenario: Scoped block restores the old value

- **WHEN** code executes `[qu = Q_TL] {*;}` and then continues
- **THEN** the temporary value applies inside the block and the previous value is
  restored afterwards

#### Scenario: Loss of the game

- **WHEN** any blob's code executes `lose`
- **THEN** the player loses the level immediately

### Requirement: Expressions and operators

Cual expressions SHALL evaluate to integers and support, in order of increasing
precedence: boolean or; boolean and; comparison (`==`, `!=`, `<`, `>`, `<=`,
`>=`, which share one precedence level rather than six); the range comparison
`a == b .. c`; boolean not; addition and subtraction; the probabilistic operator
`a : b`; multiplication, division and modulo; bitwise and, bitwise or, bitset
`.+` and bitunset `.-`; unary minus; and the bit test `a . b`.

`.+=` and `.-=` are assignments and are not expression operators; `.+` and `.-`,
at the bitwise level, are. The probabilistic operator, boolean not, the range
comparison, unary minus and the bit test are non-associative.

#### Scenario: Boolean operators

- **WHEN** `1 && 0`, `1 || 0` and `!0` are evaluated
- **THEN** the results are 0, 1 and 1 respectively

#### Scenario: Non-zero is true

- **WHEN** `42` is used where a boolean is expected
- **THEN** it is treated as true

#### Scenario: Mathematical division and modulo

- **WHEN** `13 / 5`, `-13 / 5`, `13 % -5` and `-13 % -5` are evaluated
- **THEN** the results are 2, -3, -2 and -3 respectively

#### Scenario: Probabilistic operator

- **WHEN** the expression `1:6` is evaluated repeatedly
- **THEN** it yields 1 in roughly one of every six evaluations and 0 otherwise

#### Scenario: Bit set, unset and test

- **WHEN** `x` starts at 0 and the code executes `x .+= 6`, then `x . 2`, then
  `x .-= 6`
- **THEN** `x` becomes 6, the bit test of 2 is true, and `x` returns to 0

#### Scenario: Call functions

- **WHEN** `rnd(n)` and `gcd(a, b)` are evaluated
- **THEN** `rnd(n)` yields a value in the range 0 to n-1 and `gcd` yields the
  greatest common divisor

#### Scenario: Range comparison

- **WHEN** `n == 2 .. 5` is evaluated for n equal to 3 and for n equal to 7
- **THEN** the results are 1 and 0

### Requirement: Neighbour pattern expressions

A bare pattern of six or eight characters drawn from `0`, `1` and `?` SHALL be a
boolean expression that is true when it matches the blob's neighbour sequence,
which lists a 1 for each neighbouring cell holding the same kind, starting above
and going clockwise. A `?` matches either value. For an empty blob, a direction
that leaves the board counts as 1. The pattern SHALL be evaluated against the
neighbours as they were at the start of the current step.

#### Scenario: Pattern matches

- **WHEN** a blob's neighbour sequence is `11000110` and the pattern is
  `1???0???`
- **THEN** the pattern evaluates to true

#### Scenario: Off-board neighbours count as connected for empty blobs

- **WHEN** the cell above an empty blob is outside the board or empty
- **THEN** that direction reports 1 in the empty blob's neighbour sequence

#### Scenario: Kind changes are not reflected in the same step

- **WHEN** a blob's kind is changed and its pattern expression is evaluated in the
  same step
- **THEN** the pattern still reports the neighbours as they were at the start of
  the step

### Requirement: Control flow and arrow semantics

`if` and `switch` SHALL accept two arrow forms. A right arrow `->` tests the
condition every time. A double arrow `=>` latches: once the condition has been
true, the guarded code executes on every subsequent step without re-testing, for
as long as that code is busy.

#### Scenario: Non-latching conditional

- **WHEN** code is `if 1:2 -> {A*;}`
- **THEN** the guarded code runs only on the steps where the condition happens to
  be true

#### Scenario: Latching conditional

- **WHEN** code is `if 1:2 => {A*, B*, C*, D*;}`
- **THEN** once the condition first becomes true the sequence runs to completion
  over consecutive steps before the condition is tested again

#### Scenario: switch selects the first matching branch

- **WHEN** code is `switch { n == 1 -> A; n == 2 -> B; -> C; }` and n is 2
- **THEN** branch B runs

#### Scenario: switch default branch

- **WHEN** the same switch is evaluated with n equal to 7
- **THEN** the default branch C runs

### Requirement: Busyness and animation sequences

Every code fragment SHALL have a busy flag. Assignments are never busy. A
comma-separated sequence SHALL be busy until all its commands have executed once.
A sequential block SHALL be busy while any of its parts is busy. The `busy`
command is always busy.

#### Scenario: Sequence advances one command per step

- **WHEN** code is `{ A*, B*, C*; }` and it is invoked repeatedly
- **THEN** it draws A on the first invocation, B on the second and C on the third

#### Scenario: Latching switch completes its animation

- **WHEN** code is `switch { 1:100 => {B*, C*, D*, E*;} -> A*; }`
- **THEN** when the probabilistic condition first succeeds the animation runs to
  its end over consecutive steps, and only then does the default branch resume

### Requirement: Variables, kinds and the step boundary

Every blob SHALL have its own instance of every variable. Reading a variable of
another blob SHALL return the value it had at the beginning of the current step.
Writing a variable of another blob SHALL take effect only at the end of the
current step, including compound assignments whose right-hand side is evaluated
immediately.

#### Scenario: Deferred write

- **WHEN** blob A executes `x@(0, 0) = 5` and blob B reads `x@(0, 0)` in the same
  step
- **THEN** B reads the value from the beginning of the step

#### Scenario: Deferred compound assignment

- **WHEN** code executes `x@(0, 0) += 1` when x was 3 at the start of the step and
  has since become 5
- **THEN** at the end of the step x becomes 6, not 4 and not 5

#### Scenario: Self access is also deferred

- **WHEN** code executes `x = x@(0, 0) + 1`
- **THEN** x becomes one more than its value at the beginning of the step

#### Scenario: Setting kind applies new defaults

- **WHEN** a blob's kind is set to a different kind
- **THEN** the new kind's reapply-marked variable defaults take effect
- **AND** icons drawn later in the same step use the new kind's pictures

### Requirement: System variables and constants

The runtime SHALL provide the documented system variables `file`, `pos`, `kind`,
`version`, `qu`, `out1`, `out2`, `weight`, `inhibit`, `behaviour`,
`falling_speed`, `falling_fast_speed`, and the read-only constants `time`,
`turn`, `size`, `basekind`, `loc_x`, `loc_y`, `loc_xx`, `loc_yy`, `loc_p`,
`falling`, `falling_fast`, `informational`, `players`, `exploding` and
`connect`. Constants SHALL be provided for every kind, for `global`,
`semiglobal`, `nothing` and `outside`, for the behaviour bits, the neighbour
modes, the quarter selectors, and the direction constants used with `inhibit`.

#### Scenario: file and pos reset each step

- **WHEN** a blob's code sets `file = 1; pos = 5;` and draws, and the next step
  begins
- **THEN** `file` and `pos` are back to 0 before the next draw

#### Scenario: size reflects the component

- **WHEN** a blob is part of a component of total weight 6
- **THEN** its `size` constant evaluates to 6

#### Scenario: Behaviour defaults by role

- **WHEN** a falling-blob kind is created with no explicit behaviour
- **THEN** its behaviour includes explode-on-size and calculate-size, and its
  weight is 1

#### Scenario: Semiglobal falling speeds

- **WHEN** the semiglobal blob sets no falling speeds
- **THEN** the falling piece descends 6 pixels per step normally and 32 pixels per
  step while fast falling

### Requirement: Foreign blob access forms

Variables SHALL be readable and writable through the absolute forms
`name@@(x, y)`, `name@@(x)` and `name@@()` and the relative forms
`name@(dx, dy)`, `name@(dx)` and `name@()`, with `@@()` addressing the
semiglobal blob and `@()` the global blob. In hex levels, an odd-column `x` MAY be
given a half-integer `y` to address the offset row.

#### Scenario: Absolute access

- **WHEN** code reads `x@@(3, 5)`
- **THEN** it reads the variable of the board blob at column 3, row 5

#### Scenario: Accessing the falling blobs

- **WHEN** code reads `x@(0)` while two blobs are falling
- **THEN** it reads the first falling blob; when only one remains it reads that
  one

#### Scenario: Out-of-range access yields the default

- **WHEN** code reads `x@@(99, 99)`
- **THEN** it yields the default value for that variable and does not fail

#### Scenario: Writing out of range is a no-op

- **WHEN** code writes `x@@(99, 99) = 5`
- **THEN** nothing changes and no error is raised

### Requirement: Drawing commands

The draw command SHALL render the icon selected by `kind`, `file` and `pos` into
the blob's own cell. It SHALL support restricting output to a quarter via `qu`,
and SHALL support drawing into another cell either before all own-cell drawing
(`@(pos)*`) or after it (`*@(pos)`), with the order across blobs at a given cell
stable between steps.

#### Scenario: Whole-cell draw

- **WHEN** code sets `file = 0; pos = 3;` and executes `*`
- **THEN** icon 3 of file 0 is drawn in the blob's own cell

#### Scenario: Quarter draw

- **WHEN** code sets `qu = Q_TL` and executes `*`
- **THEN** only the top-left quarter of the selected icon is drawn

#### Scenario: Draw into a neighbour

- **WHEN** code executes `*@(0, 1)`
- **THEN** the selected icon is additionally drawn in the cell below, in the
  after-pass

### Requirement: Event handlers

Blobs SHALL support the event handlers `init`, `turn`, `land`, `changeside`,
`connect`, `row_up`, `row_down`, `keyleft`, `keyright`, `keyturn` and `keyfall`,
with `row_up`/`row_down` only on the semiglobal blob and the `key*` events only on
falling blobs and the semiglobal blob.

#### Scenario: init runs once

- **WHEN** a blob comes into life
- **THEN** its `init` handler runs exactly once, before the first draw

#### Scenario: land fires on landing

- **WHEN** a falling blob becomes a board blob
- **THEN** its `land` handler runs

#### Scenario: keyturn fires even when rotation is blocked

- **WHEN** the player presses the rotate key and the piece cannot rotate
- **THEN** the `keyturn` handler of the falling blobs and the semiglobal blob
  still runs

#### Scenario: connect fires on recalculation

- **WHEN** blob connections are recalculated during explosion resolution
- **THEN** the `connect` handler of every board blob runs

### Requirement: Global and semiglobal blobs

The runtime SHALL provide one global blob for the whole game and one semiglobal
blob per player. The global blob's code SHALL run before any board blob's code each
step. Their variables exist even when no code is defined for them.

#### Scenario: Global runs first

- **WHEN** the global blob's code increments a counter and a board blob's code
  reads that counter in the same step
- **THEN** the read observes the increment

#### Scenario: Semiglobal per player

- **WHEN** a semiglobal handler writes to its own variable
- **THEN** the write is visible to that player's blobs and not to another player's

### Requirement: Effect of level script commands

`bonus` SHALL add the given points, `message` SHALL display blinking text, and
`sound` SHALL play the named sound, each applied to the player the executing blob
belongs to.

#### Scenario: Bonus points

- **WHEN** a blob's code executes `bonus(50)`
- **THEN** the player's score increases by 50

#### Scenario: Message is displayed

- **WHEN** a blob's code executes `message("You get 50 bonus points")`
- **THEN** the text appears on the board and blinks before clearing

### Requirement: Language coverage of the original levels

Every Cual construct used by the original level files SHALL be supported, so that
the original levels run without modification.

#### Scenario: Levels load and execute

- **WHEN** the bundled level set is loaded and each level is started
- **THEN** every level's Cual source parses and compiles, and the level starts
  without a runtime error during its first steps

#### Scenario: Diagnostics for unsupported syntax

- **WHEN** a Cual construct is encountered that the runtime does not implement
- **THEN** compilation fails with an error naming the file, the line and the
  construct

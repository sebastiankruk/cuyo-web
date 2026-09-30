## Purpose

Defines how the original `.ld` level description files are read and turned into a
playable level: the nested section syntax, the versioned-definition mechanism
that selects a definition per player count and difficulty, kind declarations with
the `*` repeat multiplier, colour and numeric values, arithmetic expressions over
previously defined names, and the `startdist` encoding of the initial layout.

## ADDED Requirements

### Requirement: Section and definition syntax

A level file SHALL be a sequence of named definitions. Each definition has a name
and a value, where the value is either a single datum, a comma-separated list of
data, or a braced list of further definitions forming a nested section. Comments
introduced by `#` and running to end of line SHALL be ignored.

#### Scenario: Flat definitions

- **WHEN** a file contains `numexplode=4` followed by `chaingrass=1`
- **THEN** both are top-level definitions with the values 4 and 1

#### Scenario: Nested sections

- **WHEN** a file contains `Level = { name = "Example" pics = a.xpm, b.xpm }`
- **THEN** the top level defines one section named `Level` containing the
  definitions `name` and `pics`

#### Scenario: Comment handling

- **WHEN** a line contains `numexplode=4 # four`
- **THEN** the value is 4 and the trailing text is ignored

### Requirement: Data types and the multiplier

A datum SHALL be an identifier, a word, a quoted string, or a number. A datum
followed by `*` and a number SHALL be shorthand for that many repetitions of the
datum. A number written as `<expression>` SHALL be replaced by the value of the
expression, which may combine literals, previously defined numeric names, and
the operators `+`, `-`, `*`, `/` and `%`.

#### Scenario: Repeat shorthand

- **WHEN** a file contains `pics = a.xpm, b.xpm * 3`
- **THEN** the `pics` list is a.xpm, b.xpm, b.xpm, b.xpm

#### Scenario: Arithmetic on names

- **WHEN** a file defines `n = 3` and then `m = <n * 2 + 1>`
- **THEN** `m` has the value 7

#### Scenario: Division truncates toward negative infinity

- **WHEN** an expression computes `13 / 5` and `-13 / 5`
- **THEN** the results are 2 and -3

### Requirement: Versioned definitions

Any definition MAY carry one or more version specifiers in square brackets,
applied where the name is defined. Specifiers SHALL include `1` for
single-player, `2` for two-player, `easy` and `hard` for difficulty, and the
level-track names. When a value is needed, the definition whose specifier set is
the largest subset of the active version SHALL be used; a more general
definition applies to more specialised versions for which no definition exists.

#### Scenario: Two-player override

- **WHEN** a level defines `numexplode = 8` and `numexplode[2] = 6`
- **THEN** the value is 8 in single-player and 6 in two-player

#### Scenario: General definition applies to specialised versions

- **WHEN** a level defines only `numexplode[2] = 6` and the game is running in
  two-player hard mode
- **THEN** the value is 6

#### Scenario: Most specific definition wins

- **WHEN** a level defines `numexplode = 8`, `numexplode[2] = 6` and
  `numexplode[2,hard] = 5`
- **THEN** two-player hard mode uses 5, not 6

#### Scenario: Mutually exclusive dimensions need no joint definition

- **WHEN** a level defines `numexplode[easy] = 5` and `numexplode[hard] = 9` and
  the game runs in normal mode
- **THEN** the unqualified definition is used, and no `[easy,hard]` definition is
  required or permitted

#### Scenario: Ambiguous definitions are rejected

- **WHEN** a level provides definitions for `[2]` and `[hard]` but none for
  `[2,hard]`, and the game runs in two-player hard mode
- **THEN** loading the level fails with an error naming the ambiguous
  definitions

### Requirement: Kind declaration lists

`pics`, `greypic`, `startpic` and `emptypic` SHALL declare the level's blob kinds.
Each declaration assigns the declaring list's default behaviour and probabilities
to the kinds it creates. Each kind has a distinct identifier, and the constants for
kind identifiers SHALL be assigned successive integers in declaration order.

#### Scenario: Successive kind constants

- **WHEN** a level declares `startpic = apple, orange` then
  `pics = orange, pear, apple * 3, banana` then `greypic = pineapple`
- **THEN** apple and orange exist once each from `startpic`, orange, pear, three
  apples and banana exist from `pics`, and pineapple exists from `greypic`
- **AND** the constant for orange is exactly one more than the constant for apple,
  pear is *two* more than orange, banana is four more than pear, and pineapple is
  one more than banana

A name that appears in more than one declaration list keeps the number its first
appearance gave it, and the slot it would have taken in a later list is left
unused. Pear therefore is not one more than orange: `pics` starts after the two
`startpic` slots, `orange` claims slot 2 of it on its way past without claiming
the number, and pear lands on 3. `cual.6` gives these four differences as 1, 2, 4
and 1.

#### Scenario: First use of a repeated name fixes its constant

- **WHEN** the same kind name is declared more than once
- **THEN** the constant assigned at its first declaration is the one used

#### Scenario: Declaration defaults by list

- **WHEN** a kind is declared via `pics`
- **THEN** it explodes on component size and participates in chain-size
  calculation, and has a non-zero probability of appearing as a falling blob

#### Scenario: Per-kind overrides

- **WHEN** a level redefines `numexplode` or `neighbours` inside a kind's own
  section
- **THEN** that value applies to that kind only

### Requirement: Picture names resolve as art keys

A list entry in `pics`, `greypic`, `startpic` or `emptypic` SHALL be either a
picture name or a reference to another kind's section. A picture name SHALL be
treated as a logical art key and SHALL be resolved through the art manifest, which
supplies the artwork for that key. Resolution SHALL NOT depend on any image file
being present, and the original artwork files SHALL NOT be part of the shipped
application. The same applies to the `toppic` and `bgpic` settings.

#### Scenario: Art key resolves through the manifest

- **WHEN** a level declares `pics = inGruen.xpm` and the art manifest provides an
  entry for the key `inGruen.xpm`
- **THEN** the kind resolves to that entry's artwork
- **AND** no image file is read or required

#### Scenario: Section reference is not an art key

- **WHEN** a list entry names another kind's section rather than a picture name
- **THEN** it resolves to that kind and no art key lookup is performed

#### Scenario: Unresolvable art key

- **WHEN** a level declares a picture name that the art manifest does not provide
- **THEN** loading fails with an error naming the art key and the kind that
  referenced it

### Requirement: Level-wide settings

The format SHALL support the level settings used by the game: display `name`,
`author` and `description`; colours `bgcolor`, `textcolor` and `topcolor`;
`numexplode`, `chaingrass`, `neighbours`, `toptime`, `toppic`, `topoverlap` and
`topstop`; `mirror`; `randomfallpos`; `randomgreys` and `nogreyprob`; and the
background and empty-cell pictures. Unset numeric settings SHALL take documented
defaults.

#### Scenario: Defaults apply

- **WHEN** a level omits `toptime`, `chaingrass` and `mirror`
- **THEN** the chase border descends one pixel every 50 steps, goal blobs do not
  require a chain reaction, and the level is not mirrored

#### Scenario: Mirror flips the level

- **WHEN** a level sets `mirror = 1`
- **THEN** the board is presented upside down and the rotation direction of the
  falling piece is inverted so that it still appears clockwise to the player

#### Scenario: Random fall position

- **WHEN** a level sets `randomfallpos = 1`
- **THEN** each new falling piece starts at a uniformly random column that still
  fits on the board

### Requirement: Neighbour mode selection

The `neighbours` setting SHALL accept the modes rectangular, horizontal,
vertical, diagonal, queen, knight, hex six, hex four, three-dimensional and none.
Setting a hex mode at level level SHALL additionally put the board into hex mode,
offsetting odd columns.

#### Scenario: Hex mode offsets columns

- **WHEN** a level-wide `neighbours` is hex six
- **THEN** odd columns are offset half a cell downward and blobs connect in the
  six hex directions

#### Scenario: Per-kind hex mode

- **WHEN** the level-wide `neighbours` is rectangular but one kind's own section
  sets hex six
- **THEN** only that kind uses hex connections

### Requirement: startdist decoding

`startdist` SHALL be a list of strings, one per board row, bottom-aligned, listed
top row first. Each row SHALL have 10 characters, or 20 when both players'
layouts are given separately. The final row MAY instead be a 4- or 8-character
string specifying the informational blobs. Within a row, `.` means empty, `+` means
a falling-blob kind chosen at random, `-` means a grey kind chosen at random, `*`
means a goal kind chosen at random, and any other character denotes a specific
kind and version by offset from that kind's `distkey`.

#### Scenario: Empty cells and explicit kinds

- **WHEN** a row is `A........B`
- **THEN** cell 0 holds kind A version 0, cells 1 to 8 are empty, and cell 9
  holds kind B version 0

#### Scenario: Random kinds

- **WHEN** a row contains `+` and the level declares three falling-blob kinds with
  equal probability
- **THEN** that cell holds one of the three kinds

#### Scenario: Version offset from distkey

- **WHEN** a kind has `distkey = "A"` and a row contains `C`
- **THEN** that cell holds kind A with version 2

#### Scenario: Informational row

- **WHEN** the final row has 4 characters
- **THEN** those characters describe, in order, the informational blobs for grey
  count, goal count, connection mode and chain-reaction mode

#### Scenario: Random kinds avoid accidental early connections

- **WHEN** a cell's kind was chosen at random
- **THEN** the system re-rolls that cell up to a bounded number of times while
  doing so reduces the number of same-kind neighbours it would otherwise have

### Requirement: Loading and diagnostics

Loading a level SHALL either produce a complete playable level or fail with an
error identifying the offending file, the definition and the reason. Malformed
input SHALL never result in a partially initialised playable level.

#### Scenario: Failure leaves no playable level behind

- **WHEN** any definition in a level fails to resolve
- **THEN** the level is not made available for play
- **AND** the error identifies the offending file, definition and reason

#### Scenario: Wrong startdist row length

- **WHEN** a `startdist` row has 9 or 11 characters
- **THEN** loading fails with an error stating the expected length

#### Scenario: Undefined explode threshold

- **WHEN** a kind that explodes on size has no `numexplode` defined at either
  level or kind scope
- **THEN** loading fails with an error naming the kind

### Requirement: Bundled level data

The playable level set SHALL be produced from the `.ld` files at build time and
shipped as static data, so that no parsing of the original file syntax is required
at runtime.

#### Scenario: No runtime parsing

- **WHEN** the application starts
- **THEN** the available levels are loaded from the pre-built bundle
- **AND** no original `.ld` file is fetched or parsed

#### Scenario: Original files stay authoritative

- **WHEN** a `.ld` file in the reference source changes and the project is rebuilt
- **THEN** the regenerated bundle reflects the change

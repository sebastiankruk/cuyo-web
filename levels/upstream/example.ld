#
#   Copyright <=2004 by Immanuel Halupczok
#   Maintenance modifications 2005-2007,2011 by the cuyo developers
#
#   This program is free software; you can redistribute it and/or modify
#   it under the terms of the GNU General Public License as published by
#   the Free Software Foundation; either version 2 of the License, or
#   (at your option) any later version.
#
#   This program is distributed in the hope that it will be useful,
#   but WITHOUT ANY WARRANTY; without even the implied warranty of
#   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#   GNU General Public License for more details.
#
#   You should have received a copy of the GNU General Public License
#   along with this program; if not, write to the Free Software
#   Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
#


# This is an example file to show how to write your own cuyo
# levels. It's still under construction, but probably it's already
# useful to get started. To experiment with it, do the following:
#   mkdir my_cuyo_levels
#   cd my_cuyo_levels
# Put a copy of this file into my_cuyo_levels. Then
#   mkdir pics
# The pics directory is the place where you can put images
# for your own levels (xpm files). Cuyo will find them there.
# However, you don't need to put any images there for this
# example, because it uses images of existing levels.
# Type 
#   cuyo example.ld
# to try this level; then read this file to see how it was done.


# If you wrote a cuyo level and you think it's worth being included
# in the normal cuyo distribution, you may send it to cuyo@karimmi.de.




# Before we start with this level, just one more comment on the
# organization of the level description files:
# When started, cuyo looks for an .ld file called "summary.ld".
# That file is generated from a file called "summary.in" and includes
# all the other .ld files.
# Most other ld files simply describe one level, but there's also
# one called "globals.ld", which contains some definitions useful
# in many different levels.




# "example" is the internal name of this level. (When you
# win a level, it's the internal name of the level that cuyo
# remembers.)
example = {

  # Name of the level which is displayed on screen.
  name = "Example Level"

  # The author of the level. Insert your own name.
  author = "Immi"

  # The description which appears at the beginning.
  description = "Where do I know all these icons from...?"

  # The different kinds of blobs that exist in the level.
  # In simple cases, it's enough to specify the name of an
  # xpm file. For more elaborate kinds, you have to create
  # an own section for the kind (inside the section of the
  # level) and specify the name of the section.
  # In this example, there are two simple kinds:
  # igGo.xpm and inGruen.xpm.
  # Look at the corresponding xpm files:
  # - igGo.xpm is a 32x32 image. That image is used to draw the blobs.
  # - inGruen.xpm is a 128x128 xpm. Cuyo always cuts big
  # imagess in 32x32 parts, so inGruen.xpm consists of 16
  # small icons. Now, which of the 16 different 32x32 icons
  # is drawn depends on the neighbours of the blob. For example,
  # if a blob shall be drawn which has another blob of the same
  # kind on top of it, the bottom left icon is drawn.
  # - For the kind "my_special", we want to do more elaborate
  # things, so it has its own section (see below)
  pics=igGo.xpm,inGruen.xpm,my_special
  
  # How many blob have to be put together to make them explode:
  numexplode = 5
  
  # In one-player-mode, we want to make it a bit more difficult.
  # So here, numexplode shall be 6. (You can add a "[1]" to any
  # of these keywords to specify a difference in one-player-mode.
  # Alternatively, you can add a "[2]" to specify a difference in
  # two-player-mode. If you do both, you should delete the base
  # version, because it is never used anyway.)
  numexplode[1] = 6

  # That's the stuff that has to be removed to win the level. (I'll
  # call it "grass" because it's grass in the first level.)
  # Here too, we can choose between specifying an xpm file
  # or a section. However, when we specify a "big" xpm file
  # (with several 32x32 icons), this has a different meaning
  # than for the normal blob kinds. Which of the icons is
  # drawn does not depend on the neighbours, but...
  startpic=ipStart.xpm

  # ... on startdist. Here we can specify which of the
  # icons are where at the beginning of the level. startdist
  # has to be a list of strings, each 10 characters long.
  # Each string stands for one row. (The last one for the
  # bottom row of the level.) A letter stands for a icon
  # from the startpic, where "A" is the top left icon,
  # "B" the one to the right of it, etc. "." means that
  # there shall be nothing at that place.
  startdist=".AF....AF.","BCDE..BCDE"
  
  # The "grey blobs" that appear when the other player
  # makes explosions. (This works like the normal blob kinds.)
  greypic=inSchwarz.xpm
  
  # OK, now everything is ready except for the blob
  # kind "my_special". So let's describe that now.
  my_special = {
    # It uses several xpm files:
    pics=ihBlau.xpm,inSchwarz2.xpm
    
    # For this blob, being neighbours is diagonal.
    # (See existing levels or the cual man page for possible values
    # of this constant.)
    # This constant only specifies when blobs explode, and not
    # how they are drawn. So we still have to specify how the
    # graphics shall look like separately.
    neighbours=<neighbours_diagonal>
    
    # The stuff inside <<>>-brackets is "cual code". Cual (= Cuyo
    # animation language) is an (almost) complete language which
    # makes it easy to program animations, etc. Try "man cual"
    # for details.
    # Note that the graphics of the simple blob kinds (where we
    # only specified a xpm file) is done by cual code, too: the
    # default definitions of the file "global.ld" are used.
    <<
    
    # That's the main procedure for drawing our "my_special" blob.
    my_special={

      # First, we draw the normal blob (with its diagonal connections).
      
      # There's a procedure called "schemaDiag2" defined in global.ld,
      # which draws the diagonal connections just in the way we want it:
      # It will build up the icon of different parts of an image file.
      # However, before we call it, we have to set the variable "file",
      # so that the right xpm file is taken. (Well, in fact, this would
      # not really be necessary, because file is automatically initialized
      # to 0, but let's do it anyway.)
      file = 0;    # 0 = ihBlau.xpm, 1 = inSchwarz2.xpm
      schemaDiag2;
    
      # OK, up to now, our blob looks and behaves exactly like the blue
      # blobs in the level "hormones". Now let's add a bit of animation.
      
      # Start the animation with probability of 1:80.
      # (This if does not exactly the same as the if in other languages:
      # Once the expression "1:80" is true, the stuff after the arrow
      # will be executed in each step until the animation has terminated.
      # See "man cual" for details.)
      if 1:80 => {
  	# This time, we'll take icons out of the second xpm file.
	# (inSchwarz2.xpm). Because it's so often necessary to set
	# the file variable, "1" is a shortcut for "file = 1"
	1;
	# Now, choose which 32x32 icon to draw. This is done by setting
	# the variable pos. (pos = 0 is the top left icon,...)
	# There's a shortcut here, too: "A" sets pos to 0, "B" sets pos
	# to 1, etc.
        A, B, C, D, E, F, G, H, G, F, E, D, C, B, A;
	# Now, what does it make for a sense to set the value of
	# pos 15 times in a row? Note that there are commas between
	# the letters, not semicolons. That means that only *one*
	# of these assignments is executed: on the first time, the
	# first one, on the second time the second one, etc.

	# OK, now the file and the pos are set, and we are ready
	# to really draw the icon: (The drawing command is very short.)
	*;
      };
      
    };
    
    >>
    
  }
  
  
  
}

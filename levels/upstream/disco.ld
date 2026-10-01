#
#   Copyright 2006 by Bernhard Seckinger
#   Modified 2011 by Immanuel Halupczok
#   Maintenance modifications 2006,2008,2011 by the cuyo developers
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
# The above notices apply to this file and to:
#    bddisco.xpm[.gz]
#

# Status: (M=Muss, S=Soll, K=Kann, F=Feature, B=Bugs)
#
# Fertig.

Disco =
{
  #------------------------------------#
  # Allgemeine Beschreibung des Levels #
  #------------------------------------#

  name     = "Disco"
  author   = "Berni"
  description     = "Get rid of the strobos!"

  pics = All*4

  greypic   = Grey
  startpic  = Start
  startdist = "..**.**...",
	      ".***.****.",
	      "****.*****",
	      "**********"

  numexplode = 6

  bgcolor    = 128,128,128
  topcolor   = 0,0,0
  topoverlap = 0
  toptime    = 5
  textcolor  = 60,60,255

  randomgreys[1] = 25
  randomgreys = 50

  <<
    var flash=-1,mode=0;

    global = {
      {mode=1},{mode=0},{},{};
      switch {
        1:2 => {D,A,A,A,B,A,A,A,B,A,A,A,B,A,C,A};
        1:2 => {D,A,A,A,B,A,A,A,B,A,A,A,B,A,A,A};
        => {D,A,A,A,B,A,A,A,B,A,C,A,B,A,C,A};
      };
      flash=pos;
    };
  >>

  Grey =
  {
    pics = bddisco.xpm
    
    <<
      Grey =
        {
	  G*;
	};
    >>
  }

  Start =
  {
    pics = bddisco.xpm

    <<
      Start =
	{
          if mode@() -> mode=rnd(3);
          if mode & flash@() -> E* else -> F*;
	};
    >>
  }

  All = 
  {
    pics = bddisco.xpm

    <<
      All = 
        {
          if !falling -> {
            if rnd(4) & flash@() || 1:8 -> kind = rnd(4);
            pos=kind-All+8;
            if kind@(-1,1) != nothing -> [qu = Q_TR] *@(-1,1);
            if kind@(-1,0) != nothing -> [qu = Q_BR] *@(-1,0);
          };
	  pos=kind-All;*;
	};
    >>
  }
}

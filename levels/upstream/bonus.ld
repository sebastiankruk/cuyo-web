#
#   Copyright 2006 by Bernhard Seckinger
#   Maintenance modifications 2006,2008,2011,2014 by the cuyo developers
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
#   bbBonus.xpm[.gz]
#

# Status: (M=Muss, S=Soll, K=Kann, F=Feature, B=Bugs)
#
# Fertig.

Bonus={
  name="Bonus"
  author="Berni"
  numexplode=1
  chaingrass=0
  pics=bbBonus
  bgcolor=127,127,255
  toptime=4
  startpic=bbGeld
  startdist="BCBBCBBCBB","BCBCBBCBCB","BCBCBCBBCB","BCBCBBCBCB","BCBBCBCCBB",
    "-C%&&%B-"
  greypic=bbSchein
  randomgreys[1]=20
  description="Hurry up, get bonus points!"

  bbGeld={
    pics=bbBonus.xpm
    <<
    bbGeld={
      pos=version;
      *;
      switch {
        1:500 && version==1 => {
          E*, E*, F*, F*, G*, G*, H*, H*, H*, G*, G*, F*, F*, E*, E*;
        };
        1:500 && version==2 => {
          I*, I*, J*, J*, K*, K*, L*, L*, L*, K*, K*, J*, J*, I*, I*;
        };
      };
    };
    >>
  animations="[t=500,v=B]E+E+F+F+G+G+H+H+H+G+G+F+F+E+E+;[t=500,v=C]I+I+J+J+K+K+L+L+L+K+K+J+J+I+I+"
  }
  bbBonus={
    pics=bbBonus.xpm
    << bbBonus=A*; >>
  }
  bbSchein={
    pics=bbBonus.xpm
    << bbSchein=D*; >>
  }
}

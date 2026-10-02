#
#   Copyright 2006,2014 by Mark Weyer
#   partly based on go.ld which, at that time, was:
#     Copyright <=2004 by Immanuel Halupczok
#     Maintenance modifications 2005,2006 by the cuyo developers
#   Modified 2010 by Mark Weyer
#   Maintenance modifications 2008,2011,2014 by the cuyo developers
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
#   igGo.xpm[.gz], igSchwarz.xpm[.gz], igWeiss.xpm[.gz]
#

GoII={
  name = "Go"
  author = "Mark Weyer"
  description = "Why to place your goban horizontally"
  pics = Stein*2
  startpic = igGo.xpm
  startdist = "*........*","**......**","***....***","****..****"
  emptypic = Rand
  chaingrass = 1

  Stein = {
    numexplode = 0
    pics = igSchwarz.xpm,igWeiss.xpm
    greyprob = 1

    <<
      Stein = {
        weight = -(falling
          || (kind@(1,0)==Rand) || (kind@(-1,0)==Rand)
          || (kind@(0,1)==Rand) || (kind@(0,-1)==Rand));
            # -1, wenn der Stein Freiheiten hat
        if falling || informational -> C else A;
        file=kind-Stein;
        *;
        if informational && 1:5 => {,,,,,kind=Stein+rnd(2)};
      };
    >>
  }

  Rand = {
    pics = mgRand.xpm
    <<
      Rand = {
      switch {
        11111111 -> A;
        1?111111 -> M;
        111?1111 -> B;
        11111?11 -> E;
        1111111? -> D;
        111?111? -> I;
        1?111?11 -> C;
        ??11111? -> N;
        1???1111 -> F;
        111???11 -> H;
        11111??? -> P;
        ????111? -> O;
        1?????11 -> J;
        111????? -> G;
        ??111??? -> L;
        ???????? -> K;
      };
      if (pos>0) -> *;
      };
    >>
  }
}

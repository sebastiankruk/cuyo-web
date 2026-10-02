#
#   Copyright 2008 by Mark Weyer
#   Modified 2010 by Mark Weyer
#   Maintenance modifications 2008,2011 by the cuyo developers
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


Octopi = {
  name = "Octopi"
  author = "Mark Weyer"
  description = "Octopi connect in eight directions. They also remove the anemones that way."

  sorten = 5

  pics = octopus*<sorten>
  greypic = moFisch.xpm
  startpic = anemone
  startdist = "***.......","*****...**","******.***"
  numexplode = 8
  neighbours = <neighbours_eight>

  anemone = {
    pics = moAnemone.xpm

    <<
      anemone.init = {version=rnd(4);};

      anemone = {pos=version; *;};
    >>
  }

  octopus = {
    pics = moOctopus1.xpm, moOctopus2.xpm, moOctopus3.xpm,
           moOctopus4.xpm, moOctopus5.xpm

    <<
      octopus = {
        file = kind-octopus;

        qu = Q_TL;
        switch {
          0?????00 -> C;
          0?????01 -> H;
          0?????10 -> I;
          0?????11 -> D;
          1?????00 -> A;
          1?????01 -> F;
          1?????10 -> G;
          1?????11 -> B;
        };
        *;
        if kind==kind@(-1,1) -> E*@(0,1);

        qu = Q_TR;
        switch {
          000????? -> I;
          001????? -> C;
          010????? -> D;
          011????? -> H;
          100????? -> G;
          101????? -> A;
          110????? -> B;
          111????? -> F;
        };
        *;
        if kind==kind@(-1,-1) -> E@(-1,0)*;

        qu = Q_BL;
        switch {
          ????000? -> A;
          ????001? -> G;
          ????010? -> F;
          ????011? -> B;
          ????100? -> C;
          ????101? -> I;
          ????110? -> H;
          ????111? -> D;
        };
        *;
        if kind==kind@(1,1) -> E@(1,0)*;

        qu = Q_BR;
        switch {
          ??000??? -> G;
          ??001??? -> I;
          ??010??? -> B;
          ??011??? -> D;
          ??100??? -> A;
          ??101??? -> C;
          ??110??? -> F;
          ??111??? -> H;
        };
        *;
        if kind==kind@(1,-1) -> E*@(0,-1);
      };
    >>
  }

}


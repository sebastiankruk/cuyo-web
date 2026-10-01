#
#   Copyright 2010-2012 by Mark Weyer
#   Maintenance modifications 2014 by the cuyo developers
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

Trees2 = {
  name = "Holes"
  # TRANSLATORS: "singly connected", or simply connected is a term from
  # mathematics, more specifically topology
  name[geek] = "Singly connected"
  author = "Mark Weyer"
  description = "Groups with holes explode."
  # TRANSLATORS: "complex", "nonpositive" and "Euler characteristic" are terms
  # from mathematics. "Complex" is here used in the sense of simplicial
  # complexes or CW complexes.
  description[geek] = "Complexes with nonpositive Euler characteristic explode."
  anzahl[easy] = 3
  anzahl = 4
  anzahl[hard] = 5
  w_loch[easy] = 1000000
  w_loch = 100
  w_loch[hard] = 50
  pics = Graph * <anzahl>
  startpic = mtrGras.xpm
  greypic = mtrGrau.xpm
  neighbours = <neighbours_hex6>
  startdist[easy] = "..**..*...","****..***."
  startdist = "......*...","..**..***.","****..****"
  startdist[hard] = "..**..*...","****..***.","****..****"
  numexplode = 0

  <<
    var doppel;

    semiglobal = {
      if doppel -> {
        message("Multiple holes");
        bonus(300);
      };
      doppel=0;
    };
  >>

  Graph = {
    pics = mtr1.xpm, mtr2.xpm, mtr3.xpm, mtr4.xpm, mtr5.xpm
    <<
      Graph = {
        if exploding==1 && size>0 -> doppel@@=1;

        weight = 1????? + ?1???? + ?????1 - 1 - 11???? - 1????1;
        file = kind-Graph;
        switch {
          1???11 -> F;
	  1???01 -> E;
          1????0 -> D;
          0???11 -> B;
          0???01 -> C;
          0????0 -> A;
        };
        if pos%3==1 -> qu=Q_BL_TL else -> qu=Q_TL; *;
        switch {
          111??? -> D;
	  110??? -> E;
          10???? -> F;
          011??? -> B;
          010??? -> A;
          00???? -> C;
        };
        if pos%3==1 -> qu=Q_BR_TR else -> qu=Q_TR; *;
        switch {
          ???111 -> E;
	  ???110 -> C;
          ???10? -> A;
          ???011 -> F;
          ???010 -> B;
          ???00? -> D;
        };
        if pos%3==1 -> qu=Q_TL_BL else -> qu=Q_BL; *;
        switch {
          ?111?? -> E;
	  ?011?? -> A;
          ??01?? -> C;
          ?110?? -> D;
          ?010?? -> B;
          ??00?? -> F;
        };
        if pos%3==1 -> qu=Q_TR_BR else -> qu=Q_BR; *;
      };
    >>
  }
}

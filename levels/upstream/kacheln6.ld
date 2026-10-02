#
#   Copyright 2006,2011,2014 by Mark Weyer
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

Kacheln_Sechseck = {
  # TRANSLATORS: "tiling" is used synonymous to tesselation
  name = "Tiling I"
  author = "Mark Weyer"

  sorten = 5
  pics = Kachel*<sorten>
  greypic = Kachel
  startpic = Kachel
  startdist = "....***...","....***...","...*+*+*..",
    "..**+++**.","..*+++++*.",".***+++***",".*********"
  startdist[2] = "....*.*...","...*+*+*..",
    "..**+++**.","..*+++++*.","..-*+++*-.","..-*****-."
  numexplode = 8
  numexplode[2] = 7
  numexplode[easy] = 6
  numexplode[2,easy] = 5
  neighbours = <neighbours_hex6>

  <<
    var quadrat_links, quadrat_unten, quadrat_rechts,
      dreieck_links, dreieck_rechts;
  >>

  Kachel = {
    pics = mkaSechseckKacheln.xpm, mkaSechseckRahmen.xpm

    <<
      var links, unten, rechts;

      Kachel.init = {
        quadrat_links = rnd(sorten);
        quadrat_unten = rnd(sorten);
        quadrat_rechts = rnd(sorten);
        dreieck_links = rnd(sorten);
        dreieck_rechts = rnd(sorten);
      };

      Kachel = {
        links = kind@(-1,0.5)!=nothing && kind@(-1,0.5)!=outside;
        unten = kind@(0,1)!=nothing && kind@(0,1)!=outside;
        rechts = kind@(1,0.5)!=nothing && kind@(1,0.5)!=outside;
        file=1;
        pos=2*(kind@(0,-1)!=nothing && kind@(0,-1)!=outside);
        if kind@(-1,-0.5)!=nothing && kind@(-1,-0.5)!=outside
        -> {qu=Q_BL_TL; pos+=1;}
        else qu=Q_TL_TL;
        *;
        pos=2*(kind@(0,-1)!=nothing && kind@(0,-1)!=outside);
        if kind@(1,-0.5)!=nothing && kind@(1,-0.5)!=outside
        -> qu=Q_TR_TR
        else {qu=Q_BR_TR; pos+=1;};
        *;
        pos=2-2*unten;
        if links
        -> {qu=Q_TL_BL; pos=(pos-1)%4;}
        else qu=Q_BL_BL;
        *;
        pos=2-2*unten;
        if rechts
        -> qu=Q_BR_BR
        else {qu=Q_TR_BR; pos=(pos-1)%4;};
        *;
        qu=Q_ALL;
        file=0;
        pos=6*(kind-Kachel);
        *;
        if links
        -> {
          if ????1? -> pos=6*(kind-Kachel)+3 else pos=6*quadrat_links+3;
          qu=Q_BL;
          *;
          pos-=1;
          qu=Q_BR_TR;
          *@(-1,0.5);
          if unten
          -> {
            if ???11? -> pos=6*(kind-Kachel)+5 else pos=6*dreieck_links+5;
            qu=Q_TL_BL;
            *;
            qu=Q_BL_TL;
            *@(0,1);
            pos-=1;
            qu=Q_TR;
            *@(-1,0.5);
            qu=Q_BR;
            *@(-1,0.5);
          };
        };
        if unten
        -> {
          if ???1?? -> pos=6*(kind-Kachel)+1 else pos=6*quadrat_unten+1;
          qu=Q_TL_BL;
          *;
          qu=Q_TR_BR;
          *;
          qu=Q_BL_TL;
          *@(0,1);
          qu=Q_BR_TR;
          *@(0,1);
        };
        if rechts
        -> {
          if ??1??? -> pos=6*(kind-Kachel)+2 else pos=6*quadrat_rechts+2;
          qu=Q_TR_BR;
          *;
          qu=Q_TL;
          pos+=1;
          *@(1,0.5);
          if unten
          -> {
            if ??11?? -> pos=6*(kind-Kachel)+3 else pos=6*dreieck_rechts+3;
            qu=Q_TR_BR;
            *;
            qu=Q_BR_TR;
            *@(0,1);
            pos+=1;
            qu=Q_TL;
            *@(1,0.5);
            qu=Q_BL;
            *@(1,0.5);
          };
        };
      };
    >>
  }

}


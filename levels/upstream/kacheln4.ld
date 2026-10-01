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

Kacheln_Viereck = {
  # TRANSLATORS: "tiling" is used synonymous to tesselation
  name = "Tiling II"
  author = "Mark Weyer"

  sorten = 5
  pics = Kachel*<sorten>
  greypic = Kachel
  startpic = Kachel
  emptypic = Leer
  startdist[1] = "....**....","....**....","..**++**..","..**++**..",
                 "**++++++**","**++++++**","++**++**++","++**++**++",
                 "++++**++++","++++**++++"
  startdist[2] = "....**....","....**....","..**++**..","..**++**..",
                 "**++++++**","**++++++**"
  numexplode = 7
  numexplode[2] = 6
  numexplode[easy] = 5
  numexplode[2,easy] = 4

  <<
    var dreieck_unten, dreieck_rechts, verschiebung;

    semiglobal.row_up = {verschiebung+=1;};
    semiglobal.row_down = {verschiebung-=1;};
  >>

  Leer = {
    pics = mkaViereckRahmen.xpm

    <<
      Leer = {
        if (loc_x+loc_y+verschiebung@@) % 2 == 0
        -> {
          if ??????0? -> {
            qu=Q_TL;
            if ???????0 -> H else A;
            *
          };
          if 0??????? -> {
            qu=Q_TR;
            if ?0?????? -> H else A;
            *
          };
          if ????0??? -> {
            qu=Q_BL;
            if ?????0?? -> A else H;
            *
          };
          if ??0????? -> {
            qu=Q_BR;
            if ???0???? -> A else H;
            *
          };
        } else {
          if 0??????? -> {
            qu=Q_TL;
            if ???????0 -> E else D;
            *
          };
          if ??0????? -> {
            qu=Q_TR;
            if ?0?????? -> E else D;
            *
          };
          if ??????0? -> {
            qu=Q_BL;
            if ?????0?? -> D else E;
            *
          };
          if ????0??? -> {
            qu=Q_BR;
            if ???0???? -> D else E;
            *
          };
        };
      };
    >>
  }

  Kachel = {
    pics = mkaViereckKacheln.xpm, mkaViereckRahmen.xpm, mkaViereckFall.xpm

    <<
      var links, rechts, oben, unten;

      Kachel.init = {
        dreieck_unten = rnd(sorten-1);
        if dreieck_unten>=kind-Kachel -> dreieck_unten+=1;
        dreieck_rechts = rnd(sorten-1);
        if dreieck_rechts>=kind-Kachel -> dreieck_rechts+=1;
      };

      Kachel = {
        if falling || informational -> {file=2; pos=kind-Kachel; *;}
        else {
          unten = kind@(0,1)!=nothing && kind@(0,1)!=outside;
          oben = kind@(0,-1)!=nothing && kind@(0,-1)!=outside;
          links = kind@(-1,0)!=nothing && kind@(-1,0)!=outside;
          rechts = kind@(1,0)!=nothing && kind@(1,0)!=outside;

          file=1;
          if (loc_x+loc_y+verschiebung@@) % 2 == 0
          -> {
            qu=Q_TL;
            if oben ||
                (links && kind@(-1,-1)!=nothing && kind@(-1,-1)!=outside)
              -> F else C; *;
            qu=Q_TR;
            if rechts || (oben && kind@(1,-1)!=nothing && kind@(1,-1)!=outside)
              -> F else C; *;
            qu=Q_BL;
            if links || (unten && kind@(-1,1)!=nothing && kind@(-1,1)!=outside)
              -> C else F; *;
            qu=Q_BR;
            if unten || (rechts && kind@(1,1)!=nothing && kind@(1,1)!=outside)
              -> C else F; *;
          } else {
            qu=Q_TL;
            if links ||
                (oben && kind@(-1,-1)!=nothing && kind@(-1,-1)!=outside)
              -> G else B; *;
            qu=Q_TR;
            if oben || (rechts && kind@(1,-1)!=nothing && kind@(1,-1)!=outside)
              -> G else B; *;
            qu=Q_BL;
            if unten || (links && kind@(-1,1)!=nothing && kind@(-1,1)!=outside)
              -> B else G; *;
            qu=Q_BR;
            if rechts || (unten && kind@(1,1)!=nothing && kind@(1,1)!=outside)
              -> B else G; *;
          };

          qu=Q_ALL;
          file=0;
          pos=10*(kind-Kachel);
          if (loc_x+loc_y+verschiebung@@) % 2 == 0
          -> {
            pos+=7; *;
            if unten -> {
              if ????1???
                -> pos=10*(kind-Kachel)+3 else pos=10*dreieck_unten+3;
              *;
              pos+=5;
              *@(0,1);
            };
            if rechts -> {
              if ??1?????
                -> pos=10*(kind-Kachel)+5 else pos=10*dreieck_rechts+5;
              *;
              pos+=1;
              *@(1,0);
            };
          } else {
            pos+=2; *;
            if unten -> {
              if ????1???
                -> pos=10*(kind-Kachel)+4 else pos=10*dreieck_unten+4;
              *;
              pos+=5;
              *@(0,1);
            };
            if rechts -> {
              if ??1?????
                -> pos=10*(kind-Kachel) else pos=10*dreieck_rechts;
              *;
              pos+=1;
              *@(1,0);
            };
          };
        };
      };
    >>
  }

}


#
#   Copyright 2006,2010,2011,2014 by Mark Weyer
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
# The above notices apply to this file and to:
#   mkaFuenfeckVerbind.xpm[.gz]
#

Kacheln_Fuenfeck = {
  # TRANSLATORS: "tiling" is used synonymous to tesselation
  name = "Tiling III"
  author = "Mark Weyer"

  sorten = 5
  pics = Kachel*<sorten>
  greypic = Kachel
  startpic = Kachel
  emptypic = Leer
  startdist = "**........","**........","++**......","++**......",
    "**++**....","**++**....","++**++**..","++**++**..","**++**++**"
  startdist[easy] = "**........","**........","++**......","++**......",
    "**++**....","**++**....","++**++**.."
  toppic = mkaFuenfeckHetz.xpm
  topoverlap = 48
  topcolor = 255,255,255
  numexplode = 7
  numexplode[easy] = 5
  neighbours = <neighbours_eight>

  <<
    var verschiebung;

    semiglobal.row_up = {verschiebung+=1;};
    semiglobal.row_down = {verschiebung-=1;};
  >>

  Leer = {
    pics = mkaFuenfeckRahmen.xpm

    <<
      Leer = {
        if (loc_y+verschiebung@@) % 2 == 0
        -> {
          if loc_x % 2 == 0
          -> {
            qu=Q_TL;
            switch {
              0?????0? -> {Y*;};
              ??????0? -> {c*;};
              1??????0 -> {a*;};
              0??????0 -> {F*;};
              0??????? -> {O*;};
            };
            if ?0?????? -> {qu=Q_TR; Q*;};
            qu=Q_BR;
            switch {
              ??0?0??? -> {Y*;};
              ????0??? -> {c*;};
              ??10???? -> {E*;};
              ??00???? -> {a*;};
              ??0????? -> {A*;};
            };
            qu=Q_BL;
            switch {
              ????0?0? -> {c*;};
              ????1?0? -> {G*;};
              ????0?1? -> {M*;};
            };
          } else {
            qu=Q_TR;
            switch {
              0?0????? -> {B*;};
              0??????? -> {Z*;};
              ?01????? -> {N*;};
              ?00????? -> {j*;};
              ??0????? -> {P*;};
            };
            if ???0???? -> {qu=Q_BR; b*;};
            qu=Q_BL;
            switch {
              ????0?0? -> {B*;};
              ??????0? -> {Z*;};
              ????10?? -> {d*;};
              ????00?? -> {N*;};
              ????0??? -> {F*;};
            };
            qu=Q_TL;
            switch {
              0?????0? -> {Z*;};
              0?????1? -> {E*;};
              1?????0? -> {D*;};
            };
          };
        } else {
          if loc_x % 2 == 0
          -> {
            qu=Q_BL;
            switch {
              ????0?0? -> {i*;};
              ????0??? -> {K*;};
              ?????01? -> {W*;};
              ?????00? -> {A*;};
              ??????0? -> {U*;};
            };
            if ???????0 -> {qu=Q_TL; I*;};
            qu=Q_TR;
            switch {
              0?0????? -> {i*;};
              ??0????? -> {K*;};
              10?????? -> {G*;};
              00?????? -> {W*;};
              0??????? -> {e*;};
            };
            qu=Q_BR;
            switch {
              ??0?0??? -> {K*;};
              ??1?0??? -> {f*;};
              ??0?1??? -> {g*;};
            };
          } else {
            qu=Q_BR;
            switch {
              ??0?0??? -> {L*;};
              ??0????? -> {H*;};
              ???01??? -> {J*;};
              ???00??? -> {e*;};
              ????0??? -> {V*;};
            };
            if ?????0?? -> {qu=Q_BL; T*;};
            qu=Q_TL;
            switch {
              0?????0? -> {L*;};
              0??????? -> {H*;};
              ??????10 -> {f*;};
              ??????00 -> {J*;};
              ??????0? -> {j*;};
            };
            qu=Q_TR;
            switch {
              0?0????? -> {H*;};
              1?0????? -> {d*;};
              0?1????? -> {X*;};
            };
          };
        };
      };
    >>
  }

  Kachel = {
    pics = mkaFuenfeckKacheln.xpm, mkaFuenfeckRahmen.xpm, mkaFuenfeckFall.xpm

    <<
      var links, rechts, oben, unten;

      Kachel.connect = {
        if (loc_y+verschiebung@@) % 2 == 0
        -> if loc_x % 2 == 0
          -> inhibit = DIR_DR+DIR_DL+DIR_UL
          else inhibit = DIR_DL+DIR_UL+DIR_UR
        else if loc_x % 2 == 0
          -> inhibit = DIR_UR+DIR_DR+DIR_DL
          else inhibit = DIR_UL+DIR_UR+DIR_DR;
      };

      Kachel = {
        if falling || informational -> {file=2; pos=kind-Kachel; *;}
        else {
          unten = kind@(0,1)!=nothing && kind@(0,1)!=outside;
          oben = kind@(0,-1)!=nothing && kind@(0,-1)!=outside;
          links = kind@(-1,0)!=nothing && kind@(-1,0)!=outside;
          rechts = kind@(1,0)!=nothing && kind@(1,0)!=outside;

          file=1;
          if (loc_y+verschiebung@@) % 2 == 0
          -> if loc_x % 2 == 0
            -> {if links || unten -> C else Q; *;}
            else {if oben || links -> R else b; *;}
          else if loc_x % 2 == 0
            -> {if unten || rechts -> S else I; *;}
            else {if rechts || oben -> h else T; *;};

          file=0;
          pos=12*(kind-Kachel);
          if (loc_y+verschiebung@@) % 2 == 0
          -> {
            if loc_x % 2 == 0
            -> {
              pos+=6; *;
              pos+=1; *@(1,0);
              pos-=7; *@(0,-1);
            } else {
              pos+=3; *;
              pos+=1; *@(1,0);
              pos+=5; *@(0,1);
            };
          } else {
            if loc_x % 2 == 0
            -> {
              pos+=11; *;
              pos-=1; *@(-1,0);
              pos-=5; *@(0,-1);
            } else {
              pos+=2; *;
              pos-=1; *@(-1,0);
              pos+=7; *@(0,1);
            };
          };
        };
      };
    >>
  }

  info = {
    pics = mkaFuenfeckVerbind.xpm, infoicons.xpm
    <<
       info = {
         if version==0 -> 1 else 0;
         A*
       };
    >>
  }

}


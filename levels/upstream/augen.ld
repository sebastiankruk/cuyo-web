#
#   Copyright 2010-2012,2014 by Mark Weyer
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

# referenced from dungeon.ld

Augen = {

  name = "Eyes"
  author = "Mark Weyer"
  description = "They are watching you.\nGet rid of them."
  anzahl = 5
  pics = Auge * <anzahl>
  emptypic = Leer
  greypic = Zu
  startpic = Starr * <anzahl>
  startdist = "*.........","***.....**","*****.****"
  bgcolor = 255,204,153
  numexplode = 5
  neighbours = <neighbours_hex4>
  zeilen = 2

  Auge = {
    pics = maLidA.xpm, maLidB.xpm, maLidC.xpm, maLidD.xpm,
      ma1.xpm, ma2.xpm, ma3.xpm, ma4.xpm, ma5.xpm
  }

  Leer = {
    pics = maLeer.xpm
  }

  Zu = {
    pics = maLidA.xpm, maLidB.xpm, maLidC.xpm, maLidD.xpm
  }

  Starr = {
  }

  <<
    var ziel,dx,dy,max,blitz,explo;

    semiglobal = {
      explo=0;
      if players>1 -> blitz = explo@@(;!)>0
      else -> blitz = 1:100;
      if blitz => {{B,A,A,A,A,A,A,A,A,A,A,A,A,A,A}; blitz=pos;};
    };

    augenwinkel = {
      # Die bisherigen Wert von file und pos werden noch gebraucht
      file+=2;
      qu=Q_TL_BL; *@(1,-0.5);
      qu=Q_BL_TL; *@(1,0.5);
      qu=Q_TR_BR; *@(-1,-0.5);
      qu=Q_BR_TR; *@(-1,0.5);
    };

    zielverfolg = {
      if ziel>2 && players>1 -> {
        dx = loc_xx@@(ziel-2;!)-loc_xx+320*(3-2*loc_p);
        dy = loc_yy@@(ziel-2;!)-loc_yy;
      } else {
        dx = loc_xx@@(ziel%2)-loc_xx;
        dy = loc_yy@@(ziel%2)-loc_yy;
      };
      pos = 6 + (6*zeilen)/2;
      switch {
        dy>0 && dx==-dy..dy -> pos -= (dx*3*zeilen+dx/2)/dy;
        dx<0 && dy==dx..-dx -> pos += 6*zeilen+(dy*3*zeilen-dy/2)/dx;
        dy<0 && dx==dy..-dy -> pos += 12*zeilen-(dx*3*zeilen-dx/2)/dy;
        dx>0 && dy==-dx..dx -> pos += 18*zeilen+(dy*3*zeilen+dy/2)/dx;
        -> E;
      };
      if pos==6*(1+4*zeilen) -> G;
    };

    auge = {
      # Erstmal Explosionen zaehlen (damit der Gegner geblitzt wird)
      if exploding -> explo@@+=1;

      # Augapfel (inklusive Standard-Lid)
      if ziel == 4 -> E
      else -> zielverfolg;

      # Aber nach dem Blitz stattdessen erstmal kleine Pupillen
      if blitz@@ => { ,A,A,A,A,A,A,A,A,A,A,B,C,D,E };
      *;

      # Blinzeln
      if 1:300 => A
      else -> D;
      file = blitz@@;
      if file => { D,A,A,A,A,A,A,A,B,C,D,,,, };
      qu=Q_TL; if kind==kind@(-1,-0.5) -> {pos+=4; *; pos-=4;} else *;
      qu=Q_TR; if kind==kind@(1,-0.5) -> {pos+=4; *; pos-=4;} else *;
      qu=Q_BL; if kind==kind@(-1,0.5) -> {pos+=4; *; pos-=4;} else *;
      qu=Q_BR; if kind==kind@(1,0.5) -> {pos+=4; *; pos-=4;} else *;
      qu=Q_ALL;

      augenwinkel;

      if ziel==4 && informational && 1:5 => {,,,,,kind=Auge+rnd(anzahl)};
    };

    Auge.init = { ziel = rnd(4); };

    Auge = {
      file = kind-Auge+4;
      if falling -> F*
      else -> auge;
    };

    Starr.init = {
      kind = kind-Starr+Auge;
      ziel = 4;
      behaviour = calculate_size + explodes_on_size + goalblob;
      weight = 0;
    };

    Starr = {};

    Leer = {
      if blitz@@ -> A*;
    };

    Zu = {
      file = blitz@@;
      A*;
      augenwinkel;
    };
  >>
}


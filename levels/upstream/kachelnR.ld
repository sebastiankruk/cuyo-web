#
#   Copyright 2006,2011,2014 by Mark Weyer
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
#   mkaRhombusVerbind.xpm[.gz]
#


Kacheln_azyklisch = {
  # TRANSLATORS: "tiling" is used synonymous to tesselation
  name = "Tiling IV"
  # TRANSLATORS: "tiling" is used synonymous to tesselation
  description = "Random aperiodic tiling"
  author = "Mark Weyer"

  sorten = 5
  pics = Block,Kachel*<sorten>
  greypic = Kachel
  startpic = Kachel
  emptypic = Leer
  startdist = "**********","**********","**++++++**",
    "**++++++**","**++++++**","**++++++**","**********"
  numexplode = 4
  numexplode[easy] = 3
  neighbours = <neighbours_hex6>

  inhibit_alle = <DIR_U+DIR_UR+DIR_DR+DIR_D+DIR_DL+DIR_UL>

  <<
    var xx,yy,zz,naehe,schicht,art;
    var richtung,tendenz;

    # Das Dreieck, das nach rechts zeigt, ist immer in der Mitte. Das, das
    # nach links zeigt, ist von da aus
    # bei art==1 nach links
    # bei art==2 nach rechts oben
    # bei art==3 nach rechts unten

    # richtung: 1=(1,0.5), 2=(0,1), 3=(-1,0.5)
    # tendenz: 1=links, 2=rechts (nur fuer art=1 wichtig)

    # Basiskoordinaten:
    # bx = loc_y+loc_x/2;
    # by = loc_y-(loc_x+1)/2;
    #
    # schicht = (x*x@+y*y@) / schicht@
    # x = bx-schicht
    # y = by-schicht
    # z = -schicht

    var verschiebung;

    global.init = {
      xx = rnd(10000)+3000;
      yy = rnd(10000)+3000;
      zz = rnd(10000)+3000;
      schicht = xx+yy+zz;
      verschiebung@@(;<) = 100+rnd(100);
      verschiebung@@(;>) = 100+rnd(100);
    };

    semiglobal.row_up = {verschiebung+=1;};
    semiglobal.row_down = {verschiebung-=1;};

    semiglobal = {inhibit=0;};

    berechne = {
      xx = loc_y+verschiebung@@+loc_x/2;
      yy = loc_y+verschiebung@@-(loc_x+1)/2;
      naehe = (xx*xx@ + yy*yy@) % schicht@;
      switch {
        naehe-zz@<0 -> art=1;
        naehe+xx@>=schicht@ -> art=2;
        -> art=3;
      };
    };

    male = {
      # Voraussetzungen:
      # - berechne fand schon statt
      # - file ist richtig gesetzt und pos bis auf +0..+5
      switch {
        art==1 -> {
          [qu=Q_TL_BL] *@(-1,-0.5); [qu=Q_TR_BR] *@(-1,-0.5);
          [qu=Q_BL_TL] *@(-1,0.5); [qu=Q_BR_TR] *@(-1,0.5);
          pos+=1; *;
        };
        art==2 -> {
          pos+=3; *@(0,-1);
          pos+=2; *;
        };
        art==3 -> {
          pos+=2; *;
          pos+=2; *@(0,1);
        };
      };

      0;
      # Rechten und unteren Rand dort auffuellen, wo es keine Blobs gibt.
      if kind@(0,1)==outside || loc_x==9 ->
        [naehe = (naehe+xx@+yy@)%schicht@] switch {
          naehe-zz@<0 -> {
            # art eins drunter wäre 1
            if art!=3 && (loc_x%2==0 || loc_x==9) -> {
              A;
              qu=Q_TL_BL; *;
              qu=Q_TR_BR; *;
              qu=Q_BL_TL; *@(0,1);
              qu=Q_BR_TR; *@(0,1);
            };
            qu=Q_ALL;
            if kind@(0,1)==outside && loc_x%2==1 -> B*@(0,1);
          };
          naehe+xx@>=schicht@ -> {
            # art wäre dort 2
            if kind@(0,1)==outside -> {
              D*;
              if loc_x%2==1 -> F*@(0,1);
            };
          };
          -> {
            # art wäre dort 3
            if art!=3 && (loc_x%2==0 || loc_x==9) -> {
              A;
              qu=Q_TL_BL; *;
              qu=Q_TR_BR; *;
              qu=Q_BL_TL; *@(0,1);
              qu=Q_BR_TR; *@(0,1);
            };
            qu=Q_ALL;
            if kind@(0,1)==outside && loc_x%2==1 -> C*@(0,1);
          };
        };
      # dito oberer Rand
      if kind@(0,-1)==outside && art!=2 && loc_x%2==0 ->
        [naehe = (naehe-xx@-yy@)%schicht@] switch {
          naehe-zz@<0 || naehe+xx@>=schicht@ -> {
            # art eins drüber wäre 1 oder 2
            A;
            qu=Q_BL_TL; *;
            qu=Q_BR_TR; *;
            qu=Q_ALL;
          };
          -> {
            # art wäre dort 3
            E*;
          };
        };
    };
  >>

  Leer = {
    pics = mkaRhombusLeer.xpm
    <<
      Leer = {
        berechne;
        male;
      };
    >>
  }

  Block = {
    pics = mkaRhombusLeer.xpm
    colourprob = 0

    <<
      default behaviour=floats : reapply;

      Block = {
        berechne;
        male;
        if basekind@(1,-0.5)!=Kachel || art@(1,-0.5)!=1 -> kind=Leer;
      };
    >>
  }

  Kachel = {
    pics = mkaRhombusLeer.xpm, mkaRhombusKacheln.xpm, mkaRhombusFall.xpm

    <<

      berechne_inhibit = {
        inhibit=inhibit@@;
        switch {
          art==0 -> inhibit = inhibit_alle;
          art==1 -> {
            if art@(0,-1)!=3 -> inhibit.+=DIR_U;
            if art@(1,-0.5)!=1 -> inhibit.+=DIR_UR;
            if art@(1,0.5)!=1 -> inhibit.+=DIR_DR;
            if art@(0,1)!=2 -> inhibit.+=DIR_D;
          };
          art==2 -> {
            if art@(1,0.5)!=1 -> inhibit.+=DIR_DR;
            if art@(0,1)!=2 -> inhibit.+=DIR_D;
            if art@(-1,0.5)!=2 -> inhibit.+=DIR_DL;
            if art@(-1,-0.5)!=3 -> inhibit.+=DIR_UL;
          };
          art==3 -> {
            if art@(0,-1)!=3 -> inhibit.+=DIR_U;
            if art@(1,-0.5)!=1 -> inhibit.+=DIR_UR;
            if art@(-1,0.5)!=2 -> inhibit.+=DIR_DL;
            if art@(-1,-0.5)!=3 -> inhibit.+=DIR_UL;
          };
        };
      };

      Kachel = {
        if falling || informational -> {
          2;
          pos=kind-Kachel;
          if !informational -> {
            xx = (loc_yy+(loc_xx+48)/32*16)/32+verschiebung@@;
            yy = xx-(loc_xx+16)/32;
            naehe = (xx*xx@ + yy*yy@) % schicht@;
            switch {
              naehe-zz@<0 -> ;
              naehe+xx@>=schicht@ -> pos+=sorten+2;
              -> pos+=sorten*2+4;
            }
          };
          *;
        }
        else {
          berechne;
          1; pos=6*(kind-Kachel);
          male;
          berechne_inhibit;

          # floats setzen
          if art==1 && basekind@(-1,0.5)==Kachel -> behaviour.+=floats
          else behaviour.-=floats;

          # Gravitation
          if art==1 && kind@(-1,0.5)==Leer -> kind@(-1,0.5)=Block;
          if !exploding -> {
            switch {            # richtung berechnen
              art==1 -> if tendenz==2
                -> if art@(1,0.5)==1 -> richtung=1 else richtung=2
                else richtung=3;
              art==2 -> if art@(1,0.5)==1 -> richtung=1 else richtung=2;
              art==3 -> richtung=2;
            };
            switch {            # kann man da ueberhaupt hin?
              richtung==1 ->
                if kind@(1,0.5)==outside || loc_y@(1,0.5)==20 -> richtung=0;
              richtung==2 ->
                if kind@(0,1)==outside || loc_y@(0,1)==20 -> richtung=0;
              richtung==3 ->
                if kind@(-1,0.5)==outside || loc_y@(-1,0.5)==20 -> richtung=0;
            };
            switch {            # ist dort noch frei?
              richtung==1 ->
                if kind@(1,0.5)!=Leer && kind@(1,0.5)!=Block -> richtung=0;
              richtung==2 ->
                if kind@(0,1)!=Leer && kind@(0,1)!=Block -> richtung=0;
              richtung==3 ->
                if kind@(-1,0.5)!=Leer && kind@(-1,0.5)!=Block -> richtung=0;
            };
            switch {            # Konflikte erkennen - gerade Spalten zuerst
              richtung==1 && loc_x%2 &&
                ((art@(2,0)==1 && basekind@(2,0)==Kachel && tendenz@(2,0)==1)
                  || (art@(1,-0.5)==3 && basekind@(1,-0.5)==Kachel))
                -> richtung=0;
              richtung==2 && loc_x%2 &&
                art@(0,1)==1 && basekind@(-1,0.5)==Kachel -> richtung=0;
              richtung==3 && !(loc_x%2) &&
                art@(-1,0.5)==1 && basekind@(-2,0)==Kachel -> richtung=0;
            };
            switch {
              richtung==1 -> {
                kind@(1,0.5)=kind;
                behaviour@(1,0.5).+=floats;
                tendenz@(1,0.5)=1;
              };
              richtung==2 -> {
                kind@(0,1)=kind;
                tendenz@(0,1)=2;
              };
              richtung==3 -> {
                kind@(-1,0.5)=kind;
                tendenz@(-1,0.5)=2;
              };
            };
            if richtung -> {
              if kind@(0,-1)==Leer -> kind=Leer else kind=Block;
              inhibit@@=inhibit_alle;
            };
          };
        };
      };

      Kachel.land = {
        berechne;
        tendenz=2;
        inhibit=inhibit_alle;
        inhibit@@=inhibit_alle;
      };
    >>
  }

  info = {
    pics = mkaRhombusVerbind.xpm, infoicons.xpm
    <<
      info = {
        if version==0 -> 1A
        else {
          A,A,A,A,A,A,A,A,A,
          B,B,B,B,B,B,B,B,B,
          C,C,C,C,C,C,C,C,C
        };
        *
      };
    >>
  }

}


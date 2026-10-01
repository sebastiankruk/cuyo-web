#
#   Copyright <=2004,2014 by Immanuel Halupczok
#   Modified 2005,2006 by Immanuel Halupczok
#   Modified 2006 by Mark Weyer
#   Maintenance modifications 2006,2011 by the cuyo developers
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
#   i3Dreieck.xpm.gz, i3Grau.xpm.gz, i3Plus.xpm.gz, i3Stern.xpm.gz
#   i3Gitter.xpm.gz, i3Kreis.xpm.gz, i3Quadrat.xpm.gz,
#   i3Bunt.xcf, i3Grau.xcf
#

DreiD={
  name="3D"
  author="Immi"
  description="Well, just a little bit 3D."
  neighbours=<neighbours_3D>
  greypic=Box
  startpic=Gitter
  pics=Quadrat,Dreieck,Kreis,Stern,Plus
  numexplode=7
  numexplode[easy]=5
  startdist[1]="AA......AA",
               "AA......AA",
               "AA......AA",
               "AA......AA",
               "AA......AA",
               "AAAAAAAAAA"
  startdist="AA......AA",
            "AA......AA",
            "AA......AA",
            "AA......AA",
            "AAAAAAAAAA"
  bgcolor=30,30,30
  textcolor=50,50,50
  #chaingrass=1
  #chaingrass[easy]=0
  randomgreys[1]=40
  randomgreys[2]=120

  <<

  
  
  var basis, oo, uu, ll, rr, hi;

  var fall_richtung; # Wie rum ist das Fall (relativ zu mir):
    # 0 = ich bin links, 1 = ich bin oben; etc.

  Objekt_init = { if loc_x == 4 -> fall_richtung = 0 else fall_richtung = 2; };

  Objekt_turn = { fall_richtung = (fall_richtung + 1) % 4; };
  
  Objekt={
    hi = loc_x % 2;
    if falling -> { # Fallend
      if turn == 0 && !hi && fall_richtung == 0 -> {
        V*; W*@(1);
      } else if hi && turn==0 && fall_richtung == 2 -> {
        Z*; Y@(1)*;
      } else if hi -> a* else -> U*;
      #out1 = fall_richtung;
    } else {
      if hi -> basis = 5 else basis = 1;
      oo = kind@(0,-1) == kind;
      uu = kind@(0,1) == kind;
      ll = kind@(-2,0) == kind;
      rr = kind@(2,0) == kind;

      pos=basis+2*ll    +9*oo    ; [qu=Q_TL] *;
      pos-=1;                      [qu=Q_TR_BR] if hi -> @(-1,-.5)* else *@(-1,-.5);
      pos=basis+2*(1-rr)+9*oo    ; [qu=Q_TR] *;
      pos+=1;                      [qu=Q_TL_BL] if hi -> @(1,-.5)* else *@(1,-.5);
      pos=basis+2*ll    +9*(1-uu); [qu=Q_BL] *;
      pos-=1;                      [qu=Q_BR_TR] if hi -> @(-1,.5)* else *@(-1,.5);
      pos=basis+2*(1-rr)+9*(1-uu); [qu=Q_BR] *;
      pos+=1;                      [qu=Q_BL_TL] if hi -> @(1,.5)* else *@(1,.5);

      if hi && kind@(-1,.5) == kind -> {
        [qu=Q_BL] X*;
        if kind == Gitter -> [qu=Q_BR_TR] W@(-1,.5)*;
      };
    }; # Nicht fallend
  
  }; # Objekt

  >>
  
  
  Box={
    pics=i3Grau.xpm
    <<
    Box={
      if informational -> A*
      else if loc_x % 2 -> {
        [qu=Q_TR_BR] C@(-1,-.5)*;
        [qu=Q_BR_TR] C@(-1,.5)*;
        [qu=Q_TR_BR] H@(-1,.5)*;
        D*;
        I@(0,1)*;
        [qu=Q_TL_BL] E@(1,-.5)*;
        [qu=Q_BL_TL] E@(1,.5)*;
        [qu=Q_TL_BL] J@(1,.5)*;
      } else {
        [qu=Q_TR_BR] F*@(-1,-.5);
        [qu=Q_BR_TR] F*@(-1,.5);
        B*@(0,-1);
        G*;
        [qu=Q_BL_TL] C*@(1,-.5);
        [qu=Q_TL_BL] H*@(1,-.5);
        [qu=Q_BL_TL] H*@(1,.5);
      };
    };
    >>
  }
  
  Gitter={
    pics=i3Gitter.xpm
    << Gitter=Objekt; >>
  }
  
  Quadrat={
    pics=i3Quadrat.xpm
    << Quadrat=Objekt; Quadrat.init=Objekt_init; Quadrat.turn=Objekt_turn; >>
  }

  Kreis={
    pics=i3Kreis.xpm
    << Kreis=Objekt; Kreis.init=Objekt_init; Kreis.turn=Objekt_turn; >>
  }
  
  Dreieck={
    pics=i3Dreieck.xpm
    << Dreieck=Objekt; Dreieck.init=Objekt_init; Dreieck.turn=Objekt_turn; >>
  }
  
  Stern={
    pics=i3Stern.xpm
    << Stern=Objekt; Stern.init=Objekt_init; Stern.turn=Objekt_turn; >>
  }
  
  Plus={
    pics=i3Plus.xpm
    << Plus=Objekt; Plus.init=Objekt_init; Plus.turn=Objekt_turn; >>
  }
  
}

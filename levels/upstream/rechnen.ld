#
#   Copyright 2005,2006,2008,2014 by Mark Weyer
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

Rechnen = {
  name = "Calculations"
  author = "Mark Weyer"
  pics = zahl*3
  greypic = grau
  startpic = gras
  startdist = "**********","-*%&"
  chaingrass[hard] = 1

  <<
    semiglobal = weight = 1;
    semiglobal.init={falling_speed=4;};
  >>

  zahl = {
    pics = mreZahl1.xpm,mreZahl2.xpm,mreZahl3.xpm
    <<
      var value,operator,operatorart;

      zahl.init = {
        if 1:3
          -> {operator = 1; operatorart=rnd(2); value=0;}
          else {value = rnd(11)};
      };

      zahl.land = weight@@ = 0;

      zahl.connect = weight = value*weight@@;

      zahl = {
        if kind@(0,1)==nothing && !informational -> weight@@ = 0;
        if operator -> {
          if ??1???1? && !operator@(1,0) && !operator@(-1,0) -> {
            operator=0;
            if operatorart==0 # Addition
              -> value=value@(1,0)+value@(-1,0)
              else value=value@(1,0)*value@(-1,0);
            kind@(1,0)=nothing;
            kind@(-1,0)=nothing;
            weight@@ = 0;
          }
          else if 1???1??? && !operator@(0,1) && !operator@(0,-1) -> {
            operator=0;
            if operatorart==0 # Addition
              -> value=value@(0,1)+value@(0,-1)
              else value=value@(0,1)*value@(0,-1);
            kind@(0,1)=nothing;
            kind@(0,-1)=nothing;
            weight@@ = 0;
          };
        };
        file=kind-zahl;
        schema4;
        switch {
          operator -> {pos=operatorart+24; *;};
          value<10 -> {pos=5+2*value; *;};
                    -> {
                         pos=4+2*((value/10)%10); qu=Q_TL; *; qu=Q_BL; *;
                         pos=4+2*(value%10);      qu=Q_TR; *; qu=Q_BR; *;
                       };
        };
      };
    >>
    numexplode = 100
  }

  grau = {
    pics = mreGrasgrau.xpm, mreZahl1.xpm, mreZahl2.xpm, mreZahl3.xpm
    <<
      var farbe;

      grau.init = {
        if kind@(0,1)==nothing && !informational -> weight@@ = 0;
        if informational -> farbe=0
        else {
          farbe = rnd(10);
          if farbe>3 -> farbe=0;
        };
      };

      bunt_grau = {
        file=farbe;
        if farbe==0 -> A* else F*;
      };

      grau=switch {
          kind@(0,-1)==grau && kind@(0,1)!=grau && kind@(0,1)!=nothing
            -> {bunt_grau; kind=nothing;};
          kind@(0,1)==grau || kind@(0,1)==nothing -> bunt_grau;
          -> {farbe=0; A*};
        };
    >>
  }

  gras = {
    pics = mreGrasgrau.xpm
    <<
      gras = {
        if kind@(0,1)==nothing && !informational -> weight@@ = 0;
        B*;
      };
    >>
  }

}

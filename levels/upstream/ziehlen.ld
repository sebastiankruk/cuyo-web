#
#   Copyright 2005,2006,2010 by Mark Weyer
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

Ziehlen={
  name = "Target practice"
  author = "Mark Weyer"
  pics = gruen,rot
  emptypic = nichts
  startpic = gras
  startdist[1] = "EEEEEEEEEE"
  toptime[1] = 30
  toptime[1,hard] = 15
  numexplode[1] = 100
  startdist[2] = ".........AB.........","EEEEEEEEEE"
  toptime[2] = 36
  toptime[2,hard] = 18
  numexplode[2] = 200
  randomfallpos = 1
  loch_y = 6
  loch_breite = 7                # loch-x-Angaben alle in halben Blops
  loch_breite[hard] = 5
  loch_x_min = <4-loch_breite>
  loch_x_max = 16
  nogreyprob = 1

  <<
    var loch_x=(loch_x_max+loch_x_min)/2, verbinder, verloren;

    semiglobal = {
      if 1:4 -> switch {
        (loch_x-loch_x_min+2*(loch_x_max-loch_x_min))
            : 5*(loch_x_max-loch_x_min)
          -> loch_x-=1;
          -> loch_x+=1;
      };
      if loch_x<loch_x_min -> loch_x=loch_x_min;
      if loch_x>loch_x_max -> loch_x=loch_x_max;

      if (!(loc_x@@0*2 == loch_x..loch_x+loch_breite-2)
            || !(loc_x@@1*2 == loch_x..loch_x+loch_breite-2))
          && ((loc_y@@0==loch_y) || (loc_y@@1==loch_y)) -> {
        kind@@0 = rot;
        kind@@1 = rot;
      };
    };
  >>

  gruen = {
    pics = mziAlle.xpm

    <<
      gruen.init = {
        if loc_y>=loch_y -> {  # Bin ich etwa erst unter dem Loch entstanden?
          kind=rot;
          kind@1=rot;     # Achtung! Historisch verbürgt:
                          # Die erste Verwendung relativer Adressierung
                          # bei fallenden Blops
          falling_speed@@ = 64;
          falling_fast_speed@@ = 64;
          verloren=1;
          weight=0;
        };
      };

      gruen = {
        if verbinder>0 -> {
          if verbinder==1 -> {
            B;
            weight=size@(-9,0;>)-weight@(-9,0;>)+2;
          };
          if verbinder==2 -> {
            C;
            weight=size@(9,0;<)-weight@(9,0;<)+2;
          };
        };
        *;
        if (!falling) && (loc_y<=loch_y) -> kind@(0,0)=rot;
      };
    >>

  }

  rot = {
    pics = mziAlle.xpm
    colourprob = 0

    <<
      rot = {
        D*;
        if !falling && !verloren -> kind@(0,0)=nothing;
      };
    >>

  }

  gras = {
    pics = mziAlle.xpm

    <<
      gras.init = switch {
        informational -> version=4;
        version==0 -> {kind=gruen; verbinder=1;};
        version==1 -> {kind=gruen; verbinder=2;};
      };
    >>
  }

  nichts = {
    pics = mziAlle.xpm

    <<
      nichts = {
        if loc_y==loch_y -> {
          loch_x = 2*loc_x-loch_x@@;;
          switch {
            ! (loch_x == -2..loch_breite) -> I*;
            loch_x == 0..loch_breite-2 -> ;
            loch_x==-2 -> G*;
            loch_x==-1 -> J*;
            loch_x==loch_breite-1 -> H*;
            loch_x==loch_breite -> F*;
          };
        };
      };
    >>
  }

}

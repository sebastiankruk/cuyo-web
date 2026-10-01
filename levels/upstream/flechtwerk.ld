#
#   Copyright 2011,2014 by Mark Weyer
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

Flechtwerk = {
  name = "Wickerwork"
  author = "Mark Weyer"
  emptypic = Leer
  pics = Blob*5
  greypic = Blob
  startpic = Gras
  startdist = "....**....","..******..","**********"
  numexplode = 3
  chaingrass = 1

  Blob = {pics = mflAlles.xpm,mflKlein.xpm}
  Gras = {pics = mflAlles.xpm,mflGrasV.xpm}
  Leer = {pics = mflAlles.xpm}

  <<

    var g1=0:reapply, g2=0:reapply,
        d1=0:reapply, d2=0:reapply,
        m1=0:reapply, m2=0:reapply;

    Blob.init = {
      switch {
        kind==Blob+5 -> {g1=0; g2=0; d1=0; d2=0; m1=4; m2=4;};
        kind==Blob+4 -> {g1=1; g2=1; d1=1; d2=1; m1=1; m2=1;};
        -> {
          g1 = 2 + kind%2;
          g2 = 2 + (kind>=Blob+2);
          d1=0; d2=0; m1=g1; m2=g2;
        };
      };
    };

    Blob = {
      if falling -> {
        1;
        pos=m1-1; qu=Q_TL; *; qu=Q_BR; *;
        pos=m2-1; qu=Q_TR; *; qu=Q_BL; *;
      } else {
        qu=Q_TL; pos = 32*m1 + 16*d1@(-1,-1) + 4*g2@(0,-1) + g2@(-1,0); *;
        qu=Q_TR; pos = 32*m2 + 16*d2@(1,-1) + 4*g1@(0,-1) + g1@(1,0); *;
        qu=Q_BL; pos = 32*m2 + 16*d2@(-1,1) + 4*g1@(0,1) + g1@(-1,0); *;
        qu=Q_BR; pos = 32*m1 + 16*d1@(1,1) + 4*g2@(0,1) + g2@(1,0); *;
      };
    };

    Gras = {
      if !informational && (kind@(-1,0)==kind || kind@(-1,0)==outside) -> {
        1;
        qu=Q_TL; pos = 4*d1@(-1,-1) + g2@(0,-1); *;
        qu=Q_BL; pos = 4*d2@(-1,1) + g1@(0,1); *;
      } else {
        qu=Q_TL; pos = 160 + 16*d1@(-1,-1) + 4*g2@(0,-1) + g2@(-1,0); *;
        qu=Q_BL; pos = 160 + 16*d2@(-1,1) + 4*g1@(0,1) + g1@(-1,0); *;
      };
      if !informational && (kind@(1,0)==kind || kind@(1,0)==outside) -> {
        1;
        qu=Q_TR; pos = 4*d2@(1,-1) + g1@(0,-1); *;
        qu=Q_BR; pos = 4*d1@(1,1) + g2@(0,1); *;
      } else {
        0;
        qu=Q_TR; pos = 160 + 16*d2@(1,-1) + 4*g1@(0,-1) + g1@(1,0); *;
        qu=Q_BR; pos = 160 + 16*d1@(1,1) + 4*g2@(0,1) + g2@(1,0); *;
      };
    };

    Leer = Blob;

  >>

}


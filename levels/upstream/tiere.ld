#
#   Copyright <=2004,2014 by Immanuel Halupczok
#   Modified 2006,2011 by Immanuel Halupczok
#   Maintenance modifications 2005,2006,2008,2011,2014 by the cuyo developers
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
#   itBlau.xpm[.gz], itGelb.xpm[.gz], itGras.xpm[.gz], itGrau.xpm[.gz],
#   itGruen.xpm[.gz], itHintergrund.xpm[.gz], itLeer.xpm[.gz]
#


Tiere = {

  name="Tiling Animals"
  author="Immi"
  
  numexplode=6
  chaingrass=1
  
  neighbours=<neighbours_hex6>
  pics=tier * 3
  greypic=grau
  startpic=gras
  startdist="................A..A",
            "..........A..A......",
            "....A..A..........A.",
            ".A..........A..A....",
            "......A..A..........",
            "A..A..........A..A..",
            "........A..A........",
            "..A..A..........A..A",
            "..........A..A......",
            "....A..A..........A.",
            ".A..........A..A....",
            "......A..A..........",
            "A..A..........A..A..",
            "........A..A........",
            "..A..A..............",
            "...................."
  randomgreys[1]=100

  bgcolor=0,0,0
  topcolor=68,68,68
  toppic=itTop.xpm
  topoverlap=23
  
  <<
  
  var po;
  var dy = 0;

  semiglobal.row_up = { dy+=1; };
  semiglobal.row_down = { dy-=1; };

  
  nicht_tier = {
    po = dy@@ + loc_y + (loc_x % 2);
    po = (po % 3) * 10;
    if loc_x % 2 == 0 -> po += 2;
    pos = po + 1; *@(0,-1);
    pos = po + 6; *@(0,0);
    pos = po + 5; [qu=Q_TR_BR] *@(-1,-0.5);
    pos = po + 5; [qu=Q_BR_TR] *@(-1,0.5);
    pos = po + 7; [qu=Q_TL_BL] *@(1,-0.5);
    pos = po + 7; [qu=Q_BL_TL] *@(1,0.5);
  };

  
  tier = {
    file=kind-tier;
    if falling -> {
      if loc_x % 2 == 0 -> E* else C*;
    }
    else nicht_tier;
  };
  
  >>

  tier = {
    pics=itBlau.xpm,itGelb.xpm,itGruen.xpm
  }

  grau = {
    pics=itGrau.xpm
    <<
    grau={
     if informational ->
       if loc_p == 2 -> E* else C*
     else nicht_tier;
    };
    >>    
  }
  
  gras = {
    pics=itGras.xpm
    <<
    gras={
      if informational ->
       if loc_p == 2 -> E* else C*
      else nicht_tier;
    };
    >>    
  }

}

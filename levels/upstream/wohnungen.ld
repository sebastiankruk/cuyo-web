#
#   Copyright <=2004 by Bernhard R. Link
#   Maintenance modifications 2005,2006,2008,2011 by the cuyo developers
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
#   lwBroken.xpm[.gz], lwDach.xpm[.gz], lwGray.xpm[.gz], lwGreen.xpm[.gz],
#   lwRed.xpm[.gz], lwRolladen.xpm[.gz]
#

Wohnungen={
  description="Build a nicer neighborhood"
  name="Housing"
  author="brl"
  #numexplode=9
  numexplode=5
  chaingrass=1
  pics=lwRed.xpm,lwGreen.xpm,lwRolladen.xpm
  greypic="lwGray.xpm"
  startpic=lwBroken.xpm
  startdist="AAAAAAAAAA","AAAAAAAAAA"
  # Zum lwDach testen:
  #startdist="....AA....","AAAAA..AAA","A...A.A...","..A..A..AA",
  #          "A.A.A.A.A.","AAAAAAAAAA"
  toptime=100
  bgcolor=56,120,120
  topcolor=0,0,0
  textcolor=50,50,50
  randomgreys[1]=50
  emptypic=lwDach

  lwDach={
    connecttoborder=lt
    pics=lwDach.xpm
    <<
    lwDach={
      switch {
        11111111 -> ;
        1???0?10 -> S*;
        ????1010 -> U*;
        ????1011 -> R*;
        1???011? -> Q*;
        001?0??1 -> B*;
        01??0?10 -> D*;
        ????110? -> T*;
        -> schema16;
      };
    };
    >>
  }
}

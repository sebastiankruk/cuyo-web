#
#   Copyright 2005,2008 by Mark Weyer
#   Modified 2010,2012 by Mark Weyer
#   Maintenance modifications 2006,2008,2011 by the cuyo developers
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

Baender = {
  name = "Ribbons"
  author = "Mark Weyer"
  description = "Ribbons connect diagonally."
  neighbours = <neighbours_diagonal>
  numexplode[1] = 5
  numexplode[2] = 4
  startpic = Gras
  startdist = "*.........","**...*....","***.***..*","**********"
  greypic = Grau
  emptypic = Hinter
  pics[1] = Band * 5
  pics[2] = Band * 4

  <<
    var ausgleich;

    semiglobal.row_up = ausgleich+=1;
    semiglobal.row_down = ausgleich-=1;

    Malen = {
      qu=Q_TL;
      if kind@(-1,-1)==kind -> A else B;
      *;
      if kind@(1,-1)==kind -> {C; *@(1,0)};
      qu=Q_TR;
      if kind@(1,-1)==kind -> A else B;
      *;
      if kind@(-1,-1)==kind -> {C; @(-1,0)*};
      qu=Q_BL;
      if kind@(-1,1)==kind -> A else B;
      *;
      if kind@(1,1)==kind -> {C; @(1,0)*};
      qu=Q_BR;
      if kind@(1,1)==kind -> A else B;
      *;
      if kind@(-1,1)==kind -> {C; *@(-1,0)};
    };
  >>

  Band = {
    pics = mbaBand1.xpm, mbaBand2.xpm, mbaBand3.xpm, mbaBand4.xpm, mbaBand5.xpm
    <<
      Band = {file=kind-Band; Malen;};
    >>
  }

  Gras = {
    pics = mbaGras.xpm
    <<
      Gras = Malen;
    >>
  }

  Grau = {
    pics = mbaGrau.xpm
    <<
      Grau = Malen;
    >>
  }

  Hinter = {
    pics = mbaHinter.xpm, mbaHinter2.xpm
    <<
      Hinter = {file=(loc_x+loc_y+ausgleich@@)%2; B; *};
    >>
  }

}

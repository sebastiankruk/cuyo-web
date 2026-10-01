#
#   Copyright <=2004 by Daniela Lipps
#   Modified 2011 by Immanuel Halupczok
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
# The above notices apply to this file and to:
#   jsBgStoff.xpm[.gz], jsGelbFlach.xpm[.gz], jsGrauLoch.xpm[.gz],
#   jsGruenGras.xpm[.gz], jsHetzbalken.xpm[.gz], jsOrangeKetten_5.xpm[.gz],
#   jsOrangeKreuz_2.xpm[.gz], jsRotHexen_2.xpm[.gz]
#

Embroidery={
  name="Embroidery"
  author="Jela"
  numexplode=6
  numexplode[1]=8
  chaingrass=0
  
  pics=jsOrangeKreuz,jsGelbFlach.xpm,jsRotHexen,jsOrangeKetten
  bgcolor=225,209,176
  bgpic=jsBgStoff.xpm
  topcolor=0,0,0
  toptime=50
  toppic=jsHetzbalken.xpm
  topoverlap=28
  startpic=jsGruenGras
  startdist="..*.......",".**.....*.",".***..*.*.","**********"
  greypic=jsGrauLoch.xpm
  description="Do you like doing some Needlework?"

  jsGruenGras={
    pics=jsGruenGras.xpm

    versions=6
  }  

  <<
  var dy = 0;

  semiglobal.row_up = { dy+=1; };
  semiglobal.row_down = { dy-=1; };
  >>

  jsRotHexen={
    pics=jsRotHexen_2.xpm
    <<
    var po;
    jsRotHexen={
      if falling -> po = 0
      else -> po = 2 * ((dy@@ + loc_y) % 2);
      pos = po;
      if kind@(-1,0) == kind -> pos += 1;
      [qu=Q_TL] *; [qu=Q_BL] *;
      pos = po;
      if kind@(1,0) != kind -> pos += 1;
      [qu=Q_TR] *; [qu=Q_BR]*;
    };
    >>
  }

  jsOrangeKetten={
    pics=jsOrangeKetten_5.xpm
    <<
    jsOrangeKetten=schema5;
    >>
  }
  
  jsOrangeKreuz={
    pics=jsOrangeKreuz_2.xpm
    <<
    jsOrangeKreuz={
      if 1?????11 -> [qu=Q_BR_TL] B* else -> [qu=Q_TL] A*;
      if 111????? -> [qu=Q_BL_TR] B* else -> [qu=Q_TR] A*;
      if ??111??? -> [qu=Q_TL_BR] B* else -> [qu=Q_BR] A*;
      if ????111? -> [qu=Q_TR_BL] B* else -> [qu=Q_BL] A*;
    };
    >>
  }
}

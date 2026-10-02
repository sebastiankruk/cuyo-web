#
#   Copyright <=2004 by Immanuel Halupczok
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
#   ibBaelle2.xpm[.gz], ibBaelle.xpm[.gz], ibGrauball.xpm[.gz],
#   ibKegelGelb.xpm[.gz], ibKegelPink.xpm[.gz]
#

# referenced from labskaus.ld

Baelle={
  name="Rotating Balls"
  author="Immi"
  numexplode=4
  chaingrass=0
  pics=Baelle1,Baelle3,Baelle5,Baelle6,ibBaelle.xpm
  bgcolor=255,255,255
  topcolor=200,200,200
  toptime=50
  startpic=ibKegel
  #Die folgende Zeile ist für Geschwindigkeit-Härte-Tests...
  #startdist="++++++++++","++++++++++","++++++++++","++++++++++","++++++++++","++++++++++","++++++++++","++++++++++","++++++++++","++++++++++","++++++++++","++++++++++","ABABBAABAB","ABABBAABAB"
  startdist="ABABBAABAB","ABABBAABAB","-A%&&%B-"
  startdist[1]=
    "A........B","AB......AB","ABAB..ABAB","ABABBAABAB","ABABBAABAB","-A%&"
  greypic=ibGrauball.xpm
  description="Well, all balls look the same, don't they?"
  <<
  var drehpos;
  global={
    drehpos = (drehpos + 1) % 12;
  };
  >>
  ibKegel={
    pics=ibKegelPink.xpm,ibKegelGelb.xpm
    <<
    ibKegel={
      switch {
        0???1??? -> A;
        1???1??? -> B;
        1???0??? -> C;
        0???0??? -> D;
      };
      file=version;
      *;
    };
    >>
  }
  Baelle1={
    pics=ibBaelle.xpm,ibBaelle2.xpm
    << Baelle1={schema16;pos=drehpos@;1*}; >>
  }
  Baelle2={
    pics=ibBaelle.xpm,ibBaelle2.xpm
    << Baelle2={schema16;pos=11;pos-=drehpos@;1*}; >>
  }
  Baelle3={
    pics=ibBaelle.xpm,ibBaelle2.xpm
    << Baelle3={schema16;pos=12;pos+=drehpos@;1*}; >>
  }
  Baelle4={
    pics=ibBaelle.xpm,ibBaelle2.xpm
    << Baelle4={schema16;pos=23;pos-=drehpos@;1*}; >>
  }
  Baelle5={
    pics=ibBaelle.xpm,ibBaelle2.xpm
    << Baelle5={schema16;pos=24;pos+=drehpos@;1*}; >>
  }
  Baelle6={
    pics=ibBaelle.xpm,ibBaelle2.xpm
    << Baelle6={schema16;pos=35;pos-=drehpos@;1*}; >>
  }
}

#
#   Copyright 2002,2005,2006,2010,2012 by Mark Weyer
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

Unmoeglich={
  name="impossible"
  author="Mark Weyer"
  numexplode=7
  numexplode[easy]=5
  pics=Sorte * 3
  toppic=m6Top.xpm
  topoverlap=0
  topcolor=170,170,170
  toptime=200
  bgpic=m6Hintergrund.xpm
  startpic=m6Gras
  startdist="I.....A...","I.A...AEI.","I.AEI.AEI.","I.AEI.AEI.",
            "I.AEI.AEI.","I.AEI.AEI.","-A%&"
  greypic=m6Grau.xpm
  bgcolor=0,0,0
  neighbours=<neighbours_hex6>
  randomgreys[1]=150
  randomgreys[1,easy]=-1

  Sorte={
    pics=m6Dick.xpm,m6Duenn.xpm,m6Ganzduenn.xpm
    << Sorte = {file=kind-Sorte; schemaHex8;}; >>
  }

  m6Gras = {
    pics = m6Gras.xpm
    <<
      m6Gras =
        if informational -> {L*}
        else {
          pos = version;
          if pos<8 -> switch {
            ???0?? -> pos+=3;
            1????? -> pos+= 1 + (kind==kind@(0,-2));
            -> pos+= 1 - (kind==kind@(0,2));
          } else switch {
            ???0?? -> pos+=2;
            1????? -> pos+=1;
          };
          *;
        };
    >>
  }
}


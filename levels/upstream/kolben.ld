#
#   Copyright 2002,2005,2010 by Mark Weyer
#   Modified 2006 by Mark Weyer
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

Kolben={
  name="Flasks"
  description="It depends on the gas they are filled with..."
  author="Mark Weyer"
  numexplode=8
  numexplode[easy]=5
  chaingrass=0
  pics=kolben*3
  bgcolor=0,0,0
  topcolor=200,200,200
  toptime=100
  startpic=start
  startdist="..*..*..*.",".***.*.***","**********"
  greypic=grau
  randomgreys[1]=150
  randomgreys[1,easy]=-1
  blitzrate=100
  blitzrate[easy]=20
  fallblitzrate=20
  fallblitzrate[easy]=4

  <<
    kolben={
      switch {
        (1:blitzrate) || (falling && (1:fallblitzrate)) => 1,0,1,1,1,0,1;
                                                        -> 0;
      };
      file *= (1+kind-kolben);
      pos =
        (kind@(1,0)==kind && !(kind@(0,1)==kind && kind@(1,1)==kind)) *
          (1-2*(kind@(-1,0)==kind && !(kind@(0,1)==kind && kind@(-1,1)==kind)))
        + (kind@(-1,0)==kind && !(kind@(0,1)==kind && kind@(-1,1)==kind)) * 3
        + (kind@(0,1)==kind) * (4-8*(kind@(0,-1)==kind))
        + (kind@(0,-1)==kind)*12;
      *;
    };

    start={
      switch {
        11111?11 -> C*;
        0?111?1? -> C*;
        1?111?1? -> O*;
        111?0?01 -> B*;
        111?0?11 -> C*;
        111?1?01 -> F*;
        111?1?11 -> G*;
                 -> schema16;
      };
    };

    grau={
      pos=version; *;
    };
  >>

  kolben={
    pics=mkKolben.xpm,mkKolbenBlitzRot.xpm,
         mkKolbenBlitzGruen.xpm,mkKolbenBlitzBlau.xpm
  }

  start={
    pics=mkKolben.xpm
  }

  grau={
    pics=mkKolben.xpm
    versions=16
  }
}


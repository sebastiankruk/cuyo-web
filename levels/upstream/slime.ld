#
#   Copyright 2002,2003,2005,2006 by Mark Weyer
#   Maintenance modifications 2006,2008,2010,2011 by the cuyo developers
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
#   slime1.wav, slime2.wav
#

Slime={
  name="Slime"
  author="Mark Weyer"
  numexplode[1]=5
  numexplode[2]=15
  chaingrass=0
  pics=fastslime
  bgcolor=0,0,0
  topcolor=255,255,255
  textcolor=0,255,0
  toptime[1]=80
  toptime[2]=200
  startpic=slowslime
  startdist[1]="**********","**********"
  startdist[2]="**********"
  randomgreys[1]=20
  
  <<
    var minrate, maxrate, count, dx, dy;

    init = {maxrate=minrate*2; count=maxrate;};

    fastslime.init = {minrate=2; init;};
    slowslime.init = {minrate=20; init;};

    slime = {
      switch {
        falling -> ;
        count   -> count-=1;
                -> {
          count=minrate+rnd(maxrate-minrate+1);
          switch {
            1:4 -> if kind@(0,-1)==nothing -> {
              kind@(0,-1)=kind;
              minrate@(0,-1)=minrate;
              maxrate@(0,-1)=maxrate;
              count@(0,-1)=maxrate;
            };
            1:2 -> if kind@(-1,0)==nothing -> {
              kind@(-1,0)=kind;
              minrate@(-1,0)=minrate;
              maxrate@(-1,0)=maxrate;
              count@(-1,0)=maxrate;
            };
                -> if kind@(1,0)==nothing -> {
              kind@(1,0)=kind;
              minrate@(1,0)=minrate;
              maxrate@(1,0)=maxrate;
              count@(1,0)=maxrate;
            };
          };
        };
      };
      schema5;
    };

    fastslime = {if size<10*players-5 -> slime else schema5;};
    slowslime = {
      switch {
        1:300 => {1,1,2,2,3,
                   {if 1:2 -> sound("slime1.wav") else -> sound("slime2.wav");
                     3;},
                  4,4,5,5,6,6};
              -> 0;
      };
      slime;
    };
  >>

  fastslime = {pics = msGreen.xpm}
  slowslime = {
    pics = msRed.xpm,msRed0.xpm,msRed1.xpm,msRed2.xpm,msRed3.xpm,msRed4.xpm,msRed5.xpm
    greyprob = 1
  }
}


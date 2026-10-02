#
#   Copyright 2002,2005,2006,2011 by Mark Weyer
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

Tennis={
  name="Tennis"
  author="Mark Weyer"
  description="Don't be confused by extra balls."
  numexplode[1]=6
  numexplode[2]=5
  numexplode[1,easy]=4
  numexplode[2,easy]=4
  speed=6
  speed[easy]=4
  toptime=200
  pics=Yellow,Green,Grey,Blue
  greypic=mtWall.xpm
  startpic=Start
  startdist="**********","**********","**********"
  startdist[easy]="**********","**********"
  emptypic=Hinter
  bgcolor=0,153,255
  chaingrass=0
  topcolor=255,128,0
  textcolor=0,0,0
  neighbours=<neighbours_diagonal>

  <<
    var time_,shorttime,part,rack01,rack10,colour;

    global={
      time_=time%18;
      shorttime=time_%9;
      part=time_/9;
    };

    semiglobal.init={falling_speed=speed;};

    Racket={
      switch {
        ???1???? -> rack01=0;
        ?1?????? -> rack01=0;
        ?0?0???? -> rack01=1;
      };
      switch {
        ???????1 -> rack10=2;
        ?????1?? -> rack10=2;
        ?????0?0 -> rack10=1;
      };
      switch {
        time_@==  .. 3 -> pos=rack10;
        time_@== 4     -> if rack10==rack01 -> pos=rack01 else B;
        time_@== 5..12 -> pos=rack01;
        time_@==13     -> if rack10==rack01 -> pos=rack01 else B;
        time_@==13..   -> pos=rack10;
      };
    };

    RandomColour={colour=1+rnd(4)};

    Start.init={RandomColour;};

    Start={B*;
      if shorttime@==0 && 1:3 -> RandomColour;
      pos=shorttime@; file=colour; *;
    };

    RoofA={0;{A,B,C,D,E};*};
    RoofB={1;{A,B,C,D,E,F,G};*};
    RoofC={2;{A,B,C,D,E};*};
    RoofD={3;{A,B,C,D,E,F,G};*};

    Hinter= {
      switch {
        ??0?0?0? -> &RoofA;
        ??110?0? -> &RoofA;
        ??11011? -> &RoofA;
        ??0?011? -> &RoofA;
        ??100?0? -> &RoofB;
        ??10011? -> &RoofB;
        ??10001? -> &RoofC;
        ??0?001? -> &RoofD;
        ??11001? -> &RoofD;
      };
    };

    Blob={
      Racket;*;
      1A*;
      if part@==0
        -> {
          switch {
            ?0?1?1?? || ?0???1?0 -> {5;pos=8-shorttime@;*};
            ?1???0?1 || ?1?0?0?? -> {5;pos=shorttime@;*};
          };
          if ?????1?? -> {
            2;pos=2*shorttime@;
            *@(-1,0); pos+=1; *; pos+=17; *@(-1,1); pos+=1; *@(0,1);
          };
          if ?0???0?? -> {4;pos=shorttime@;*};
        }
        else {
          switch {
            ???1?1?0 || ?0?1???0 -> {5;pos=8-shorttime@;*};
            ?1?0???1 || ???0?0?1 -> {5;pos=shorttime@;*};
                                 -> {1A*};
          };
          if ???1???? -> {
            3;pos=2*shorttime@;
            *; pos+=1; *@(1,0); pos+=17; *@(0,1); pos+=1; *@(1,1);
          };
          if ???0???0 -> {4;pos=shorttime@;*};
        };
    };

    Yellow=Blob;
    Green=Blob;
    Grey=Blob;
    Blue=Blob;
  >>

  Yellow={pics=
    mtRacket.xpm, mtSource.xpm,
    mtYellowLeft.xpm, mtYellowRight.xpm,
    mtYellowBounce.xpm, mtYellowOut.xpm
  }

  Green={pics=
    mtRacket.xpm, mtSource.xpm,
    mtGreenLeft.xpm, mtGreenRight.xpm,
    mtGreenBounce.xpm, mtGreenOut.xpm
  }

  Grey={pics=
    mtRacket.xpm, mtSource.xpm,
    mtGreyLeft.xpm, mtGreyRight.xpm,
    mtGreyBounce.xpm, mtGreyOut.xpm
  }

  Blue={pics=
    mtRacket.xpm, mtSource.xpm,
    mtBlueLeft.xpm, mtBlueRight.xpm,
    mtBlueBounce.xpm, mtBlueOut.xpm
  }

  Start={pics=
    mtRacket.xpm,
    mtYellowBounce.xpm, mtGreyBounce.xpm,
    mtBlueBounce.xpm, mtGreenBounce.xpm
  }

  Hinter={pics=
    mtRoof1.xpm, mtRoof2.xpm, mtRoof3.xpm, mtRoof4.xpm
  }
}


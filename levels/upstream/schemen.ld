#
#   Copyright 2010-2012,2014 by Mark Weyer
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


Schemen = {

  name = "Silhouettes"
  author = "Mark Weyer"
  pics = Fuehler, Herz, Zellen, Drachen, Qualle
  greypic = Grau
  startpic = Gras
  startdist = "**********"
  numexplode[1] = 6
  numexplode[2] = 4
  bgpic = mscHinter.xpm
  bgpic[eco] = "mscNix.xpm"
  bgcolor = 48,55,50
  bgcolor[eco] = 255,255,255
  textcolor = 128,128,128
  toppic = mscHetz.xpm
  topoverlap = 0
  explosionpic=ithDreckExpl.xpm
  
  emptypic = Leer

  <<
    var ausgleich;

    semiglobal.row_up = ausgleich+=1;
    semiglobal.row_down = ausgleich-=1;

    leer = { pos = (loc_y+ausgleich@@)%20*10+loc_x; *; };

    sorte = {
      if !falling -> {
        leer;
        1;
        switch {
          0?0?0?0? -> A;
          0?1?0?0? -> B;
          0?1?0?1? -> C;
          0?0?0?1? -> D;
          0?0?1?0? -> E;
          0?1?1?0? -> F;
          0?1?1?1? -> G;
          0?0?1?1? -> H;
          1?0?1?0? -> I;
          1?1?1?0? -> J;
          1?1?1?1? -> K;
          1?0?1?1? -> L;
          1?0?0?0? -> M;
          1?1?0?0? -> N;
          1?1?0?1? -> O;
          1?0?0?1? -> P;
        };
        pos += 16 * ((time + 2*kind) % 10 + 1);
        *;
      };
      if informational -> 3 else 2;
    };
  >>

  Leer = {
    pics = mscLeer.xpm
    << Leer = leer; >>
  }

  Fuehler = {
    pics = mscLeer.xpm, mscVerbind.xpm,
      msc1A.xpm, msc1B.xpm, msc1C.xpm,
      msc1AInfo.xpm, msc1BInfo.xpm, msc1CInfo.xpm
    <<
      EinFuehler = {
        {
          if 1:10 => {A,B,C,B,A} else => A,
          if 1:10 => {D,E,F,E,D} else => D,
          if 1:10 => {G,H,I,H,G} else => G,
          if 1:10 => {D,E,F,E,D} else => D
        };
        *;
      };

      Fuehler = {
        sorte;
        if informational -> 5 else 2;
        EinFuehler;
        if informational -> 6 else 3;
        EinFuehler;
        if informational -> 7 else 4;
        EinFuehler;
      };

      Fuehler[eco]={
        if !falling -> leer;
        1;schema16;
        if informational -> 5 else 2;
        D*;
        if informational -> 6 else 3;
        D*;
        if informational -> 7 else 4;
        D*;
      };
    >>
  }

  Herz = {
    pics = mscLeer.xpm, mscVerbind.xpm, msc2.xpm, msc2Info.xpm
    <<
      Herz = {
        sorte;
        A,B,C,D,E,F,G,H,I;
        *;
      };

      Herz[eco]={
        if !falling -> leer;
        1;schema16;
        if informational -> 3 else 2;
        A*;
      };
    >>
  }

  Zellen = {
    pics = mscLeer.xpm, mscVerbind.xpm, msc3.xpm, msc3Info.xpm
    <<
      Zellen = {
        sorte;
        {if 1:2 => {A,A} else => A},
        {if 1:2 => {A,A,A} else => A},
        {if 1:2 => {A,A,A,A,A} else => A},
        B,C,D,D,
        {if 1:2 => {D,D} else => D},
        {if 1:2 => {D,D,D} else => D},
        E,F,
        {if 1:2 => {F,F} else => F},
        G,H,
        {if 1:2 => {H,H} else => H},
        {if 1:2 => {I,I} else => I},
        {if 1:2 => {J,J} else => J},
        K,L,M,N,O,
        A,A,A;
        *;
      };

      Zellen[eco]={
        if !falling -> leer;
        1;schema16;
        if informational -> 3 else 2;
        I*;
      };
    >>
  }

  Drachen = {
    pics = mscLeer.xpm, mscVerbind.xpm, msc4.xpm, msc4Info.xpm
    <<
      Drachen = {
        sorte;
        {E,F,G,H,
        if 1:2 => {I,J,K,L,M,N,O,P,A,B,C,D}
        else => {Q,R,S,T,U}};
        *;
      };

      Drachen[eco]={
        if !falling -> leer;
        1;schema16;
        if informational -> 3 else 2;
        L*;
      };
    >>
  }

  Qualle = {
    pics = mscLeer.xpm, mscVerbind.xpm, msc5.xpm, msc5Info.xpm
    <<
      var duempel;

      Qualle = {
        sorte;

        if 1:30 => { Y,Z,a,b,c,d,e,f,g,h,i,j,k,l,m }
        else -> {
          pos = duempel%24;
          duempel += 1;
        };
        *;
      };

      Qualle[eco]={
        if !falling -> leer;
        1;schema16;
        if informational -> 3 else 2;
        m*;
      };
    >>
  }

  Gras = {
    pics = mscLeer.xpm, mscGrasGrau.xpm, mscGrasGrauInfo.xpm
    <<
      flacker = {
        {if 1:2 => {{},{}} else => {}},
        {if 1:2 => {{},,{}} else => {}},
        {if 1:2 => {{},,,,{}} else => {}},
        {if 1:2 => {{},,,,,,,,{}} else => {}},
        {if 1:2 => {{},,,,,,,,,,,,,,,,{}} else => {}},
        {if 1:2
        => {{},,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,{}}
        else => {}},
        {if 1:2
        => {{},,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
            ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,{}}
        else => {}},
        *,*,{},{},*,*,{},{},
        *,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,*,
        {if 1:2 => {*,*,*,*,*,*} else => *},
        {},{},*,*,{},{},*,*,
        {},,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,{}
      };

      Gras = {
        if informational -> 2Q*
        else {leer; 1S*};
        if kind@(0,-1)!=Gras -> {Q; *@(0,-1);};
        if kind@(1,0)!=Gras -> {T; *@(1,0);};
        A; flacker;
        B; flacker;
        C; flacker;
        D; flacker;
        E; flacker;
        F; flacker;
        G; flacker;
        H; flacker;
        I; flacker;
        J; flacker;
        K; flacker;
        L; flacker;
        M; flacker;
        N; flacker;
        O; flacker;
      };

      Gras[eco] =
        if informational -> 2Q*
        else {leer; 1S*};
    >>
  }

  Grau = {
    pics = mscLeer.xpm, mscGrasGrau.xpm, mscGrasGrauInfo.xpm
    <<
      Grau =
        if informational -> 2R*
        else { leer; 1R* };
    >>
  }

}


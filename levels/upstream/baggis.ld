#
#   Copyright <=2002 by Simon Huggenberger
#   Modified 2006 by Immanuel Halupczok
#   Maintenance modifications 2003,2006,2008,2011 by the cuyo developers
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
#   sbBlitzer.xpm[.gz], sbBlitz.xpm[.gz], sbBrezelB.xpm[.gz],
#   sbBrezelSB.xpm[.gz], sbBrezelS.xpm[.gz], sbBrezel.xpm[.gz],
#   sbBroetchenB.xpm[.gz], sbBroetchenSB.xpm[.gz], sbBroetchenS.xpm[.gz],
#   sbBroetchen.xpm[.gz], sbBurgerB.xpm[.gz], sbBurgerSB.xpm[.gz],
#   sbBurgerS.xpm[.gz], sbBurger.xpm[.gz], sbKaeseB.xpm[.gz],
#   sbKaeseSB.xpm[.gz], sbKaeseS.xpm[.gz], sbKaese.xpm[.gz], sbOfen.xpm[.gz],
#   sbSunglas.xpm[.gz]
#


Baggis={
  name="Baggis"
  author="Simon"
  # Some cleanup and bugfixes (and maybe new bugs) by Immi
  numexplode=4
  numexplode[1]=6
  chaingrass=1
  pics=sbKaese,sbBrezel,sbBurger,sbBroetchen,sbSunglas
  bgcolor=0,0,127
  topcolor=200,200,200
  toptime=50
  startpic=sbOfen
  startdist="...AAAA...","...AAAA...","...AAAA...","...AAAA..."
  greypic=sbBlitzer
  textcolor=159,31,95
  randomgreys[1]=200
  description="Protect yourself from the flash!"
  emptypic=sbNix

  <<
  var blitz,blitzt;
  var sunglas;
  # values for sunglas:
  #   0: none at all
  #   1: i'm wearing one
  #   2: one is coming
  #   3: i'm wearing one and one is passing by
  #   4: i'm wearing one and one is just leaving an another one is coming

  geblitzt = {
    switch {
      blitz==0 -> switch {
        sunglas==0 || sunglas==2 -> 2;
         -> 4;};
      -> {
       blitz=0;
       1*;
       switch {
          sunglas==0 || sunglas==2 -> {3;kind=rnd(4)};
          -> 5;}};
    }
  };

  sunglasx = {
    switch{
      sunglas@(0,1)==0 -> sunglas@(0,1)=2;
      sunglas@(0,1)==1 || sunglas@(0,1)==2 -> sunglas@(0,1)=3;
      -> sunglas@(0,1)=4;};
  };

  sungl = {
    0;
    switch {
      sunglas==2 -> {B*,{sunglas=1;A*}};
      sunglas==3 -> {B*,{sunglasx;A*},{sunglas=1;C*}};
      sunglas==4 -> {{B*;C*},{sunglasx;A*},{sunglas=1;C*}};
    };
  };

  sbSunglas = {file = version; 
    A;
    switch {
      falling==0 -> {
         { 
           sunglasx;
           if sunglas==1 -> sunglas=0;
           0
         },{
           if sunglas==0 || sunglas==1 -> kind=sbNix;
           C
         }
       };
    };
  *;sungl};

  >>

  sbKaese = {
    pics = sbSunglas.xpm,sbBlitz.xpm,
           sbKaese.xpm,sbKaeseB.xpm,sbKaeseS.xpm,sbKaeseSB.xpm
    <<
    sbKaese = {geblitzt;schema16;sungl};
    >>
  }

  sbBrezel={
    pics=sbSunglas.xpm,sbBlitz.xpm,
         sbBrezel.xpm,sbBrezelB.xpm,sbBrezelS.xpm,sbBrezelSB.xpm
    <<
    sbBrezel = {geblitzt;schema16;sungl};
    >>
  }

  sbBurger={
    pics=sbSunglas.xpm,sbBlitz.xpm,
         sbBurger.xpm,sbBurgerB.xpm,sbBurgerS.xpm,sbBurgerSB.xpm
    <<
    sbBurger = {geblitzt;schema16;sungl};
    >>
  }

  sbBroetchen={
    pics=sbSunglas.xpm,sbBlitz.xpm,
         sbBroetchen.xpm,sbBroetchenB.xpm,sbBroetchenS.xpm,sbBroetchenSB.xpm
    <<
    sbBroetchen = {geblitzt;schema16;sungl};
    >>
  }

  sbBlitzer={
    pics=sbSunglas.xpm,sbBlitz.xpm,sbBlitzer.xpm,explosion.xpm
    <<
    sbBlitzer = {
      switch { blitzt==1 || blitzt==2 -> {1B*};};
      switch {
        1:20 && 0??????? => 1,1,1;
        -> 0;};
      blitzt = file;
      geblitzt;kind=sbBlitzer;
      switch {
        0???0??? -> A;
        0???1??? -> D;
        1???1??? -> B;
        1???0??? -> E;
      };
      2*;
      switch { sunglas==1 || sunglas==3 || sunglas==4 -> {
        F*; 
        switch {blitzt==1 =>
	 {3;blitzt=2;A,B,C,D,E,F,G,{H;kind@(0,0)=nothing};*};}};
      };
      sungl;
      switch {
        blitzt==1 -> {
          2C*;
### Gibt es einen Grund, warum du zu blitz eins addierst und es nicht einfach auf
### 1 setzt?
### Außerdem: Wenn du wirklich eins addieren willst, tut das, so wie du's machst,
### nicht richtig, wenn ein Bröt gleichzeitig von zwei Seiten beblitzt wird.
### Funktionieren würde "blitz@(1,0)+=1". Siehe "man cual" für Erklärungen.
	  blitz@(1,0)=blitz@(1,0)+1;blitz@(-1,0)=blitz@(-1,0)+1;
	  switch {
	    kind@(0,1)==sbBlitzer ->
	      {blitz@(2,0)=blitz@(2,0)+1;blitz@(-2,0)=blitz@(-2,0)+1};};
	};
      };
    };
    >>
  }
### Noch ein Vorschlag: Vielleicht ist dir schon aufgefallen, dass wenn ein
### Blitzdings runterfällt, der Blitz nicht ganz nachkommt, links und rechts.
### Mein Vorschlag, um dem Abzuhelfen ist: Es gibt keine Variable blitz mehr;
### statt dessen schaut die geblitzt-Routine, ob ein Nachbarblob ein Blitzdings
### ist und ob das grad am blitzen ist. (Der Einfachheit halber könnte das
### Blitzdings selbst ausrechnen, wie weit es blitzen möchte, damit die
### geblitzt-Routine einfacher wird.

  sbSunglas = {pics = sbSunglas.xpm,sbSunglas.xpm,sbSunglas.xpm,
    sbSunglas.xpm,sbSunglas.xpm}

  sbOfen={
    pics = sbSunglas.xpm,sbOfen.xpm
    <<
    sbOfen = {
      switch {sunglas==0 -> sunglas=1;};
      switch {
        11111111 -> F; # 1
        10111111 -> D; # 1
        11111110 -> H; # 1
        11101111 -> L; # 1
        11111011 -> P; # 1
	10111011 -> Q; # 1
	11101110 -> R; # 1
        111???11 -> J; # 5
        ??11111? -> B; # 5
        1???1111 -> G; # 5
        11111??? -> E; # 5
        ??111??? -> A; #17
        ????111? -> C; #17
        111????? -> I; #17
        1?????11 -> K; #17
	0?0?1?0? -> O;
	100?1?00 -> O;
	0??????? -> M; 
	-> N;
      };
      1;*;sungl};
    >>
  }

  sbNix={
    pics = sbSunglas.xpm,sbBlitz.xpm
    <<
    sbNix = {geblitzt;kind=sbNix};
    >>
  }

}

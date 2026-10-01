#
#   Copyright 2005,2006,2012 by Mark Weyer
#   Modified 2011 by Mark Weyer
#   Maintenance modifications 2005,2006,2008,2011 by the cuyo developers
#   Partly based on the following levels:
#   viecher.ld which, at that time, was
#     Copyright <=2004 by Immanuel Halupczok
#   memory.ld which, at that time, was
#     Copyright 2006 by Bernhard Seckinger
#     Maintenance modifications 2002,2003 by the cuyo developers
#     Partly based on the following levels:
#     hexkugeln.ld which, at that time, was
#       Copyright <=2004 by Immanuel Halupczok
#     kunst.ld which, at that time, was
#       Copyright <=2004 by Immanuel Halupczok
#     pinguine.ld which, at that time, was
#       Created <=2002 by Bernhard Seckinger
#     hormone.ld which, at that time, was
#       Copyright <=2004 by Immanuel Halupczok
#     viecher.ld which, at that time, was
#       Copyright <=2004 by Immanuel Halupczok
#     nasenkugeln.ld which, at that time, was
#       Copyright <=2004 by Immanuel Halupczok
#     pfeile.ld which, at that time, was
#       Copyright <=2004 by Immanuel Halupczok
#   jahreszeiten.ld which, at that time, was
#     Copyright <=2002 by Daniela Lipps
#     Modified 2011 by Immanuel Halupczok
#     Maintenance modifications 2002,2006,2008,2011 by the cuyo developers
#   baelle.ld which, at that time, was
#     Copyright <=2004 by Immanuel Halupczok
#   puzzle.ld which, at that time, was
#     Copyright 2006 by Mark Weyer
#     Maintenance modifications 2006 by the cuyo developers
#   angst.ld which, at that time, was
#   nasenkugeln.ld which, at that time, was
#     Copyright <=2004 by Immanuel Halupczok
#     Modified 2005,2006 by Immanuel Halupczok
#     Maintenance modifications 2005,2006 by the cuyo developers
#   theater.ld which, at that time, was
#     Copyright 2008 by Immanuel Halupczok
#     Copyright 2011 by Mark Weyer
#     Maintenance modifications 2008,2011,2012 by the cuyo developers
#   himmel.ld which, at that time, was
#     Copyright <=2002 by Daniela Lipps
#     Maintenance modifications 2006 by the cuyo developers
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

# referenced from memory.ld

Labskaus2 = {
  name = "Potpourri"
  author = "Mark Weyer (editor)"
  description = "Made of 100% recycled graphics"
  pics = ivElephant, bmG, jjJahr, Baelle, mpAlle, man4
  startpic = inGras
  startdist = "**********"
  chaingrass = 1
  greypic = ithDreck
  nogreyprob = 1
  emptypic = Leer

  extrapics = 1

  <<
    var dy,vog_r,vog_l,neuer_vogel;

    vordergrund = {
      file=0;
      if vog_r -> {
        A*,B*,C*,D*,
        {[qu=Q_TL_TR] A*},
        {[qu=Q_TL_TR] B*; [qu=Q_TR_TL] B*@(1,0)},
        {[qu=Q_TL_TR] C*; [qu=Q_TR_TL] C*@(1,0)},
        {[qu=Q_TL_TR] D*; [qu=Q_TR_TL] D*@(1,0);
          vog_r@(1,0) = 1;
          vog_r=0;
          if players == 2 && loc_x == 9 && loc_p == 1 ->
            neuer_vogel@@(0, loc_y; >) = 1
        }
      };
      if vog_l -> {
        H*,G*,F*,E*,
        {[qu=Q_BR_BL] H*},
        {[qu=Q_BR_BL] G*; [qu=Q_BL_BR] G*@(-1,0)},
        {[qu=Q_BR_BL] F*; [qu=Q_BL_BR] F*@(-1,0)},
        {[qu=Q_BR_BL] E*; [qu=Q_BL_BR] E*@(-1,0);
          vog_l@(-1,0) = 1;
          vog_l=0;
          if players == 2 && loc_x == 0 && loc_p == 2 ->
            neuer_vogel@@(9, loc_y; <) = 1
        }
      };
      if vog_l || vog_r -> neuer_vogel = 0;
      if neuer_vogel && loc_x == 0 => {
        {[qu=Q_TR_TL] B*},
        {[qu=Q_TR_TL] C*},
        {[qu=Q_TR_TL] D*; vog_r=1; neuer_vogel = 0}
      };
      if neuer_vogel && loc_x == 9 => {
        {[qu=Q_BL_BR] G*},
        {[qu=Q_BL_BR] F*},
        {[qu=Q_BL_BR] E*; vog_l=1; neuer_vogel = 0}
      };
    };
  >>

  semiglobal = {
    pics=jhBallons.xpm

    <<
      var ballon, ballon_x, ballon_y;

      semiglobal = {
        if ballon -> {
          @@(ballon_x,ballon_y)*;
          ballon_y-=1;
          ballon = ballon_y>=0;
        }
        else ->
          if 1:30 -> {ballon=1; ballon_x=rnd(10); ballon_y=20};
      };

      semiglobal.row_up = dy+=1;
      semiglobal.row_down = dy-=1;
    >>
  }

  ivElephant = {
    numexplode[1] = 9
    numexplode[2] = 6
    colourprob = 2
    pics=jjExtra.xpm,
         ivElefant.xpm

    <<
      ivElephant={
        file=extrapics;
        switch {
          0?0?0?0? -> {{A,Y,a};*;};
          0?1?0?0? -> {{B,U,W};*;};
          1?1?1?0? -> {{J,R,T};*;};
          1?0?0?0? -> {{M,Q,S};*;};
          1?1?0?1? -> {{O,V,X};*;};
          -> schema16;
        };
        vordergrund;
      };
    >>
  }

  bmG = {
    numexplode = 2
    colourprob = 2
    pics=jjExtra.xpm,
         bmKarten.xpm,bmStrich.xpm

    <<
      var zuklappen=1;

      bmG={
        file=extrapics;
        switch {
          falling -> G*;
          zuklappen => {
            # Grade aufgekommen oder so was.
            # Aber erst noch ein Bildchen lang normal, weil sonst die
            # Start-Karten schon beim ersten Bild leicht umklappen.
            {zuklappen=0;G*}, V*, {file+=1;A*}, P*
          };
          1:70 => {
            # Kurz aufklappen
            P*, {file+=1;A*}, V*,
            G*,G*,G*,G*,G*,G*,G*,G*,G*,G*,G*,G*,G*,G*,
            V*, {file+=1;A*}, P*
          };
          -> A*; # zugeklappt
        };
        vordergrund;
      };
    >>
  }

  jjJahr = {
    numexplode[1] = 7
    numexplode[2] = 4
    colourprob = 2
    pics=jjExtra.xpm,
         jjWinter1.xpm,jjWinter2.xpm,jjWinter3.xpm,jjWinter4.xpm,
         jjFruehling1.xpm,jjFruehling2.xpm,jjFruehling3.xpm,jjFruehling4.xpm,
         jjSommer1.xpm,jjSommer2.xpm,jjSommer3.xpm,jjSommer4.xpm,
         jjHerbst1.xpm,jjHerbst2.xpm,jjHerbst3.xpm,jjHerbst4.xpm

    <<
      var dt;
      jjJahr.init={dt=rnd(16)+rnd(16)};
      jjJahr={
        file=((time+dt)%512)/32 + extrapics;
        schema16;

        if 1?1?1?1? && (time+dt) % 512 == 13*32 -> {vog_r=1; vog_l=1};

        vordergrund;
      };
    >>
  }

  Baelle = {
    numexplode = 4
    colourprob = 2
    pics=jjExtra.xpm,
         ibBaelle.xpm,ibBaelle2.xpm

    <<
      Baelle={
        file=extrapics; schema16; pos=time%12; file+=1; *;
        vordergrund;
      };
    >>    
  }

  mpAlle = {
    pics = jjExtra.xpm,
           mpAlle.xpm
    numexplode = 9
    colourprob = 2

    <<
      mpAlle = {file=extrapics; schema5; vordergrund;};
    >>
  }

  man4 = {
    numexplode = 4
    colourprob = 2
    pics = jjExtra.xpm,
           manKoepfe4.xpm, manGesichter4.xpm

    <<
      var alt_y,faellt,gemalt;
      var bedroht,abstand;

      fallbilder = {
        faellt = alt_y<loc_y && !falling;
        gemalt = 1;
        switch {
          faellt -> O;
          faellt@(0,0) => {P,P,P};
          -> gemalt=0;
        };
        alt_y = loc_y;
      };

      gesicht[easy] = {
        switch {
          gemalt -> ;
          exploding -> J;
          -> if 1:20 => {A,A,A,A,A,A,A,A,A,I,I,I,I}
            else -> I;
        };
      };

      gesicht = {
        abstand = 2*loc_y-loc_y@@(0)-loc_y@@(1);
        bedroht = (kind==kind@@(0) || kind==kind@@(1)) && abstand>=-6;
        switch {
          gemalt -> ;
          falling -> U;
          exploding -> H;
          bedroht && abstand>13 -> E;
          bedroht && abstand>8 -> K;
          bedroht -> if abstand<-5 || abstand>5 -> K else {M,N};
          -> V;
        };
      };

      gesicht[hard] = {
        switch {
          gemalt -> ;
          exploding -> G;
          -> if 1:20 => {B,B,B,B,B,B,B,B,B,F,F,F,F}
            else -> F;
        };
      };

      man4 = {
        file=extrapics;
        schema4;
        file+=1;
        fallbilder;
        gesicht;
        *;
        vordergrund;
      };
    >>
  }

  inGras = {
    pics=jjExtra.xpm,
         "inGras.xpm"
    colourprob[hard] = 1
    versions = 4

    <<
      var li, re;
    
      inGras={
        file=extrapics;
        li = ??????1? || loc_x == 0;
        re = ??1????? || loc_x == 9;
        switch {
          li && re -> {pos=version + 1; *; pos=version+7; @(0,1)*};
          re -> {A*; G@(0,1)*;};
          li -> {F*; L@(0,1)*;};
          -> {
            [qu=Q_TL] A*;
            [qu=Q_BL] A*;
            [qu=Q_TL] G@(0,1)*;
            [qu=Q_TR] F*;
            [qu=Q_BR] F*;
            [qu=Q_TR] L@(0,1)*;
          };
        };
        vordergrund;
      };
    >>
  }

  ithDreck = {
    pics=jjExtra.xpm,
         ithDreck1.xpm,ithDreck2.xpm,ithDreck3.xpm
    greyprob = 1
    <<
    ithDreck.init={version = rnd(3) + extrapics;};
    
    ithDreck={
      file = version;
      if (loc_y + dy@@) % 2 -> E* else -> F*;
      vordergrund;
    };
    >>
  }

  Leer = {
    pics = jjExtra.xpm
    << Leer = vordergrund; >>
  }
}


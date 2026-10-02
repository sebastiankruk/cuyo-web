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
#   isBauerSchwarz.xpm[.gz], isBauerWeiss.xpm[.gz], isBrettrand.xpm[.gz],
#   isBrett.xpm[.gz], isDameSchwarz.xpm[.gz], isDameWeiss.xpm[.gz],
#   isLaeuferSchwarz.xpm[.gz], isLaeuferWeiss.xpm[.gz], isSchwarz.xpm[.gz],
#   isSpringerSchwarz.xpm[.gz], isSpringerWeiss.xpm[.gz],
#   isTurmSchwarz.xpm[.gz], isTurmWeiss.xpm[.gz], isVerbindung.xpm[.gz],
#   isWeiss.xpm[.gz]
#

# referenced from springer.ld


Schach={
  name="Chess"
  author="Immi"
  numexplode=4
  numexplode[1]=5
  chaingrass=1
  pics=isLaeufer,isSpringer,isDame,isTurm
  bgcolor=216,201,151
  startpic=isGras
  startdist=".DDDDDDDD.",".CABFEBAC.","-E%&"
  #startdist=".DDDDDDDD.",".CABFE..C."
  #startdist=".DDDDDDDD.",".C...EBAC."
  #startdist=".DDDDDDDD.",".C...E..C."
  greypic=isBauer
  bgpic=isBrett.xpm
  topcolor=137,92,37
  toppic=isBrettrand.xpm
  topoverlap=2
  toptime=50
  #hiddenfeature=1
  emptypic=isNix
  <<
  knightlines={
    switch {
      kind@(1,0)==isSpringer && kind@(-1,-1)==isSpringer -> {
        [qu=Q_BL_TL] {A*};
        [qu=Q_BR_TR] {A*};
      };
    };
    switch {
      kind@(1,1)==isSpringer && kind@(-1,0)==isSpringer -> {
        [qu=Q_TL_BL] {A*};
        [qu=Q_TR_BR] {A*};
      };
    };
    switch {
      kind@(1,-1)==isSpringer && kind@(-1,0)==isSpringer -> {
        [qu=Q_BL_TL] {D*};
        [qu=Q_BR_TR] {D*};
      };
    };
    switch {
      kind@(1,0)==isSpringer && kind@(-1,1)==isSpringer -> {
        [qu=Q_TL_BL] {D*};
        [qu=Q_TR_BR] {D*};
      };
    };
    switch {
      kind@(0,1)==isSpringer && kind@(-1,-1)==isSpringer -> {
        [qu=Q_TR_TL] {B*};
        [qu=Q_BR_BL] {B*};
      };
    };
    switch {
      kind@(1,1)==isSpringer && kind@(0,-1)==isSpringer -> {
        [qu=Q_TL_TR] {B*};
        [qu=Q_BL_BR] {B*};
      };
    };
    switch {
      kind@(-1,1)==isSpringer && kind@(0,-1)==isSpringer -> {
        [qu=Q_TR_TL] {C*};
        [qu=Q_BR_BL] {C*};
      };
    };
    switch {
      kind@(0,1)==isSpringer && kind@(1,-1)==isSpringer -> {
        [qu=Q_TL_TR] {C*};
        [qu=Q_BL_BR] {C*};
      };
    };
  };
  knightlines_falsch={
    switch {
      ??1????1 -> {
        [qu=Q_BL_TL] {A*};
        [qu=Q_BR_TR] {A*};
      };
    };
    switch {
      ???1??1? -> {
        [qu=Q_TL_BL] {A*};
        [qu=Q_TR_BR] {A*};
      };
    };
    switch {
      ?1????1? -> {
        [qu=Q_BL_TL] {D*};
        [qu=Q_BR_TR] {D*};
      };
    };
    switch {
      ??1??1?? -> {
        [qu=Q_TL_BL] {D*};
        [qu=Q_TR_BR] {D*};
      };
    };
    switch {
      ????1??1 -> {
        [qu=Q_TR_TL] {B*};
        [qu=Q_BR_BL] {B*};
      };
    };
    switch {
      1??1???? -> {
        [qu=Q_TL_TR] {B*};
        [qu=Q_BL_BR] {B*};
      };
    };
    switch {
      1????1?? -> {
        [qu=Q_TR_TL] {C*};
        [qu=Q_BR_BL] {C*};
      };
    };
    switch {
      ?1??1??? -> {
        [qu=Q_TL_TR] {C*};
        [qu=Q_BL_BR] {C*};
      };
    };
  };
  
  >>

  isGras={
    pics=isVerbindung.xpm,isWeiss.xpm,isSchwarz.xpm
    <<
    
    var roch_gr, roch_kl;
    
    lili={[qu=Q_TL_TL] *; [qu=Q_BL_BL] *};
    lire={[qu=Q_TL_TR] *; [qu=Q_BL_BR] *};
    reli={[qu=Q_TR_TL] *; [qu=Q_BR_BL] *};
    rere={[qu=Q_TR_TR] *; [qu=Q_BR_BR] *};
    turm1={G;lire};
    turm2={C;lire};
    turm3={G*};
    turm4={C*};
    turm5={G;reli;H;lire};
    turm6={C;reli};
    turm7={H;lili};
    koenig1={H;rere};
    koenig2={E;lire};
    koenig3={H;reli;I;lire};
    koenig4={E*};
    koenig5={I*};
    koenig6={E;reli};
    koenig7={I;reli};
    
    isGras={
      switch {
        version == 4 && loc_x == 5 -> {
	  # Ich bin König und stehe auf Startposition.
	  # Gute Vorbedingung für Rochade.
          roch_gr =
	    kind@(-1,0) == nothing &&
	    kind@(-2,0) == nothing &&
	    kind@(-3,0) == nothing &&
	    kind@(-4,0) == isGras && version@(-4,0) == 2;
	  roch_kl =
	    kind@(1,0) == nothing &&
	    kind@(2,0) == nothing &&
	    kind@(3,0) == isGras && version@(3,0) == 2;
	
	  switch {
	    roch_gr -> {
	      # Große Rochade iniziieren (auf Nachbarfeldern)
	      kind@(-1,0) = isGras;
	      kind@(-2,0) = isGras;
	      kind@(-3,0) = isGras;
	      version@(-1,0) = 21;
	      version@(-2,0) = 22;
	      version@(-3,0) = 23;
	      version@(-4,0) = 24;
	    };
	  };
	  switch {
	    roch_kl -> {
	      # Kleine Rochade iniziieren (auf Nachbarfeldern)
	      kind@(1,0) = isGras;
	      kind@(2,0) = isGras;
	      version@(1,0) = 11;
	      version@(2,0) = 12;
	      version@(3,0) = 13;
	    };
	  };
	
	  # Richtige Rochade(n) auf Mittelfeld iniziieren und
	  # Punkte und Message.
	  switch {
	    roch_gr && roch_kl -> {
	      version@(0,0) = 30;
	      bonus(300);
              # TRANSLATORS: "King" and "Castling" are chess terms.
	      message("King confused.\nCastling both sides\n300 Bonus Points");
	    };
	    roch_gr -> {
	      version@(0,0) = 20;
  	      bonus(150);
              # TRANSLATORS: "Queen" and "Castling" are chess terms.
	      message("Castling queen's side\n150 Bonus Points");
	    };
	    roch_kl -> {
	      version@(0,0) = 10;
  	      bonus(100);
              # TRANSLATORS: "King" and "Castling" are chess terms.
	      message("Castling king's side\n100 Bonus Points");
	    };
	  };
	};  # gute Vorbedingungen für Rochade
      }; # switch


      ### Malen ###
      
      file=loc_p;
      switch {
        # Beide Rochaden (Mittelfeld):
	version == 30 => {
	      {koenig3;koenig4}, {koenig2;koenig4}, {koenig1;koenig5},
              koenig6,
	      koenig7, {}, {},
	      {},
	      {}, {}, {kind=nothing}
	    };
      
        # Große Rochade:
        version == 20 => {
	      koenig4, koenig4, koenig5,
              koenig6,
	      koenig7, {}, {},
	      {},
	      {}, {}, {kind=nothing}
	    };
        version == 21 => {
	      {}, {}, koenig1,
	      koenig2,
	      koenig3, koenig4, koenig5,
	      koenig6,
	      {koenig7;turm7}, turm6, {turm5; version=2}
	    };
        version == 22 => {
	      {}, {}, {},
	      {},
	      turm7, turm6, {koenig1;turm5},
	      {koenig2;turm4},
	      {koenig3;turm3}, {koenig4;turm2}, {koenig4;turm1; version=4}
	    };
        version == 23 => {
	      turm7, turm6, turm5,
	      turm4,
	      {turm3}, {turm2}, {turm1},
	      {},
	      {}, {}, {; kind=nothing}
	    };
        version == 24 => {
              turm3, turm2, turm1,
	      {},
	      {}, {}, {kind=nothing}
	    };

        # Kleine Rochade:
        version == 10 => {
	      koenig3, koenig2, koenig1,
              {},
	      {}, {}, {kind=nothing}
	    };
        version == 11 => {
	      koenig7, koenig6, koenig5,
	      koenig4,
	      {koenig3;turm1}, {koenig2;turm2}, {koenig1;turm3; version=2}
	    };
        version == 12 => {
	      turm1, turm2, turm3,
	      turm4,
	      {koenig7;turm5}, {koenig6;turm6}, {koenig5;turm7; version=4}
	    };
        version == 13 => {
              turm5, turm6, turm7,
	      {},
	      {}, {}, {kind=nothing}
	    };

        # Keine rochade
        -> {
          pos=version;*
	};
      };
    
      
      0;knightlines
    };
    >>
  }
  isNix={
    pics=isVerbindung.xpm
    << isNix={0;knightlines}; >>
  }
  isBauer={
    pics=isVerbindung.xpm,isBauerSchwarz.xpm, isBauerWeiss.xpm
    << isBauer={file=loc_p;*;0;knightlines}; >>
  }
  isTurm={
    pics=isVerbindung.xpm,isTurmSchwarz.xpm,isTurmWeiss.xpm
    neighbours=<neighbours_rect>
    << isTurm={file=loc_p;schema4;0;knightlines}; >>
  }
  isSpringer={
    pics=isVerbindung.xpm,isSpringerSchwarz.xpm,isSpringerWeiss.xpm
    #knightlines=isVerbindung.xpm
    neighbours=<neighbours_knight>
    << isSpringer={file=loc_p;*;0;knightlines}; >>
  }
  isLaeufer={
    pics=isVerbindung.xpm,isLaeuferSchwarz.xpm,isLaeuferWeiss.xpm
    neighbours=<neighbours_diagonal>
    << isLaeufer={file=loc_p;schemaDiag2;0;knightlines}; >>
  }
  isDame={
    pics=isVerbindung.xpm,isDameSchwarz.xpm,isDameWeiss.xpm
    neighbours=<neighbours_eight>
    << isDame={file=loc_p;schemaDiag16;0;knightlines}; >>
  }
}


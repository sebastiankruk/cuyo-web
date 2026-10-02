#
#   Copyright 2006 by Bernhard Seckinger
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
#   bpEis.xpm[.gz], bpFreezeIglu.xpm[.gz], bpFreezePingu.xpm[.gz],
#   bpFreezeSchnee.xpm[.gz], bpIglu.xpm[.gz], bpPinguA.xpm[.gz],
#   bpPinguB.xpm[.gz], bpPinguC.xpm[.gz], bpPinguD.xpm[.gz], bpPinguE.xpm[.gz],
#   bpPinguFall.xpm[.gz], bpPinguF.xpm[.gz], bpPinguG.xpm[.gz],
#   bpPinguH.xpm[.gz], bpPinguI.xpm[.gz], bpPinguJong.xpm[.gz],
#   bpPinguJ.xpm[.gz], bpPinguK.xpm[.gz], bpPinguL.xpm[.gz], bpPinguM.xpm[.gz],
#   bpPinguN.xpm[.gz], bpPinguO.xpm[.gz], bpPinguP.xpm[.gz], bpPingu.xpm[.gz],
#   bpSchnee.xpm[.gz], bpStein.xpm[.gz]
#

# Status: (M=Muss, S=Soll, K=Kann, F=Feature, B=Bugs)
#
# Fertig.
#
# FK Keulenjonglage
# FK Presslufthammer
# FK Pingu-Iglu-Aktivität

# Überblick über die Bilder
#
# bpIglu       : Iglu
# bpSchnee     : Schnee
# bpStein      : (graue) bisher: Stein
# bpEis        : (start) Eislandschaft
# bpPingu      : Pinguine in Standardakro
# bpPinguA-P   : Standardzappeln in den 16 verschiedenen Positionen
# bpPinguJong  : Jonglierender Pinguin
# bpPinguFall  : Pinguin mit Fallschirm
# bpPinguFall2 : Pinguin mit normalem Schirm


Antarctic =
{
  name     = "Antarctic"
  description     = "Beware of freezing!"
  author = "Berni"

  pics = Pingu,Iglu,Schnee,Freezing

  greypic      = bpStein.xpm
  startpic     = Eis
  startdist[1] = "B........C","ABCDBDBACD","-A%&"
  startdist    = "ABCDBDBACD","-A%&"

  numexplode = 4
  chaingrass = 1

  textcolor  = 0,0,0
  bgcolor    = 150,200,255
  topcolor   = 255,255,255
  topoverlap = 0
  toptime    = 50

  <<
    var sum = 0;
    var freezecount = 0;
    var freezekind = 0;
    
    checkfreeze = {
    
      sum = 0;
      if kind@(-1,0) == Eis -> sum+=1;
      if kind@(1,0) == Eis -> sum+=1;
      if kind@(0,1) == Eis -> sum+=1;
      if kind@(0,-1) == Eis -> sum+=2; # Das ist Absicht!

      if sum>=2 -> {
        freezekind@(0,0) = kind@(0,0);
        freezecount@(0,0) = 0;
        kind@(0,0) = Freezing;
      };

    };
  >>

  Eis =
  {
    pics = bpEis.xpm
    
    <<
      Eis = {
        switch {
          kind@(0,-1) == Eis || kind@(0,-1) == Freezing 
            -> {pos=version+4;*;};
            -> {pos=version;*;};
        };
      };
    >>
  }

  Freezing =
  {
    neighbours=<neighbours_none>
    pics = bpFreezePingu.xpm, bpFreezeIglu.xpm, bpFreezeSchnee.xpm
    
    <<
      Freezing.init = {
        kind = rnd(3);
      };
      
      Freezing = {
        freezecount+=1;
        file = freezekind;
        pos = freezecount/5;
        *;
        if freezecount == 24 -> {kind@(0,0) = Eis; version@(0,0) = rnd(4);};
      };
    >>
  }

  Iglu =
  {
    pics = bpIglu.xpm
    
    <<
      Iglu = {
        checkfreeze;
        schema16;
      };
    >>
  }

  Schnee =
  {
    pics = bpSchnee.xpm
    
    <<
      var landing = 0;
    
      Schnee.land = {
        landing = 1;
      };
    
      Schnee = {
        if !falling -> {checkfreeze;};
        pos = rnd(4);*;
      };
    >>
  }

  Pingu = 
  {
    pics = bpPingu.xpm,
           bpPinguA.xpm,bpPinguB.xpm,bpPinguC.xpm,bpPinguD.xpm,
           bpPinguE.xpm,bpPinguF.xpm,bpPinguG.xpm,bpPinguH.xpm,
           bpPinguI.xpm,bpPinguJ.xpm,bpPinguK.xpm,bpPinguL.xpm,
           bpPinguM.xpm,bpPinguN.xpm,bpPinguO.xpm,bpPinguP.xpm,
	   bpPinguJong.xpm,bpPinguFall.xpm
    numexplode = 8

    <<

      var solo=0;       # Pinguin macht Aktion, wärend der er sich nicht verbindet
      var sum=0;        # Welche Nachbarn hat der Pinguin? Siehe Akro-Pingu-Sektion
      
      var fallschirm=0; # Pinguin hat seinen Schirm gezückt.
      var fast=0;       # Wird bei schnellem Fall auf 10 gesetzt und am Boden runtergezählt

      pinguA = {
	switch {
	  1:10 => { 1;{A;solo=1},B,C,D,E,F,G,H,I,J,K,{0A;solo=0};*; };
	  1:10 => { 1;L,M,M,M,L,0A;*; };
	  1:10 => { 1;N,O,O,O,N,0A;*; };
	  1:10 => { 1;P,0A;*; };
	  1:10 => { 1;Q,R,R,R,Q,0A;*; };
	  1:10 => { 1;S,T,T,T,S,0A;*; };
	  1:10 => { 17;{A;solo=1},B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,I,H,G,F,E,D,C,B,A,{0A;solo=0};*; };
	  -> 0A*;
	}
      };

      # ---------------------------------

      pinguB = {
	switch {
	  1:10 => { 2;A,B,C,D,D,D,D,C,B,A,0B;*; };
	  1:10 => { 2;E,F,G,F,E,0B;*; };
	  1:10 => { 2;H,0B;*; };
	  -> 0B*;
	}
      };

      pinguC = {
	switch {
	  1:10 => { 3;A,B,C,C,B,A,0C;*; };
	  1:10 => { 3;D,0C;*; };
	  1:10 => { 3;E,E,0C;*; };
	  1:10 => { 3;F,F,F,0C;*; };
	  1:10 => { 3;G,G,H,H,H,G,G,0C;*; };
	  -> 0C*;
	}
      };

      pinguD = {
	switch {
	  1:10 => { 4;A,0D;*; };
	  1:10 => { 4;B,C,D,E,D,C,B,0D;*; };
	  -> 0D*;
	}
      };

      # ---------------------------------

      pinguE= {
	switch {
	  1:10 => { 5;A,B,B,B,B,B,A,0E;*; };
	  1:10 => { 5;C,0E;*; };
	  1:10 => { 5;D,E,F,G,F,E,D,0E;*; };
	  1:10 => { 5;H,H,0E;*; };
	  -> 0E*;
	}
      };

      pinguI= {
	switch {
	  1:10 => { 9;A,B,C,C,B,A,0I;*; };
	  1:10 => { 9;D,0I;*; };
	  1:10 => { 9;E,F,G,G,F,E,0I;*; };
	  1:10 => { 9;H,L,L,L,H,0I;*; };
	  1:10 => { 9;I,J,K,K,J,I,0I;*; };
	  -> 0I*;
	}
      };

      pinguM= {
	switch {
	  1:10 => { 13;A,0M;*; };
	  1:10 => { 13;K,0M;*; };
	  1:10 => { 13;L,0M;*; };
	  1:10 => { 13;B,C,D,D,C,B,0M;*; };
	  1:10 => { 13;E,F,G,G,F,E,0M;*; };
	  1:10 => { 13;H,I,J,J,I,H,0M;*; };
	  -> 0M*;
	}
      };

      # ---------------------------------

      pinguF= {
	switch {
	  1:10 => { 6;H,0F;*; };
	  1:10 => { 6;A,B,A,0F;*; };
	  1:10 => { 6;C,D,G,G,D,C,0F;*; };
	  1:10 => { 6;E,F,F,E,0F;*; };
	  -> 0F*;
	}
      };

      pinguG= {
	switch {
	  1:10 => { 7;G,0G;*; };
	  1:10 => { 7;A,B,A,0G;*; };
	  1:10 => { 7;C,D,D,C,0G;*; };
	  1:10 => { 7;E,E,F,F,E,E,0G;*; };
	  -> 0G*;
	}
      };

      pinguH= {
	switch {
	  1:10 => { 8;D,0H;*; };
	  1:10 => { 8;C,I,C,0H,A,B,A,0H,C,I,C,0H,A,B,A,0H;*; };
	  1:10 => { 8;E,F,E,0H;*; };
	  1:10 => { 8;G,G,H,H,G,G,0H;*; };
	  -> 0H*;
	}
      };


      pinguJ= {
	switch {
	  1:10 => { 10;A,0J;*; };
	  1:10 => { 10;B,C,D,C,B,0J;*; };
	  1:10 => { 10;E,F,F,E,0J;*; };
	  -> 0J*;
	}
      };

      pinguK= {
	switch {
	  1:10 => { 11;A,0K;*; };
	  1:10 => { 11;B,B,C,C,B,B,0K;*; };
	  1:10 => { 11;D,0K;*; };
	  1:10 => { 11;E,0K;*; };
	  -> 0K*;
	}
      };

      pinguL= {
	switch {
	  1:10 => { 12;A,0L;*; };
	  1:10 => { 12;B,C,D,C,B,0L;*; };
	  1:10 => { 12;E,F,G,H,I,J,K,L,K,J,I,H,G,F,E,0L;*; };
	  -> 0L*;
	}
      };


      pinguN= {
	switch {
	  1:10 => { 14;I,0N;*; };
	  1:10 => { 14;C,D,C,0N,A,B,A,0N,C,D,C,0N,A,B,A,0N;*; };
	  1:10 => { 14;E,F,E,0N;*; };
	  1:10 => { 14;G,G,H,H,G,G,0N;*; };
	  -> 0N*;
	}
      };

      pinguO= {
	switch {
	  1:10 => { 15;E,0O;*; };
	  1:10 => { 15;A,B,A,0O;*; };
	  1:10 => { 15;C,C,D,D,C,C,0O;*; };
	  -> 0O*;
	}
      };

      pinguP= {
	switch {
	  1:10 => { 16;L,0P;*; };
	  1:10 => { 16;A,B,C,B,A,0P;*; };
	  1:10 => { 16;E,F,G,F,E,0P;*; };
	  1:10 => { 16;I,J,K,J,I,0P;*; };
	  1:10 => { 16;D,D,H,H,D,D,0P;*; };
	  -> 0P*;
	}
      };

      Pingu = {

	# ----- Pingu wärend des Fallens -----

        if falling -> fast = falling_fast*5; # ----- Liegedauer -----
        
        switch {

          # Pinguin liegt am Boden
          !falling && fast => {
            18;{switch{1:2 => G; => G,G,G;};},G,H;*;I,J,J,I,L,K,{if fast -> fast-=1};*;
          };
                    
          # Pinguin mit Fallschirm
          fallschirm       => {
	    switch {
	      falling_fast   => {18;F;*;};  
	      falling        -> {18;C,C,D,D,C,C,E,E;*;};
	                     => {18;{A;fallschirm = 0;solo = 0};*; };
	    };
	  };
          
          # Pinguin fällt schnell
          falling_fast     => {fallschirm = 1; solo=1;18;F;*;};
          
          # Pinguin fällt langsam
	  falling          -> {18; {switch{1:2 => A; => A,A,A;};},
                                   {switch{1:2 => A; => A,A,A;};},
                                A,A,A,A,A,A,B,B,B,A,A,A,A,B,B,B,{A;fallschirm = 1;solo = 1};*;
                              };
                              
	  => {

	  # ----- Obendran Eis -----
          
            checkfreeze;
          
	  # ----- Akro-Pingu -----

	    sum = 0;
	    if 1??????? && !solo@(0,-1) -> sum+=1;
	    if ??1????? && !solo@(1,0) -> sum+=2;
	    if ????1??? && !solo@(0,1) -> sum+=4;
	    if ??????1? && !solo@(-1,0) -> sum+=8;
            switch {
  	    sum== 0 => pinguA;
            sum== 2 => pinguB;
            sum==10 => pinguC;
            sum== 8 => pinguD;
            sum== 4 => pinguE;
            sum== 6 => pinguF;
            sum==14 => pinguG;
            sum==12 => pinguH;
            sum== 5 => pinguI;
            sum== 7 => pinguJ;
            sum==15 => pinguK;
            sum==13 => pinguL;
            sum== 1 => pinguM;
            sum== 3 => pinguN;
            sum==11 => pinguO;
            sum== 9 => pinguP;
	    }; 
	  };
	}
      };
    >>
  }
  

}

#
#   Copyright 2006 by Bernhard Seckinger
#   Maintenance modifications 2002,2003,2006,2008,2011,2014 by the cuyo developers
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
#   btGrey.xpm[.gz], btScore.xpm[.gz], btTetris.xpm[.gz]
#

# Status: (M=Muss, S=Soll, K=Kann, F=Feature, B=Bugs)
#
# Fertig.
#
# FK: Bonus bei Zeile weg
# FK: Feinjustierung


#------------------------------#
# Definition des Tetris-Levels #
#------------------------------#

Tetris =
{
  #------------------------------------#
  # Allgemeine Beschreibung des Levels #
  #------------------------------------#

  name     = "Tetris"
  author   = "Berni"
  description     = "Complete lines will disappear."

  pics = Tetris * 7

  greypic   = Grey
  startpic  = Score
  startdist = "ABCDEFGHIJ","-K%&" # schreibt: "SCORE:0000"

  numexplode = 4
  chaingrass = 1 

  textcolor  = 255,0,0
  bgcolor    = 0,0,0
  topcolor   = 192,192,192  
  toptime    = 50

  randomgreys    = 500 # Das muss evtl. noch angepasst werden
  randomgreys[1] = 100 # Das muss evtl. noch angepasst werden

  <<
    var punkte=0;
    var exp = 0;
    var exp2 = 0;

    vielleicht_explodieren = {
      if  exp && !exp2 => { 
        exp2=1;
	if kind@(1,0) == Grey -> exp@(1,0)=1;
	if kind@(-1,0) == Grey -> exp@(-1,0)=1;
	if kind@(0,1) == Grey -> exp@(0,1)=1;
	if kind@(0,-1) == Grey -> exp@(0,-1)=1;
	explode;
	punkte@+=1;
      };
    };

  >>

  #-----------------------------------------------------#
  # Startaufstellung und das Verhalten der "Gras"-Teile #
  #-----------------------------------------------------#

  Score =
  {
    pics = btScore.xpm

    <<
      var local; # Parameter fuer Unterroutine 'setDigit'

      setDigit = {
        switch 
        {
          local==0 -> K;
          local==1 -> L;
          local==2 -> M;
          local==3 -> N;
          local==4 -> O;
          local==5 -> P;
          local==6 -> Q;
          local==7 -> R;
          local==8 -> S;
          local==9 -> T;
        }
      };

      Score = {
        switch { 
          version==0 -> A;
          version==1 -> B;
          version==2 -> C;
          version==3 -> D;
          version==4 -> E;
          version==5 -> F;
          version==6 -> { local=punkte@ / 1000 % 10;setDigit };
          version==7 -> { local=punkte@ /  100 % 10;setDigit };
          version==8 -> { local=punkte@ /   10 % 10;setDigit };
          version==9 -> { local=punkte@        % 10;setDigit };
          version==10 -> G;
        };*
      };
    >>
  } # End of Score

  #-------------------#
  # Die grauen Steine #
  #-------------------#

  Grey =
  {
     pics = btGrey.xpm

     <<
       Grey = {
         schema16;
         vielleicht_explodieren;
       };
     >>
  }

  #-------------------#
  # Die Tetris-Steine #
  #-------------------#

  <<
    var sum,local;

    # Prueft, ob eine ganze Zeile voll mit Tetris-Teilen ist und laesst diese
    # gegebenenfalls verschwinden.

    testline = { 
      switch { loc_x==0 -> 
	{
	  sum=0;
          switch {kind@(9,0)==0..6 -> sum+=1;};
          switch {kind@(8,0)==0..6 -> sum+=1;};
          switch {kind@(7,0)==0..6 -> sum+=1;};
          switch {kind@(6,0)==0..6 -> sum+=1;};
          switch {kind@(5,0)==0..6 -> sum+=1;};
          switch {kind@(4,0)==0..6 -> sum+=1;};
          switch {kind@(3,0)==0..6 -> sum+=1;};
          switch {kind@(2,0)==0..6 -> sum+=1;};
          switch {kind@(1,0)==0..6 -> sum+=1;};
          switch {kind@(0,0)==0..6 -> sum+=1;};

          switch {sum==10 -> {
            #kind@(0,0)=Grey;
	    exp@(0,0)=1;
            #kind@(1,0)=Grey;
	    exp@(1,0)=1;
            #kind@(2,0)=Grey;
	    exp@(2,0)=1;
            #kind@(3,0)=Grey;
	    exp@(3,0)=1;
            #kind@(4,0)=Grey;
	    exp@(4,0)=1;
            #kind@(5,0)=Grey;
	    exp@(5,0)=1;
            #kind@(6,0)=Grey;
	    exp@(6,0)=1;
            #kind@(7,0)=Grey;
	    exp@(7,0)=1;
            #kind@(8,0)=Grey;
	    exp@(8,0)=1;
            #kind@(9,0)=Grey;
	    exp@(9,0)=1;
          };};
	};};*;
      vielleicht_explodieren;
    };
  >>

  Tetris = { pics=btTetris.xpm << Tetris = {pos=kind-Tetris;testline;}; >> }

} # End of Tetris

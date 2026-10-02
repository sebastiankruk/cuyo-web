#
#   Copyright 2006 by Bernhard Seckinger
#   Modified 2011 by Mark Weyer
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
#   blBuchstabe.xpm[.gz], blFeld.xpm[.gz], blFragezeichen.xpm[.gz],
#   blLeer.xpm[.gz], blMark.xpm[.gz], blTop.xpm[.gz]
#

# Status: (M=Muss, S=Soll, K=Kann, F=Feature, B=Bugs)
#
# Fertig.

Letters =
{
  #------------------------------------#
  # Allgemeine Beschreibung des Levels #
  #------------------------------------#

  name     = "Letters"
  author   = "Berni"
  description     = "Try to find out, which letters do connect!"

  pics = Letter1,Letter2,Letter3,Letter4

  greypic   = Leer
  startpic  = blFragezeichen.xpm
  startdist = "AAAAAAAAAA"

  numexplode = 4
  chaingrass = 0

  bgpic      = blFeld.xpm
  bgcolor    = 201,183,128
  toppic     = blTop.xpm
  topcolor   = 0,11,11
  topoverlap = 0
  toptime    = 30

  randomgreys[1] = 50

  #----------------#
  # Die Buchstaben #
  #----------------#

  <<
    var type=0,da=0,mark=0,blink=0;

    checkcuyo = {
      switch {
	da == 0 ->
	  switch {
	
	    ## CUYO waagrecht

	    kind@(1,0) == Letter2 && type@(1,0) == 3
	    && kind@(2,0) == Letter2 && type@(2,0) == 6
            && kind@(3,0) == Letter4 && type@(3,0) == 3
            -> {
	      mark@(0,0) = 1;
	      mark@(1,0) = 2;
 	      mark@(2,0) = 2;
              mark@(3,0) = 3;
	      blink@(0,0) = 100;
	      blink@(1,0) = 100;
              blink@(2,0) = 100;
	      blink@(3,0) = 100;
	      bonus(100);
	      message("You have found\nthe name of the game:\n*** CUYO ***\n100 Bonus Points"); 
	      da=1;
            };

	    # CUYO senkrecht

	    kind@(0,1) == Letter2 && type@(0,1) == 3
	    && kind@(0,2) == Letter2 && type@(0,2) == 6
            && kind@(0,3) == Letter4 && type@(0,3) == 3
            -> {
	      mark@(0,0) = 4;
	      mark@(0,1) = 5;
 	      mark@(0,2) = 5;
              mark@(0,3) = 6;
	      blink@(0,0) = 100;
	      blink@(0,1) = 100;
              blink@(0,2) = 100;
	      blink@(0,3) = 100;
	      bonus(100);
	      message("You have found\nthe name of the game:\n*** CUYO ***\n100 Bonus Points"); 
	      da=1;
            };

	    -> da=0;
          };
	};
    };

    checkimmi = {
      switch {
	da == 0 ->
	  switch {
	
	    ## IMMI waagrecht

	    kind@(1,0) == Letter2 && type@(1,0) == 1
	    && kind@(2,0) == Letter2 && type@(2,0) == 1
            && kind@(3,0) == Letter4 && type@(3,0) == 1
            -> {
	      mark@(0,0) = 1;
	      mark@(1,0) = 2;
 	      mark@(2,0) = 2;
              mark@(3,0) = 3;
	      blink@(0,0) = 100;
	      blink@(1,0) = 100;
              blink@(2,0) = 100;
	      blink@(3,0) = 100;
	      bonus(200);
	      message("You have found\nthe name of the\nprogrammer of Cuyo:\n*** IMMI ***\n200 Bonus Points"); 
	      da=1;
            };

	    # IMMI senkrecht

	    kind@(0,1) == Letter2 && type@(0,1) == 1
	    && kind@(0,2) == Letter2 && type@(0,2) == 1
            && kind@(0,3) == Letter4 && type@(0,3) == 1
            -> {
	      mark@(0,0) = 4;
	      mark@(0,1) = 5;
 	      mark@(0,2) = 5;
              mark@(0,3) = 6;
	      blink@(0,0) = 100;
	      blink@(0,1) = 100;
              blink@(0,2) = 100;
	      blink@(0,3) = 100;
	      bonus(200);
	      message("You have found\nthe name of the\nprogrammer of Cuyo:\n*** IMMI ***\n200 Bonus Points"); 
	      da=1;
            };

	    -> da=0;
          };
	};
    };

    checkberni = {
      switch {
	da == 0 ->
	  switch {
	
	    ## BERNI waagrecht

	    kind@(1,0) == Letter3 && type@(1,0) == 3
	    && kind@(2,0) == Letter1 && type@(2,0) == 6
            && kind@(3,0) == Letter4 && type@(3,0) == 2
            && kind@(4,0) == Letter4 && type@(4,0) == 1
            -> {
	      mark@(0,0) = 1;
	      mark@(1,0) = 2;
 	      mark@(2,0) = 2;
              mark@(3,0) = 2;
              mark@(4,0) = 3;
	      blink@(0,0) = 100;
	      blink@(1,0) = 100;
              blink@(2,0) = 100;
	      blink@(3,0) = 100;
	      blink@(4,0) = 100;
	      bonus(2000);
	      message("You have found\nthe name of the\nprogrammer of this Level:\n*** BERNI ***\n2000 Bonus Points"); 
	      da=1;
            };

	    # BERNI senkrecht

	    kind@(0,1) == Letter3 && type@(0,1) == 3
	    && kind@(0,2) == Letter1 && type@(0,2) == 6
            && kind@(0,3) == Letter4 && type@(0,3) == 2
            && kind@(0,4) == Letter4 && type@(0,4) == 1
            -> {
	      mark@(0,0) = 4;
	      mark@(0,1) = 5;
 	      mark@(0,2) = 5;
 	      mark@(0,3) = 5;
              mark@(0,4) = 6;
	      blink@(0,0) = 100;
	      blink@(0,1) = 100;
              blink@(0,2) = 100;
	      blink@(0,3) = 100;
	      blink@(0,4) = 100;
	      bonus(2000);
	      message("You have found\nthe name of the\nprogrammer of this Level:\n*** BERNI ***\n2000 Bonus Points"); 
	      da=1;
            };

	    -> da=0;
          };
	};
    };

    mark = {
      switch {
	mark == 1 && (blink%10 < 5) -> [file=2]A*;
	mark == 2 && (blink%10 < 5) -> [file=2]B*;
	mark == 3 && (blink%10 < 5) -> [file=2]C*;
	mark == 4 && (blink%10 < 5) -> [file=2]D*;
	mark == 5 && (blink%10 < 5) -> [file=2]E*;
	mark == 6 && (blink%10 < 5) -> [file=2]F*;
      };
      blink-=1;
      switch {
	blink == 0 -> mark = 0;
      };
    };

  >>

  Leer = 
  {
    pics = blBuchstabe.xpm
  
    <<
      Leer = A*;
    >>
  }  

  Letter1 = 
  {
    pics = blBuchstabe.xpm,blLeer.xpm,blMark.xpm
    colourprob = 7

    <<
      Letter1.init = {type=rnd(7);};

      Letter1 = {
        [file=1]schema16;
        switch {
	  type==0 -> G;
          type==1 -> H;
          type==2 -> K;
          type==3 -> M;
          type==4 -> Q;
          type==5 -> R;
          type==6 -> S;
	};*;mark
      };
    >>
  }

  Letter2 = 
  {
    pics = blBuchstabe.xpm,blLeer.xpm,blMark.xpm
    colourprob = 7

    <<
      Letter2.init = {type=rnd(7);};

      Letter2 = {
        [file=1]schema16;
        switch {
	  type==0 -> B;
          type==1 -> N;
          type==2 -> U;
          type==3 -> V;
          type==4 -> W;
          type==5 -> X;
          type==6 -> Z;
	};*;mark;
      };
    >>
  }

  Letter3 = 
  {
    pics = blBuchstabe.xpm,blLeer.xpm,blMark.xpm
    colourprob = 5

    <<
      Letter3.init = {type=rnd(5);};

      Letter3 = {
        [file=1]schema16;
        switch {
	  type==0 -> {C;checkberni;};
          type==1 -> {D;checkcuyo;};
          type==2 -> E;
          type==3 -> F;
          type==4 -> L;
	};*;mark;
      };
    >>
  }

  Letter4 = 
  {
    pics = blBuchstabe.xpm,blLeer.xpm,blMark.xpm
    colourprob = 7

    <<
      Letter4.init = {type=rnd(7);};

      Letter4 = {
        [file=1]schema16;
        switch {
	  type==0 -> I;
          type==1 -> {J;checkimmi;};
          type==2 -> O;
          type==3 -> P;
          type==4 -> T;
          type==5 -> Y;
          type==6 -> a;
	};*;mark;
      };
    >>
  }

} # End of Letter

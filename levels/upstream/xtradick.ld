#
#   Copyright 2006 by Bernhard Seckinger, Bilder: Daniela Lipps
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
# The above notices apply to this file and to:
#   bxBaer104.xpm[.gz], bxBaer112.xpm[.gz], bxBaer120.xpm[.gz],
#   bxBaer128.xpm[.gz], bxBaer136.xpm[.gz], bxBaer144.xpm[.gz],
#   bxBaer152.xpm[.gz], bxBaer160.xpm[.gz], bxBaer32.xpm[.gz],
#   bxBaer40.xpm[.gz], bxBaer48.xpm[.gz], bxBaer56.xpm[.gz], bxBaer64.xpm[.gz],
#   bxBaer72.xpm[.gz], bxBaer80.xpm[.gz], bxBaer88.xpm[.gz], bxBaer96.xpm[.gz],
#   bxBall104.xpm[.gz], bxBall112.xpm[.gz], bxBall120.xpm[.gz],
#   bxBall128.xpm[.gz], bxBall136.xpm[.gz], bxBall144.xpm[.gz],
#   bxBall152.xpm[.gz], bxBall160.xpm[.gz], bxBall32.xpm[.gz]
#   bxBall40.xpm[.gz], bxBall48.xpm[.gz], bxBall56.xpm[.gz], bxBall64.xpm[.gz],
#   bxBall72.xpm[.gz], bxBall80.xpm[.gz], bxBall88.xpm[.gz], bxBall96.xpm[.gz],
#   bxBuch104.xpm[.gz], bxBuch112.xpm[.gz], bxBuch120.xpm[.gz],
#   bxBuch128.xpm[.gz], bxBuch136.xpm[.gz], bxBuch144.xpm[.gz],
#   bxBuch152.xpm[.gz], bxBuch160.xpm[.gz], bxBuch32.xpm[.gz],
#   bxBuch40.xpm[.gz], bxBuch48.xpm[.gz], bxBuch56.xpm[.gz], bxBuch64.xpm[.gz],
#   bxBuch72.xpm[.gz], bxBuch80.xpm[.gz], bxBuch88.xpm[.gz], bxBuch96.xpm[.gz],
#   bxKlotz104.xpm[.gz], bxKlotz112.xpm[.gz], bxKlotz120.xpm[.gz],
#   bxKlotz128.xpm[.gz], bxKlotz136.xpm[.gz], bxKlotz144.xpm[.gz],
#   bxKlotz152.xpm[.gz], bxKlotz160.xpm[.gz], bxKlotz32.xpm[.gz],
#   bxKlotz40.xpm[.gz], bxKlotz48.xpm[.gz], bxKlotz56.xpm[.gz],
#   bxKlotz64.xpm[.gz], bxKlotz72.xpm[.gz], bxKlotz80.xpm[.gz],
#   bxKlotz88.xpm[.gz], bxKlotz96.xpm[.gz], bxLok104.xpm[.gz],
#   bxLok112.xpm[.gz], bxLok120.xpm[.gz], bxLok128.xpm[.gz], bxLok136.xpm[.gz],
#   bxLok144.xpm[.gz], bxLok152.xpm[.gz], bxLok160.xpm[.gz], bxLok32.xpm[.gz],
#   bxLok40.xpm[.gz], bxLok48.xpm[.gz], bxLok56.xpm[.gz], bxLok64.xpm[.gz],
#   bxLok72.xpm[.gz], bxLok80.xpm[.gz], bxLok88.xpm[.gz], bxLok96.xpm[.gz]
#

# Status: (M=Muss, S=Soll, K=Kann, F=Feature, B=Bugs)
#
# FS: Bildchen für Graue: Messer und Gabel
# FS: Bildchen für Gras: Armee-Spielzeug
# FS: Hintergrundfarben und Feinjustierung

Xtradick =
{
  #------------------------------------#
  # Allgemeine Beschreibung des Levels #
  #------------------------------------#

  name     = "Extra fat toys"
  author   = "Berni/Jela"
  description     = "What do they do?"

  pics = All * 5

  greypic   = Buchstabe
  startpic  = blFragezeichen.xpm
  startdist = "AAAAAAAAAA"

  numexplode = 4
  chaingrass = 1

  bgcolor    = 201,183,128
  topcolor   = 0,0,0
  topoverlap = 0
  toptime    = 30

  randomgreys[1] = 50

  <<
    var size = 0, animated = 0, step = 0,
	xx,yy;

    semiglobal = 
    {
	switch {
	 1:5 ->
	   {
	     xx = rnd(10);
	     yy = rnd(20);
	   };
	 -> 
	   {
	     xx = -1;
 	     yy = -1;
	   };
	};
    };
  >>


  All =
  {
      pics = 
        bxBaer32.xpm,bxBaer40.xpm,bxBaer48.xpm,bxBaer56.xpm,bxBaer64.xpm,bxBaer72.xpm,
	bxBaer80.xpm,bxBaer88.xpm,bxBaer96.xpm,bxBaer104.xpm,bxBaer112.xpm,bxBaer120.xpm,
	bxBaer128.xpm,bxBaer136.xpm,bxBaer144.xpm,bxBaer152.xpm,bxBaer160.xpm,

        bxBall32.xpm,bxBall40.xpm,bxBall48.xpm,bxBall56.xpm,bxBall64.xpm,bxBall72.xpm,
	bxBall80.xpm,bxBall88.xpm,bxBall96.xpm,bxBall104.xpm,bxBall112.xpm,bxBall120.xpm,
	bxBall128.xpm,bxBall136.xpm,bxBall144.xpm,bxBall152.xpm,bxBall160.xpm,

        bxBuch32.xpm,bxBuch40.xpm,bxBuch48.xpm,bxBuch56.xpm,bxBuch64.xpm,bxBuch72.xpm,
	bxBuch80.xpm,bxBuch88.xpm,bxBuch96.xpm,bxBuch104.xpm,bxBuch112.xpm,bxBuch120.xpm,
	bxBuch128.xpm,bxBuch136.xpm,bxBuch144.xpm,bxBuch152.xpm,bxBuch160.xpm,

        bxLok32.xpm,bxLok40.xpm,bxLok48.xpm,bxLok56.xpm,bxLok64.xpm,bxLok72.xpm,
	bxLok80.xpm,bxLok88.xpm,bxLok96.xpm,bxLok104.xpm,bxLok112.xpm,bxLok120.xpm,
	bxLok128.xpm,bxLok136.xpm,bxLok144.xpm,bxLok152.xpm,bxLok160.xpm,

        bxKlotz32.xpm,bxKlotz40.xpm,bxKlotz48.xpm,bxKlotz56.xpm,bxKlotz64.xpm,bxKlotz72.xpm,
	bxKlotz80.xpm,bxKlotz88.xpm,bxKlotz96.xpm,bxKlotz104.xpm,bxKlotz112.xpm,bxKlotz120.xpm,
	bxKlotz128.xpm,bxKlotz136.xpm,bxKlotz144.xpm,bxKlotz152.xpm,bxKlotz160.xpm


      <<
	startanimation = {
  	  step = 1; animated=1;
	};

	stepper = {
	  switch {
	    step ==  1..16 -> {size = step;    step +=1;            }; ## 1..16
	    step == 17..26 -> {size = 16;      step +=1;            }; ## 16
	    step == 27..32 -> {size = 42-step; step +=1;            }; ## 15..10
	    step == 33..38 -> {size = step-22; step +=1;            }; ## 11..16
	    step == 39..53 -> {size = 54-step; step +=1;            }; ## 15..1
	    step >= 54     -> {size = 0;       step = 0; animated=0;}; ## 0
	  };
	};

        All = {
	  switch {
	    falling -> {file = kind*17;A*;};
	    -> {
		 file = kind*17+size;

		 switch {
		   size == 0     -> A*;
		   size == 1..8 -> 
		     {
		       A*@(-1,-1);
		       B*@( 0,-1);
		       C*@( 1,-1);
		       D*@(-1, 0);
		       E*@( 0, 0);
		       F*@( 1, 0);
		       G*@(-1, 1);
		       H*@( 0, 1);
		       I*@( 1, 1);
		     };
		   size > 8     -> 
		     {
		       A*@(-2,-2);
		       B*@(-1,-2);
		       C*@( 0,-2);
		       D*@( 1,-2);
		       E*@( 2,-2);
		       F*@(-2,-1);
		       G*@(-1,-1);
		       H*@( 0,-1);
		       I*@( 1,-1);
		       J*@( 2,-1);
		       K*@(-2, 0);
		       L*@(-1, 0);
		       M*@( 0, 0);
		       N*@( 1, 0);
		       O*@( 2, 0);
		       P*@(-2, 1);
		       Q*@(-1, 1);
		       R*@( 0, 1);
		       S*@( 1, 1);
		       T*@( 2, 1);
		       U*@(-2, 2);
		       V*@(-1, 2);
		       W*@( 0, 2);
		       X*@( 1, 2);
		       Y*@( 2, 2);
		     };
		 };	

                 if loc_x==xx@@ && loc_y==yy@@ -> startanimation;

		 stepper;
	       };
	  };
      };
    >>
  }

  Buchstabe = {pics = blBuchstabe.xpm <<Buchstabe=A*;>>}

} # End of Xtradick


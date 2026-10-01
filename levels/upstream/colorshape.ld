#
#   Copyright 2006 by Bernhard Seckinger
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
#   bcBack.xpm[.gz], bcEmpty1.xpm[.gz], bcEmpty2.xpm[.gz], bcOrange.xpm[.gz],
#   bcSechseck.xpm[.gz], bcShapes.xpm[.gz]
#

# Status: (M=Muss, S=Soll, K=Kann, F=Feature, B=Bugs)
#
# Fertig.

ColorShape =
{
  #------------------------------------#
  # Allgemeine Beschreibung des Levels #
  #------------------------------------#

  name     = "Shape and Color"
  author   = "Berni"
  description     = "An explosion changes the way, they connect..."

  pics = All*4

  greypic   = Grey
  startpic  = Start
  emptypic  = Empty
  startdist = "A.........","A.........","A.........","A........A",
	      "AA.......A","AA.......A","AAA....AAA",
	      "AAAA.AAAAA"
  startdist[1] = "A.........","A.........","A.........","A........A","A........A",
	         "AA.......A","AA.......A","AA.......A","AAA....AAA",
	         "AAAA..AAAA","AAAA.AAAAA"

  numexplode = 4
  chaingrass = 1

  bgcolor    = 0,0,0
  topcolor   = 0,0,0
  topoverlap = 0
  toptime    = 80
  textcolor  = 200,200,200

  randomgreys[1] = 40

  <<
    var farbe, form;

    var modus = 0,
	wechsel = 0,
	explobum = 0,
	counter = 0;
	
    semiglobal =
      {
	wechsel=0;
	switch {
	  explobum==1 -> 
	   {
	     counter=9;
	     explobum=0;
	   };
	  counter > 0 -> 
	    { 
	      switch {
		counter == 9 -> 
	   	  {
	     	    modus=1-modus;
	     	    wechsel=1;
	   	  };
	      };
	      counter-=1;
	    };
	};
      };

    bg = {
	if !falling && loc_x == 0..9 && loc_y == 0..19 ->
	    {
              file = modus@@;
	      pos = loc_x+10*loc_y;*;
	    };
    };
  >>

  Start =
  {
    pics = bcEmpty1.xpm,bcEmpty2.xpm,bcOrange.xpm

    <<
      Start =
	{
	  bg;
	  2;schema5;
	};
    >>
  }

  Grey =
  {
    pics = bcEmpty1.xpm,bcEmpty2.xpm,bcBack.xpm,bcSechseck.xpm

    <<
      Grey =
	{
	  bg;
	  2;schema5;
	  3A*;
	};
    >>
  }

  Empty =
  {
    pics = bcEmpty1.xpm,bcEmpty2.xpm

    <<
      Empty = 
        {
	  bg;
	};
    >>
  }

  All = 
  {
    pics = bcEmpty1.xpm,bcEmpty2.xpm,bcBack.xpm,bcShapes.xpm

    <<    
      All.init = { 
        switch {
	  modus@@ == 0 -> {farbe = kind; form = rnd(4)};
	  modus@@ == 1 -> {farbe = rnd(4); form = kind};
	};
      };

      All.changeside = {
	switch {
	  modus@@==0 -> kind=farbe;
	  modus@@==1 -> kind=form;    
	};
      };

      All = 
        {
          bg;

	  if size>=4 -> explobum@@ = 1;

	  if wechsel@@==1 ->
	    switch {
	      modus@@==0 -> kind=farbe;
	      modus@@==1 -> kind=form;
            };

	  2;schema5;
	  3;pos=4*form+farbe;*;

	};
    >>
      
  }
} # End of ColorShape

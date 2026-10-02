#
#   Copyright <=2004 by Immanuel Halupczok
#   Modified 2014 by Immanuel Halupczok
#   Maintenance modifications 2005,2006,2011,2014 by the cuyo developers
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
#   ieGelb.xpm[.gz], ieGras.xpm[.gz], ieGrau.xpm[.gz], ieGruen.xpm[.gz],
#   ieNix.xpm[.gz], ieOben.xpm[.gz], ieRosa.xpm[.gz], ieRot.xpm[.gz]
#   ieUnten.xpm[.gz]
#

Ebene={
  name="Plane"
  author="Immi"
  numexplode=4
  numexplode[1]=5
  chaingrass=1
  randomgreys[1]=100
  pics=ieGelb,ieRosa,ieRot,ieGruen
  textcolor=0,200,200
  bgcolor=40,40,40
  startpic=ieGras
  startdist="A.A.A.A.A.","AAAAAAAAAA"
  greypic=ieGrau
  emptypic=ieNix
  neighbours=<neighbours_hex4>
  bgpic=ieUnten.xpm
  toppic="ieOben.xpm"
  topoverlap=16
  topcolor=0,150,200
  toptime=50

  <<
  
  var wasserfall;
  
  schemaEbene={

    # Default: Kein Wasserfall von diesem Feld aus. Wenn ein Wasserfall
    # stattfinden soll, muss die Variable nach dem Aufruf von schemaEbene
    # wieder überschrieben werden.
    wasserfall = 0;
       
    switch {
      ?????0?0 -> A;
      ?????1?0 -> C;
    };
    switch {
      ?????0?1 -> D;
      ?????1?1 -> B;
    };
    switch {???????0 -> qu=Q_TL_TL; -> qu=Q_BL_TL;};
    switch {kind@(-1,-.5)==nothing || kind@(-1,-.5)==outside -> pos += 4;};
    *;
    
    
    switch {
      ?0?1???? -> C;
      ?1?1???? -> A;
    };
    switch {
      ?0?0???? -> D;
      ?1?0???? -> B;
    };
    switch {???1???? -> qu=Q_TR_TR; -> qu=Q_BR_TR;};
    switch {kind@(1,-.5)==nothing || kind@(1,-.5)==outside -> pos += 4;};
    *;
    
    
    switch {
      ?????0?0 -> A;
      ?????1?0 -> C;
    };
    switch {
      ?????0?1 -> D;
      ?????1?1 -> B;
    };
    switch {???????0 -> qu=Q_BL_BL; -> qu=Q_TL_BL;};
    switch {kind@(-1,.5)==nothing || kind@(-1,.5)==outside -> pos += 4;};
    *;
    
    
    switch {
      ?0?1???? -> C;
      ?1?1???? -> A;
    };
    switch {
      ?0?0???? -> D;
      ?1?0???? -> B;
    };
    switch {???1???? -> qu=Q_BR_BR; -> qu=Q_TR_BR;};
    switch {kind@(1,.5)==nothing || kind@(1,.5)==outside -> pos += 4;};
    *;
      
  };
  
  farbe={
    switch {
      falling -> I*;
      -> {
	# Wasserfallstrahl, der von oben vorbei kommt:
	[qu=Q_BR_TR] switch {
	  wasserfall@(0,-1) == 1 -> J*;
	  wasserfall@(0,-1) == 2 -> K*;
	  wasserfall@(0,-1) == 3 -> L*;
	};
	
	# Eigentliches Blop
        schemaEbene;
	
	# Wasserfall, der von uns kommt:
	[qu=Q_TR_BR] switch {
	  wasserfall@(0,0) == 1 -> J*;
	  wasserfall@(0,0) == 2 -> K*;
	  wasserfall@(0,0) == 3 -> L*;
	};

        # Wasserfallberechnung (muss _nach_ schemaEbene stattfinden, weil
	# in schemaEbene wasserfall auf 0 gesetzt wird)
	switch {
	  ?001?? && (kind@(1,0.5) == nothing || kind@(1,0.5) == outside) -> {
	      wasserfall = 1, wasserfall = 2, wasserfall = 3;
	    };
	};

      };
    };
  };
  #exceptions8="10?010?0:N,???010??:J+,10?????0:R+"
  #animations="[P=J]JKL;[P=N]NOP;[P=R]RST"

  >>
  
  ieNix={
    pics=ieNix.xpm
    <<
    ieNix={
      wasserfall = 0;
      switch {
        kind@(-1,-.5) != nothing && kind@(-1,-.5) != outside ->
	  [qu=Q_TL_TL] *;
      };
      switch {
        kind@( 1,-.5) != nothing && kind@( 1,-.5) != outside ->
	  [qu=Q_TR_TR] *;
      };
      switch {
        kind@(-1, .5) != nothing && kind@(-1, .5) != outside ->
	  [qu=Q_BL_BL] *;
      };
      switch {
        kind@( 1, .5) != nothing && kind@( 1, .5) != outside ->
	  [qu=Q_BR_BR] *;
      };
    };
    >>
  }
  ieGrau={
    pics=ieGrau.xpm
    << ieGrau=if informational -> I* else -> schemaEbene; >>
  }
  ieGras={
    pics=ieGras.xpm
    << ieGras=if informational -> I* else -> schemaEbene; >>
  }
  ieGelb={
    pics="ieGelb.xpm"
    << ieGelb=farbe; >>
  }
  ieRosa={
    pics="ieRosa.xpm"
    << ieRosa=farbe; >>
  }
  ieRot={
    pics=ieRot.xpm
    << ieRot=farbe; >>
  }
  ieGruen={
    pics=ieGruen.xpm
    << ieGruen=farbe; >>
  }
}

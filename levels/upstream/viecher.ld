#
#   Copyright <=2004 by Immanuel Halupczok
#   Maintenance modifications 2005,2006,2008,2011 by the cuyo developers
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
#   ivBerge.xpm[.gz], ivDrachen.xpm[.gz], ivElefant.xpm[.gz], ivFeuer1.xpm[.gz],
#   ivFeuer2.xpm[.gz], ivFeuer3.xpm[.gz], ivFeuer4.xpm[.gz], ivFeuer5.xpm[.gz],
#   ivFeuer6.xpm[.gz], ivFeuer7.xpm[.gz], ivFeuer8.xpm[.gz], ivStein.xpm[.gz],
#   ivTintenfisch.xpm[.gz], ivVulkan2.xpm[.gz], ivVulkan3.xpm[.gz],
#   ivVulkan4.xpm[.gz], ivVulkan5.xpm[.gz], ivVulkan6.xpm[.gz],
#   ivVulkan7.xpm[.gz], ivVulkan8.xpm[.gz], ivVulkan9.xpm[.gz],
#   ivVulkan.xpm[.gz]
#

# referenced from labskaus.ld, memory.ld

Viecher={
  name="Beasts"
  author="Immi"
  numexplode=6
  numexplode[1]=9
  chaingrass=1
  pics=ivDrachen,ivElefant,ivTintenfisch
  bgcolor=255,255,255
  bgpic=ivBerge.xpm
  topcolor=60,60,60
  toptime=50
  startpic=ivVulkan
  startdist="....AA....","...AAAA...","..AAAAAA.."
  startdist[1]="....AA....","...AAAA...","..AAAAAA..",".AAAAAAAA."
  greypic=ivStein
  description="Warning! Fire hazard!"
  emptypic=ivNix
  <<
  var ausbruch,brennt;
  # ba = 1 bedeutet, dass sich das Feld mit Feuer verbindet.
  var ba;
  var alter_kind;
  
  global={switch {
    1:100 => 1,2,3,4,5,6,7,8;
    -> 0;
  };ausbruch=file};
  
  feuer=switch {
    brennt==1 => {
      ba=1;
      0,1,2,3,4,{5;kind=ivStein},6,{7;brennt=0;ba=0};

      # Das Diag16-Schema, manuell implementiert
      [qu=Q_TL] {switch {
        ba@(-1,0) && ba@(-1,-1) && ba@(0,-1) -> K;
                     ba@(-1,-1) && ba@(0,-1) -> J;
        ba@(-1,0) && ba@(-1,-1)              -> L;
                     ba@(-1,-1)              -> C;
        ba@(-1,0)               && ba@(0,-1) -> G;
                                   ba@(0,-1) -> N;
        ba@(-1,0)                            -> F;
                                             -> E;
      };*};
      [qu=Q_TR] {switch {
        ba@(0,-1) && ba@(1,-1) && ba@(1,0) -> J;
                     ba@(1,-1) && ba@(1,0) -> F;
        ba@(0,-1) && ba@(1,-1)             -> N;
                     ba@(1,-1)             -> L;
        ba@(0,-1)              && ba@(1,0) -> K;
                                  ba@(1,0) -> E;
        ba@(0,-1)                          -> G;
                                           -> C;
      };*};
      [qu=Q_BL] {switch {
        ba@(0,1) && ba@(-1,1) && ba@(-1,0) -> G;
                    ba@(-1,1) && ba@(-1,0) -> K;
        ba@(0,1) && ba@(-1,1)              -> C;
                    ba@(-1,1)              -> E;
        ba@(0,1)              && ba@(-1,0) -> F;
                                 ba@(-1,0) -> L;
        ba@(0,1)                           -> J;
                                           -> N;
      };*};
      [qu=Q_BR] {switch {
        ba@(1,0) && ba@(1,1) && ba@(0,1) -> F;
                    ba@(1,1) && ba@(0,1) -> G;
        ba@(1,0) && ba@(1,1)             -> E;
                    ba@(1,1)             -> N;
        ba@(1,0)             && ba@(0,1) -> J;
                                ba@(0,1) -> C;
        ba@(1,0)                         -> K;
                                         -> L;
      };*};

    };
  };
  # Für Blops, die nicht verbrennen können:
  feuerfest={alter_kind=kind;feuer;kind=alter_kind};
  >>
  
  ivStein={
    pics=ivFeuer1.xpm,ivFeuer2.xpm,ivFeuer3.xpm,ivFeuer4.xpm,
         ivFeuer5.xpm,ivFeuer6.xpm,ivFeuer7.xpm,ivFeuer8.xpm,ivStein.xpm
    <<
    ivStein={8*;feuerfest};
    >>
  }
  
  ivNix={
    pics=ivFeuer1.xpm,ivFeuer2.xpm,ivFeuer3.xpm,ivFeuer4.xpm,
         ivFeuer5.xpm,ivFeuer6.xpm,ivFeuer7.xpm,ivFeuer8.xpm
    <<
    ivNix=feuerfest;
    >>
  }
  
  ivTintenfisch={
    pics=ivFeuer1.xpm,ivFeuer2.xpm,ivFeuer3.xpm,ivFeuer4.xpm,
         ivFeuer5.xpm,ivFeuer6.xpm,ivFeuer7.xpm,ivFeuer8.xpm,
         ivTintenfisch.xpm
    <<
    ivTintenfisch={8;schema16;feuer};
    >>
  }
  
  ivDrachen={
    pics=ivFeuer1.xpm,ivFeuer2.xpm,ivFeuer3.xpm,ivFeuer4.xpm,
         ivFeuer5.xpm,ivFeuer6.xpm,ivFeuer7.xpm,ivFeuer8.xpm,
         ivDrachen.xpm
    <<
    var fp;
    
    ivDrachen={
      8;
      switch {
        0?1?0?0? -> {
          switch {
            1:100 =>
	      switch {
  	        players==1 => {
                  U,{W;ba=1},Y,{a;brennt@(-1,0)=1},{Y;brennt@(-2,0)=1},
  	          a,{Y;brennt@(-3,0)=1},{a;brennt@(-2,-1)=1},
		  {W;brennt@(-3,-1)=1;ba=0},U
                };
	        players==2 => {
                  U,{W;ba=1},Y,{a;brennt@(-1,0)=1},Y,
  	          {a;brennt@(-2,0)=1},Y,a,{W;ba=0},U
                };
	      };
            -> B;
          };
          *
        };
        0?0?0?1?->{
          switch {
            1:100 => {
	      switch {
  	        players==1 => {
                  V,{X;ba=1},Z,{b;brennt@(1,0)=1},{Z;brennt@(2,0)=1},
  	          b,{Z;brennt@(3,0)=1},{b;brennt@(2,-1)=1},
		  {X;brennt@(3,-1)=1;ba=0},V
                };
	        players==2 => {
                  V,{X;ba=1},Z,{b;brennt@(1,0)=1},Z,
                  {b;brennt@(2,0)=1},Z,b,{X;ba=0},V
                };
	      };
            };
            -> D;
          };
          *
        };
        -> schema16;
      };
      switch {
        1:100 => {
          B,C,D,C,B,A,B,C,D,C,B,A,B,C,D,C,B,A,B,C,D,C,B
        };
        1:100 => {
          B,C,D,D,D,D,D,D,D,D,D,C,B
        };
        => A;
      };
      fp=pos;
      switch {
        1?????11 -> [qu=Q_BR_TL] {Q;pos+=fp@(0,0);*};
      };
      switch {
        111????? -> [qu=Q_BL_TR] {Q;pos+=fp@(1,0);*};
      };
      switch {
        ????111? -> [qu=Q_TR_BL] {Q;pos+=fp@(0,1);*};
      };
      switch {
        ??111??? -> [qu=Q_TL_BR] {Q;pos+=fp@(1,1);*};
      };
      feuer;
    };
    >>
  }
  ivElefant={
    pics=ivFeuer1.xpm,ivFeuer2.xpm,ivFeuer3.xpm,ivFeuer4.xpm,
         ivFeuer5.xpm,ivFeuer6.xpm,ivFeuer7.xpm,ivFeuer8.xpm,
         ivElefant.xpm
    <<
    ivElefant={
      8;
      switch {
        0?0?0?0? -> {{A,Y,a};*;brennt=0};
        0?1?0?0? -> {{B,U,W};*;brennt=0};
        1?1?1?0? -> {{J,R,T};*;brennt=0};
        1?0?0?0? -> {{M,Q,S};*;brennt=0};
        1?1?0?1? -> {{O,V,X};*;brennt=0};
        -> {
	  schema16;
	   # Wasser-Elefanten brennen nicht. Also nur hier Feuer
	   # aufrufen.
	  feuer;
	};
      }
    };
    >>
  }
  ivVulkan={
    pics=ivFeuer1.xpm,ivFeuer2.xpm,ivFeuer3.xpm,ivFeuer4.xpm,
         ivFeuer5.xpm,ivFeuer6.xpm,ivFeuer7.xpm,ivFeuer8.xpm,
         ivVulkan.xpm,ivVulkan2.xpm,ivVulkan3.xpm,ivVulkan4.xpm,
         ivVulkan5.xpm,ivVulkan6.xpm,ivVulkan7.xpm,ivVulkan8.xpm,
         ivVulkan9.xpm
    
    <<
    ivVulkan={
      switch {
        001???0? -> A;
        0?0???10 -> C;
        001???11 -> E;
        001???10 -> B;
        011???10 -> F;
        011???11 -> G;
        0?0???0? -> D;
        011???0? -> H;
        1?1???1? -> I;
        0?0???11 -> J;
        1?1???0? -> K;
        1?0???1? -> L;
        1?0???0? -> M;
      };
      8;
      switch {
        pos==0..3 -> file+=ausbruch@;
      };
      switch {
        players==1 ->
	  switch {
            file==9 -> { brennt@(0,-1)=1; ba=1;};
            file==11 -> brennt@(0,-2)=1;
	    file==12 -> { brennt@(-1,-2)=1; brennt@(1,-2)=1; };
            file==13 -> brennt@(0,-3)=1;
	    file==14 -> { brennt@(-1,-3)=1; brennt@(1,-3)=1; };
            file==15 -> ba=0;
	  };
	players==2 ->
	  switch {
            file==9 -> { brennt@(0,-1)=1; ba=1;};
            file==13 -> brennt@(0,-2)=1;
            file==15 -> ba=0;
	  };
      };
      *;
      feuerfest;
    };
    >>
  }
}

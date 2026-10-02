#
#   Copyright <=2011 by Simon Huggenberger
#   Maintenance modifications 2011,2014 by the cuyo developers
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
#   spBlinky.xpm[.gz], spClyde.xpm[.gz], spEyes.xpm[.gz], spGhost.xpm[.gz],
#   spInkey.xpm[.gz], spLabyrinth.xpm[.gz], spPacman10.xpm[.gz],
#   spPacman11.xpm[.gz], spPacman2.xpm[.gz], spPacman3.xpm[.gz],
#   spPacman4.xpm[.gz], spPacman5.xpm[.gz], spPacman6.xpm[.gz],
#   spPacman7.xpm[.gz], spPacman8.xpm[.gz], spPacman9.xpm[.gz],
#   spPacman.xpm[.gz], spPfeil.xpm[.gz], spPinky.xpm[.gz]
#


Pacman={
  name="Pacman"
  author="Simon"
  numexplode=3
  numexplode1=3
  chaingrass=1
  pics=spUp,spRight,spDown,spLeft,spLife
  bgcolor=0,0,0
  topcolor=0,0,191
  toptime=50
  startpic=spLabyrinth
  startdist="GMGKMGKMGM","FFDOJDOJFF","DNGPKKPMHJ","KPJFQIFDPK",
	"GLKNGMHKLM","DKKLJDLKKJ"
  greypic=ilTuer.xpm
  textcolor=127,255,255
  topoverlap=0
  description="Wanna play Pacman?"

# schnellere 180er-Wende
# halbe Kekse entfernen
# gefangener Geist/ ausbrechender Geist
# version "andert Labyrinth
# individuelle Verfolgung
# schnellere Animation
# Wiederauferstehung Pacmans

  <<
  var pacman,ghost,blinky,clyde,inkey,pinky;
  var keks,move,chmove,pac_x,pac_y;
  var wayo,wayr,wayu,wayl,ways;

  global = {
    switch {pacman<10 -> 0,0,0,0,0,0,1,0,0,0,0,0,0,2;
	    => {0; pacman = 11},{0; pacman = 0},0,0,0,0,0,0,0,0,0,0,0,0,0;};
    move = file;
    switch {1:200 -> keks = 1;};
    switch {move==2 -> {
      switch {blinky==1..32 -> blinky -= 1;};
      switch {pinky==1..32 -> pinky -= 1;};
      switch {inkey==1..32 -> inkey -= 1;};
      switch {clyde==1..32 -> clyde -= 1;};
      switch {keks==1..16 -> keks -= 1;};
    };};
    switch {move>=1 && pacman==1..9 -> pacman += 1;}
  };

  spLabyrinth.init = {
    pacman@ = 11;
    switch {version!=16 -> {keks = 1; ways = version};
      -> {ways = 2; wayr = 1; keks = 16; keks@(1,0) = 0};
    };
    switch {version%2==1 -> wayo = 1;};
    switch {version%4>=2 -> {wayr = 1; keks += 2};};
    switch {version%8>=4 -> {wayu = 1; keks += 4};};
    switch {version%16>=8 -> wayl = 1;};
    switch {(loc_x==0 || loc_x==9)&&(loc_y==16 || loc_y==19) -> keks+=7;};
  };

  spLife.init = kind = rnd(5);

  spUp.turn = kind = spRight;
  spRight.turn = kind = spDown;
  spDown.turn = kind = spLeft;
  spLeft.turn = kind = spUp;

  labstart = 
    switch {
      keks@(0,0)==16 -> {pinky = 10; inkey = 12};
      keks@(-1,0)==16 -> {pinky = 14; clyde = 12};
      keks@(0,-1)==16 -> pacman = 10;
      keks@(-1,-1)==16 -> pacman = 14;
      keks@(0,1)==16 -> blinky = 10;
      keks@(-1,1)==16 -> blinky = 14;
    }
  ;

  labmove = {
    switch {
      move%2==0 -> A;
      move%8>=4 -> B;
      -> C;
    };
    switch {
      move==9..16 -> pos += 3;
      move==17..24 -> pos += 6;
      move>=25 -> pos += 9;
    };
    switch {
      move%8==3..5 -> *;
      move==6..7 || move==9..10  -> {qu = Q_TL_TR; *; qu = Q_BL_BR; *};
      move==1..2 || move==14..15  -> {qu = Q_TR_TL; *; qu = Q_BR_BL; *};
      move==22..23 || move==25..26 -> {qu = Q_BL_TL; *; qu = Q_BR_TR; *};
      move==17..18 || move==30..31  -> {qu = Q_TL_BL; *; qu = Q_TR_BR; *};
    };
    switch {move@>=1 -> move += 1;};
    qu = Q_ALL
  };

  labmov = {labmove; switch {move@==1 -> move -= 1;}};

  labvom = {
    switch {
      move<=16 -> {move = 16-move; labmove; move = 16-move};
      -> {move = 48-move; labmove; move = 48-move};
    };
    switch {move@>=1 -> move += move@;}
  };

  wandmove = {
    switch {
      ways==0 -> move@(0,0) = move;
      ways==1 -> move = 20;
      ways==2 -> move = 4;
      ways==3 -> switch {1:2 -> move = 20; -> move = 4;};
      ways==4 -> move = 28;
      ways==5 -> switch {1:2 -> move = 20; -> move = 28;};
      ways==6 -> switch {1:2 -> move = 4; -> move = 28;};
      ways==7 -> switch {1:3 -> move = 20; 1:2 -> move = 4; -> move = 28;};
      ways==8 -> move = 12;
      ways==9 -> switch {1:2 -> move = 20; -> move = 12;};
      ways==10 -> switch {1:2 -> move = 4; -> move = 12;};
      ways==11 -> switch {1:3 -> move = 20; 1:2 -> move = 4; -> move = 12;};
      ways==12 -> switch {1:2 -> move = 28; -> move = 12;};
      ways==13 -> switch {1:3 -> move = 20; 1:2 -> move = 28; -> move = 12;};
      ways==14 -> switch {1:3 -> move = 4; 1:2 -> move = 28; -> move = 12;};
      ways==15 -> switch {1:4 -> move = 20; 1:3 -> move = 4;
		          1:2 -> move = 28; -> move = 12;};
    };
  };

  labwand = {
    switch {
      move@>=1 && move==4 && wayr==0  -> wandmove;
      move@>=1 && move==12 && wayl==0  -> wandmove;
      move@>=1 && move==20 && wayo==0  -> wandmove;
      move@>=1 && move==28 && wayu==0  -> wandmove;
    };
  };

  fressen = {
    keks -= 8;
    switch {blinky@!=33 -> blinky@ = 32;};
    switch {pinky@!=33 -> pinky@ = 32;};
    switch {inkey@!=33 -> inkey@ = 32;};
    switch {clyde@!=33 -> clyde@ = 32;};
  };

  labkoll = {
    switch {pacman>=move -> chmove=pacman; -> {chmove=move; move=pacman};};
    switch {move==9..23 -> move = 32-move;};
    switch {chmove==9..23 -> chmove = 32-chmove;};
    switch {move>16 -> move -= 16;};
    switch {chmove>16 -> chmove -= 16;};
    switch {(chmove-move<=2 && move-chmove<=2) ||
	    (chmove==10..14 && move==3..5) ||
	    (chmove==11..13 && move==2..6) ->
      switch {ghost==0 && blinky@==1..32 -> blinky@ = 33;
              ghost==0 && blinky@==0 -> pacman@ = 1;};
    }
  };

  labpacman = {
    switch {pacman@>=1 -> file = pacman@+7; -> 1;};
    move = pacman; labmove; pacman = move;
    switch {move@>=1 -> {
      switch {
        pacman==6 ->
          switch {loc_x==9 -> pacman@(-9,0) = 2; -> pacman@(1,0) = 2;};
        pacman==14 ->
          switch {loc_x==0 -> pacman@(9,0) = 10; -> pacman@(-1,0) = 10;};
        pacman==22 -> pacman@(0,-1) = 18;
        pacman==30 -> pacman@(0,1) = 26;
      };
      switch {
        wayr==0 && pacman==5 -> pacman -= 1;
        wayl==0 && pacman==13 -> pacman -= 1;
        wayo==0 && pacman==21 -> pacman -= 1;
        wayu==0 && pacman==29 -> pacman -= 1;
	pacman@>=1 -> pacman -= 1;
      };
      switch {pacman%8==4 => {
        switch {
	  chmove@==1 && wayo==1 -> {pacman = 20; chmove@ = 0};
	  chmove@==2 && wayr==1 -> {pacman = 4; chmove@ = 0};
	  chmove@==3 && wayu==1 -> {pacman = 28; chmove@ = 0};
	  chmove@==4 && wayl==1 -> {pacman = 12; chmove@ = 0};
	};
	switch {keks%2==1 -> keks -= 1; keks==8..14 => fressen;}
      };};
      switch {keks%4>=2 && (pacman==7 || pacman==11) -> keks -= 2;};
      switch {keks%8>=4 && (pacman==19 || pacman==31) -> keks -= 4;};
      switch {pacman%8==2..5 -> {
        pac_x@ = loc_x; pac_y@ = loc_y;
	switch {pacman@==0 -> {
	  switch {blinky%8!=0 -> {ghost = 0; move = blinky; labkoll};};
	  switch {clyde%8!=0 -> {ghost = 3; move = clyde; labkoll};}
	};}
      };}
    };}
  };

  labfollow = {
    switch {
      move<=16 -> {
        switch {
	  1:2 && move==4 && loc_x<=pac_x@ -> ;
	  1:2 && move==12 && loc_x>=pac_x@ -> ;
	  wayo==1 && loc_y>=pac_y@ -> move = 20;
	  wayu==1 && loc_y<=pac_y@ -> move = 28;
	};
      };
      -> {
        switch {
	  1:2 && move==20 && loc_y>=pac_y@ -> ;
	  1:2 && move==28 && loc_y<=pac_y@ -> ;
	  wayr==1 && loc_x<=pac_x@ -> move = 4;
	  wayl==1 && loc_x>=pac_x@ -> move = 12;
	};
      };
    };
  };

  labturn = {
    switch {
      move==4 && wayl==1 -> {ways -= 8; wandmove; ways += 8};
      move==12 && wayr==1 -> {ways -= 2; wandmove; ways += 2};
      move==20 && wayu==1 -> {ways -= 4; wandmove; ways += 4};
      move==28 && wayo==1 -> {ways -= 1; wandmove; ways += 1};
    };
  };

  labghost = {
    switch {
      move%8==4 && (move@==2 || (move@==1 && file>=3)) -> {
        switch {
	  2:3 -> labfollow;
	  -> labturn;
	};
        labwand;
      };
    };
    switch {
      file==2 -> switch {move%16>=9 -> labvom; -> labmov;};
      file==1 -> {2; switch {move%16<=8 -> labvom; -> labmov;};};
      -> labmove;
    }
  };

  labblinky = {
    switch {
      blinky@==2..10 && blinky@%2==0 -> 1;
      blinky@==1..32 -> 2;
      blinky@==33 -> 3;
      -> 4;
    };
    move = blinky; labghost; blinky = move;
    switch {move@>=1 -> switch { 
      blinky==5 ->
        switch {loc_x==9 -> blinky@(-9,0) = 1; -> blinky@(1,0) = 1;};
      blinky==13 ->
        switch {loc_x==0 -> blinky@(9,0) = 9; -> blinky@(-1,0) = 9;};
      blinky==21 -> blinky@(0,-1) = 17;
      blinky==29 -> blinky@(0,1) = 25;
    };}
  };

  labpinky = {
    5;
    switch {pinky%8!=0 -> {move = pinky; labghost; pinky = move};};
    switch {move@>=1 -> switch { 
      pinky==5 ->
        switch {loc_x==9 -> pinky@(-9,0) = 1; -> pinky@(1,0) = 1;};
      pinky==13 ->
        switch {loc_x==0 -> pinky@(9,0) = 9; -> pinky@(-1,0) = 9;};
      pinky==21 -> pinky@(0,-1) = 17;
      pinky==29 -> pinky@(0,1) = 25;
    };}
  };

  labinkey = {
    6;
    switch {inkey%8!=0 -> {move = inkey; labghost; inkey = move};};
    switch {move@>=1 -> switch { 
      inkey==5 ->
        switch {loc_x==9 -> inkey@(-9,0) = 1; -> inkey@(1,0) = 1;};
      inkey==13 ->
        switch {loc_x==0 -> inkey@(9,0) = 9; -> inkey@(-1,0) = 9;};
      inkey==21 -> inkey@(0,-1) = 17;
      inkey==29 -> inkey@(0,1) = 25;
    };}
  };

  labclyde = {
    7;
    switch {clyde%8!=0 -> {move = clyde; labghost; clyde = move};};
    switch {move@>=1 -> switch { 
      clyde==5 ->
        switch {loc_x==9 -> clyde@(-9,0) = 1; -> clyde@(1,0) = 1;};
      clyde==13 ->
        switch {loc_x==0 -> clyde@(9,0) = 9; -> clyde@(-1,0) = 9;};
      clyde==21 -> clyde@(0,-1) = 17;
      clyde==29 -> clyde@(0,1) = 25;
    };}
  };

  pfeil = {
    schema4;
    switch {
      move==1 -> E;
      move==2 -> F;
      move==3 -> G;
      move==4 -> H;
    };
    switch {
      move==5 -> switch {1:50 => R,R,R,R,R,R,R; -> Q;};
      turn==1 -> pos += 4;
      turn==2 -> pos += 8;
    };
    switch {
      size>=3 => {1;{chmove@ = move; A},B,C,D,E,F,G,{H; kind@(0,0) = nothing}};
    };
    *
  };

  >>

  spPacman = {
    pics = spPacman.xpm
    <<
    spPacman = {
      A;
      switch {??1????? -> {qu = Q_TL_TR; *; qu = Q_BL_BR; *};};
      switch {??????1? -> {qu = Q_TR_TL; *; qu = Q_BR_BL; *};};
      qu = Q_ALL; *
    };
    >>
  }
      
  spLabyrinth = {
    pics = spLabyrinth.xpm, spPacman.xpm, spGhost.xpm, spEyes.xpm,
	   spBlinky.xpm, spPinky.xpm, spInkey.xpm, spClyde.xpm,
	   spPacman2.xpm, spPacman3.xpm, spPacman4.xpm, spPacman5.xpm,
	   spPacman6.xpm, spPacman7.xpm, spPacman8.xpm, spPacman9.xpm,
	   spPacman10.xpm, spPacman11.xpm
    <<
    spLabyrinth = {
      if informational
      -> A*
      else {
        switch {
          wayo==1 -> {
	    switch {0??????? -> {wayo = 0; ways -= 1};};
	    switch {wayl==1 -> D; -> C;};
	    qu = Q_TL;*;
	    switch {wayr==1 -> D; -> C;};
	    qu = Q_TR;*;
	  };
	  -> {
	    switch {wayu@(0,-1)==1 && 1??????? -> {wayo = 1; ways += 1};};
	    switch {wayl==1 -> B; -> A;};
	    qu = Q_TL;*;
	    switch {wayr==1 -> B; -> A;};
	    qu = Q_TR;*;
	  };
        };
        switch {
          wayu==1 -> {
	    switch {????0??? -> {wayu = 0; ways -= 4};};
	    switch {wayl==1 -> D; -> C;};
	    qu = Q_BL;*;
	    switch {wayr==1 -> D; -> C;};
	    qu = Q_BR;*;
	  };
	  -> {
	    switch {wayo@(0,1)==1 && ????1??? -> {wayu = 1; ways += 4};};
	    switch {wayl==1 -> B; -> A;};
	    qu = Q_BL;*;
	    switch {wayr==1 -> B; -> A;};
	    qu = Q_BR;*;
	  };
        };
        switch {wayr==0 ->
          switch {wayl@(1,0)==1 || wayl@(-9,0)==1 -> {wayr = 1; ways += 2};};};
        switch {wayl==0 ->
          switch {wayr@(-1,0)==1 || wayr@(9,0)==1 -> {wayl = 1; ways += 8};};};
        switch {wayr==1 && ??0????? && kind@(-9,0)!=spLabyrinth -> 
          {wayr = 0; ways -= 2};};
        switch {wayl==1 && ??????0? && kind@(9,0)!=spLabyrinth ->
          {wayl = 0; ways -= 8};};
        qu = Q_ALL;
        switch {keks@(0,0)%2==1 -> {keks@=1; E*};};
        switch {keks@(0,0)%4>=2 -> {keks@=1; qu=Q_TL_TR;E*; qu=Q_BL_BR;E*};};
        switch {keks@(-1,0)%4>=2 -> {keks@=1; qu=Q_TR_TL;E*; qu=Q_BR_BL;E*};};
        switch {keks@(0,0)%8>=4 -> {keks@=1; qu=Q_TL_BL;E*; qu=Q_TR_BR;E*};};
        switch {keks@(0,-1)%8>=4 -> {keks@=1; qu=Q_BL_TL;E*; qu=Q_BR_TR;E*};};
        switch {keks@(0,0)==16 -> {qu=Q_TR_TR;F*};};
        switch {keks@(-1,0)==16 -> {qu=Q_TL_TL;F*};};
        switch {keks@(0,1)==16 -> {qu=Q_BR_BR;F*};};
        switch {keks@(-1,1)==16 -> {qu=Q_BL_BL;F*};};
        qu = Q_ALL;
        switch {keks==8..14 => {keks@=1;I,I,J,K,K,J;*};};
        switch {
          pacman@<=10 -> {
            switch {blinky%8!=0 -> labblinky;};
	    switch {pinky%8!=0 -> labpinky;};
	    switch {inkey%8!=0 -> labinkey;};
	    switch {clyde%8!=0 -> labclyde;};
	    switch {pacman%8!=0 -> labpacman;}};
	  -> {pacman=0; blinky=0; pinky=0; inkey=0; clyde=0; labstart};
        }
      }
    };
    >>
  }

  spUp = {
    pics = spPfeil.xpm, explosion.xpm
    <<
    spUp = {move = 1; pfeil};
    >>
  }

  spRight = {
    pics = spPfeil.xpm, explosion.xpm
    <<
    spRight = {move = 2; pfeil};
    >>
  }

  spDown = {
    pics = spPfeil.xpm, explosion.xpm
    <<
    spDown = {move = 3; pfeil};
    >>
  }

  spLeft = {
    pics = spPfeil.xpm, explosion.xpm
    <<
    spLeft = {move = 4; pfeil};
    >>
  }

  spLife = {
    pics = spPfeil.xpm, explosion.xpm
    <<
    spLife = {move = 5; pfeil;
                #switch {loc_x==9 -> Z*;}
                # Ich verstehe nicht, was die vorige Zeile machen sollte...
                # ausser einen Fehler bewirken. Hab sie mal auskommentiert. -Immi
             };
    >>
  }
 

}

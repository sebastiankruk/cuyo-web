#
#   Copyright 2006,2008,2010,2011,2014 by Mark Weyer
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

Dungeon = {

  farben = 5           # Zählt nur die normalen Farben
  rand = <farben>
  gold = <farben+1>
  ego = <farben+2>  # Es werden vier Werte gebraucht
  leer = <farben+6>
  dateien = 12         # Genauer: Dateien pro Farbe
  linksoben = 1
  rechtsoben = 2
  linksunten = 4
  rechtsunten = 8
  sgrad[easy] = -1
  sgrad = 0
  sgrad[hard] = 1

  name = "Treasure hunt"
  author = "Mark Weyer"
  description = "Collect gold for extra points"
  pics = Wand * <farben>
  greypic = Gold
  emptypic = Leer
  startpic = Bildschirm
  startdist = "...****...","...****...","...****...","...****..."
  numexplode = 5
  neighbours = <neighbours_eight>
  randomgreys[1] = 300
  randomfallpos = 1

  bgcolor = 169,222,161     # Durchschnittsfarbe in mdBoden.xpm
  topcolor = 255,255,255
  toppic = mdFog.xpm

  <<
    var farbe=rand;
    var besetzt=15;         # Bitfeld mit Mauerinformation
    var xp,yp,xv,yv,xr,yr;  # p: Position.
                            # v und r: Vektor nach vorne und nach rechts

    lies_feld = {
      # Rein: xp und yp
      # Raus: farbe
      if xp<20 || players<2
      -> if besetzt@@(xp/2,yp/2;<).((1+(xp%2))*(1+3*(yp%2)))
        -> farbe = farbe@@(xp/2,yp/2;<)
        else -> farbe = leer
      else if besetzt@@(xp/2-10,yp/2;>).((1+(xp%2))*(1+3*(yp%2)))
        -> farbe = farbe@@(xp/2-10,yp/2;>)
        else -> farbe = leer;
      if farbe==leer && players>1  # Oder vielleicht doch ein Ego?
      -> switch {
        xp==xp@@(;<) && yp==yp@@(;<) -> switch {
          xv@@(;>)==-xv@@(;<) && yv@@(;>)==-yv@@(;<) -> farbe = ego;
            # entgegengesetze Richtung: Wir sehen ihn von vorne
          xv@@(;>)==xv@@(;<) && yv@@(;>)==yv@@(;<) -> farbe = ego+1;
            # gleiche Richtung: Wir sehen ihn von hinten
          xv@@(;>)==xr@@(;<) && yv@@(;>)==yr@@(;<) -> farbe = ego+2;
            # unser vorne ist sein rechts: Wir sehen ihn von links
          -> farbe = ego+3;
        };
        xp==xp@@(;>) && yp==yp@@(;>) -> switch {
          xv@@(;<)==-xv@@(;>) && yv@@(;<)==-yv@@(;>) -> farbe = ego;
            # entgegengesetze Richtung: Wir sehen ihn von vorne
          xv@@(;<)==xv@@(;>) && yv@@(;<)==yv@@(;>) -> farbe = ego+1;
            # gleiche Richtung: Wir sehen ihn von hinten
          xv@@(;<)==xr@@(;>) && yv@@(;<)==yr@@(;>) -> farbe = ego+2;
            # unser vorne ist sein rechts: Wir sehen ihn von links
          -> farbe = ego+3;
        };
      };
    };

    besetzt_gold_test = {
      # Rein: xp und yp
      # Raus: farbe (nach eventuellem Nehmen von Gold)
      # Nimmt Gold, wenn's welches gibt
      lies_feld;
      if farbe==gold -> {
        # Wir können doch hin und wir räumen das Gold ab
        farbe = leer;
        if xp<20
        -> besetzt@@(xp/2,yp/2;<) = 0
        else besetzt@@(xp/2-10,yp/2;>) = 0;
        bonus(20);
      };
    };

    Leer_T = {
      # Draws the ground, the above border, and egos in the top row.
      # pics = Boden, Plastik, EgoV, EgoH, EgoL, EgoR, ...
      if loc_y==0 -> {0A*; 1E*};
      0A; @(0,1)*;
      if sgrad<0 -> {
        if (loc_x+10*(loc_p-1) == xp@@(;<)/2) && (2*loc_y == yp@@(;<)) -> {
          switch {
            yv@@(;<)==1 -> 2;
            yv@@(;<)==-1 -> 3;
            xv@@(;<)==-1 -> 4;
            xv@@(;<)==1 -> 5;
          };
          pos = xp@@(;<)%2; *;
          pos += 2; @(0,1)*;
        };
        if (players==2) &&
            (loc_x+10*(loc_p-1) == xp@@(;>)/2) && (2*loc_y == yp@@(;>)) -> {
          switch {
            yv@@(;>)==1 -> 2;
            yv@@(;>)==-1 -> 3;
            xv@@(;>)==-1 -> 4;
            xv@@(;>)==1 -> 5;
          };
          pos = xp@@(;>)%2; *;
          pos += 2; @(0,1)*;
        };
      };
    };

    Leer_B = {
      # Draw egos in the bottom row.
      # pics = Boden, Plastik, EgoV, EgoH, EgoL, EgoR, ...
      if sgrad<0 -> {
        if (loc_x+10*(loc_p-1) == xp@@(;<)/2) && (2*loc_y+1 == yp@@(;<)) -> {
          switch {
            yv@@(;<)==1 -> 2;
            yv@@(;<)==-1 -> 3;
            xv@@(;<)==-1 -> 4;
            xv@@(;<)==1 -> 5;
          };
          pos = 4+xp@@(;<)%2; *;
          pos += 2; @(0,1)*;
        };
        if (players==2) &&
            (loc_x+10*(loc_p-1) == xp@@(;>)/2) && (2*loc_y+1 == yp@@(;>)) -> {
          switch {
            yv@@(;>)==1 -> 2;
            yv@@(;>)==-1 -> 3;
            xv@@(;>)==-1 -> 4;
            xv@@(;>)==1 -> 5;
          };
          pos = 4+xp@@(;>)%2; *;
          pos += 2; @(0,1)*;
        };
      };
    };

  >>

  semiglobal = {
    <<
      sinus = {
        # Rein: xp
        # Raus: yp=sin(xp*pi/2)
        yp = (1-((xp/2)%2)*2)*(xp%2);
      };

      semiglobal.init = {
        falling_speed=3;
        if sgrad>0 -> { # Position und Ausrichtung zufällig
          xp = rnd(4); sinus; xr=yp;
          xp+=1; sinus; xv=yp; yr=yp;
          xp+=1; sinus; yv=yp;
          xp = rnd(20*players);
          yp = rnd(32); # nicht ins Gras, also lieber nicht zu tief
        } else -> {
          xp=29*loc_p-24;
          yp=39;
          xv=0;
          yv=-1;
          xr=1;
          yr=0;
        };
      };

      semiglobal.keyleft = {xv@@=-xr; yv@@=-yr; xr@@=xv; yr@@=yv;};
      semiglobal.keyright = {xv@@=xr; yv@@=yr; xr@@=-xv; yr@@=-yv;};

      semiglobal.keyturn = {
        xp+=xv; yp+=yv; besetzt_gold_test;
        if farbe!=leer -> {xp-=xv; yp-=yv;};
      };

      semiglobal.keyfall = {
        xp-=xv; yp-=yv; besetzt_gold_test;
        if farbe!=leer -> {xp+=xv; yp+=yv;};
      };
    >>
  }

  Wand = {
    pics = mdBoden.xpm, mdPlastik.xpm,
      mdEgoV.xpm, mdEgoH.xpm, mdEgoL.xpm, mdEgoR.xpm,
      mdZiegel.xpm, mdStein.xpm, mdHolz.xpm, mdFels.xpm, mdEisen.xpm
    versions = 3

    <<
      Wand.init = {
        farbe = kind-Wand;
        switch {
          version==0 -> {
            besetzt = linksoben+linksunten;
            inhibit = DIR_R+DIR_UR+DIR_DR;
          };
          version==1 -> {
            besetzt = linksoben+rechtsoben;
            inhibit = DIR_D+DIR_DR+DIR_DL;
          };
          version==2 -> {
            besetzt = rechtsoben+rechtsunten;
            inhibit = DIR_L+DIR_UL+DIR_DL;
          };
        };
      };

      Wand = {
        if !falling -> Leer_T;
        file = kind-Wand+6;
        pos = version;
        if falling -> {pos+=6; *}
        else {
          *;
          pos+=3;
          @(0,1)*;
        };
        if !falling -> Leer_B;
      };
    >>
  }

  Gold = {
    pics = mdBoden.xpm, mdPlastik.xpm,
      mdEgoV.xpm, mdEgoH.xpm, mdEgoL.xpm, mdEgoR.xpm,
      mdGold.xpm
    versions = 4
    <<
      Gold.init = {
        farbe = gold;
        switch {
          version==0 -> {besetzt = linksoben;};
          version==1 -> {besetzt = rechtsoben;};
          version==2 -> {besetzt = linksunten;};
          version==3 -> {besetzt = rechtsunten;};
        };
      };

      Gold = {
        if informational -> 6I*
        else {
          Leer_T;
          6;
          switch {
            besetzt!=0 -> {
              pos=version;
              if pos>1 -> pos+=2;
              *;
              pos+=2;
              @(0,1)*;
            };
            (loc_x+10*(loc_p-1) != xp@@(;<)/2 || loc_y!=yp@@(;<)/2) &&
                (players<2 ||
                  loc_x+10*(loc_p-1) != xp@@(;>)/2 || loc_y!=yp@@(;>)/2)
              -> kind=Leer;
          };
          Leer_B;
        };
      };
    >>    
  }

  Leer = {
    pics = mdBoden.xpm,mdPlastik.xpm,
      mdEgoV.xpm, mdEgoH.xpm, mdEgoL.xpm, mdEgoR.xpm
    <<
      default besetzt=0:reapply;
      Leer = { Leer_T; Leer_B; };
    >>
  }

  Bildschirm = {
    pics[eco] = mdPlastik.xpm, mdSchwarz.xpm
    pics = mdPlastik.xpm,
      mdZiegel00.xpm, mdZiegel01.xpm, mdZiegel02.xpm, mdZiegel03.xpm,
      mdZiegel04.xpm, mdZiegel05.xpm, mdZiegel06.xpm, mdZiegel07.xpm,
      mdZiegel08.xpm, mdZiegel09.xpm, mdZiegel10.xpm, mdZiegel11.xpm,

      mdStein00.xpm, mdStein01.xpm, mdStein02.xpm, mdStein03.xpm,
      mdStein04.xpm, mdStein05.xpm, mdStein06.xpm, mdStein07.xpm,
      mdStein08.xpm, mdStein09.xpm, mdStein10.xpm, mdStein11.xpm,

      mdHolz00.xpm, mdHolz01.xpm, mdHolz02.xpm, mdHolz03.xpm,
      mdHolz04.xpm, mdHolz05.xpm, mdHolz06.xpm, mdHolz07.xpm,
      mdHolz08.xpm, mdHolz09.xpm, mdHolz10.xpm, mdHolz11.xpm,

      mdFels00.xpm, mdFels01.xpm, mdFels02.xpm, mdFels03.xpm,
      mdFels04.xpm, mdFels05.xpm, mdFels06.xpm, mdFels07.xpm,
      mdFels08.xpm, mdFels09.xpm, mdFels10.xpm, mdFels11.xpm,

      mdEisen00.xpm, mdEisen01.xpm, mdEisen02.xpm, mdEisen03.xpm,
      mdEisen04.xpm, mdEisen05.xpm, mdEisen06.xpm, mdEisen07.xpm,
      mdEisen08.xpm, mdEisen09.xpm, mdEisen10.xpm, mdEisen11.xpm,

      mdPlastik00.xpm, mdPlastik01.xpm, mdPlastik02.xpm, mdPlastik03.xpm,
      mdPlastik04.xpm, mdPlastik05.xpm, mdPlastik06.xpm, mdPlastik07.xpm,
      mdPlastik08.xpm, mdPlastik09.xpm, mdPlastik10.xpm, mdPlastik11.xpm,

      mdGold00.xpm, mdGold01.xpm, mdGold02.xpm, mdGold03.xpm,
      mdGold04.xpm, mdGold05.xpm, mdGold06.xpm, mdGold07.xpm,
      mdGold08.xpm, mdGold09.xpm, mdGold10.xpm, mdGold11.xpm,

      mdEgoV00.xpm, mdEgoV01.xpm, mdEgoV02.xpm, mdEgoV03.xpm,
      mdEgoV04.xpm, mdEgoV05.xpm, mdEgoV06.xpm, mdEgoV07.xpm,
      mdEgoV08.xpm, mdEgoV09.xpm, mdEgoV10.xpm, mdEgoV11.xpm,

      mdEgoH00.xpm, mdEgoH01.xpm, mdEgoH02.xpm, mdEgoH03.xpm,
      mdEgoH04.xpm, mdEgoH05.xpm, mdEgoH06.xpm, mdEgoH07.xpm,
      mdEgoH08.xpm, mdEgoH09.xpm, mdEgoH10.xpm, mdEgoH11.xpm,

      mdEgoL00.xpm, mdEgoL01.xpm, mdEgoL02.xpm, mdEgoL03.xpm,
      mdEgoL04.xpm, mdEgoL05.xpm, mdEgoL06.xpm, mdEgoL07.xpm,
      mdEgoL08.xpm, mdEgoL09.xpm, mdEgoL10.xpm, mdEgoL11.xpm,

      mdEgoR00.xpm, mdEgoR01.xpm, mdEgoR02.xpm, mdEgoR03.xpm,
      mdEgoR04.xpm, mdEgoR05.xpm, mdEgoR06.xpm, mdEgoR07.xpm,
      mdEgoR08.xpm, mdEgoR09.xpm, mdEgoR10.xpm, mdEgoR11.xpm,

      mdBoden00.xpm, mdBoden01.xpm, mdBoden02.xpm, mdBoden03.xpm,
      mdBoden04.xpm, mdBoden05.xpm, mdBoden06.xpm, mdBoden07.xpm,
      mdBoden08.xpm, mdBoden09.xpm, mdBoden10.xpm, mdBoden11.xpm,
      mdBoden12.xpm, mdBoden13.xpm, mdBoden14.xpm, mdBoden15.xpm,

      mdHimmel0.xpm, mdHimmel1.xpm, mdHimmel2.xpm, mdHimmel3.xpm
    <<
      var xx,yy;

      Rahmen = {
        file=0;
        if kind@(0,1)!=kind -> {E;@(0,1)*};
        if kind@(0,-1)!=kind -> {F;*@(0,-1)};
        qu=Q_TL;
        if kind@(-1,0)==kind
        -> if kind@(0,-1)==kind
          -> {if kind@(-1,-1)!=kind -> D*;}
          else B*
        else if kind@(0,-1)==kind
          -> C*
          else A*;
        qu=Q_TR;
        if kind@(1,0)==kind
        -> if kind@(0,-1)==kind
          -> {if kind@(1,-1)!=kind -> C*;}
          else A*
        else if kind@(0,-1)==kind
          -> D*
          else B*;
        qu=Q_BL;
        if kind@(-1,0)==kind
        -> if kind@(0,1)==kind
          -> {if kind@(-1,1)!=kind -> B*;}
          else D*
        else if kind@(0,1)==kind
          -> A*
          else C*;
        qu=Q_BR;
        if kind@(1,0)==kind
        -> if kind@(0,1)==kind
          -> {if kind@(1,1)!=kind -> A*;}
          else C*
        else if kind@(0,1)==kind
          -> B*
          else D*;
      };

      Bildschirm[eco] = {1A*; Rahmen;};

      Bildschirm = if informational
        -> {
          # Himmel
          file = (farben+6)*dateien + 18 + xv@@ + yv@@ + (xv@@!=0);
          qu=Q_BR_TL; F*;
          qu=Q_BL_TR; G*;

          # Boden
          file = 5+(farben+6)*dateien + xp@@%2 - 2*(1-yp@@%2)
            + 2*(xv@@-xr@@) + 8*(xv@@!=0);
          qu=Q_TR_BL; B*;
          qu=Q_TL_BR; C*;

          # Reihe 5
          xp=xp@@+xv@@*5-xr@@; yp=yp@@+yv@@*5-yr@@; lies_feld;
          if farbe!=leer -> {
            file=farbe*dateien+11;
            qu=Q_BR_TL; B*; qu=Q_TR_BL; F*;
          };
          xp+=2*xr@@; yp+=2*yr@@; lies_feld;
          if farbe!=leer -> {
            file=farbe*dateien+12;
            qu=Q_BL_TR; C*; qu=Q_TL_BR; G*;
          };
          xp-=xr@@; yp-=yr@@; lies_feld;
          if farbe!=leer -> {
            file=farbe*dateien+10;
            qu=Q_BR_TL; B*; qu=Q_TR_BL; F*; qu=Q_BL_TR; C*; qu=Q_TL_BR; G*;
          };

          # Reihe 4
          xp=xp@@+xv@@*4-xr@@; yp=yp@@+yv@@*4-yr@@; lies_feld;
          if farbe!=leer -> {
            file=farbe*dateien+9;
            qu=Q_BR_TL; B*; qu=Q_TR_BL; F*;
          };
          xp+=2*xr@@; yp+=2*yr@@; lies_feld;
          if farbe!=leer -> {
            file=farbe*dateien+9;
            qu=Q_BL_TR; C*; qu=Q_TL_BR; G*;
          };
          xp-=xr@@; yp-=yr@@; lies_feld;
          if farbe!=leer -> {
            file=farbe*dateien+8;
            qu=Q_BR_TL; B*; qu=Q_TR_BL; F*; qu=Q_BL_TR; C*; qu=Q_TL_BR; G*;
          };

          # Reihe 3
          xp=xp@@+xv@@*3-xr@@; yp=yp@@+yv@@*3-yr@@; lies_feld;
          if farbe!=leer -> {
            file=farbe*dateien+7;
            qu=Q_BR_TL; B*; qu=Q_TR_BL; F*;
          };
          xp+=2*xr@@; yp+=2*yr@@; lies_feld;
          if farbe!=leer -> {
            file=farbe*dateien+6;
            qu=Q_BL_TR; C*; qu=Q_TL_BR; G*;
          };
          xp-=xr@@; yp-=yr@@; lies_feld;
          if farbe!=leer -> {
            file=farbe*dateien+5;
            qu=Q_BR_TL; B*; qu=Q_TR_BL; F*; qu=Q_BL_TR; C*; qu=Q_TL_BR; G*;
          };

          # Reihe 2
          xp=xp@@+xv@@*2-xr@@; yp=yp@@+yv@@*2-yr@@; lies_feld;
          if farbe!=leer -> {
            file=farbe*dateien+4;
            qu=Q_BR_TL; F*; qu=Q_TR_BL; J*;
          };
          xp+=2*xr@@; yp+=2*yr@@; lies_feld;
          if farbe!=leer -> {
            file=farbe*dateien+4;
            qu=Q_BL_TR; G*; qu=Q_TL_BR; K*;
          };
          xp-=xr@@; yp-=yr@@; lies_feld;
          if farbe!=leer -> {
            file=farbe*dateien+3;
            qu=Q_BR_TL; F*; qu=Q_TR_BL; J*; qu=Q_BL_TR; G*; qu=Q_TL_BR; K*;
          };

          # Reihe 1
          xp=xp@@+xv@@; yp=yp@@+yv@@; lies_feld;
          if farbe!=leer -> {
            file=farbe*dateien+1;
            qu=Q_BR_TL; F*; qu=Q_TR_BL; J*; qu=Q_BL_TR; G*; qu=Q_TL_BR; K*;
          };

          # Rahmen
          0;
          qu=Q_TL; A*;
          qu=Q_TR; B*;
          qu=Q_BL; C*;
          qu=Q_BR; D*;

        } else -> {
          xx = (loc_x-3)%4;
          yy = loc_y%4;

          if yy<2 -> {  # Himmel
            pos = xx+4*yy;
            file = (farben+6)*dateien + 18 + xv@@ + yv@@ + (xv@@!=0);
            *;
          };
          if yy>=2 -> {  # Boden
            pos = xx+4*yy-8;
            file = 5+(farben+6)*dateien + xp@@%2 - 2*(1-yp@@%2)
              + 2*(xv@@-xr@@) + 8*(xv@@!=0);
            *;
          };

          if yy>=1 -> {
            pos=xx+4*yy-4;
            if yy<3 -> switch { # Reihe 5
              xx==0 -> {
                xp=xp@@+xv@@*5-xr@@*5; yp=yp@@+yv@@*5-yr@@*5; lies_feld;
                if farbe!=leer -> {
                  file=farbe*dateien+10;
                  [qu=Q_TL] *; [qu=Q_BL] *;
                };
                xp+=xr@@; yp+=yr@@; lies_feld;
                if farbe!=leer -> {
                  file=farbe*dateien+11;
                  *;
                };
                xp+=xr@@; yp+=yr@@; lies_feld;
                if farbe!=leer -> {
                  file=farbe*dateien+12;
                  *;
                };
                xp+=xr@@; yp+=yr@@; lies_feld;
                if farbe!=leer -> {
                  file=farbe*dateien+10;
                  [qu=Q_TR] *; [qu=Q_BR] *;
                };
              };
              xx==1 -> {
                xp=xp@@+xv@@*5-xr@@*2; yp=yp@@+yv@@*5-yr@@*2; lies_feld;
                if farbe!=leer -> {
                  file=farbe*dateien+10;
                  [qu=Q_TL] *; [qu=Q_BL] *;
                };
                xp+=xr@@; yp+=yr@@; lies_feld;
                if farbe!=leer -> {
                  file=farbe*dateien+11;
                  *;
                };
                xp+=xr@@; yp+=yr@@; lies_feld;
                if farbe!=leer -> {
                  file=farbe*dateien+10;
                  [qu=Q_TR] *; [qu=Q_BR] *;
                };
              };
              xx==2 -> {
                xp=xp@@+xv@@*5+xr@@*2; yp=yp@@+yv@@*5+yr@@*2; lies_feld;
                if farbe!=leer -> {
                  file=farbe*dateien+10;
                  [qu=Q_TR] *; [qu=Q_BR] *;
                };
                xp-=xr@@; yp-=yr@@; lies_feld;
                if farbe!=leer -> {
                  file=farbe*dateien+12;
                  *;
                };
                xp-=xr@@; yp-=yr@@; lies_feld;
                if farbe!=leer -> {
                  file=farbe*dateien+10;
                  [qu=Q_TL] *; [qu=Q_BL] *;
                };
              };
              xx==3 -> {
                xp=xp@@+xv@@*5+xr@@*5; yp=yp@@+yv@@*5+yr@@*5; lies_feld;
                if farbe!=leer -> {
                  file=farbe*dateien+10;
                  [qu=Q_TR] *; [qu=Q_BR] *;
                };
                xp-=xr@@; yp-=yr@@; lies_feld;
                if farbe!=leer -> {
                  file=farbe*dateien+12;
                  *;
                };
                xp-=xr@@; yp-=yr@@; lies_feld;
                if farbe!=leer -> {
                  file=farbe*dateien+11;
                  *;
                };
                xp-=xr@@; yp-=yr@@; lies_feld;
                if farbe!=leer -> {
                  file=farbe*dateien+10;
                  [qu=Q_TL] *; [qu=Q_BL] *;
                };
              };
            };

          switch { # Reihen 4 und 3
            xx==0 -> {
              xp=xp@@+xv@@*4-xr@@*4; yp=yp@@+yv@@*4-yr@@*4; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+8;
                [qu=Q_TL] *; [qu=Q_BL] *;
              };
              xp+=xr@@; yp+=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+9;
                *;
              };
              xp+=xr@@; yp+=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+8;
                [qu=Q_TR] *; [qu=Q_BR] *;
              };

              xp=xp@@+xv@@*3-xr@@*3; yp=yp@@+yv@@*3-yr@@*3; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+5;
                *;
              };
              xp+=xr@@; yp+=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+6;
                *;
              };
              xp+=xr@@; yp+=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+7;
                *;
              };
            };
            xx==1 -> {
              xp=xp@@+xv@@*4-xr@@*2; yp=yp@@+yv@@*4-yr@@*2; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+8;
                [qu=Q_TL] *; [qu=Q_BL] *;
              };
              xp+=xr@@; yp+=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+9;
                *;
              };
              xp+=xr@@; yp+=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+8;
                [qu=Q_TR] *; [qu=Q_BR] *;
              };

              xp=xp@@+xv@@*3-xr@@*2; yp=yp@@+yv@@*3-yr@@*2; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+6;
                *;
              };
              xp+=xr@@; yp+=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+7;
                *;
              };
              xp+=xr@@; yp+=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+5;
                *;
              };
            };
            xx==2 -> {
              xp=xp@@+xv@@*4+xr@@*2; yp=yp@@+yv@@*4+yr@@*2; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+8;
                [qu=Q_TR] *; [qu=Q_BR] *;
              };
              xp-=xr@@; yp-=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+9;
                *;
              };
              xp-=xr@@; yp-=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+8;
                [qu=Q_TL] *; [qu=Q_BL] *;
              };

              xp=xp@@+xv@@*3+xr@@*2; yp=yp@@+yv@@*3+yr@@*2; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+7;
                *;
              };
              xp-=xr@@; yp-=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+6;
                *;
              };
              xp-=xr@@; yp-=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+5;
                *;
              };
            };
            xx==3 -> {
              xp=xp@@+xv@@*4+xr@@*4; yp=yp@@+yv@@*4+yr@@*4; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+8;
                [qu=Q_TR] *; [qu=Q_BR] *;
              };
              xp-=xr@@; yp-=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+9;
                *;
              };
              xp-=xr@@; yp-=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+8;
                [qu=Q_TL] *; [qu=Q_BL] *;
              };

              xp=xp@@+xv@@*3+xr@@*3; yp=yp@@+yv@@*3+yr@@*3; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+5;
                *;
              };
              xp-=xr@@; yp-=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+7;
                *;
              };
              xp-=xr@@; yp-=yr@@; lies_feld;
              if farbe!=leer -> {
                file=farbe*dateien+6;
                *;
              };
            };
          };
        };

        pos=xx+4*yy;
        switch { # Reihen 2 und 1
          xx==0 -> {
            xp=xp@@+xv@@*2-xr@@*2; yp=yp@@+yv@@*2-yr@@*2; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+3;
              *;
            };
            xp+=xr@@; yp+=yr@@; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+4;
              *;
            };

            xp=xp@@+xv@@-xr@@; yp=yp@@+yv@@-yr@@; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+2;
              *;
            };
            xp+=xr@@; yp+=yr@@; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+1;
              *;
            };
          };
          xx==1 -> {
            xp=xp@@+xv@@*2-xr@@; yp=yp@@+yv@@*2-yr@@; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+4;
              *;
            };
            xp+=xr@@; yp+=yr@@; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+3;
              *;
            };

            xp=xp@@+xv@@-xr@@; yp=yp@@+yv@@-yr@@; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+2;
              *;
            };
            xp+=xr@@; yp+=yr@@; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+1;
              *;
            };
          };
          xx==2 -> {
            xp=xp@@+xv@@*2+xr@@; yp=yp@@+yv@@*2+yr@@; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+4;
              *;
            };
            xp-=xr@@; yp-=yr@@; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+3;
              *;
            };

            xp=xp@@+xv@@+xr@@; yp=yp@@+yv@@+yr@@; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+2;
              *;
            };
            xp-=xr@@; yp-=yr@@; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+1;
              *;
            };
          };
          xx==3 -> {
            xp=xp@@+xv@@*2+xr@@*2; yp=yp@@+yv@@*2+yr@@*2; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+3;
              *;
            };
            xp-=xr@@; yp-=yr@@; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+4;
              *;
            };

            xp=xp@@+xv@@+xr@@; yp=yp@@+yv@@+yr@@; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+2;
              *;
            };
            xp-=xr@@; yp-=yr@@; lies_feld;
            if farbe!=leer -> {
              file=farbe*dateien+1;
              *;
            };
          };
        };

        farbe = rand;

        Rahmen;
      };
    >>
  }

}


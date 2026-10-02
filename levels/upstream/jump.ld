#
#   Copyright 2008 by Mark Weyer
#   Modified 2010,2011 by Mark Weyer
#   Maintenance modifications 2014 by the cuyo developers
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


Jump = {
  # TRANSLATORS: "Jump" is as in the computer game genre jump-and-run, only
  # without the run
  name = "Jump"
  author = "Mark Weyer"
  # TRANSLATORS: "8 bit" refers to an era of computer games
  description[geek] = "8 bit nostalgia"
  farben = 5
  pics = Avatar, Gift * <farben>
  startpic = Naegel
  emptypic = Luft
  startdist = ".*...*..**",".*****..**",".******.**","**********"
  numexplode[easy] = 3
  numexplode = 4
  numexplode[hard] = 5
  bgcolor = 0,0,0
  nogreyprob = 1
  quelle_dauer = 125

  <<
    var gesch, tot, y_soll, y_ist, steht;
    var pf1_x, pf1_y, pf1_d, pf1_v, pf1_l, pf1_z;
    var pf2_x, pf2_y, pf2_d, pf2_v, pf2_l, pf2_z;
    var qu_x, qu_y, qu_f1, qu_f2, qu_zeit;

    var farbe = farben : reapply;

    quelle_neu = {
      qu_x = -1;
    };

    tropf = {
      if farbe@@0 != farben -> {
        farbe@@(loc_x@@0, loc_y@@0) = farbe@@0;
        farbe@@(loc_x@@1, loc_y@@1) = farbe@@1;
      };
    };

    semiglobal.init = {
      bonus(100);
      pf1_y = -10;
      pf2_y = -10;
      quelle_neu;
    };

    semiglobal = {
      if loc_yy@@0 > loc_yy@@1
        -> y_ist = loc_yy@@0
        else -> y_ist = loc_yy@@1;

      # Quelle
      if qu_x==-1 -> { # Keine Quelle vorhanden, also neue suchen
        qu_x = 1+rnd(8);
        qu_y = 3+rnd(7);
        if (kind@@(qu_x,qu_y) == Luft) && (qu_y >= time/32/50) -> {
          qu_f1 = rnd(farben);
          qu_f2 = rnd(farben);
          qu_zeit = quelle_dauer + 10;
        } else -> qu_x=-1;
      } else -> # Es gibt eine Quelle
        if qu_zeit==0 -> quelle_neu
        else qu_zeit-=1;

      # Bewegung Plattform 1
      if pf1_d==0
        -> {
          pf1_y = rnd(6)+5;
          pf1_l = 3+rnd(3);
          pf1_v = 5+rnd(10);
          pf1_z = pf1_v;
          if 1:2 -> {pf1_d = 1; pf1_x = -pf1_l;}
            else -> {pf1_d = -1; pf1_x = 10;};
        }
        else -> {
          pf1_z -=1;
          if pf1_z==0 -> {
            pf1_x+=pf1_d; pf1_z=pf1_v;
            if ((pf1_d==1) && (pf1_x==10)) || ((pf1_d==-1) && (pf1_x==-pf1_l))
              -> pf1_d=0;
          };
        };

      # Bewegung Plattform 2
      if pf2_d==0
        -> {
          pf2_y = rnd(6)+5;
          pf2_l = 3+rnd(3);
          pf2_v = 5+rnd(10);
          pf2_z = pf2_v;
          if 1:2 -> {pf2_d = 1; pf2_x = -pf2_l;}
            else -> {pf2_d = -1; pf2_x = 10;};
        }
        else -> {
          pf2_z -=1;
          if pf2_z==0 -> {
            pf2_x+=pf2_d; pf2_z=pf2_v;
            if ((pf2_d==1) && (pf2_x==10)) || ((pf2_d==-1) && (pf2_x==-pf2_l))
              -> pf2_d=0;
          };
        };

      # Interaktion Plattformen-Spieler
      steht = 0;
      if ((pf1_x<=loc_x@@0) && (pf1_x+pf1_l>loc_x@@0) ||
            (pf1_x<=loc_x@@1) && (pf1_x+pf1_l>loc_x@@1)) &&
          (y_soll >= pf1_y*32) && (y_soll <= pf1_y*32+gesch)
        -> {y_soll = pf1_y*32; steht+=1;};
      if ((pf2_x<=loc_x@@0) && (pf2_x+pf2_l>loc_x@@0) ||
            (pf2_x<=loc_x@@1) && (pf2_x+pf2_l>loc_x@@1)) &&
          (y_soll >= pf2_y*32) && (y_soll <= pf2_y*32+gesch)
        -> {y_soll = pf2_y*32; steht+=2;};
      if (steht==3) && (pf2_y>pf1_y) -> y_soll = pf1_y*32;
      if steht>0 -> {gesch=0; steht=1;};

      #Interaktion Quelle-Spieler
      if (qu_zeit<=quelle_dauer) && (((loc_x@@0==qu_x) && (loc_y@@0==qu_y))
          || ((loc_x@@1==qu_x) && (loc_y@@1==qu_y))) -> {
        if farbe@@0 != farben -> tropf;
        farbe@@0 = qu_f1;
        farbe@@1 = qu_f2;
        quelle_neu;
      };

      # Bewegung Spieler
      if !steht -> {
        y_soll = y_soll + gesch;
        gesch += 3;
        if gesch>64 -> gesch=64;
      };
      falling_speed = y_soll-y_ist;
      falling_fast_speed = y_soll-y_ist;
      if tot -> falling_fast_speed = 32;
    };

    semiglobal.keyturn = {
      if steht -> gesch=-30;
    };

    semiglobal.keyfall = {
      tropf;
      if steht && (((loc_x@@0==qu_x) && (loc_y@@0==qu_y-1))
          || ((loc_x@@1==qu_x) && (loc_y@@1==qu_y-1))) -> {
        farbe@@0 = qu_f1;
        farbe@@1 = qu_f2;
        quelle_neu;
      } else -> {
        farbe@@0 = farben;
        farbe@@1 = farben;
      };
    };


    sprites = {
      if (loc_x==qu_x@@) && (loc_y==qu_y@@)
          && ((qu_zeit@@ % 2) || (qu_zeit@@ == 25..quelle_dauer)) -> {
        M;
        file = qu_f1@@;
        qu=Q_TL; *; qu=Q_BR; *;
        file = qu_f2@@;
        qu=Q_TR; *; qu=Q_BL; *;
        qu=Q_ALL;
      };
      file = farben;
      if loc_y==pf1_y@@+1
        -> switch {
          loc_x==pf1_x@@ -> A*;
          loc_x==pf1_x@@+pf1_l@@-1 -> C*;
          loc_x-pf1_x@@ == 1..pf1_l@@-2 -> B*;
        };
      if loc_y==pf2_y@@+1
        -> switch {
          loc_x==pf2_x@@ -> A*;
          loc_x==pf2_x@@+pf2_l@@-1 -> C*;
          loc_x-pf2_x@@ == 1..pf2_l@@-2 -> B*;
        };
    };


    var avricht;

    Avatar.init = {
      weight = 0;  # (Zur Sicherheit)
      if loc_x==4
        -> avricht=0
        else -> avricht=2;
      y_soll@@ = loc_yy;
      falling_speed@@ = 0;
      falling_fast_speed@@ = 0;
      gesch@@ = 0;
      tot@@=0;
    };

    Avatar = {
      file = farbe;
      pos=3*avricht+turn;
      *;
    };

    Avatar.turn = {
      avricht = (avricht+1)%4;
    };

    Avatar.land = {bonus(-5); explode; tot@@=1};


    Gift = {
      weight = 1;
      file = kind-Gift;
      O*;
      sprites;
    };


    Naegel = {
      file = farben+1;
      if kind@(0,-1)==kind
        -> {C*; B; *@(0,-1)}
        else -> A*;
      sprites;
    };


    Luft = {
      if farbe != farben -> {
        file = farbe; N*;
        if kind@(0,1) == Luft -> {
          if farbe@(0,1) == farben -> {
            farbe@(0,1) = farbe;
            farbe = farben;
          };
        } else -> { kind = Gift+farbe; };
      };
      sprites;
    };

  >>

  Avatar = {
    pics = mjZeug1.xpm, mjZeug2.xpm, mjZeug3.xpm, mjZeug4.xpm, mjZeug5.xpm,
           mjZeug6.xpm
  }

  Gift = {
    pics = mjZeug1.xpm, mjZeug2.xpm, mjZeug3.xpm, mjZeug4.xpm, mjZeug5.xpm,
           mjPlattform.xpm
    colourprob = 0
  }

  Naegel = {
    pics = mjZeug1.xpm, mjZeug2.xpm, mjZeug3.xpm, mjZeug4.xpm, mjZeug5.xpm,
           mjPlattform.xpm, mjNaegel.xpm
  }

  Luft = {
    pics = mjZeug1.xpm, mjZeug2.xpm, mjZeug3.xpm, mjZeug4.xpm, mjZeug5.xpm,
           mjPlattform.xpm
  }

}


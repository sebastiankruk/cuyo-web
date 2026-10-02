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
#   baAliens.xpm[.gz], baAnzeige.xpm[.gz], baBlue.xpm[.gz], baGreen.xpm[.gz],
#   baPower.xpm[.gz], baRaumschiff.xpm[.gz], baRed.xpm[.gz], baSchuss.xpm[.gz],
#   baWarnship.xpm[.gz], baYellow.xpm[.gz]
#

# Status: (M=Muss, S=Soll, K=Kann, F=Feature, B=Bugs)
#
# FS Alarm-Alien ist noch etwas langweilig
# FK Diverse Gadgets zum Einsammeln fehlen noch
# BK Bei Explosionen sperrt die Tastatur für kurze Zeit
# FS Feinjustierung
# BS Synchrones Ansteigen im 2er-Modus, y-Korrektur bei Zeilenwechsel

Aliens =
{
  name     = "Aliens"
  author = "Berni"


  greypic   = bpStein.xpm
  startpic  = Alien
  pics = Red,Green,Blue,Yellow,Empty

  startdist = "DAAAAAAAAD","DCCBBBBCCD"
  mirror    = 1

  numexplode = 4
  chaingrass = 1

  textcolor  = 160,160,160
  bgcolor    = 0,0,0
  topcolor   = 192,192,192
  topoverlap = 0
  toptime    = 50

  p_shoot = 500
  p_shoot[hard] = 150

  <<
    var xc = 4;
    var yc = 1;
    var shoot = 1;
    var lives = 3;
    var next1 = -1;
    var next2 = -1;
    
    var pot, row, col;

    var ashoot0 = 0;
    var ashoot1 = 0;
    var ashoot2 = 0;
    var ashoot3 = 0;
    var ashoot4 = 0;
    var ashoot5 = 0;
    var ashoot6 = 0;
    var ashoot7 = 0;
    var ashoot8 = 0;
    var ashoot9 = 0;

    var ich_bin_counter = 0;
    var alienclock = 0;
    var aliengymnastics = 0;
    var aliendir = 0;        # 0 = links, 1 = rechts
    var exploschiff = 0;

    var counter = 1350;
    var alarm = 0;
    var ac = 0;

    init_all = {
      kind = Empty;
      if loc_x==4
        -> { 
          ich_bin_counter = 1;
          yc@@ = loc_y+1;
        }
      else ich_bin_counter = 0;
    };

    Empty.init  = init_all;
    Red.init    = init_all;
    Blue.init   = init_all;
    Green.init  = init_all;
    Yellow.init = init_all;

    schuss = {
      if 18-loc_y!=yc@@ -> 0A*
      else kind@(0,0) = nothing;
    };

      get = {
        switch {
          col == 0 -> row = ashoot0@@;
          col == 1 -> row = ashoot1@@;
          col == 2 -> row = ashoot2@@;
          col == 3 -> row = ashoot3@@;
          col == 4 -> row = ashoot4@@;
          col == 5 -> row = ashoot5@@;
          col == 6 -> row = ashoot6@@;
          col == 7 -> row = ashoot7@@;
          col == 8 -> row = ashoot8@@;
          col == 9 -> row = ashoot9@@;
        };
      };

      set = {
        switch {
          col == 0 -> ashoot0@@ = row;
          col == 1 -> ashoot1@@ = row;
          col == 2 -> ashoot2@@ = row;
          col == 3 -> ashoot3@@ = row;
          col == 4 -> ashoot4@@ = row;
          col == 5 -> ashoot5@@ = row;
          col == 6 -> ashoot6@@ = row;
          col == 7 -> ashoot7@@ = row;
          col == 8 -> ashoot8@@ = row;
          col == 9 -> ashoot9@@ = row;
        };
      };

  >>

  semiglobal = {
    pics = baRaumschiff.xpm,baAnzeige.xpm,baPower.xpm,
           baRed.xpm,baGreen.xpm,baBlue.xpm,baYellow.xpm,
           baSchuss.xpm,explosion.xpm,baWarnship.xpm
    <<
      aliens = {
        # max = kgv(10,100)
      
        if alienclock@@==999 -> { alienclock@@ = 0; }
        else alienclock@@+=1;

        aliengymnastics@@ = (alienclock@@%10)/5;
        aliendir@@ = (alienclock@@%100)/50;
      };

      alienshoot = {
        get;
        if row!=0 -> {
          7A*@@(col,row);
          row-=1;
          set;
          if row==yc@@+1 && (col==xc@@ || col==xc@@+1) -> exploschiff@@ = 1;
        }
      };

      ashooting = {
        [ col = 0 ] alienshoot;
        [ col = 1 ] alienshoot;
        [ col = 2 ] alienshoot;
        [ col = 3 ] alienshoot;
        [ col = 4 ] alienshoot;
        [ col = 5 ] alienshoot;
        [ col = 6 ] alienshoot;
        [ col = 7 ] alienshoot;
        [ col = 8 ] alienshoot;
        [ col = 9 ] alienshoot;
      };

      shooting = {
        if next1@@ == -1 -> next1@@ = rnd(4);
        if next2@@ == -1 -> next2@@ = rnd(4);
      
        if shoot@@==0 -> {
          if kind@@(xc@@,yc@@+1)==nothing && kind@@(xc@@,yc@@+2)==nothing &&
             kind@@(xc@@+1,yc@@+1)==nothing && kind@@(xc@@+1,yc@@+2)==nothing &&
             next1@@ != -1 && next2@@ != -1
            -> {
              kind@@(xc@@,yc@@+1) = Red+next1@@;
              kind@@(xc@@+1,yc@@+1) = Red+next2@@;
              next1@@ = -1;
              next2@@ = -1;
            };
          shoot@@ = 10;
        };
        if shoot@@>1 -> shoot@@-=1;
      };

      semiglobal = {

        if counter@@<=0 ->
          { alarm@@ = 1; counter@@=1550; message("Hurry up!!!");}
        else
          counter@@ -= 1;

        if alarm@@ -> {
          9;
          A*@@(alarm@@-3,yc@@+5);
          B*@@(alarm@@-2,yc@@+5);
          C*@@(alarm@@-1,yc@@+5);
          D*@@(alarm@@-3,yc@@+4);
          E*@@(alarm@@-2,yc@@+4);
          F*@@(alarm@@-1,yc@@+4);
          if ac@@>=3 -> {
            alarm@@+=1; ac@@ = 0;
          }
          else {
            ac@@ += 1;
          };
          
        };

        aliens;
        
        ashooting;

        shooting;
        
        # Raumschiff Zeichnen
        0A;*@@(xc@@,yc@@+1);
        0B;*@@(xc@@+1,yc@@+1);
        if exploschiff@@ => {
          8;A,B,C,D,E,F,G,
            {H;exploschiff@@ = 0;xc@@=4;lives@@-=1; if !lives@@ -> lose};
          *@@(xc@@,yc@@+1);*@@(xc@@+1,yc@@+1);
        };
        
        # Armaturenbrett
        1A;
        *@@(0,yc@@);
        *@@(1,yc@@);
        *@@(2,yc@@);
        *@@(3,yc@@);
        *@@(4,yc@@);
        *@@(5,yc@@);
        *@@(6,yc@@);
        *@@(7,yc@@);
        *@@(8,yc@@);
        *@@(9,yc@@);
        
        # Power-Anzeige
        2;
        pos = shoot@@*3;
        *@@(0,yc@@);
        pos = shoot@@*3+1;
        *@@(1,yc@@);
        pos = shoot@@*3+2;
        *@@(2,yc@@);

        # Lives-Anzeige
        1C;
        if lives@@>=1 -> *@@(9,yc@@);
        if lives@@>=2 -> *@@(8,yc@@);
        if lives@@>=3 -> *@@(7,yc@@);
        
        # Naechste Schuesse-Anzeige
        if next1@@ != -1 -> {
          file=3+next1@@;B;
          qu=Q_TR;*@@(4,yc@@);
          qu=Q_BR;*@@(4,yc@@);
        };
        if next2@@ != -1 -> {
          file=3+next2@@;B;
          qu=Q_TL;*@@(5,yc@@);
          qu=Q_BL;*@@(5,yc@@);
        };
        qu = Q_ALL;
        
        # Vorhang
        1B;
        *@@(0,yc@@-1);
        *@@(1,yc@@-1);
        *@@(2,yc@@-1);
        *@@(3,yc@@-1);
        *@@(4,yc@@-1);
        *@@(5,yc@@-1);
        *@@(6,yc@@-1);
        *@@(7,yc@@-1);
        *@@(8,yc@@-1);
        *@@(9,yc@@-1);
        *@@(0,yc@@-2);
        *@@(1,yc@@-2);
        *@@(2,yc@@-2);
        *@@(3,yc@@-2);
        *@@(4,yc@@-2);
        *@@(5,yc@@-2);
        *@@(6,yc@@-2);
        *@@(7,yc@@-2);
        *@@(8,yc@@-2);
        *@@(9,yc@@-2);
      };
    >>
  }

  Alien =
  {
    pics = baAliens.xpm
    versions = 3
    
    <<
      var moving = 7;
      var movingnext = 0;
    
      Alien.init = {
        if version==3 -> kind = Empty;
      };
    
      Alien = {
        pos=version*2+aliengymnastics@@;*;

        if informational -> {
          if 1:5 => {,,,,,version=rnd(3)};
        }
        else {

          if movingnext || movingnext@(0,1) || movingnext@(0,-1) -> {
            movingnext = 0;
            if aliendir@@==0 -> {
              # Nach links!
              if kind@(-1,0)==Empty || kind@(-1,0)==nothing
                -> { kind@(-1,0)=Alien; version@(-1,0) = version; kind@(0,0)=kind@(-1,0); }
            }
            else {
              # Nach rechts!
              if kind@(1,0)==Empty || kind@(1,0)==nothing
                -> { kind@(1,0)=Alien; version@(1,0) = version; kind@(0,0)=kind@(1,0); }
            };
          }
          else {
            if 1:p_shoot -> {
             [ col = 9-loc_x ] get;
             if row==0 -> {
               [ col = 9-loc_x ] [ row = 18-loc_y ] set;
             };
            };
          };

          moving-=1;
          if moving<0 -> {
            moving = 5+rnd(10);
            movingnext = 1;
          };

  #        out1 = counter@@;
  #        out2 = loc_y;
  #        out1 = alienclock@@;
  #        out2 = aliengymnastics@@;
        };
      };
    >>
  }

  Red = 
  {
     pics = baRed.xpm
     
     << Red = schuss; >>
  }

  Blue = 
  {
     pics = baBlue.xpm
     
     << Blue = schuss; >>
  }
  
  Green = 
  {
     pics = baGreen.xpm

     << Green = schuss; >>
  }

  Yellow = 
  {
     pics = baYellow.xpm
     
     << Yellow = schuss; >>
  }

  Empty = 
  {
     pics = bpPingu.xpm
     neighbours = <neighbours_none>

     <<
     
       Empty.keyleft = {
         if ich_bin_counter && xc@@>0 -> xc@@ -= 1; 
       };
       
       Empty.keyright = {
         if ich_bin_counter && xc@@<8 -> xc@@ += 1;
       };

       Empty.keyfall = {
         if ich_bin_counter && shoot@@==1 -> shoot@@ = 0;
       };

       Empty.keyturn = {
         next1@@ = next2@@;
         next2@@ = next1@@;
       };
       
       Empty.land = {
         kind@(0,0) = nothing;
       };
       
       Empty = { };
     >>
  }
  

}

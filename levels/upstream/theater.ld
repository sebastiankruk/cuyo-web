#
#   Copyright 2008,2014 by Immanuel Halupczok
#   Copyright 2011 by Mark Weyer
#   Maintenance modifications 2008,2011,2012,2014 by the cuyo developers
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
#   ithBlauBlah.xpm[.gz], ithBlauH.xpm[.gz], ithBlauL.xpm[.gz],
#   ithBlauR.xpm[.gz], ithBlauV.xpm[.gz], ithBlau.xpm[.gz], ithDreck1.xpm[.gz],
#   ithDreck2.xpm[.gz], ithDreck3.xpm[.gz], ithDreckExpl.xpm[.gz],
#   ithGelbBlah.xpm[.gz], ithGelbH.xpm[.gz], ithGelbL.xpm[.gz],
#   ithGelbR.xpm[.gz], ithGelbV.xpm[.gz], ithGelb.xpm[.gz],
#   ithGruenBlah.xpm[.gz], ithGruenH.xpm[.gz], ithGruenL.xpm[.gz],
#   ithGruenR.xpm[.gz], ithGruenV.xpm[.gz], ithGruen.xpm[.gz],
#   ithOrangeBlah.xpm[.gz], ithOrangeH.xpm[.gz], ithOrangeL.xpm[.gz],
#   ithOrangeR.xpm[.gz], ithOrangeV.xpm[.gz], ithOrange.xpm[.gz],
#   ithRosaBlah.xpm[.gz], ithRosaH.xpm[.gz], ithRosaL.xpm[.gz],
#   ithRosaR.xpm[.gz], ithRosaV.xpm[.gz], ithRosa.xpm[.gz], ithRotBlah.xpm[.gz],
#   ithRotH.xpm[.gz], ithRotL.xpm[.gz], ithRotR.xpm[.gz], ithRotV.xpm[.gz],
#   ithRot.xpm[.gz], ithSitz.xpm[.gz], ithVorhang.xpm[.gz]
#

# referenced from labskaus.ld

Theater={
  name="Theater"
  author="Immi"
  numexplode=6
  chaingrass=0
  pics=gelb,gruen,orange,rosa,rot,blau
#  pics[hard]=gelb,gruen,orange,rosa,rot,blau
#  pics=gelb,gruen,orange,rosa,rot
#  pics[easy]=gelb,gruen,orange,rosa
  bgcolor=50,0,0
  topcolor=45,0,0
  toppic=ithVorhang.xpm
  topoverlap=22
  topstop=15
  textcolor=150,0,0
  toptime=50
  startpic=Sitz
  startdist="...****...",
            "**.****.**","**.****.**","**.****.**","**.****.**",
            "**.****.**","**.****.**","**.****.**","**.****.**",
            "**.****.**","**.****.**"
  startdist[easy]="...****...",
            "**.****.**","**.****.**","**.****.**","**.****.**",
            "**.****.**","**.****.**","**.****.**","**.****.**"
  #startdist="...****.............",
  #          "**.****.**..........","**.****.**..........","**.****.**..........","**.****.**..........",
  #          "**.****.**..........","**.****.**..........","**.****.**..........","**.****.**.......*.."
  greypic=dreck
  randomgreys[hard,1]=40
  randomgreys[1]=50
  randomgreys[easy,1]=-1
  nogreyprob=1
  emptypic = Leer
  description="Please keep quiet. Otherwise you will be blasted."
  explosionpic = ithDreckExpl.xpm
  
  <<
  # Die Ebene mit den Sitzen findet nur in Variablen von semiglobal statt.
  # Die Blobs melden das Verschwinden von Sitzen beim semiglobal an - da
  # dies nicht mit Nachrutschen kommutiert, führen sie es nicht gleich aus.
  # Das macht der semiglobal dann schon selbst im nächsten Schritt, zusammen
  # mit dem Nachrutschen. Und noch einen Schritt später sehen die Blobs dann
  # das Ergebnis. Damit Synchronität gewahrt bleibt, melden die Blobs das
  # Verschwinden 2 Zeitschritte an, bevor es passiert. Ja, richtig: Wir
  # haben 0,16s Präkognition.

  var sitz0,sitz1,sitz2,sitz3,sitz4,sitz5,sitz6,sitz7,sitz8,sitz9,sitz;
    # Bitfelder, spaltenweise, die angeben, wo noch Sitze sind.
    # Genauer: Der Wert dieser Variablen am *Anfang* der animiere-Gleichzeit
    # gibt die Position der Sitze an (so dass sie mit @@ ausgelesen werden kann)
    # Bit 2^0 ist ganz unten.
    # Die mit Ziffer sind für eine Spalte und wohnen im semiglobal.
    # Der andere ist die Variable, mit der gearbeitet wird.
  var besetzt0,besetzt1,besetzt2,besetzt3,besetzt4,besetzt5,besetzt6,besetzt7,besetzt8,besetzt9,besetzt;
    # Bitfelder, die angeben, wo sich ein blob befindet (Kugel oder Dreck,
    # mit oder ohne Sitz). Genauer: Am *Ende* jeder Gleichzeit werden
    # dieser Werte (mit Zukunftszuweisungen) aktualisiert. Bis zur nächsten
    # Aktualisierung wird versucht, die Werte aktuell zu halten
  var weg0,weg1,weg2,weg3,weg4,weg5,weg6,weg7,weg8,weg9,weg;
    # Gibt an, welche Blops gleich platzen werden.
  var spalte;
  var hetz = 2097152;  # Das Limit für sitz, das dem Hetzrand entspricht.
                       # Ist um Faktor 2 zu hoch, da es gleich im nullten
                       # Schritt kleiner gemacht wird.

  # Zugriff auf die Variablen durch semiglobal:
  lies0 = {sitz=sitz0; besetzt=besetzt0; weg=weg0; spalte=0;};
  lies1 = {sitz=sitz1; besetzt=besetzt1; weg=weg1; spalte=1;};
  lies2 = {sitz=sitz2; besetzt=besetzt2; weg=weg2; spalte=2;};
  lies3 = {sitz=sitz3; besetzt=besetzt3; weg=weg3; spalte=3;};
  lies4 = {sitz=sitz4; besetzt=besetzt4; weg=weg4; spalte=4;};
  lies5 = {sitz=sitz5; besetzt=besetzt5; weg=weg5; spalte=5;};
  lies6 = {sitz=sitz6; besetzt=besetzt6; weg=weg6; spalte=6;};
  lies7 = {sitz=sitz7; besetzt=besetzt7; weg=weg7; spalte=7;};
  lies8 = {sitz=sitz8; besetzt=besetzt8; weg=weg8; spalte=8;};
  lies9 = {sitz=sitz9; besetzt=besetzt9; weg=weg9; spalte=9;};

  schreib0 = {sitz0=sitz; besetzt0=besetzt; weg0=weg;};
  schreib1 = {sitz1=sitz; besetzt1=besetzt; weg1=weg;};
  schreib2 = {sitz2=sitz; besetzt2=besetzt; weg2=weg;};
  schreib3 = {sitz3=sitz; besetzt3=besetzt; weg3=weg;};
  schreib4 = {sitz4=sitz; besetzt4=besetzt; weg4=weg;};
  schreib5 = {sitz5=sitz; besetzt5=besetzt; weg5=weg;};
  schreib6 = {sitz6=sitz; besetzt6=besetzt; weg6=weg;};
  schreib7 = {sitz7=sitz; besetzt7=besetzt; weg7=weg;};
  schreib8 = {sitz8=sitz; besetzt8=besetzt; weg8=weg;};
  schreib9 = {sitz9=sitz; besetzt9=besetzt; weg9=weg;};

  var rowdown,rowup;
  # Werden in semiglobal auf 1 gesetzt, wenn grad der entsprechende event kam.

  semiglobal.init = {
    # Erst einmal alles voll. Die Leer-Blobs löschen dann schon raus.
    sitz0=1048575;
    sitz1=1048575;
    sitz2=1048575;
    sitz3=1048575;
    sitz4=1048575;
    sitz5=1048575;
    sitz6=1048575;
    sitz7=1048575;
    sitz8=1048575;
    sitz9=1048575;
  };

  var rueber_sitz; # flag für Sitze in der Rüber-Reihe. Lebt im Blob selbst.
                   # (Der Wert von rueber_sitz von blops, die nicht in der
                   # Rüber-Reihe sind, kann beliebig sein.)
  var fall;
  var my_exploding;

  semiglobal_spalte = {

    # Die Situation ist:
    # - besetzt enthält die Werte vom vorigen Spielschritt;
    #   nur Rüberreihen-Verschiebungen wurden schon angepasst
    # - sitz enthält die Werte vom aktuellen Spielschritt
    #   (und soll hinterher die Werte vom *nächsten* Spielschritt
    #   enthalten - außer Rüberreihen-Verschiebungen, die
    #   hinterher korrigiert werden)
    # - weg besagt, welche Blops in diesem oder im nächsten Spielschritt
    #   explodieren werden. Die Blop-Positionen sind die
    #   richtigen, da während einer Explosion nichts fallen kann.
    #   - my_exploding == 7: explodieren im nächsten Schritt
    #   - my_exploding == 8: explodieren in diesem Schritt

    ### Teil 1: besetzt aktuailisieren

    # Blops fallen lassen:
    # Bestimme unterste, nicht besetzte Position...
    fall = gcd(besetzt+1, 1048576);
    # ... und verschiebe alle blops ab da eins nach unten:
    besetzt=besetzt%fall + (besetzt-besetzt%fall)/2;

    # blops sprengen:
    if my_exploding == 8 -> besetzt .-= weg;

    # Jetzt sollte besetzt mit den aktuellen Blop-Positionen
    # übereinstimmen.

    ### Teil 2: fall für den nächsten Spielschritt bestimmen:

    # Im Prinzip sollte man auch erst die Sitze fallen lassen,
    # und dann evtl. Sprengungen entfernen. Allerdings ist (im
    # Gegensatz zu den echten Blops) nicht garantiert, dass
    # sprengen und fallen nicht gleichzeitig stattfinden kann.
    # Deshalb muss das sprengen ausgeführt werden, bevor die
    # fallenden Blops nach unten verschoben werden. Also:

    # Bestimme die unterste Position, die
    # weder besetzt ist, noch einen Sitz enthält:

    fall = gcd((sitz | besetzt)+1, 1048576);

    # Alle Sitze darüber werden gleich eins runterfallen. Allerdings
    # müssen vorher noch die gesprengten Sitze entfernt werden.

    if my_exploding == 7 -> sitz.-=weg;

    # fall orientiert sich am Zustand vor "sitz.-=weg". Das entspricht dem,
    # was auch die normalen Blobs machen: Nach dem Explodieren erst einmal
    # einen Zeitschritt leer sein, dann erst ggf. durch Nachrutschen ersetzt.
    sitz=sitz%fall + (sitz-sitz%fall)/2;

    if sitz>=hetz -> lose;

    weg=0;
  };

  semiglobal = {
    if !time%(32*toptime) -> hetz/=2;
    lies0; semiglobal_spalte; schreib0;
    lies1; semiglobal_spalte; schreib1;
    lies2; semiglobal_spalte; schreib2;
    lies3; semiglobal_spalte; schreib3;
    lies4; semiglobal_spalte; schreib4;
    lies5; semiglobal_spalte; schreib5;
    lies6; semiglobal_spalte; schreib6;
    lies7; semiglobal_spalte; schreib7;
    lies8; semiglobal_spalte; schreib8;
    lies9; semiglobal_spalte; schreib9;
    rowup=0;
    rowdown=0;
  };


  var dy = 0, oddRow;


  semiglobal_spalte_up = {
    sitz=sitz*2+rueber_sitz@@(spalte,19);
    # Die Rüberreihe ist komplett besetzt:
    besetzt=besetzt*2+1;
    weg*=2;
  };


  semiglobal.row_up = {
    dy+=1;
    rowup=1;
    lies0; semiglobal_spalte_up; schreib0;
    lies1; semiglobal_spalte_up; schreib1;
    lies2; semiglobal_spalte_up; schreib2;
    lies3; semiglobal_spalte_up; schreib3;
    lies4; semiglobal_spalte_up; schreib4;
    lies5; semiglobal_spalte_up; schreib5;
    lies6; semiglobal_spalte_up; schreib6;
    lies7; semiglobal_spalte_up; schreib7;
    lies8; semiglobal_spalte_up; schreib8;
    lies9; semiglobal_spalte_up; schreib9;   
  };


  semiglobal_spalte_down = {
    # Gut, daß in rüber-Reihen keine explodierenden Blobs sein können.
    # Daher kann weg nicht das Bit 2^0 gesetzt haben...
    rueber_sitz@@(spalte,20)=sitz%2; sitz/=2;
    besetzt/=2;
    weg/=2;
  };


  semiglobal.row_down = {
    dy-=1;
    rowdown=1;
    lies0; semiglobal_spalte_down; schreib0;
    lies1; semiglobal_spalte_down; schreib1;
    lies2; semiglobal_spalte_down; schreib2;
    lies3; semiglobal_spalte_down; schreib3;
    lies4; semiglobal_spalte_down; schreib4;
    lies5; semiglobal_spalte_down; schreib5;
    lies6; semiglobal_spalte_down; schreib6;
    lies7; semiglobal_spalte_down; schreib7;
    lies8; semiglobal_spalte_down; schreib8;
    lies9; semiglobal_spalte_down; schreib9;   
  };




  # Zugriff auf die Variablen durch die Blobs:
  var sitzl,sitzr;

  lies = {
    weg=0;
    switch {
      loc_x==0 -> {sitzl=0;       sitz=sitz0@@; sitzr=sitz1@@;};
      loc_x==1 -> {sitzl=sitz0@@; sitz=sitz1@@; sitzr=sitz2@@;};
      loc_x==2 -> {sitzl=sitz1@@; sitz=sitz2@@; sitzr=sitz3@@;};
      loc_x==3 -> {sitzl=sitz2@@; sitz=sitz3@@; sitzr=sitz4@@;};
      loc_x==4 -> {sitzl=sitz3@@; sitz=sitz4@@; sitzr=sitz5@@;};
      loc_x==5 -> {sitzl=sitz4@@; sitz=sitz5@@; sitzr=sitz6@@;};
      loc_x==6 -> {sitzl=sitz5@@; sitz=sitz6@@; sitzr=sitz7@@;};
      loc_x==7 -> {sitzl=sitz6@@; sitz=sitz7@@; sitzr=sitz8@@;};
      loc_x==8 -> {sitzl=sitz7@@; sitz=sitz8@@; sitzr=sitz9@@;};
      loc_x==9 -> {sitzl=sitz8@@; sitz=sitz9@@; sitzr=0;      };
    };
  };



  var maske;    # = 2^Zeile, wobei die Zeile 0 ganz unten ist.
                # Zeile 20 (die rüber-Reihe) wird anders gehandhabt.

  calc_maske = {
    if loc_y<20 -> {
      maske=1;
      if loc_y%2==0 -> maske*=2;
      if loc_y%4<2 -> maske*=4;
      if loc_y%8>=4 -> maske*=16;
      if loc_y==4..11 -> maske*=256;
      if loc_y<4 -> maske*=65536;
    } else maske=0;
  };



  bin_gleich_weg = switch {
    loc_x==0 -> {weg0@@.+=maske;};
    loc_x==1 -> {weg1@@.+=maske;};
    loc_x==2 -> {weg2@@.+=maske;};
    loc_x==3 -> {weg3@@.+=maske;};
    loc_x==4 -> {weg4@@.+=maske;};
    loc_x==5 -> {weg5@@.+=maske;};
    loc_x==6 -> {weg6@@.+=maske;};
    loc_x==7 -> {weg7@@.+=maske;};
    loc_x==8 -> {weg8@@.+=maske;};
    loc_x==9 -> {weg9@@.+=maske;};
  };

  bin_blop = switch {
    loc_x==0 -> {besetzt0@@.+=maske;};
    loc_x==1 -> {besetzt1@@.+=maske;};
    loc_x==2 -> {besetzt2@@.+=maske;};
    loc_x==3 -> {besetzt3@@.+=maske;};
    loc_x==4 -> {besetzt4@@.+=maske;};
    loc_x==5 -> {besetzt5@@.+=maske;};
    loc_x==6 -> {besetzt6@@.+=maske;};
    loc_x==7 -> {besetzt7@@.+=maske;};
    loc_x==8 -> {besetzt8@@.+=maske;};
    loc_x==9 -> {besetzt9@@.+=maske;};
  };

  bin_kein_blop = switch {
    loc_x==0 -> {besetzt0@@.-=maske;};
    loc_x==1 -> {besetzt1@@.-=maske;};
    loc_x==2 -> {besetzt2@@.-=maske;};
    loc_x==3 -> {besetzt3@@.-=maske;};
    loc_x==4 -> {besetzt4@@.-=maske;};
    loc_x==5 -> {besetzt5@@.-=maske;};
    loc_x==6 -> {besetzt6@@.-=maske;};
    loc_x==7 -> {besetzt7@@.-=maske;};
    loc_x==8 -> {besetzt8@@.-=maske;};
    loc_x==9 -> {besetzt9@@.-=maske;};
  };



  # gibt in einem Blop den Wert des besetzt-bits aus
  debug_besetzt = {
    calc_maske;
    switch {
      loc_x == 0 -> out1 = besetzt0@@.maske;
      loc_x == 1 -> out1 = besetzt1@@.maske;
      loc_x == 2 -> out1 = besetzt2@@.maske;
      loc_x == 3 -> out1 = besetzt3@@.maske;
      loc_x == 4 -> out1 = besetzt4@@.maske;
      loc_x == 5 -> out1 = besetzt5@@.maske;
      loc_x == 6 -> out1 = besetzt6@@.maske;
      loc_x == 7 -> out1 = besetzt7@@.maske;
      loc_x == 8 -> out1 = besetzt8@@.maske;
      loc_x == 9 -> out1 = besetzt9@@.maske;
    };
  };




  calcEvenOdd = {
    oddRow = (loc_y + dy@@) % 2;
  };

  malSitz={
    if oddRow -> {
      D*;
      A*@(0,-1);
      [qu=Q_TL] E@(1,0)*;
      [qu=Q_BL] E@(1,0)*;
      [qu=Q_BL] B*@(1,-1);
    } else -> {
      F*;
      C*@(0,-1);
      [qu=Q_TR] E@(-1,0)*;
      [qu=Q_BR] E@(-1,0)*;
      [qu=Q_BR] B*@(-1,-1);
    };
  };

  sitze = {

    if loc_y < 20 && sitz.maske || loc_y == 20 && rueber_sitz -> {
      behaviour.+=goalblob;
      calcEvenOdd;
      if exploding<=5 || kind==dreck -> malSitz;
    }
    else behaviour.-=goalblob;
    #debug_besetzt;
  };

  
  var guck=1:reapply;  # In welche Richtung gucken?
      # 1 = normal, 2 = li, 3 = re, 4 = vor, 5 = rueck
  var rede=0:reapply;  # Reden? Und: in welche Richtung?
  var pause=5:reapply; # Pause vor wieder in andere Richtung gucken
  var heimlich=0:reapply; # Heimlich auf einen Sitz gehen? Richtung?

  bla1L = {[qu=Q_TL_TR] *@(-1,0); [qu=Q_TR_TL] *};
  bla2L = {[qu=Q_BL_TR] *@(-1,0); [qu=Q_BR_TL] *};

  bla1R = {[qu=Q_TL_TR] *; [qu=Q_TR_TL] *@(1,0)};
  bla2R = {[qu=Q_BL_TR] *; [qu=Q_BR_TL] *@(1,0)};

  bla1V = {[qu=Q_TL_BL] *; [qu=Q_TR_BR] *};
  bla2V = {[qu=Q_BL_BL] *; [qu=Q_BR_BR] *};

  bla1H = {[qu=Q_TL_BL] *@(0,-1); [qu=Q_TR_BR] *@(0,-1)};
  bla2H = {[qu=Q_BL_BL] *@(0,-1); [qu=Q_BR_BR] *@(0,-1)};
  
  

  malSitzUndBenutzer = {
    # guck sollte der file-Wert sein mit den Bildern des Benutzers

    calcEvenOdd;
    sitze;

    file=guck;
    if exploding<=5 -> {
      if behaviour.goalblob -> {
        # Blop mit Sitz (ragt in das Feld darüber)
        if oddRow -> {A*@(0,-1); C*;} else -> {B*@(0,-1); D*;};
      } else -> {
        # Blop ohne Sitz
        if oddRow -> E* else -> F*;
      };
    };
  };
  

  malKugel = {
    calc_maske; lies;

    if exploding==7 || exploding==8 -> {
      bin_gleich_weg;
      my_exploding@@ = exploding;
    };

    if pause > 0 -> pause -= 1;
    if falling -> {
      6C*; pause=5;
    } else -> {
      switch {
        guck==2 -> {
          if kind@(-1,0) != kind ||
             1:20 && pause==0 && rede != 2 -> { guck=1; pause=10; }
        };
        guck==3 -> {
          if kind@(1,0) != kind ||
             1:20 && pause==0 && rede != 3 -> { guck=1; pause=10; }
        };
        guck==4 -> {
          if kind@(0,1) != kind ||
             1:20 && pause==0 && rede != 4 -> { guck=1; pause=10; }
        };
        guck==5 -> {
          if kind@(0,-1) != kind ||
             1:20 && pause==0 && rede != 5 -> { guck=1; pause=10; }
        };
        guck==1 && 1:4 -> {
          if kind@(-1,0) == kind && pause==0 -> {
            if 1:6 || guck@(-1,0) == 3 ->  { guck=2; pause=5; }
          };
        };
        guck==1 && 1:3 -> {
          if kind@(1,0) == kind && pause==0 -> {
            if 1:6 || guck@(1,0) == 2 ->  { guck=3; pause=5; }
          };
        };
        guck==1 && 1:2 -> {
          if kind@(0,1) == kind && pause==0 -> {
            if 1:6 || guck@(0,1) == 5 ->  { guck=4; pause=5; }
          };
        };
        guck==1 -> {
          if kind@(0,-1) == kind && pause==0 -> {
            if 1:6 || guck@(0,-1) == 4 ->  { guck=5; pause=5; }
          };
        };
      };

     # Variante A: Rede nicht, wenn die angesprochene Person
     # redet:
#      if rede == 0 && 1:20 -> {
#        if guck == 2 && rede@(-1,0) == 0  ||
#           guck == 3 && rede@(1,0) == 0  ||
#           guck == 4 && rede@(0,1) == 0  ||
#           guck == 5 && rede@(0,-1) == 0 ->
#          rede = guck;
#      };
      # Variante B: Rede nicht, wenn drumrum irgend jemand redet:
      if rede == 0 && 1:20 && guck != 1 &&
         rede@(-1,0) == 0 && rede@(1,0) == 0 &&
         rede@(0,1) == 0 && rede@(0,-1) == 0 ->
            rede = guck;

      # Über mir ist niemand und niemand ist in der Nähe, mit
      # dem ich mich unterhalten kann? Dann evtl. heimlich Sitzplatz
      # wechseln.
      if kind@(0,-1) == Leer && kind@(0,1) != kind &&
         kind@(-1,0) != kind && kind@(1,0) != kind && loc_y != 20 -> {
        switch {
          heimlich == 0 && 1:120 ->
            if kind@(-1,0) == Leer && sitzl.maske
              && !(kind@(-1,1) == Leer && sitzl.(maske/2)) ->
                       heimlich = 2;
          heimlich == 0 && 1:119 ->
            if kind@(1,0) == Leer && sitzr.maske
              && !(kind@(1,1) == Leer && sitzr.(maske/2)) ->
                       heimlich = 3;
          heimlich == 2  ->
            if !(kind@(-1,0) == Leer && sitzl.maske)
              || (kind@(-1,1) == Leer && sitzl.(maske/2)) ->
                       heimlich = 0;          
          heimlich == 3  ->
            if !(kind@(1,0) == Leer && sitzr.maske)
              || (kind@(1,1) == Leer && sitzr.(maske/2)) ->
                       heimlich = 0;          
        };
        
        if heimlich != 0 -> {
          # Kein Doppelpfeil bei den ifs; die heimlich-Sequenz wird
          # sofort abgebrochen, wenn was dazwischen kommt
          guck = 1, guck = 1, guck = 1, guck = 1, guck = 1, guck = 1,
          guck = 5 - heimlich, guck = 5 - heimlich, guck = 5 - heimlich,
          guck = 5 - heimlich, guck = 5 - heimlich,
          guck = 1, guck = 1,
          guck = heimlich, guck = heimlich, guck = heimlich,
          guck = heimlich, guck = heimlich,
          guck = 1, guck = 1,
          guck = 5 - heimlich, guck = 5 - heimlich, guck = 5 - heimlich,
          guck = 5 - heimlich, guck = 5 - heimlich,
          guck = 1, guck = 1,
          guck = heimlich, guck = heimlich, {
            guck = heimlich;
            if heimlich == 2 -> kind@(-1,0) = kind
            else -> kind@(1,0) = kind;
            kind@(0,0) = nothing;
          }
        };
        
      } else -> {
        # Evtl. wurde gerade eine heimlich-Sequenz abgebrochen:
        heimlich = 0;
      };

      malSitzUndBenutzer;

      6;
      if rede == 2 ->
        {A;bla1L},{A;bla1L},{A;bla2L},{A;bla2L},
        {B;bla1L},{B;bla1L},{B;bla2L},{B;bla2L;rede=0};
      if rede == 3 ->
        {A;bla1R},{A;bla1R},{A;bla2R},{A;bla2R},
        {B;bla1R},{B;bla1R},{B;bla2R},{B;bla2R;rede=0};
      if rede == 4 ->
        {A;bla1V},{A;bla1V},{A;bla2V},{A;bla2V},
        {B;bla1V},{B;bla1V},{B;bla2V},{B;bla2V;rede=0};
      if rede == 5 ->
        {A;bla1H},{A;bla1H},{A;bla2H},{A;bla2H},
        {B;bla1H},{B;bla1H},{B;bla2H},{B;bla2H;rede=0};

      bin_blop;
    };

    # Die explosionpic ist auf etwas gesetzt, was den Hintergrund
    # nicht löscht, damit Dreck die Sitze beim explodieren nicht
    # kaputt macht. Deshalb hier manuell die Explosion richtig
    # malen.
    if exploding -> { pos=exploding-1; 7*; };
  };

  landKugel={
    # Frisch gelandeten Blop gleich in das besetzt-Array eintragen.
    # Ist allerdings möglicherweise unnötig: Ein frisch gelandeter Blop
    # kann nicht an einer Stelle sein, wo er das Fallen eines Sitzes
    # verhindern würde.
    calc_maske;
    bin_blop;
  };
  
  
  >>
  gruen={
    pics=ithSitz.xpm,ithGruen.xpm,ithGruenL.xpm,ithGruenR.xpm,
                     ithGruenV.xpm,ithGruenH.xpm,ithGruenBlah.xpm,
         explosion.xpm
    << gruen=malKugel; gruen.land=landKugel; >>
  }
  gelb={
    pics=ithSitz.xpm,ithGelb.xpm,ithGelbL.xpm,ithGelbR.xpm,
                     ithGelbV.xpm,ithGelbH.xpm,ithGelbBlah.xpm,
         explosion.xpm
    << gelb=malKugel; gelb.land=landKugel; >>
  }
  orange={
    pics=ithSitz.xpm,ithOrange.xpm,ithOrangeL.xpm,ithOrangeR.xpm,
                     ithOrangeV.xpm,ithOrangeH.xpm,ithOrangeBlah.xpm,
         explosion.xpm
    << orange=malKugel; orange.land=landKugel; >>
  }
  rosa={
    pics=ithSitz.xpm,ithRosa.xpm,ithRosaL.xpm,ithRosaR.xpm,
                     ithRosaV.xpm,ithRosaH.xpm,ithRosaBlah.xpm,
         explosion.xpm
    << rosa=malKugel; rosa.land=landKugel; >>
  }
  rot={
    colourprob[easy] = 0
    pics=ithSitz.xpm,ithRot.xpm,ithRotL.xpm,ithRotR.xpm,
                     ithRotV.xpm,ithRotH.xpm,ithRotBlah.xpm,
         explosion.xpm
    << rot=malKugel; rot.land=landKugel; >>
  }
  blau={
    colourprob = 0
    colourprob[hard] = 1
    pics=ithSitz.xpm,ithBlau.xpm,ithBlauL.xpm,ithBlauR.xpm,
                     ithBlauV.xpm,ithBlauH.xpm,ithBlauBlah.xpm,
         explosion.xpm
    << blau=malKugel; blau.land=landKugel; >>
  }
  dreck={
    pics=ithSitz.xpm,ithDreck1.xpm,ithDreck2.xpm,ithDreck3.xpm

    <<
    dreck.init={version = 1 + rnd(3);};
    
    dreck={
      calc_maske; lies;
      guck = version;
      malSitzUndBenutzer;
      bin_blop;
    };
    >>
  }

  Sitz={
    pics=ithSitz.xpm
    <<
    Sitz.init = {
      if !informational -> {
        calc_maske;
        kind=Leer; sitz=maske; behaviour.+=goalblob;
      };
    };

    # Das ein Sitzblob sein init-event überlebt, passiert nur für den informational-blob.
    Sitz = {G*};
    >>
  }

  Leer = {
    pics = ithSitz.xpm
    <<
    Leer.init = {
      # Nur am Anfang des Spiels: alle leer-Blops löschen
      # ihr Sitz-Bit (um die startdist in die sitz-Variablen
      # zu übertragen):
      if !time && loc_y<20 -> {
        calc_maske;
        my_exploding@@ = 7;
        bin_gleich_weg;
      };
    };

    Leer = {
      calc_maske;
      if time -> lies;
      sitze;
      bin_kein_blop;
    };
    >>
  }
}

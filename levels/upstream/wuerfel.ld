#
#   Copyright 2005 by Immanuel Halupczok
#   Modified 2006,2014 by Immanuel Halupczok
#   Maintenance modifications 2005,2006,2008,2011,2014 by the cuyo developers
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
#   itrBlau.xpm[.gz], itrBraun.xpm[.gz], itrGrau.xpm[.gz], itrGruen.xpm[.gz],
#   itrLila.xpm[.gz], itrVorderrand.xpm[.gz],
#   itrAlle.xcf
#

Wuerfel={
  name="Cubes"
  author="Immi"
  numexplode=7
  numexplode[2]=6
  numexplode[easy]=5
  numexplode[2,easy]=4
  chaingrass=0
  toptime=100
  pics=wuerfel * 4
  greypic=wuerfel
  bgcolor=50,50,70
  startpic=start_dummy
  startdist="....A.....","..CaAaD...","..ccBdd...","..CCbDD...",
            "..acBda...","aAaAaAaAa."
  neighbours=<neighbours_hex6>
  description="Will they land in front of or behind the others?"
  emptypic=nix
  bgpic=itrVorderrand.xpm
  
  vorderrand_file = 5
  
  start_dummy = {
  }
  
  nix = {
    pics="itrBraun.xpm", "itrBlau.xpm", "itrGruen.xpm", "itrLila.xpm",
         "itrGrau.xpm", "itrVorderrand.xpm"
  }
  
  wuerfel = {
    pics="itrBraun.xpm", "itrBlau.xpm", "itrGruen.xpm", "itrLila.xpm",
         "itrGrau.xpm", "itrVorderrand.xpm"
  }


  <<
  
  
  # kind_ = kind - wuerfel + 10 * (bin_goalblop)
  var kind_;
  
  # 1, wenn schon festgelegt ist, wo wie ich vorne/hinten bin
  var definiert;
  
  # Für alle Pfeile gilt:
  #   1 = gute Richtung
  #   0 = schlechte Richtung
  #   Bei lu und ru ist gut, wenn ich weiter hinten bin,
  #   bei u ist gut, wenn ich weiter vorne bin
  
  # Speiche = Pfeil von mir aus weg; für die Großgeschriebenen
  #   haben wir die Verantwortung.
  var Speiche_lu, Speiche_u, Speiche_ru;
  var speiche_lo, speiche_o, speiche_ro;

  # Welche Nachbarn existieren?
  var ex_lu, ex_u, ex_ru, ex_lo, ex_ro, ex_o;
  # Rad = Pfeil um mich rum
  var rad_lu, rad_ru, rad_l, rad_r, rad_lo, rad_ro;
  # Für's Rad:
  #   gut/schlecht = beide Würfel existieren und das Radsegment
  #                  ist gut/schlecht
  var rad_g_lu, rad_g_ru, rad_g_l, rad_g_r, rad_g_lo, rad_g_ro;
  var rad_s_lu, rad_s_ru, rad_s_l, rad_s_r, rad_s_lo, rad_s_ro;
  # Ich möchte mich in die folgenden Richtungen verbinden:
  var verb_u = 0, verb_lo = 0, verb_ro = 0;
  
  var verdeck_gefahr;
  
  # unten = unterste Zeile; ganz_unten = tiefere Hälfte der untersten Zeile
  var unten, ganz_unten;


  #      ICH
  #  lu/  | \ru
  # LI   u|   RE
  #  lu\  | /ru
  #      UN

  start_dummy.init = {
    kind = rnd(2);
    if version >= 26 -> { kind += 2; version -= 26; };
    kind_ = kind - wuerfel + 10;
    behaviour .+= goalblob;
    switch {
      version == 0 -> {
          # Oberseite; hinter allem
          Speiche_lu = 1; Speiche_ru = 1;
        };
      version == 1 -> {
          # Vorderkante: Auf dem drunter
          Speiche_u = 1;
        };
      version == 2 -> {
          # Linke Seite: Auf dem drunter aber hinter dem rechts
          Speiche_u = 1;
          Speiche_ru = 1;
        };
      version == 3 -> {
          # Rechte Seite: Auf dem drunter aber hinter dem links
          Speiche_u = 1;
          Speiche_lu = 1;
        };
    };
    definiert = 1;
  };
  

  
  get_nachbarn={
    unten = kind@(0,1) == outside;
    ganz_unten = unten && loc_x % 2 == 0;
  
    # Welche Nachbarn existieren?
    ex_lu = kind@(-1,.5) >= wuerfel;
    ex_ru = kind@(1,.5) >= wuerfel;
    ex_u = kind@(0,1) >= wuerfel;
    ex_lo = kind@(-1,-.5) >= wuerfel;
    ex_ro = kind@(1,-.5) >= wuerfel;
    ex_o = kind@(0,-1) >= wuerfel;

    # Pfeile von Nachbarn zu mir (Speichen-Pfeile)
    speiche_lo = Speiche_ru@(-1,-.5);
    speiche_o = Speiche_u@(0,-1);
    speiche_ro = Speiche_lu@(1,-.5);
      
    # Pfeile um mich rum (Rad-Pfeile)
    rad_lu = Speiche_ru@(-1,.5);
    rad_ru = Speiche_lu@(1,.5);
    rad_l = Speiche_u@(-1,-.5);
    rad_r = Speiche_u@(1,-.5);
    rad_lo = Speiche_lu@(0,-1);
    rad_ro = Speiche_ru@(0,-1);
  };
  
  get_gutschlecht={
    rad_g_lo = ex_o && ex_lo && rad_lo;
    rad_g_ro = ex_o && ex_ro && rad_ro;
    rad_g_lu = ex_u && ex_lu && rad_lu;
    rad_g_ru = ex_u && ex_ru && rad_ru;
    rad_g_l = ex_lo && ex_lu && rad_l;
    rad_g_r = ex_ro && ex_ru && rad_r;
    rad_s_lo = ex_o && ex_lo && !rad_lo;
    rad_s_ro = ex_o && ex_ro && !rad_ro;
    rad_s_lu = ex_u && ex_lu && !rad_lu;
    rad_s_ru = ex_u && ex_ru && !rad_ru;
    rad_s_l = ex_lo && ex_lu && !rad_l;
    rad_s_r = ex_ro && ex_ru && !rad_r;
  };
  
  berechne_verbindungen = {
    verb_u = ex_u && Speiche_u &&
             (Speiche_lu || !rad_s_lu) && (Speiche_ru || !rad_s_ru);
    #v_u_lu = ex_u && Speiche_u && (Speiche_lu || !rad_s_lu);
    #v_u_ru = ex_u && Speiche_u && (Speiche_ru || !rad_s_ru);
    verb_lo = ex_lo && speiche_lo &&
              (Speiche_lu || !rad_s_l) && (speiche_o || !rad_s_lo);
    #v_lo_lu = ex_lo && speiche_lo && (Speiche_lu || !rad_s_l);
    #v_lo_o = ex_lo && speiche_lo && (speiche_o || !rad_s_lo);
    verb_ro = ex_ro && speiche_ro &&
              (Speiche_ru || !rad_s_r) && (speiche_o || !rad_s_ro);
    #v_ro_ru = ex_ro && speiche_ro && (Speiche_ru || !rad_s_r);
    #v_ro_o = ex_ro && speiche_ro && (speiche_o || !rad_s_ro);

    #out1 = verb_lo * 100 + verb_u * 10 + verb_ro + 111;
  };


  # Wie *, beachtet aber Goalblop-andersaussehen
  stern = {
    if file >= 10 -> {
      file = file - 10;
      if pos < 9 -> { pos += 18; };
    };
    *;
  };
  
  
  mal_o = {if ex_o -> {file=kind_@(0,-1);H;stern;};};
  mal_lo = {if ex_lo -> {file=kind_@(-1,-.5);F;stern;};};
  mal_ro = {if ex_ro -> {file=kind_@(1,-.5);D;stern;};};
  mal_lu = {if ex_lu -> {file=kind_@(-1,.5);C;stern;};};
  mal_ru = {if ex_ru -> {file=kind_@(1,.5);A;stern;};};
  mal_u = {if ex_u -> {file=kind_@(0,1);B;stern;};};

  mal_nachbarn={
    # Malen: Unten links
    [qu=Q_BL] {
      if !rad_l -> mal_lo;
      if !rad_lu -> mal_u;
      mal_lu;
      if rad_l -> mal_lo;
      if rad_lu -> mal_u;
    };

    # Malen: Unten rechts
    [qu=Q_BR] {
      if !rad_r -> mal_ro;
      if !rad_ru -> mal_u;
      mal_ru;
      if rad_r -> mal_ro;
      if rad_ru -> mal_u;
    };

    # Malen: Oben links
    [qu=Q_TL] {
      if rad_l -> mal_lu;
      if rad_lo -> mal_o;
      mal_lo;
      if !rad_l -> mal_lu;
      if !rad_lo -> mal_o;
    };

    # Malen: Oben rechts
    [qu=Q_TR] {
      if rad_r -> mal_ru;
      if rad_ro -> mal_o;
      mal_ro;
      if !rad_r -> mal_ru;
      if !rad_ro -> mal_o;
    };
    
    if unten -> {
      file = vorderrand_file;
      if ganz_unten -> {
         A*;
      } else -> {
        [qu=Q_TL_BL] B*;
        [qu=Q_TR_BR] B*;
      };
    };
    
  };

  mal_extrakanten = {
    if (!ex_lo || speiche_lo) -> {
      if (!ex_o || !speiche_o) -> { # lo-Kante sichtbar
        if !verb_lo -> {
          [qu=Q_BR_TR] J*@(-1,-.5);
	  [qu=Q_BL] K*@(0,-1);
	};
        if (verb_ro@(-1,.5) && verb_ro@(-2,0) && !verb_lo@(-1,.5)) -> [qu=Q_BL_TR] J*@(-1,-.5);
	if (verb_ro@(0,0) && verb_ro@(-1,-.5) && !verb_lo@(1,-.5)) -> [qu=Q_TL_BL] K*@(0,-1);
      };
      if (!ex_lu || !Speiche_lu) && !ganz_unten -> { # l-Kante sichtbar
        if !verb_lo -> {
          [qu=Q_TR_BR] M*@(-1,-.5);
	  [qu=Q_BR_TR] M*@(-1,.5);
	};
        if (verb_u@(0,-1) && verb_u@(-1,-1.5) && !verb_lo@(0,-1)) -> [qu=Q_TL_BR] M*@(-1,-.5);
	if (verb_u@(0,0) && verb_u@(-1,-.5) && !verb_lo@(0,1)) -> [qu=Q_BL_TR] M*@(-1,.5);
      };
    };
    if (!ex_ro || speiche_ro) -> {
      if (!ex_o || !speiche_o) -> { # ro-Kante sichtbar
        if !verb_ro -> {
          [qu=Q_BL_TL] L*@(1,-.5);
	  [qu=Q_BR] K*@(0,-1);
	};
        if (verb_lo@(1,.5) && verb_lo@(2,0) && !verb_ro@(1,.5)) -> [qu=Q_BR_TL] L*@(1,-.5);
	if (verb_lo@(0,0) && verb_lo@(1,-.5) && !verb_ro@(-1,-.5)) -> [qu=Q_TR_BR] K*@(0,-1);
      };
      if (!ex_ru || !Speiche_ru) && !ganz_unten -> { # r-Kante sichtbar
        if !verb_ro -> {
          [qu=Q_TL_BL] O*@(1,-.5);
	  [qu=Q_BL_TL] O*@(1,.5);
	};
        if (verb_u@(0,-1) && verb_u@(1,-1.5) && !verb_ro@(0,-1)) -> [qu=Q_TR_BL] O*@(1,-.5);
	if (verb_u@(0,0) && verb_u@(1,-.5) && !verb_ro@(0,1)) -> [qu=Q_BR_TL] O*@(1,.5);
      };
    };
    if (!ex_u || Speiche_u) && !unten -> {
      if (!ex_lu || !Speiche_lu) -> { # lu-Kante sichtbar
        if !verb_u -> {
          [qu=Q_TL] Q*@(0,1);
	  [qu=Q_TR_BR] P*@(-1,.5);
	};
	if (verb_lo@(1,.5) && verb_lo@(1,1.5) && !verb_u@(1,.5)) -> [qu=Q_BL_TL] Q*@(0,1);
        if (verb_lo@(0,0) && verb_lo@(0,-1) && !verb_u@(-1,-.5)) -> [qu=Q_TL_BR] P*@(-1,.5);
      };
      if (!ex_ru || !Speiche_ru) -> { # ru-Kante sichtbar
        if !verb_u -> {
          [qu=Q_TR] Q*@(0,1);
	  [qu=Q_TL_BL] R*@(1,.5);
	};
	if (verb_ro@(-1,.5) && verb_ro@(-1,1.5) && !verb_u@(-1,.5)) -> [qu=Q_BR_TR] Q*@(0,1);
        if (verb_ro@(0,0) && verb_ro@(0,-1) && !verb_u@(1,-.5)) -> [qu=Q_TR_BL] R*@(1,.5);
      };
    };
  };
  
  mal_extrakanten_alt = {
      
  
    # Wenn zwei Blops verbunden sind, dann die entsprechenden
    # Trennkanten heller übermalen (aber nur wenn sie sichtbar
    # sind)
    # Dabei noch eine Sonderfall-Entescherung: Wenn vier Blops
    # zusammen eine Fläche bilden, die auf einer Seite geschlitzt
    # ist, dann Schlitz noch um einen halben Blop verlängern.
    if verb_u -> {
      if !rad_s_lu -> {  # lu
	if !(verb_lo@(1,.5) && verb_lo@(1,1.5) && !verb_u@(1,.5)) -> [qu=Q_TL] Q*@(0,1);
        if !(verb_lo@(0,0) && verb_lo@(0,-1) && !verb_u@(-1,-.5)) -> [qu=Q_BR] M*@(-1,.5);
	# Zugriff mit @(0,0), damit nicht eine der Verbindungen früher
	# bemerkt wird als die anderen; das führt zu kurzzeitigen
	# Inkonsistenzen, die zum Aufflackern eines Strichs führen.
      };
      if !rad_s_ru -> {  # ru
	if !(verb_ro@(-1,.5) && verb_ro@(-1,1.5) && !verb_u@(-1,.5)) -> [qu=Q_TR] Q*@(0,1);
        if !(verb_ro@(0,0) && verb_ro@(0,-1) && !verb_u@(1,-.5)) -> [qu=Q_BL] O*@(1,.5);
      };
    };
    if verb_lo -> {
      if !rad_s_l -> {  # l
        if !(verb_u@(0,-1) && verb_u@(-1,-1.5) && !verb_lo@(0,-1)) -> [qu=Q_BR] J*@(-1,-.5);
	if !(verb_u@(0,0) && verb_u@(-1,-.5) && !verb_lo@(0,1)) -> [qu=Q_TR] M*@(-1,.5);
      };
      if !rad_s_lo -> {  # lo
        if !(verb_ro@(-1,.5) && verb_ro@(-2,0) && !verb_lo@(-1,.5)) -> [qu=Q_TR] J*@(-1,-.5);
	if !(verb_ro@(0,0) && verb_ro@(-1,-.5) && !verb_lo@(1,-.5)) -> [qu=Q_BL] K*@(0,-1);
      };
    };
    if verb_ro -> {
      if !rad_s_r -> {  # r
        if !(verb_u@(0,-1) && verb_u@(1,-1.5) && !verb_ro@(0,-1)) -> [qu=Q_BL] L*@(1,-.5);
	if !(verb_u@(0,0) && verb_u@(1,-.5) && !verb_ro@(0,1)) -> [qu=Q_TL] O*@(1,.5);
      };
      if !rad_s_ro -> {  # ro
        if !(verb_lo@(1,.5) && verb_lo@(2,0) && !verb_ro@(1,.5)) -> [qu=Q_TL] L*@(1,-.5);
	if !(verb_lo@(0,0) && verb_lo@(1,-.5) && !verb_ro@(-1,-.5)) -> [qu=Q_BR] K*@(0,-1);
      };
    };
    #out1 = 100 * v_lo_lu + 10 * v_lo_o + verb_lo + 111;
    #if v_lo_lu && !rad_s_l -> {[qu=Q_BR] S*@(-1,-.5); [qu=Q_TR] V*@(-1,.5);};  # l
    #if v_lo_o && !rad_s_lo ->     {[qu=Q_TR] S*@(-1,-.5); [qu=Q_BL] T*@(0,-1);};  # lo
  };
  
  
  berechne_pfeile={
    # Folgende Invarianten sollen immer gelten (bzw. maximal
    # für einen Zeitraum der Länge \epsilon verletzt sein):
    # - Keine ggg-/sss-Dreiecke: (g = gut, s = schlecht)
    #   = zyklische Dreiecke; führen zu Grafikfehler
    # - Kein Dreieck mit oberer und unterer Kante beide schlecht:
    #   Führen dazu, dass ein Blop "in der Luft hängt"
    # Ansonsten wird noch optimiert auf:
    # - möglichst wenig ssg-Dreiecke
    # - Neue Blops nicht völlig verdeckt

    if !definiert -> {
      # Pfeil nach unten bestimmen:

      #Speiche_u = rnd(2); # Erst mal zufällig
      Speiche_u = 0;  # Erst mal möglichst flach

      
      ### In welchen Fällen *muss* Speiche_u == 1 (gut) sein
      
      # Wenn unten ein schlechter Pfeil ist, können wir
      # ein ssg-Dreieck vermeiden
      if rad_s_lu || rad_s_ru -> Speiche_u = 1;
      
      # Oben und nicht hinten anbauen, wenn ich hinten alleine wäre
      # (gar nicht mit dem Rest verbunden).
      if !rad_g_lu && !rad_g_ru -> Speiche_u = 1;
      
      # Blop nicht völlig verdecken... unter Zusatzbedingungen:
      # - Verdeckende Blops sind schon alt (d. h. definiert)
      # - Nach vorne holen verletzt keine Invariante
      # Verdeckt ist der Blop, wenn er hinter den beiden oberen ist und:
      # - hinter dem unteren  oder
      # - hinter den beiden lu und ru
      # Hinter den oberen kann mit unserem Algorithmus nur bei
      # rad_g_l && rad_g_r passieren
      verdeck_gefahr = rad_g_l && rad_g_r &&
                       definiert@(-1,-.5) && definiert@(1,-.5);
      if verdeck_gefahr -> Speiche_u = 1;
      # Wenn der untere Blop gar nicht existiert, können wir immer noch
      # verdeckt werden. Deshalb wird verdeck_gefahr weiter unten nochmal
      # verwendet.

      ### In welchen Fällen *muss* Speiche_u == 0 (schlecht) sein
      
      # Ist unnötig, wenn man sowieso ganz am Anfang mit default
      # Speiche_u = 0 startet. Ist deshalb auskommentiert

      # Wenn sonst oben ein vermeidbarer Fehler wäre:
      # (Nur wenn der obere Blop schon älter ist.)
      #if definiert@(-1,-.5) &&
      #   rad_g_lu && rad_s_l && !rad_s_ru -> Speiche_u = 0;
      #if definiert@(1,-.5) &&
      #   rad_g_ru && rad_s_r && !rad_s_lu -> Speiche_u = 0;

      ### Ende von Speiche_u bestimmen

      # Jetzt die restlichen Pfeile:
      # Default gut; schlecht nur, wenn am Dreieck darunter
      # bereits zwei gute Kanten sind
      Speiche_lu = !(rad_g_lu && Speiche_u);
      Speiche_ru = !(rad_g_ru && Speiche_u);
      if verdeck_gefahr -> {
        # Noch besteht Gefahr, den Blop durch lu, ru, lo, ro
	# zu verdecken. Wenn wir das ohne Überhang vermeiden
	# können, tun wir's. (Auf einer Seite würde reichen,
	# aber es soll symmetrisch sein.)
        if !rad_s_lu -> Speiche_lu = 0;
	if !rad_s_ru -> Speiche_ru = 0;
      };
      # Wenn die Blops links und rechts über mir schon länger existieren,
      # dann auch deren Pfeile setzen; dabei auch gleich meine eigenen
      # entsprechenden Variablen setzen, damit weniger Zeitverzögerung
      # entsteht
      if ex_lo -> {
        speiche_lo = !(rad_g_l && Speiche_lu);
        Speiche_ru@(-1,-.5) = speiche_lo;
      };
      if ex_ro -> {
        speiche_ro = !(rad_g_r && Speiche_ru);
        Speiche_lu@(1,-.5) = speiche_ro;
      };
      
      
      # Wir entscheiden uns erst dann entgültig für unsere Pfeile, wenn
      # a) sich alle unsere Unterklötze entschieden haben und
      # b) wir nicht in der Luft hängen.
      definiert = (!ex_lu || definiert@(-1,.5)) &&
	          (!ex_u || definiert@(0,1)) &&
	          (!ex_ru || definiert@(1,.5)) &&
		  (ex_u || kind@(0,1) == outside)
    } else if loc_y < 19 || kind@(0,1) == outside -> {
      # Eigentlich sind die Pfeile berechnet. Aber vielleicht
      # müssen verletzte Invarianten repariert werden.
      # Allerdings nur, wenn unter uns nicht grad eine Reihe
      # langrutscht; bei langrutschenden Reihen warten wir erst
      # mal.
      if rad_g_lu && Speiche_lu && Speiche_u -> Speiche_lu = 0;
      if rad_s_lu && !Speiche_lu -> Speiche_lu = 1;
      if rad_g_ru && Speiche_ru && Speiche_u -> Speiche_ru = 0;
      if rad_s_ru && !Speiche_ru -> Speiche_ru = 1;

      if rad_s_lu && rad_s_ru -> Speiche_u = 1
    };
    #out2 = Speiche_lu * 100 + Speiche_u * 10 + Speiche_ru + 111;
  };
  
  wuerfel.init={
    kind_ = kind - wuerfel;
  };
  
  wuerfel.land={
    get_nachbarn;
    get_gutschlecht;
    berechne_pfeile;
  };
  
  
  wuerfel.connect={
    if !falling -> {
      get_nachbarn;
      get_gutschlecht;
      berechne_pfeile;
      berechne_verbindungen;
      #if !definiert -> {
      #	inhibit = DIR_U + DIR_D + DIR_UL + DIR_UR + DIR_DL + DIR_DR;
      #} else -> {
	inhibit = DIR_D * (!verb_u)
        	+ DIR_UL * (!verb_lo)
        	+ DIR_UR * (!verb_ro);
      #};
    };
    
  };

  wuerfel={
    file = kind_;
    if !falling && !informational -> {

      get_nachbarn;

      get_gutschlecht;

      berechne_pfeile;

      berechne_verbindungen;

      # Malen: Ich selbst
      E; stern;
      
      mal_extrakanten;

      # Für's Nachbarn-malen zählen die, die hinter mir sind,
      # einfach als nicht da.
      ex_lu = ex_lu && Speiche_lu;
      ex_ru = ex_ru && Speiche_ru;
      ex_u = ex_u && !Speiche_u;
      
      ex_lo = ex_lo && !speiche_lo;
      ex_ro = ex_ro && !speiche_ro;
      ex_o = ex_o && speiche_o;

      mal_nachbarn;

      #if verb_u -> {3; [qu=Q_BL] B*@(0,0); [qu=Q_TL] B*@(0,1); };
      #if verb_lo -> {3; [qu=Q_TL] C*@(0,0); [qu=Q_BR] C*@(-1,-.5); };
      #if verb_ro -> {3; [qu=Q_TR] A*@(0,0); [qu=Q_BL] A*@(1,-.5); };
      

    } else -> {
      G; stern;
    };
    #out1 = verb_lo * 100 + verb_u * 10 + verb_ro + 111;
    #out1 = definiert;
    #out2 = Speiche_lu * 100 + Speiche_u * 10 + Speiche_ru + 111;
  };

  nix={
    get_nachbarn;
    mal_nachbarn;
    verb_lo = 0;
    verb_ro = 0;
    verb_u = 0;
  };

  >>


  
}


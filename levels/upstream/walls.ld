#
#   Copyright <=2004 by Immanuel Halupczok
#   Modified 2005,2006,2014 by Immanuel Halupczok
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
#   iwaBad.xpm[.gz], iwaBeton.xpm[.gz], iwaNix.xpm[.gz], iwaObjekte.xpm[.gz],
#   iwaParkett.xpm[.gz], iwaTeppich.xpm[.gz],
#   iwaAlles.xcf
#

Walls = {

  name = "Walls"
  author = "Immi"
  description = "Floors don't connect through walls."
  startpic = gras
  pics=bad,parkett,teppich
  #pics[1]=gruen,gelb,rosa,orange
  randomgreys[1]=60
  numexplode = 4
  numexplode[1] = 5
  
  bgcolor = 112,110,104
 
  startdist="++++++++++","AAAAAAAAAA" 
  
#pics=inGruen.xpm  
#numexplode = 200
#startdist="AAAAAAAAAA","++++++++++","++++++++++","++++++++++","++++++++++","++++++++++","++++++++++","++++++++++","++++++++++","++++++++++","++++++++++","++++++++++","++++++++++"
  greypic=grau
  nogreyprob=1
  emptypic=leer
  
  <<
  
  var wob, wun, wli, wre;  # Wand
  var plo; # Pfosten links oben
  var vob, vun, vli, vre;  # Verbindung
  var dy;
  var xx, yy, sp_h, sp_v;
  var wand;
  
  initWaende = {
    wob = 0; wli = 0; wre = 0; wun = 0;
  };
  
  korrigierexxyy = {
    yy += dy@@;
    if loc_p == 1 -> {
      sp_h = 0;
    } else -> {
      xx = 9 - xx;
      sp_h = 1;
    };
    if yy > 19 -> {
      yy = 39 - yy;
      xx = 9 - xx;
      sp_h = 1 - sp_h;
      sp_v = 1;
    } else -> {
      sp_v = 0;
    };
  };
  
  # vorher xx,yy setzen
  getWandOben = {
    wand = 0;
    yy += dy@@;
    if loc_p == 2 -> xx = 9 - xx;
    if yy > 19 -> {
      yy = 40 - yy;
      xx = 9 - xx;
    };
    switch {
      yy == 20 -> if xx == 1 || xx == 4 || xx == 5 || xx == 8 -> wand = 1;
      yy == 19 -> if xx == 2 || xx == 3 || xx == 5 ||
                     xx == 6 || xx == 9                       -> wand = 1;
      yy == 18 -> if xx == 1 || xx == 3 || xx == 4 ||
                     xx == 7 || xx == 8                       -> wand = 1;
      yy == 17 -> if xx == 0 || xx == 2 || xx == 5 || xx == 9 -> wand = 1;
      yy == 16 -> if xx == 5                                  -> wand = 1;
      yy == 15 -> if xx == 6                                  -> wand = 1;
      yy == 14 -> if xx == 1 || xx == 8                       -> wand = 1;
      yy == 13 -> if xx == 4                                  -> wand = 1;
      yy == 12 -> if xx == 7                                  -> wand = 1;
      yy == 11 -> if xx == 6                                  -> wand = 1;
      yy == 10 -> if xx == 9                                  -> wand = 1;
    };
  };
  
  # vorher xx,yy setzen
  getWandLinks = {
    if xx == 0 || xx == 10 -> wand = 1
    else -> {
      wand = 0;
      yy += dy@@;
      if loc_p == 2 -> xx = 10 - xx;
      if yy > 19 -> {
	yy = 39 - yy;
	xx = 10 - xx;
      };
      switch {
	yy == 19 -> if xx == 1 || xx == 3 || xx == 8            -> wand = 1;
	yy == 18 -> if xx == 1 || xx == 7                       -> wand = 1;
	yy == 17 -> if xx == 6                                  -> wand = 1;
	yy == 16 -> if xx == 2 || xx == 4 || xx == 7 || xx == 9 -> wand = 1;
	yy == 15 -> if xx == 1 || xx == 4 || xx == 8            -> wand = 1;
	yy == 14 -> if xx == 3 || xx == 5                       -> wand = 1;
	yy == 13 -> if xx == 7                                  -> wand = 1;
  #      yy == 12 -> if xx == 3                                  -> wand = 1;
	yy == 11 -> if xx == 3                                  -> wand = 1;
	yy == 10 -> if xx == 1                                  -> wand = 1;
      };
    };
  };
  
  checkWaende = {
    initWaende;
   
    if !informational -> { 
      xx = loc_x; yy = loc_y; getWandLinks; wli = wand;
      xx = loc_x+1; yy = loc_y; getWandLinks; wre = wand;
      xx = loc_x; yy = loc_y; getWandOben; wob = wand;
      xx = loc_x; yy = loc_y+1; getWandOben; wun = wand;
      if wli || wob -> plo = 1 else -> {
	xx = loc_x; yy = loc_y-1; getWandLinks;
	if wand -> plo = 1 else -> {
	  xx = loc_x-1; yy = loc_y; getWandOben;
	  plo = wand;
	}
      };
    #} else -> {
    #  wli = 1; wre = 1; wob = 1; wun = 1;
    };
  };
  
  #malWaende = {
  #  1D*;
  #  if wli -> B*;
  #  if wre -> A*;
  #  if wob -> E*;
  #  if wun -> C*;
  #};

  meinConnect = {
    checkWaende;
    inhibit = 0;
    if wob -> inhibit += DIR_U;
    if wun -> inhibit += DIR_D;
    if wli -> inhibit += DIR_L;
    if wre -> inhibit += DIR_R;
  };
  
  #meinBlobAlt = {
  #  if falling -> {initWaende;}
  #  else       -> {checkWaende;malWaende;};
#
#    vob = !wob && (kind == kind@(0,-1) ||
#                   kind == nothing && kind@(0,-1) == outside);
#    vun = !wun && kind == kind@(0,1);
#    vli = !wli && kind == kind@(-1,0);
#    vre = !wre && kind == kind@(1,0);
#    
#    if vli -> pos = 3 - vre else pos = vre;
#    if vob -> pos += 12 - 4 * vun else pos += 4 * vun;
#    0*;
#  };
  
  
  meinBlop = {
    if falling -> 0J*
    else -> {
      # Wände bestimmen
      checkWaende;
      
      # Verbindungen bestimmen
      vob = !wob && (kind == kind@(0,-1) ||
                     kind == nothing && kind@(0,-1) == outside);
      vun = !wun && kind == kind@(0,1);
      vli = !wli && kind == kind@(-1,0);
      vre = !wre && kind == kind@(1,0);
    
      # Verbindungen (Boden) malen
      0;
      [qu=Q_TL] [pos =       vli + 2*wli + 3*vob + 6*wob] *;
      [qu=Q_TR] [pos = 2 - 2*vre -   wre + 3*vob + 6*wob] *;
      [qu=Q_BL] [pos = 6 +   vli + 2*wli - 6*vun - 3*wun] *;
      [qu=Q_BR] [pos = 8 - 2*vre -   wre - 6*vun - 3*wun] *;

      # Wände malen
      # malWaende;

      # Mittelpfosten entfernen
      if !plo && vli && vob && (kind == kind@(-1,-1) ||
                       kind == nothing && kind@(-1,-1) == outside) -> {
        0K;
        [qu=Q_BR_TL] *@(0,0);
        [qu=Q_BL_TR] *@(-1,0);
        [qu=Q_TR_BL] *@(0,-1);
        [qu=Q_TL_BR] *@(-1,-1);
      };
      if informational -> 0K*;
    };
    
    
    
  };

  bad.connect = meinConnect;
  bad = meinBlop;

  parkett = meinBlop;
  parkett.connect = meinConnect;

  teppich = meinBlop;
  teppich.connect = meinConnect;

  grau = meinBlop;

  gras.init = { version = rnd(4); };
  gras = {
    meinBlop;
    pos = version; 1*;
  };

  leer = meinBlop;


  semiglobal.row_up = { dy+=1; };
  semiglobal.row_down = { dy-=1; };
  >>
  
  bad={
    pics=iwaBad.xpm
  }
  parkett={
    pics=iwaParkett.xpm
  }
  teppich={
    pics=iwaTeppich.xpm
  }
  grau={
    pics=iwaBeton.xpm
  }
  gras={
    pics=iwaBeton.xpm,iwaObjekte.xpm
  }
  leer={
    pics=iwaNix.xpm
  }
}


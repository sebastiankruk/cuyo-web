#
#   Copyright <=2004,2014 by Immanuel Halupczok
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
#   i6Blau.xpm[.gz], i6Gelb.xpm[.gz], i6Grau.xpm[.gz], i6Gross1.xpm[.gz],
#   i6Gross2.xpm[.gz], i6Gross3.xpm[.gz], i6Hintergrund.xpm[.gz],
#   i6Lila.xpm[.gz], i6Oben.xpm[.gz], i6Rot.xpm[.gz], i6Weiss.xpm[.gz]
#

# referenced from memory.ld

HexKugeln={
  name="Balls & Rods"
  author="Immi"
  numexplode=5
  chaingrass=1
  pics=i6Weiss,i6Gelb,i6Rot,i6Blau,i6Lila
  bgcolor=200,200,155
  #bgpic=i6Hintergrund.xpm
  topcolor=0,0,0
  toppic=i6Oben.xpm
  topoverlap=13
  toptime=50
  startpic=i6Gross
  startdist="..D.ADG......D.ADG..",".AEGCEI.....AEGCEI..",".CFI-F-.....CFI-F-..","-A%&&%A-"
  startdist[1]="D.........","EG........","FID.ADG.D.","-AEGCEIAEG","-CFI-F-CFI","-A%&"
  greypic=i6Grau
  emptypic=i6Empty
  textcolor=0,100,0
  neighbours=<neighbours_hex6>
  hexflip=2
  randomgreys[1]=100
  description="Most dense packing of spheres"
  <<

  var my_exploding;
  var anz1 = 7, anz2 = 7, anz3 = 7, anz4 = 7;

  mal_wellen={
    if !falling && kind@(0,1) == outside -> {
      if (loc_x & 1 == 1) == (loc_p == 2) -> {
        A*;
      } else {
        qu=Q_BL_TL; B*@(0,1);
        qu=Q_BR_TR; B*@(0,1);
      };
    };
  };


  bunt={
    if exploding != 0 -> my_exploding@ = exploding;
    schemaHex8;
    1; mal_wellen;
  };


  global={
    my_exploding=0;
  };

  >>

  i6Empty={
    pics=i6Hintergrund.xpm
    << i6Empty={0; mal_wellen;}; >>
  }

  i6Grau={
    pics=i6Grau.xpm,i6Hintergrund.xpm
    << i6Grau={0A*; 1; mal_wellen;}; >>
  }

  i6Weiss={
    pics=i6Weiss.xpm,i6Hintergrund.xpm
    << i6Weiss=bunt; >>
  }

  i6Gelb={
    pics=i6Gelb.xpm,i6Hintergrund.xpm
    << i6Gelb=bunt; >>
  }

  i6Rot={
    pics=i6Rot.xpm,i6Hintergrund.xpm
    << i6Rot=bunt; >>
  }

  i6Blau={
    pics=i6Blau.xpm,i6Hintergrund.xpm
    << i6Blau=bunt; >>
  }

  i6Lila={
    pics=i6Lila.xpm,i6Hintergrund.xpm
    << i6Lila=bunt; >>
  }


  i6Gross={
    pics=i6Hintergrund.xpm,i6Gross.xpm
    <<
    var basis;
    var anz=7;
    var kugelnr;

    get_anz={
      switch {
        kugelnr == 1 -> anz = anz1@;
        kugelnr == 2 -> anz = anz2@;
        kugelnr == 3 -> anz = anz3@;
        kugelnr == 4 -> anz = anz4@;
      };
    };

    dec_anz={
      switch {
        kugelnr == 1 -> anz1@ -= 1;
        kugelnr == 2 -> anz2@ -= 1;
        kugelnr == 3 -> anz3@ -= 1;
        kugelnr == 4 -> anz4@ -= 1;
      };
    };



    mal_kugel =  {
      basis = 2 * (anz - 1) - (anz == 2..5) + (anz == 7);
      basis *= 3;
      
      qu=Q_ALL;    pos=basis+1; @(0,0)*;

      if anz >= 2 -> {
	qu=Q_ALL;    pos=basis+4; @(0,1)*;

	qu=Q_BR_TR;  pos=basis;   @(-1,1)*;
	qu=Q_BR_TR;  pos=basis+3; @(-1,2)*;
	qu=Q_BL_TL;  pos=basis+2; @(1,1)*;
	qu=Q_BL_TL;  pos=basis+5; @(1,2)*;

	qu=Q_TR_BR;  pos=basis;   @(-1,0)*;
	qu=Q_TR_BR;  pos=basis+3; @(-1,1)*;
	qu=Q_TL_BL;  pos=basis+2; @(1,0)*;
	qu=Q_TL_BL;  pos=basis+5; @(1,1)*;

	if anz >= 5 -> {
	  qu=Q_ALL;    pos=basis+7; @(0,2)*;

	  qu=Q_BR_TR;  pos=basis+6; @(-1,3)*;
	  qu=Q_BL_TL;  pos=basis+8; @(1,3)*;

	  qu=Q_TR_BR;  pos=basis+6; @(-1,2)*;
	  qu=Q_TL_BL;  pos=basis+8; @(1,2)*;

	  qu=Q_BL_TL;  pos=basis;   @(-1,1)*;
	  qu=Q_BL_TL;  pos=basis+3; @(-1,2)*;
	  qu=Q_BL_TL;  pos=basis+6; @(-1,3)*;
	  qu=Q_BR_TR;  pos=basis+2; @(1,1)*;
	  qu=Q_BR_TR;  pos=basis+5; @(1,2)*;
	  qu=Q_BR_TR;  pos=basis+8; @(1,3)*;

	  qu=Q_TL_BL;  pos=basis;   @(-1,0)*;
	  qu=Q_TL_BL;  pos=basis+3; @(-1,1)*;
	  qu=Q_TL_BL;  pos=basis+6; @(-1,2)*;
	  qu=Q_TR_BR;  pos=basis+2; @(1,0)*;
	  qu=Q_TR_BR;  pos=basis+5; @(1,1)*;
	  qu=Q_TR_BR;  pos=basis+8; @(1,2)*;

	};
      };
      qu=Q_ALL;
    };


    i6Gross.init={
      behaviour .+= floats;
      switch {
        loc_p == 1 && loc_x == 7..9 -> kugelnr = 3;  # nur 1-sp-modus
        loc_p == 1 && loc_x == 0..1 && loc_y <= 17 -> kugelnr = 4;  # nur 1-sp-modus
        loc_p == 1 && loc_x == 1..3 -> kugelnr = 1;
        loc_p == 1 && loc_x == 4..6 -> kugelnr = 2;
        loc_p == 2 && loc_x == 2..4 -> kugelnr = 3;
        loc_p == 2 && loc_x == 5..7 -> kugelnr = 4;
      };
    };

    var richtige_seite;
    var version_oben;

    i6Gross={
      1;
      if informational -> B*
      else {
        if exploding != 0 -> my_exploding@ = exploding;

        behaviour .+= floats;

        get_anz; #out1=anz; out2=kugelnr;
	switch {
	  version==0 && anz < 5 -> kind = nothing;
	  version==2 && anz < 3 -> kind = nothing;
	  version==3 && anz < 5 -> kind = nothing;
	  version==4 && anz < 2 -> kind = nothing;
	  version==5 && anz < 1 -> kind = nothing;
	  version==6 && anz < 5 -> kind = nothing;
	  version==8 && anz < 3 -> kind = nothing;
	};

        if kind != nothing -> {

          richtige_seite = players == 1 || (kugelnr >= 3) == (loc_p == 2);
          version_oben = 5 - (anz+1)/3;

          # Der oberste Blop der Kugel ist für das Malen zuständig:
          if richtige_seite && version==version_oben ||
            !richtige_seite && version==5  -> mal_kugel;

          # Der underste Blop der Kugel ist für das Fallen zuständig:
          if my_exploding@ == 0 -> {
	    if richtige_seite && version==5 ||
	      !richtige_seite && version==version_oben -> {
              # Sind die Felder unter der Kugel frei?
              # Im 1-sp-Modus könnte die linke Spalte außerhalb des Spielfelds sein;
              # deshalb dort auch "outside" erlauben.
	      if kind@(0,1)==nothing &&
		(anz<=2 ||  (kind@(-1,.5)==nothing || kind@(-1,.5) == outside) && kind@(1,.5)==nothing) -> {
	      
		behaviour@(0,0) .-= floats;
		if anz >= 2 -> behaviour@(0,-1) .-= floats;
		if anz >= 3 -> behaviour@(-1,-.5) .-= floats;
		if anz >= 3 -> behaviour@(1,-.5) .-= floats;
		if anz >= 5 -> behaviour@(-1,-1.5) .-= floats;
		if anz >= 5 -> behaviour@(0,-2) .-= floats;
		if anz >= 5 -> behaviour@(1,-1.5) .-= floats;
	      };

	    };
          };

	  if exploding == 8 -> {
	    kind@(0,0) = i6Gross;
            behaviour@(0,0) .+= floats;
	    dec_anz;
  	  };
	};
        # (Achtung: Die blopart könnte auch empty geworden sein)
	0; mal_wellen;
      };
    };
    >>
  }
}


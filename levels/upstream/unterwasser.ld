#
#   Copyright <=2004 by Bernhard Seckinger and Immanuel Halupczok
#   Modified 2006 by Bernhard Seckinger
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
#   ibwAlgen.xpm[.gz], ibwBlaeschen.xpm[.gz], ibwFisch.xpm[.gz],
#   ibwMuschel.xpm[.gz], ibwPlankton.xpm[.gz], ibwSchuh.xpm[.gz],
#   ibwTintenfisch.xpm[.gz], ibwWellen.xpm[.gz]
#

# Status: (M=Muss, S=Soll, K=Kann, F=Feature, B=Bugs)
#
# Fertig?
#

UnterWasser={
  name="Under Water"
  author="Berni & Immi"
  numexplode=4
  chaingrass=1
  pics=Tintenfisch,Fisch,Muschel,Plankton
  bgcolor=0,30,60
  topcolor=200,220,255
  toptime=50
  toppic=ibwWellen.xpm
  topoverlap=32
  startpic=Algen
  startdist[1]="..A.......","..A.......","..A......A","..A..A...A","..AA.A...A","A.AA.A...A","A.AA.A.A.A"
  startdist="..A.......","..A.......","..A..A...A","A.A..A.A.A"
  greypic=ibwSchuh.xpm
  textcolor=200,220,255
  #bubblespic=ibwBlaeschen
  description="Bubbles (Level still under construction.)"
  emptypic=ibwNix
  <<
  var bl_pos, bl_vers, bl_stat;
  
  inc_bl_stat={
    bl_stat+=1;
    switch {
      bl_vers==0 -> bl_stat%=6;
      bl_vers==1 -> bl_stat%=12;
    }
  };
  
  blaeschen={
    switch {
      bl_pos==0 -> switch {
        # Vom Boden starten:
        #kind@(0,1) = outside && falling && 1:500 ->
        #    bl_pos=1,bl_stat=0;{1:2->bl_vers=0;->bl_vers=1;};
        # Von den Algen starten:
        kind == Algen && 1:200 -> {
          bl_pos=1;
          bl_stat=0;
          bl_vers=0;
        };
        # Von den Muscheln starten:
        kind == Muschel && 1:200 -> {
          bl_pos=1;
          bl_stat=0;
          bl_vers=1;
        };
        bl_pos@(0,1)==2 -> {
          bl_pos=1;
          bl_stat=bl_stat@(0,1);
          bl_vers=bl_vers@(0,1);
        };
      };
      -> {
        bl_pos = (bl_pos + 1) % 4;
      };
    };
    inc_bl_stat;
    switch {
      bl_pos != 0 -> {
        switch {
          bl_vers==0 -> switch {
            bl_stat==0 -> A;
            bl_stat==1 || bl_stat==5 -> B;
            bl_stat==2 || bl_stat==4 -> C;
            bl_stat==3 -> D;
          };
          bl_vers==1 -> switch {
            bl_stat==0..1 -> E;
            bl_stat==2..3 || bl_stat==10..11 -> F;
            bl_stat==4..5 || bl_stat==8..9 -> G;
            bl_stat==6..7 -> H;
          };
        };
        switch {
          bl_pos==1 -> {[qu=Q_TL_BL] 0*;[qu=Q_TR_BR] 0*};
          bl_pos==2 -> 0*;
          bl_pos==3 -> {[qu=Q_BL_TL] 0*;[qu=Q_BR_TR] 0*};
        };
      };
    };
  };
  >>

  ibwNix={
    pics=ibwBlaeschen.xpm
    << ibwNix=blaeschen; >>
  }
  Tintenfisch={
    pics=ibwBlaeschen.xpm,ibwTintenfisch.xpm
    << Tintenfisch={blaeschen;1;schema16}; >>
  }
  Fisch={
    pics=ibwBlaeschen.xpm,ibwFisch.xpm
    << Fisch={blaeschen;1;schema16}; >>
  }
  Plankton={
    pics=ibwBlaeschen.xpm,ibwPlankton.xpm
    << Plankton={blaeschen;1;schema16}; >>
  }
  Algen={
    pics=ibwBlaeschen.xpm,ibwAlgen.xpm
    <<
    Algen={
      blaeschen;
      switch {
        0??????? -> B;
        1??????? -> A;
      };
      1*
    };
    >>
  }
  Muschel={
    pics=ibwBlaeschen.xpm,ibwMuschel.xpm
    <<
    var mitte,po;
    Muschel={
      blaeschen;
      switch {
        mitte==0 -> {
          po=rnd(16);
          mitte=1
        };
      };
      pos=po;
      1*
    };
    >>
    schema=3
  }
}

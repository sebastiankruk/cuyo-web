#
#   Copyright <=2004 by Immanuel Halupczok
#   Modified 2005,2006 by Immanuel Halupczok
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
#   inGelb1.xpm[.gz], inGelb2.xpm[.gz], inGelb.xpm[.gz], inGras.xpm[.gz],
#   inGrau.xpm[.gz], inGruen1.xpm[.gz], inGruen2.xpm[.gz], inGruen.xpm[.gz],
#   inOrangeNasen1.xpm[.gz], inOrangeNasen2.xpm[.gz], inOrangeNasen.xpm[.gz],
#   inRosaNasen1.xpm[.gz], inRosaNasen2.xpm[.gz], inRosaNasen.xpm[.gz],
#   inSchwarz2.xpm[.gz], inSchwarz.xpm[.gz]
#

# referenced from farming.ld, dungeon.ld, labskaus.ld, memory.ld, pause.xpm,
# desktop icons

Nasenkugeln={
  name="Noseballs"
  author="Immi"
  numexplode=4
  numexplode[1]=6
  chaingrass=0
  pics=inRosaNasen,inGruen,inGelb,inSchwarz,inOrangeNasen
  bgcolor=255,255,255
  topcolor=200,200,200
  toptime=50
  startpic=inGras
  startdist="**********"
  greypic=inGrau
  description="Put four balls together; then, they will explode. Try to make the grass explode, too."
  description[1]="Put six balls together; then, they will explode. Try to make the grass explode, too."
  
  <<
  
  # Zum testen, ob das Animations-Timing genau stimmt, wenn Blops von
  # einem Spieler zum anderen wandern: Einkommentieren, 2-Spieler-Modus
  # starten, Reihe rüberwechseln lassen. Das Gras sollte komplett Synchron
  # blinken.
  # var xxx;
  # inGras={
  #   xxx = (xxx + 1) % 10;
  #   switch {
  #     xxx != 0 -> {pos = version; *};
  #   };
  # };


  var schlaf;
  
  gruengelb={
    switch {
      schlaf==0 -> switch {
        1:600 => {1,1,1,1,{1;schlaf=1}};
        1:150 => {1,2,2,1};
        => 0;
      };
      schlaf==1 -> switch {
        1:80 => {1,0,1,2,{1;schlaf=0}};
        => 2;
      };
    };
    schema16;
    
    # Um Rüberreihen zu ärgern:
    #switch {
    #  kind@(0,1) == nothing && kind@(0,2) == outside -> kind@(0,1) = kind;
    #};
  };
  
  rosaorange={switch {
    1:200 => {1; #sound("inSchnuff.wav")
             },1,2,2,1,0,{1; #sound("inSchnuff.wav")
             },2,2,1,1;
    => 0;
  };schema16};
  >>
  inGruen={
    pics=inGruen.xpm,inGruen1.xpm,inGruen2.xpm
    <<
    inGruen=gruengelb;
    >>
  }
  inGelb={
    pics="inGelb.xpm",inGelb1.xpm,inGelb2.xpm
    <<
    inGelb=gruengelb;
    >>
  }
  inSchwarz={
    pics=inSchwarz.xpm,inSchwarz2.xpm
    <<
    var glaenz;
    inSchwarz={
      schema16;
      # Glanz:
      if 1:200 => {
        A,B,C,D,E,F,G,H,G,F,E,D,C,B,A;
        1*
      };
    };
    >>
  }
  inRosaNasen={
    pics=inRosaNasen.xpm,inRosaNasen1.xpm,inRosaNasen2.xpm
    <<
    inRosaNasen=rosaorange;
    >>
  }
  inOrangeNasen={
    pics=inOrangeNasen.xpm,inOrangeNasen1.xpm,inOrangeNasen2.xpm
    <<
    inOrangeNasen=rosaorange;
    >>
  }
  inGras={
    pics="inGras.xpm"
    versions=4
    <<
    var li, re;
    
    inGras={
      li = ??????1? || loc_x == 0;
      re = ??1????? || loc_x == 9;
      switch {
        li && re -> {pos=version + 1; *; pos=version+7; @(0,1)*};
	re -> {A*; G@(0,1)*;};
	li -> {F*; L@(0,1)*;};
	-> {
	  [qu=Q_TL] A*;
	  [qu=Q_BL] A*;
	  [qu=Q_TL] G@(0,1)*;
	  [qu=Q_TR] F*;
	  [qu=Q_BR] F*;
	  [qu=Q_TR] L@(0,1)*;
	};
      }
    };
    >>
  }
  inGrau={
    pics="inGrau.xpm"
    <<
    
    var dreh,gu;
    
    inGrau={
      switch {
	dreh==0 => switch {
          1:100 -> dreh=1;
          1:99 -> dreh=2;
	};
	dreh==1 => {
          switch {
            1:3 -> dreh=0;
          };
          gu+=1;
          gu%=8
	};
	dreh==2 => {
          switch {
            1:3 -> dreh=0;
          };
          gu+=7;
          gu%=8
	};
      };
      pos=gu;
      0*;
    };
    >>
  }
}

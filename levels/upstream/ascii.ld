#
#   Copyright <=2004 by Immanuel Halupczok
#   Maintenance modifications 2005,2011,2014 by the cuyo developers
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
#   iaApple.xpm[.gz], iaAusdruck.xpm[.gz], iaBefehl.xpm[.gz], iaError.xpm[.gz],
#   iaGrau.xpm[.gz], iaSchrift.xpm[.gz], iaString.xpm[.gz], iaZahl.xpm[.gz],
#   iaZeug.xpm[.gz]
#

ASCII={
  name="ASCII"
  author="Immi"
  numexplode=6
  chaingrass=0
  pics=iaBefehl,iaAusdruck,iaString,iaZahl
  bgcolor=0,0,0
  textcolor=239,206,139
  topcolor=0,0,0
  toppic=iaApple.xpm
  toptime=50
  startpic=iaError.xpm
  greypic=iaGrau.xpm
  startdist="ABCDEFGHIJ"
# TRANSLATORS: "basic" is a pun on the programming language BASIC.
  description="A very basic level"
  
  <<
  
  # links / rechts sagt, wie viele weiter Blobs links / rechts
  # von einem Blob von der gleichen Sorte sind.
  # Wird etwas verzögert berechnet.
  var links, rechts;
  
  calc_li_re={
    switch {
      ??????0? -> links = 0;
      ??????1? -> {links = links@(-1,0); links += 1};
    };
    switch {
      ??0????? -> rechts = 0;
      ??1????? -> {rechts = rechts@(1,0); rechts += 1};
    };
  };
  
  unterstrich=[file=1] {
    #switch {
    #  ????1??? -> A*;
    #};
    schema5;
    switch {
      loc_x == 0 -> F*;
    };
  };
  

  ###############
  
  iaBefehl={
    # TO
    # INPUT
    # NEXT:END
    #:GOTO 340
    calc_li_re;
    unterstrich;
    
    rechts %= 3;

    switch {
      links == 0 && rechts == 0 -> A;
      links == 0 && rechts == 1 -> B;
      links == 1 && rechts == 0 -> C;
      links == 0 && rechts == 2 -> D;
      links == 1 && rechts == 1 -> E;
      links == 2 && rechts == 0 -> F;
      rechts == 2 -> G;
      rechts == 1 -> H;
      rechts == 0 -> I;
    };
    *;
  };  # Ende Befehl


  iaString={
    # ""
    # "yes"
    # "type n"
    # y, a, c,
    calc_li_re;
    unterstrich;
    
    # rechts: 0, 1, 2, 3, 4, 2, 3, 4, 2, 3
    switch {
      rechts >= 5 -> rechts -= 3;
    };
    
    switch {
      ??0???0? -> A;
      links == 0 && rechts == 1 -> B;
      links == 1 && rechts == 0 -> C;
      links == 0 -> D;
      links == 1 -> E;
      rechts == 0 -> F;
      rechts == 1 || rechts == 4 -> G;
      rechts == 2 -> H;
      rechts == 3 -> I;
    };
    *;
  }; # Ende String
  

  iaAusdruck={
    # ?N
    # ?Y+DY
    # ?TAB(X1)
    #;A$(P-Q0)

    calc_li_re;
    unterstrich;
    
    rechts %= 3;

    switch {
      links == 0 && rechts == 0 -> A;
      links == 0 && rechts == 1 -> B;
      links == 1 && rechts == 0 -> C;
      links == 0 && rechts == 2 -> D;
      links == 1 && rechts == 1 -> E;
      links == 2 && rechts == 0 -> F;
      rechts == 2 -> G;
      rechts == 1 -> H;
      rechts == 0 -> I;
    };
    *;
  };  # Ende Ausdruck


  iaZahl={
    # 42
    # -4096
    # 7380.1E12
    calc_li_re;
    unterstrich;
    
    switch {
      links == 0 && rechts == 0 -> A;
      links == 0 -> B;
      links == 1 && rechts == 0 -> C;
      rechts == 0 -> F;
      links == rechts || links == rechts + 1 -> E;
      links % 2 == 0 -> C;
      -> D;
    };
    *;
  }; # Ende Zahl
  
  >>
  
  iaBefehl={
    pics=iaBefehl.xpm,iaZeug.xpm
  }
  iaAusdruck={
    pics=iaAusdruck.xpm,iaZeug.xpm
  }
  iaString={
    pics=iaString.xpm,iaZeug.xpm
  }
  iaZahl={
    pics=iaZahl.xpm,iaZeug.xpm
  }
}

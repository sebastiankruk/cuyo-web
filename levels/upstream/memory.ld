#
#   Copyright 2006 by Bernhard Seckinger
#   Maintenance modifications 2002,2003,2005,2006,2008,2011,2014 by the cuyo developers
#   Partly based on the following levels:
#   hexkugeln.ld which, at that time, was
#     Copyright <=2004 by Immanuel Halupczok
#   kunst.ld which, at that time, was
#     Copyright <=2004 by Immanuel Halupczok
#   pinguine.ld which, at that time, was
#     Created <=2002 by Bernhard Seckinger
#   hormone.ld which, at that time, was
#     Copyright <=2004 by Immanuel Halupczok
#   viecher.ld which, at that time, was
#     Copyright <=2004 by Immanuel Halupczok
#   nasenkugeln.ld which, at that time, was
#     Copyright <=2004 by Immanuel Halupczok
#   pfeile.ld which, at that time, was
#     Copyright <=2004 by Immanuel Halupczok
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
#   bmKarten.xpm[.gz], bmStrich.xpm[.gz], bmTisch.xpm[.gz]
#

# referenced from labskaus.ld

# Status: (M=Muss, S=Soll, K=Kann, F=Feature, B=Bugs)
#
# Fertig.
#
# FK Blumenbild wird nicht mehr "zitiert".

Memory={
# TRANSLATORS: "Memory" is the name of a commercial brand of the Pairs game,
# at least in the German market.
  name="Memory"
  author="Berni"
  numexplode=2
  chaingrass=0
  greypic=bm
  pics=bm*13
  bgcolor=255,255,255
  topcolor=0,0,0
  toptime=50
  startpic=bmTisch.xpm
  startdist[1]="++++++++++","AAAAAAAAAA"
  startdist="AAAAAAAAAA"
  textcolor=90,90,90
# TRANSLATORS: "Memory" is the name of a commercial brand of the Pairs game,
# at least in the German market.
  description="Well, memory."
  
  <<
  var zuklappen=1;
  
  karte={
    switch {
      falling || informational -> {
        # Am fallen
        *
      };
      zuklappen &&
        kind@(-1,0) != outside && kind@(-1,0) != nothing &&
	kind@(-1,0) != bmTisch &&
	zuklappen@(-1,0) -> {
        # Wir sollen zuklappen, aber links von uns ist eine Karte,
	# die auch noch nicht damit angefangen. Dann warten wir noch...
        # (Lustiger Rüberklapp-effekt.)
        *
      };
      zuklappen => {
        # Grade aufgekommen oder so was.
        # Aber erst noch ein Bildchen lang normal, weil sonst die
        # Start-Karten schon beim ersten Bild leicht umklappen.
        {zuklappen=0;*}, {pos+=15;*}, 1A*, P*
      };
      1:500 => {
        # Kurz aufklappen
        P*, 1A*, {pos+=15;*},
        *,*,*,*,*,*,*,*,*,*,*,*,*,*,
        {pos+=15;*}, 1A*, P*
      };
      -> A*; # zugeklappt
    };
  };
  >>

  bm={
    pics=bmKarten.xpm,bmStrich.xpm
    << bm={pos=kind-bm+1;karte}; >>
  }
}

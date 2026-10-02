#
#   Copyright 2012 by Austin Wang
#   Modified 2012,2014 by Mark Weyer
#   Modified 2014 by Immanuel Halupczok
#   Maintenance modifications 2012,2014 by the cuyo developers
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
#   aBoxFractal.xpm[.gz], aCantorSet.xpm[.gz], aDragon.xpm[.gz],
#   aMandelbrotTree.xpm[.gz], aRepTile.xpm[.gz], aSierpSieve.xpm[.gz]

Fractals = {
  name = "Fractals"
  author = "Austin W."
  description = "Three explode if in each aspect they are all the same or all different."

  pics=symbol
  bgpic=aMandelbrotTree.xpm
  startpic=aCantorSet.xpm
  startdist="AFGE..DHIC", "ABBE..DBBC", "ABBBBBBBBC","-J%&"
  startdist[hard]="JOPN..MQRL", "AFGE..DHIC", "ABBE..DBBC", "ABBBBBBBBC","-J%&"
  greypic=greyblob

  <<semiglobal.init={falling_speed=4;};>>

  symbol = {
    pics=aBoxFractal.xpm, aRepTile.xpm, aSierpSieve.xpm

    <<
    var type, rawtyp;

    symbol.init={
      rawtyp=rnd(27);
      # Encode middle digit mod 9:
      type = 1+((rawtyp /3) % 3)*273;
      # Encode last digit mod 7:
      switch {
        rawtyp % 3 == 1 -> type *= 352;
        rawtyp % 3 == 2 -> type *= 235;
      };
      # Encode first digit mod 13:
      switch {
        rawtyp / 9 == 1 -> type *= 757;
        rawtyp / 9 == 2 -> type *= 568;
      };
      type %= 819;  # 819 = 7*9*13
      inhibit=DIR_U + DIR_R + DIR_D + DIR_L;
    };

######## CONNECTION ########
    symbol.connect={
      # Connect with (0,-1) and (1,0) ?
      if 1?1????? && (1 == (type@(0,-1)*type@(1,0)*type@(0,0)) % 819) -> {
        inhibit@(0,-1)=0;
        inhibit@(0,0)=0;
        inhibit@(1,0)=0;
      };
      # Connect with (0,-1) and (0,1) ?
      if 1???1??? && (1 == (type@(0,-1)*type@(0,1)*type@(0,0)) % 819) -> {
        inhibit@(0,-1)=0;
        inhibit@(0,0)=0;
        inhibit@(0,1)=0;
      };
      # Connect with (0,-1) and (-1,0) ?
      if 1?????1? && (1 == (type@(0,-1)*type@(-1,0)*type@(0,0)) % 819) -> {
        inhibit@(0,-1)=0;
        inhibit@(0,0)=0;
        inhibit@(-1,0)=0;
      };
      # Connect with (1,0) and (0,1) ?
      if ??1?1??? && (1 == (type@(1,0)*type@(0,1)*type@(0,0)) % 819) -> {
        inhibit@(1,0)=0;
        inhibit@(0,0)=0;
        inhibit@(0,1)=0;
      };
      # Connect with (1,0) and (-1,0) ?
      if ??1????1 && (1 == (type@(1,0)*type@(-1,0)*type@(0,0)) % 819) -> {
        inhibit@(1,0)=0;
        inhibit@(0,0)=0;
        inhibit@(-1,0)=0;
      };
      # Connect with (0,1) and (-1,0) ?
      if ????1?1? && (1 == (type@(0,1)*type@(-1,0)*type@(0,0)) % 819) -> {
        inhibit@(0,1)=0;
        inhibit@(0,0)=0;
        inhibit@(-1,0)=0;
      };
    };

######## DRAWING IMAGE ########
    symbol={
      file=rawtyp / 9;
      pos=rawtyp % 9; *;
    };
    
    >>
    numexplode = 3
  }

  greyblob = {
    pics=aDragon.xpm
    colourprob=1
    <<
    greyblob = switch {
      kind@(0,1)==greyblob && kind@(0,2)!=greyblob && kind@(0,2)!=nothing
        => {A*, B*, C*, {D*;kind=nothing}};
      kind@(0,-1)==greyblob && kind@(0,1)!=greyblob && kind@(0,1)!=nothing
        => {{E,F,G,H};*};
      -> A*;
      };
    >>
  }
}






################################################################
###                                                          ###
###                   SYMBOLS && VARIABLES                   ###
###                                                          ###
################################################################
### Each set of distinct symbols has a number stored in the  ###
###  variable type. Items are characterized as follows:      ###
### - Box fractal, rep-tile, Sierpinski sieve (3 mod 13)     ###
### - Red, blue, green (4 mod 9)                             ###
### - Iteration 1, 2, or 3 (2 mod 7)                         ###
###  x mod n means that the value mod n is 1, x, or x^2 and  ###
###  that x^3 mod n=1.                                       ###
###                                                          ###
### Data is retrieved using modular arithmetic, and numbers  ###
###  are generated using applied Chinese Remainder Theorem.  ###
###  In case of mod 9, we exploit the fact that the          ###
###  geometric progression 1,x,x^2 also is an arithmetic     ###
###  progression, meaning that (x^2 = 2x-1) mod 9.           ###
###  We can find a blob's specific characteristics by taking ###
###  its type modulo 7, 9, and 13.                           ###
###  For connection, we check whether for all n as above,    ###
###  the three values are either all the same or all         ###
###  different. As x^3 mod n=1, this amounts to checking     ###
###  (for values x1, x2, x3) that (x1*x2*x3=1) mod n.        ###
###  Instead of extracting the three components, the check   ###
###  is done mod (7*9*13).                                   ###
###                                                          ###
################################################################
################################################################
################################################################
###                                                          ###
###                   NOTES (on gameplay)                    ###
###                                                          ###
################################################################
### Each blob has three distinct properties (fractal type,   ###
###  iteration in fractal, and color). A set of 3 blobs      ###
###  explode when for each property, the three blobs are all ###
###  the same within that property or all different.         ###
################################################################

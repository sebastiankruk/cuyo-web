#
#   Copyright 2011 Bernhard R. Link
#   Modified 2011 by Immanuel Halupczok
#   Modified 2011 by Mark Weyer
#   Maintenance modifications 2011,2014 by the cuyo developers
#   based heavily on schach.ld and thus also
#     Copyright <=2004 by Immanuel Halupczok
#     Maintenance modifications 2005,2006,2008 by the cuyo developers
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
#   ispBeige.xpm[.gz], ispBraun.xpm[.gz], ispGraubraun.xpm[.gz]
#   ispGrau.xpm[.gz], ispOrange.xpm[.gz], ispRest.xpm[.gz], ispSchwarz.xpm[.gz],
#   ispWeiss.xpm[.gz]
#

Springer={
  name="Knights"
  author="brl & Immi"
  # TRANSLATORS: "Knight" and "Pawn" refer to the chess pieces
  description="Knights connect via knight moves. Pawns don't connect at all."
  numexplode=6
  chaingrass[hard]=1
  pics=isSpringer * 6
  bgcolor=190,210,150
  startpic=isKoenig
  startdist="EEEEEEEEEE","EEEEEEEEEE"
  greypic=isBauer
  topcolor=15,45,20
  textcolor=20,75,25
  toptime=100
  neighbours=<neighbours_knight>
  <<
  knightlines={
    switch {
      basekind@(1,0)==isSpringer && kind@(-1,-1)==kind@(1,0) -> {
        [qu=Q_BL_TL] {A*};
        [qu=Q_BR_TR] {A*};
      };
    };
    switch {
      basekind@(1,1)==isSpringer && kind@(1,1)==kind@(-1,0) -> {
        [qu=Q_TL_BL] {A*};
        [qu=Q_TR_BR] {A*};
      };
    };
    switch {
      basekind@(1,-1)==isSpringer && kind@(1,-1)==kind@(-1,0) -> {
        [qu=Q_BL_TL] {D*};
        [qu=Q_BR_TR] {D*};
      };
    };
    switch {
      basekind@(1,0)==isSpringer && kind@(1,0)==kind@(-1,1) -> {
        [qu=Q_TL_BL] {D*};
        [qu=Q_TR_BR] {D*};
      };
    };
    switch {
      basekind@(0,1)==isSpringer && kind@(0,1)==kind@(-1,-1) -> {
        [qu=Q_TR_TL] {B*};
        [qu=Q_BR_BL] {B*};
      };
    };
    switch {
      basekind@(1,1)==isSpringer && kind@(1,1)==kind@(0,-1) -> {
        [qu=Q_TL_TR] {B*};
        [qu=Q_BL_BR] {B*};
      };
    };
    switch {
      basekind@(-1,1)==isSpringer && kind@(-1,1)==kind@(0,-1) -> {
        [qu=Q_TR_TL] {C*};
        [qu=Q_BR_BL] {C*};
      };
    };
    switch {
      basekind@(0,1)==isSpringer && kind@(0,1)==kind@(1,-1) -> {
        [qu=Q_TL_TR] {C*};
        [qu=Q_BL_BR] {C*};
      };
    };
  };
  >>

  isKoenig={
    pics=ispRest.xpm
    << isKoenig={B*}; >>
  }
  isBauer={
    pics=ispRest.xpm
    colourprob=3
    << isBauer={A*}; >>
  }
  isSpringer={
    pics=ispSchwarz.xpm,ispWeiss.xpm,ispGrau.xpm,ispBraun.xpm,ispBeige.xpm,ispOrange.xpm
    <<
    isSpringer={
      file=kind-isSpringer;
      if kind@(2,1) == kind -> {
        [qu=Q_BR] B*; [qu=Q_TL_BL] B@(1,0)*; [qu=Q_TR_BR] B@(1,0)*;
      };
      if kind@(-2,-1) == kind -> {
        [qu=Q_TL] B*; [qu=Q_BL_TL] B@(-1,0)*; [qu=Q_BR_TR] B@(-1,0)*;
      };
      if kind@(1,2) == kind -> {
        [qu=Q_BR] C*; [qu=Q_TL_TR] C@(0,1)*; [qu=Q_BL_BR] C@(0,1)*;
      };
      if kind@(-1,-2) == kind -> {
        [qu=Q_TL] C*; [qu=Q_TR_TL] C@(0,-1)*; [qu=Q_BR_BL] C@(0,-1)*;
      };
      if kind@(-1,2) == kind -> {
        [qu=Q_BL] D*; [qu=Q_TR_TL] D@(0,1)*; [qu=Q_BR_BL] D@(0,1)*;
      };
      if kind@(1,-2) == kind -> {
        [qu=Q_TR] D*; [qu=Q_TL_TR] D@(0,-1)*; [qu=Q_BL_BR] D@(0,-1)*;
      };
      if kind@(2,-1) == kind -> {
        [qu=Q_TR] E*; [qu=Q_BL_TL] E@(1,0)*; [qu=Q_BR_TR] E@(1,0)*;
      };
      if kind@(-2,1) == kind -> {
        [qu=Q_BL] E*; [qu=Q_TL_BL] E@(-1,0)*; [qu=Q_TR_BR] E@(-1,0)*;
      };
      A*;
    };
    >>
  }
}

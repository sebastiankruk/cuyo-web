#
#   Copyright 2005,2006,2011,2014 by Mark Weyer
#   Maintenance modifications 2006,2008,2011 by the cuyo developers
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

SilberGold={
  name="Silver and Gold"
  author="Mark Weyer"
  numexplode=4
  numexplode[easy]=3
  chaingrass=0
  pics=silber,gold,silbergold,goldsilber
  bgcolor=0,0,0
  topcolor=255,255,255
  textcolor=255,0,0
  toptime=200
  startpic=mgsWeiss.xpm
  startdist=".**.**.**.","**********","**********"
  startdist[easy]=".**.**.**.","**********"
  neighbours=<neighbours_knight>
  speed=6
  speed[easy]=3

  <<

    semiglobal.init = {falling_speed=speed;};

    # Bei den 8 Malroutinen muss vorher file auf die Farbe gesetzt sein.
    llo = {
      qu=Q_TL;
      if kind==kind@(-2,-1) -> {B*; [file=0]{
          C;@(-1,0)*; D;*@(-1,0);
          qu=Q_TR;
          C;@(-1,0)*; D;*@(-1,0);
        }}
      else A*;
    };

    loo = {
      qu=Q_TL;
      if kind==kind@(-1,-2) -> {B*; [file=1]{
          C;@(0,-1)*; D;*@(0,-1);
          qu=Q_BL;
          C;@(0,-1)*; D;*@(0,-1);
        }}
      else A*;
    };

    roo = {
      qu=Q_TR;
      if kind==kind@(1,-2) -> {B*; [file=1]{
          A;@(0,-1)*; B;*@(0,-1);
          qu=Q_BR;
          A;@(0,-1)*; B;*@(0,-1);
        }}
      else A*;
    };

    rro = {
      qu=Q_TR;
      if kind==kind@(2,-1) -> {B*; [file=0]{
          A;@(1,0)*; B;*@(1,0);
          qu=Q_TL;
          A;@(1,0)*; B;*@(1,0);
        }}
      else A*;
    };

    rru = {
      qu=Q_BR;
      if kind==kind@(2,1) -> {B*; [file=0]{
          C;@(1,0)*; D;*@(1,0);
          qu=Q_BL;
          C;@(1,0)*; D;*@(1,0);
        }}
      else A*;
    };

    ruu = {
      qu=Q_BR;
      if kind==kind@(1,2) -> {B*; [file=1]{
          C;@(0,1)*; D;*@(0,1);
          qu=Q_TR;
          C;@(0,1)*; D;*@(0,1);
        }}
      else A*;
    };

    luu = {
      qu=Q_BL;
      if kind==kind@(-1,2) -> {B*; [file=1]{
          A;@(0,1)*; B;*@(0,1);
          qu=Q_TL;
          A;@(0,1)*; B;*@(0,1);
        }}
      else A*;
    };

    llu = {
      qu=Q_BL;
      if kind==kind@(-2,1) -> {B*; [file=0]{
          A;@(-1,0)*; B;*@(-1,0);
          qu=Q_BR;
          A;@(-1,0)*; B;*@(-1,0);
        }}
      else A*;
    };

  >>

  silber = {
    pics = mgsSilber.xpm, mgsSilberVerbind.xpm
    greyprob=1
    <<
      default inhibit = DIR_LLU+DIR_LLD+DIR_RRD+DIR_RRU : reapply;

      silber = {
        0; loo; roo; ruu; luu;
        if informational && 1:5 => {,,,,,kind=silber+rnd(4)};
      };
    >>
  }

  gold = {
    pics = mgsGoldVerbind.xpm, mgsGold.xpm
    greyprob=1
    <<
      default inhibit = DIR_UUL+DIR_DDL+DIR_DDR+DIR_UUR : reapply;

      gold = {
        1; llo; rro; rru; llu;
        if informational && 1:5 => {,,,,,kind=silber+rnd(4)};
      };
    >>
  }

  silbergold = {
    pics = mgsGoldVerbind.xpm, mgsSilberVerbind.xpm, mgsSilberGold.xpm
    greyprob=1
    <<
      default inhibit = DIR_UUL+DIR_LLD+DIR_DDR+DIR_RRU : reapply;

      silbergold = {
        2; llo; roo; rru; luu;
        if informational && 1:5 => {,,,,,kind=silber+rnd(4)};
      };
    >>
  }

  goldsilber = {
    pics = mgsGoldVerbind.xpm, mgsSilberVerbind.xpm, mgsGoldSilber.xpm
    greyprob=1
    <<
      default inhibit = DIR_LLU+DIR_DDL+DIR_RRD+DIR_UUR : reapply;

      goldsilber = {
        2; loo; rro; ruu; llu;
        if informational && 1:5 => {,,,,,kind=silber+rnd(4)};
      };
    >>
  }

}


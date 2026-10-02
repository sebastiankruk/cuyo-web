#
#   Copyright 2014 by Mark Weyer
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
# mfaBack.xpm[.gz], mfaCabbage.xpm[.gz], mfaCattle.xpm[.gz], mfaFence.xpm[.gz],
# mfaMaize.xpm[.gz], mfaPigs.xpm[.gz], mfaRoad.xpm[.gz], mfaWater.xpm[.gz],
# mfaWheat.xpm[.gz]

Farming = {
  name = "Farming"
  author = "Mark Weyer"
  description = "Almost each level has its very own graphics.\nAt least this level has exactly the same rules as the previous one."
  pics = Cattle,Pigs,Wheat,Cabbage,Maize
  greypic = Water
  startpic = Road
  startdist = "**********"
  numexplode[1] = 6
  numexplode[2] = 4
  bgpic = mfaBack.xpm
  bgcolor = 106,190,48

  <<
    Fence = {
      qu=Q_TL;
      switch {
        0?????0? -> if kind@(0,-1)==Cattle..Pigs
          -> if kind@(-1,0)==Cattle..Pigs
            -> if kind@(-1,-1)==Cattle..Pigs
              -> J*
              else I*
            else C*
          else if kind@(-1,0)==Cattle..Pigs
            -> G*
            else A*;
        1?????0? -> if kind@(-1,0)==Cattle..Pigs
          -> if kind@(-1,-1)==Cattle..Pigs
            -> K*
            else H*
          else B*;
        0?????1? -> if kind@(0,-1)==Cattle..Pigs
          -> if kind@(-1,-1)==Cattle..Pigs
            -> M*
            else F*
          else D*;
        1?????10 -> if kind@(-1,-1)==Cattle..Pigs
          -> N*
          else E*;
        # 1?????11 -> nothing to draw;
      };
      qu=Q_TR;
      switch {
        0?0????? -> if kind@(0,-1)==Cattle..Pigs
          -> if kind@(1,0)==Cattle..Pigs
            -> if kind@(1,-1)==Cattle..Pigs
              -> J*
              else I*
            else C*
          else if kind@(1,0)==Cattle..Pigs
            -> G*
            else A*;
        1?0????? -> if kind@(1,0)==Cattle..Pigs
          -> if kind@(1,-1)==Cattle..Pigs
            -> K*
            else H*
          else B*;
        0?1????? -> if kind@(0,-1)==Cattle..Pigs
          -> if kind@(1,-1)==Cattle..Pigs
            -> M*
            else F*
          else D*;
        101????? -> if kind@(1,-1)==Cattle..Pigs
          -> N*
          else E*;
        # 111????? -> nothing to draw;
      };
      qu=Q_BL;
      switch {
        ????0?0? -> if kind@(0,1)==Cattle..Pigs
          -> if kind@(-1,0)==Cattle..Pigs
            -> if kind@(-1,1)==Cattle..Pigs
              -> J*
              else I*
            else C*
          else if kind@(-1,0)==Cattle..Pigs
            -> G*
            else A*;
        ????1?0? -> if kind@(-1,0)==Cattle..Pigs
          -> if kind@(-1,1)==Cattle..Pigs
            -> K*
            else H*
          else B*;
        ????0?1? -> if kind@(0,1)==Cattle..Pigs
          -> if kind@(-1,1)==Cattle..Pigs
            -> M*
            else F*
          else D*;
        ????101? -> if kind@(-1,1)==Cattle..Pigs
          -> N*
          else E*;
        # ????111? -> nothing to draw;
      };
      qu=Q_BR;
      switch {
        ??0?0??? -> if kind@(0,1)==Cattle..Pigs
          -> if kind@(1,0)==Cattle..Pigs
            -> if kind@(1,1)==Cattle..Pigs
              -> J*
              else I*
            else C*
          else if kind@(1,0)==Cattle..Pigs
            -> G*
            else A*;
        ??0?1??? -> if kind@(1,0)==Cattle..Pigs
          -> if kind@(1,1)==Cattle..Pigs
            -> K*
            else H*
          else B*;
        ??1?0??? -> if kind@(0,1)==Cattle..Pigs
          -> if kind@(1,1)==Cattle..Pigs
            -> M*
            else F*
          else D*;
        ??101??? -> if kind@(1,1)==Cattle..Pigs
          -> N*
          else E*;
        # 111????? -> nothing to draw;
      };
      qu=Q_ALL;
    };
  >>

  Cattle = {
    pics = mfaFence.xpm, mfaCattle.xpm
    <<
      Cattle = {
        if falling -> 1B*
        else {0; Fence; 1A*};
      };
    >>
  }

  Pigs = {
    pics = mfaFence.xpm, mfaPigs.xpm
    <<
      Pigs = {
        if falling -> 1F*
        else {0; Fence; 1; schema5; 1G*};
      };
    >>
  }

  Wheat = {
    pics = mfaWheat.xpm
    <<
      Wheat = schema5;
    >>
  }

  Cabbage = {
    pics = mfaCabbage.xpm
    <<
      Cabbage = schema5;
    >>
  }

  Maize = {
    pics = mfaMaize.xpm
    <<
      Maize = schema5;
    >>
  }

  Road = {
    pics = mfaRoad.xpm
    <<
      Road = schema16;
    >>
  }

  Water = {
    pics = mfaWater.xpm
    << Water = schema5; >>
  }

}


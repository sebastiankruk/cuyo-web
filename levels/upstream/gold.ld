#
#   Copyright 2005,2011 by Mark Weyer
#   Modified 2006,2010 by Mark Weyer
#   Maintenance modifications 2006,2008,2011,2014 by the cuyo developers
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

Gold={
  name="Gold"
  author="Mark Weyer"
  description[1]="Yes, it CAN be completed"
  description[2]="Yes, it CAN be completed\n...cooperatively"
  numexplode=10
  chaingrass=0
  bgcolor=0,0,0
  topcolor=255,255,255
  textcolor=255,0,0
  toptime=200
  startpic=gold
  startdist="**..**..**","**..**..**","**..**..**"
  neighbours=<neighbours_knight>
  randomgreys=200

  gold = {
    pics = mgsGoldVerbind.xpm, mgsGold.xpm
    colourprob = 1
    greyprob = 1
    <<
      default inhibit = DIR_UUL+DIR_DDL+DIR_DDR+DIR_UUR;
      default behaviour = goalblob+calculate_size+explodes_on_size;

      llo = {
        qu=Q_TL;
        if kind==kind@(-2,-1) -> {B*; [file=0]{
            C;@(-1,0)*; D;*@(-1,0);
            qu=Q_TR;
            C;@(-1,0)*; D;*@(-1,0);
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

      llu = {
        qu=Q_BL;
        if kind==kind@(-2,1) -> {B*; [file=0]{
            A;@(-1,0)*; B;*@(-1,0);
            qu=Q_BR;
            A;@(-1,0)*; B;*@(-1,0);
          }}
        else A*;
      };

      gold = {1; llo; rro; rru; llu;};
    >>
  }


  << info = if version==0 -> A* else H*; >>

}



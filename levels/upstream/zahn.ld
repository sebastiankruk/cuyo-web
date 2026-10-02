#
#   Copyright 2005,2010 by Mark Weyer
#   Modified 2006 by Mark Weyer
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

Zahn={
  name="Teeth"
  author="Mark Weyer"
  numexplode=6
  toptime=100
  pics=Zahn
  greypic=Grau
  startpic=Start
  startdist="**********","**********","**********"
  bgcolor=0,0,0
  chaingrass=0
  topcolor=255,255,170
  textcolor=204,204,136
  randomgreys[1]=100
  neighbours=<neighbours_eight>

  <<

    var oben,unten,links,rechts,obenlinks,
        untenlinks,obenrechts,untenrechts,
        zwischenablage;

    Drehen = {
      zwischenablage = oben;
      oben = obenlinks;
      obenlinks = links;
      links = untenlinks;
      untenlinks = unten;
      unten = untenrechts;
      untenrechts = rechts;
      rechts = obenrechts;
      obenrechts = zwischenablage;
    };

    Dreh_vor = {Drehen; Drehen;};

    Dreh_zufaellig = {
      if 1:2 -> {Dreh_vor; Dreh_vor;};
      if 1:2 -> Dreh_vor;
      if 1:2 -> Drehen;
    };

    Zahn = {
      switch {
        turn==0 -> {
          file = 2*behaviour.goalblob;
          qu=Q_TL;
          if links
            -> if ??????1? && rechts@(-1,0) -> pos=2 else pos=1
            else pos=0;
          if oben
            -> {if 1??????? && unten@(0,-1) -> pos+=6 else pos+=3;};
          if obenlinks
            -> {if ???????1 && untenrechts@(-1,-1) -> pos+=18 else pos+=9;};
          *;
          qu=Q_TR;
          if rechts
            -> if ??1????? && links@(1,0) -> pos=2 else pos=1
            else pos=0;
          if oben
            -> {if 1??????? && unten@(0,-1) -> pos+=6 else pos+=3;};
          if obenrechts
            -> {if ?1?????? && untenlinks@(1,-1) -> pos+=18 else pos+=9;};
          *;
          qu=Q_BL;
          if links
            -> if ??????1? && rechts@(-1,0) -> pos=2 else pos=1
            else pos=0;
          if unten
            -> {if ????1??? && oben@(0,1) -> pos+=6 else pos+=3;};
          if untenlinks
            -> {if ?????1?? && obenrechts@(-1,1) -> pos+=18 else pos+=9;};
          *;
          qu=Q_BR;
          if rechts
            -> if ??1????? && links@(1,0) -> pos=2 else pos=1
            else pos=0;
          if unten
            -> {if ????1??? && oben@(0,1) -> pos+=6 else pos+=3;};
          if untenrechts
            -> {if ???1???? && obenlinks@(1,1) -> pos+=18 else pos+=9;};
          *;
        };
        turn==1 -> {
          file=1;
          qu=Q_TL;
          if rechts -> pos=1 else pos=0;
          if obenrechts -> pos+=2;
          if obenlinks -> pos+=4;
          if oben -> pos+=8;
          *;
          qu=Q_TR;
          if rechts -> pos=1 else pos=0;
          if obenrechts -> pos+=2;
          if untenrechts -> pos+=4;
          if unten -> pos+=8;
          *;
          qu=Q_BL;
          if links -> pos=1 else pos=0;
          if untenlinks -> pos+=2;
          if obenlinks -> pos+=4;
          if oben -> pos+=8;
          *;
          qu=Q_BR;
          if links -> pos=1 else pos=0;
          if untenlinks -> pos+=2;
          if untenrechts -> pos+=4;
          if unten -> pos+=8;
          *;
        };
        turn==2 -> {
          file=1;
          qu=Q_TL;
          if links -> pos=17 else pos=16;
          if obenrechts -> pos+=2;
          if obenlinks -> pos+=4;
          if oben -> pos+=8;
          *;
          qu=Q_TR;
          if rechts -> pos=17 else pos=16;
          if obenrechts -> pos+=2;
          if untenrechts -> pos+=4;
          if oben -> pos+=8;
          *;
          qu=Q_BL;
          if links -> pos=17 else pos=16;
          if untenlinks -> pos+=2;
          if obenlinks -> pos+=4;
          if unten -> pos+=8;
          *;
          qu=Q_BR;
          if rechts -> pos=17 else pos=16;
          if untenlinks -> pos+=2;
          if untenrechts -> pos+=4;
          if unten -> pos+=8;
          *;
        };
      };
    };

    Zahn.turn = {Dreh_vor;};

    Zahn.connect = {
      inhibit=0;
      if !links -> inhibit+=DIR_L;
      if !rechts -> inhibit+=DIR_R;
      if !oben -> inhibit+=DIR_U;
      if !unten -> inhibit+=DIR_D;
      if !obenlinks -> inhibit+=DIR_UL;
      if !obenrechts -> inhibit+=DIR_UR;
      if !untenlinks -> inhibit+=DIR_DL;
      if !untenrechts -> inhibit+=DIR_DR;
    };

    Init_drei = {
      oben=1;
      links=1;
      untenrechts=1;
      Dreh_zufaellig;
    };

    Start.init = {
      kind=Zahn;
      behaviour.+=goalblob;
      Init_drei;
    };

    Zahn.init = {
      oben = 1; Dreh_zufaellig;
      oben = 1; Dreh_zufaellig;
      oben = 1; Dreh_zufaellig;
      oben = 1; Dreh_zufaellig;
    };

    Grau.init = {
      kind=Zahn;
      Init_drei;
    };

  >>

  Zahn = {pics=mzZahn.xpm, mzZahnDreh.xpm, mzZahnGras.xpm}
  Grau = {}
  Start = {}
    
}


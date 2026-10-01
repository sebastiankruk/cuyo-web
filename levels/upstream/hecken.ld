#
#   Copyright 2011 by Mark Weyer
#   based on go.ld which, at that time, was:
#     Copyright <=2004 by Immanuel Halupczok
#     Modified 2006,2008 by Mark Weyer
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

Go={
  name="Gardens"
  author="Immi"
  #numexplode[1]=4
  numexplode=3
  chaingrass=1
  pics   = stein*2
  pics[1]= stein*3
  # *4
  startpic=mihStein.xpm
  startdist="*........*","**......**","***....***","****..****"
  greypic=mihLoch.xpm
  toptime=80
  #randomgreys[1]=200
  description="Gardens need hedges for separation. The hedges do not count for the size of a garden, though."
  bgcolor = 48,191,48


  <<
  var gli,gre,gob,gun,hli,hre,hob,hun;

  stein={
    # gli sagt: Der Garten geht nach links weiter.
    gli = kind@(-1,0)==kind || kind@(-1,0)==outside;
    gre = kind@(1,0)==kind || kind@(1,0)==outside;
    gob = kind@(0,-1)==kind || kind@(0,-1)==outside;
    gun = kind@(0,1)==kind || kind@(0,1)==outside;
    weight = (!falling) && gli && gre && gob && gun;

    switch {
      falling -> {};
      weight@(0,0) -> F*;
      -> {
        # hli sagt: die Hecke geht nach links weiter.
        hli = kind@(-1,0)==outside || (
          basekind@(-1,0)==stein && !weight@(-1,0) && (kind@(-1,0)!=kind
            || !gob@(0,0) || !gob@(-1,0) || !gun@(0,0) || !gun@(-1,0)));
        hre = kind@(1,0)==outside || (
          basekind@(1,0)==stein && !weight@(1,0) && (kind@(1,0)!=kind
            || !gob@(0,0) || !gob@(1,0) || !gun@(0,0) || !gun@(1,0)));
        hob = kind@(0,-1)==outside || (
          basekind@(0,-1)==stein && !weight@(0,-1) && (kind@(0,-1)!=kind
            || !gli@(0,0) || !gli@(0,-1) || !gre@(0,0) || !gre@(0,-1)));
        hun = kind@(0,1)==outside || (
          basekind@(0,1)==stein && !weight@(0,1) && (kind@(0,1)!=kind
            || !gli@(0,0) || !gli@(0,1) || !gre@(0,0) || !gre@(0,1)));

        if hli ->
          if hob ->
            if hob@(-1,0) && hli@(0,-1) && !1?????11 -> E else B
          else A
        else if hob -> D else C;
        qu=Q_TL; *;

        if hre ->
          if hob ->
            if hob@(1,0) && hre@(0,-1) && !111????? -> D else E
          else A
        else if hob -> B else C;
        qu=Q_TR; *;

        if hli ->
          if hun ->
            if hun@(-1,0) && hli@(0,1) && !????111? -> B else A
          else E
        else if hun -> D else C;
        qu=Q_BL; *;

        if hre ->
          if hun ->
            if hun@(1,0) && hre@(0,1) && !??111??? -> A else D
          else E
        else if hun -> B else C;
        qu=Q_BR; *;
      };
    };
    qu=Q_ALL;
    pos=6+kind-stein;
    *;
  };
  >>

  stein={ pics=mihGarten.xpm }
}

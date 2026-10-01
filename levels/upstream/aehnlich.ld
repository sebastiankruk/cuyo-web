#
#   Copyright 2006-2008,2010 by Mark Weyer
#   Maintenance modifications 2011 by the cuyo developers
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

Aehnlich={
  name = "Similar balls"
  description[geek] = "Numerically equal colours connect"
  author = "Mark Weyer"
  anzahl = 96
  abstand = <anzahl/6>
  abstand[easy] = <anzahl/4>
  abstand[hard] = <anzahl/8>
  pics = Kugel
  startpic = Rest
  greypic = Rest
  startdist = "***....***","***....***","***....***"
  numexplode = 17
  numexplode[2] = 13
  bgcolor = 0,0,0
  textcolor = 160,176,164

  Kugel = {
    pics = maeSchema.xpm,maeSorten.xpm
    versions = <anzahl>

    <<
      var dx, dy, ergebnis, rechts, links, oben, unten;

      gleich = {
        ergebnis =  ((version@(dx,dy)-version) % anzahl < abstand) ||
            ((version-version@(dx,dy)) % anzahl < abstand);
      };

      Kugel.connect = {
        inhibit = 0;
	if kind@(0,1)==Kugel -> {
          dx=0; dy=1; gleich;
          if !ergebnis -> inhibit+=DIR_D};
	if kind@(1,0)==Kugel -> {
          dx=1; dy=0; gleich;
          if !ergebnis -> inhibit+=DIR_R};
      };

      Kugel = {
        dx=0; dy=1; gleich; unten = (kind@(0,1)==Kugel) && ergebnis;
        dx=1; dy=0; gleich; rechts = (kind@(1,0)==Kugel) && ergebnis;
        dx=0; dy=-1; gleich; oben = (kind@(0,-1)==Kugel) && ergebnis;
        dx=-1; dy=0; gleich; links = (kind@(-1,0)==Kugel) && ergebnis;
        qu=Q_TL; pos = links+2*oben; *;
        qu=Q_TR; pos = 1-rechts+2*oben; *;
        qu=Q_BL; pos = 2+links-2*unten; *;
        qu=Q_BR; pos = 3-rechts-2*unten; *;
        qu=Q_ALL; pos=version; 1*;
      };
    >>
  }

  Rest = {
    pics = maeSchema.xpm,maeSorten.xpm

    <<
      Rest = {
        qu=Q_TL; A*;
        qu=Q_TR; B*;
        qu=Q_BL; C*;
        qu=Q_BR; D*;
        qu=Q_ALL; pos=anzahl+kind-Rest; 1*;};
    >>
  }

}


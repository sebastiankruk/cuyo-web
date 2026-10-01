#
#   Copyright <=2004 by Bernhard R. Link
#   Maintenance modifications 2005,2006,2008,2011 by the cuyo developers
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
#   lbBlack.xpm[.gz], lbBomb.xpm[.gz], lbGray.xpm[.gz]
#
Explosive={
  name="Explosive"
  author="brl"
  numexplode=8
  numexplode[1]=8
  chaingrass=1
  pics=lbBomb
  bgcolor=190,190,190
  startpic=lbBlack
  startdist="..A....A..","..AA..AA.."
  greypic=lbGray.xpm
  topcolor=210,210,210
  randomgreys=190
  randomgreys[1]=20
  toptime=50

  lbBlack={
	  pics = lbBlack.xpm
	  schema=0
  }

  lbBomb={
	pics=lbBomb.xpm
    	<< lbBomb= {
		switch {
			size == ..1 -> A;
			size == 2 -> B;
			size == 3 -> B;
			size == 4 -> B;
			size == 5 -> B;
			size == 6 -> C;
			size == 7 -> D;
			size == 8.. -> E;
		};
		0;
		*;
	};
	>>
  }
}

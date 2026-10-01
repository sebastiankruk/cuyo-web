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
#   elBlack.xpm.gz, elBlue.xpm.gz, elGray.xpm.gz, elGreen.xpm.gz, elRed.xpm.gz,
#   elYellow.xpm.gz
#

Elemente={
  name="Elements"
  author="brl"
  numexplode=9
  chaingrass=1
  pics=elBlue.xpm,elRed.xpm,elYellow.xpm,elGreen.xpm
  bgcolor=0,0,0
  topcolor=10,10,10
  textcolor=50,60,50
  toptime=90
  greypic=elGray.xpm
  startpic=elBlack.xpm
  startdist[1]="A........A","A...A....A","A..AAA...A","A..AAA...A","A..AAAA..A"
  startdist="A........A","A...-....A","A..---...A","A..---...A","A..----..A"

  <<
  elBlack=schema16;
  >>
}

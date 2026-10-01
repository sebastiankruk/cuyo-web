#
#   Copyright 2006 by Mark Weyer
#   Maintenance modifications 2008,2011,2014 by the cuyo developers
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

Rollenspiel = {
  name = "Fantasy role playing"
  author="Mark Weyer"
#  pics = Wuerfel * 6
  pics = Fee, Kobold, Mensch, Zwerg, Elf, Troll
  greypic = Grau
  startpic = mrpAlle.xpm
  startdist = "..HH..HH..",".HHH..HHH.","-H%&"
  chaingrass = 1
  nogreyprob = 1

#  Wuerfel = {
#    pics = mrpAlle.xpm
#    numexplode = <1+kind-Wuerfel>
#
#    << Wuerfel = {pos=numexplode;*;}; >>
#  }

  Grau = { pics = mrpAlle.xpm << Grau=*; >>}

  Fee    = {pics = mrpAlle.xpm numexplode = 1 << Fee=B*; >>}
  Kobold = {pics = mrpAlle.xpm numexplode = 2 << Kobold=C*; >>}
  Mensch = {pics = mrpAlle.xpm numexplode = 3 << Mensch=D*; >>}
  Zwerg  = {pics = mrpAlle.xpm numexplode = 4 << Zwerg=E*; >>}
  Elf    = {pics = mrpAlle.xpm numexplode = 5 << Elf=F*; >>}
  Troll  = {pics = mrpAlle.xpm numexplode = 6 << Troll=G*; >>}

}


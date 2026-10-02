#
#   Copyright 2005,2006,2014 by Mark Weyer
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

Maennchen = {
  name = "Characters"
  author = "Mark Weyer"
  pics = maennchen*3
  greypic = grau
  startpic = mmGrasgrau.xpm
  startdist = "...BBBB...",".BBBBBBBB.","BBBBBBBBBB","-B%&"
  chaingrass[hard] = 1

  maennchen = {
    pics = mmBlau.xpm, mmRot.xpm, mmGelb.xpm
    <<
      maennchen.init = {weight = rnd(3)+1;};
      maennchen = {file=kind-maennchen; pos=weight+3; *; schema4;};
    >>
    numexplode = 10
  }

  grau = {
    pics=mmGrasgrau.xpm
    << grau=*; >>
  }

}

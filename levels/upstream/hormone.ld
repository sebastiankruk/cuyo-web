#
#   Copyright <=2004 by Immanuel Halupczok
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
#   ihBlau.xpm[.gz], ihBunt.xpm[.gz], ihGrau.xpm[.gz], ihGruen.xpm[.gz],
#   ihLila.xpm[.gz],  ihRot.xpm[.gz]
#

# referenced from memory.ld

Hormone={
  name="Hormones"
  author="Immi"
  numexplode=4
  numexplode[1]=6
  chaingrass=1
  pics=ihRot.xpm,ihGruen.xpm,ihBlau.xpm,ihLila.xpm
  pics[2]=ihRot.xpm,ihGruen.xpm,ihBlau.xpm
  toptime=50
  startpic="ihBunt.xpm"
  greypic="ihGrau.xpm"
  neighbours=<neighbours_diagonal>
  startdist[1]="++++++++++","----------","++++++++++","AAAAAAAAAA"
  startdist="AAAAAAAAAA"
  bgcolor=0,0,0
  textcolor=255,255,255
  description="When do the \"hormones\" connect?"

  <<
  ihRot=schemaDiag2;
  ihGruen=schemaDiag2;
  ihBlau=schemaDiag2;
  ihLila=schemaDiag2;
  >>
}

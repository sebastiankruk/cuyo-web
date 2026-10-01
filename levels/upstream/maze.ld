#
#   Copyright 2002,2004-2006,2014 by Mark Weyer
#   Modified 2010 by Mark Weyer
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

Labyrinth={
  name="Maze"
  description="Collect all treasures. Finding the exit is optional."
  author="Mark Weyer"
  numexplode=4
  chaingrass=0
  sorten = 6
  sorten[easy] = 4
  pics=Sorte * <sorten>
  bgcolor=255,255,255
  toppic=mlTop.xpm
  topoverlap=0
  topcolor=255,255,255
  toptime[1]=80
  toptime[2]=200
  startpic=Gras
  startdist[1]=
    "**********","**********","**********","**********","**********","yz%&"
  startdist[2]="**********","**********","**********","**********","yz%&"
  startdist[1,easy]="**********","**********","**********","yz%&"
  startdist[2,easy]="**********","**********","yz%&"
  emptypic=mlHinter.xpm
  greypic=Grau
  nogreyprob=<2*sorten>
  
  <<
    Gras.init = {
      if kind@(0,1)!=outside && 2:3 -> switch {
        2:3 -> kind@(0,0)=Sorte+rnd(sorten);
            -> kind@(0,0)=Grau;
      };
    };

    Sorte = {file=kind-Sorte; schema16;};

    Grau = schema16;

    Gras = schema16;

    mlHinter = switch {
      1?1?1?1? -> ;
               -> schema16;
    };
  >>

  Sorte = {
    pics = mlSorte2.xpm, mlSorte4.xpm, mlSorte5.xpm,
           mlSorte6.xpm, mlSorte1.xpm, mlSorte3.xpm
    greyprob = 4
  }
  Gras = {
    pics = mlGras.xpm
    distkey = "z"
  }
  Grau = {
    pics = mlGrau.xpm
    distkey = "y"
    greyprob = <3*sorten>
  }
}


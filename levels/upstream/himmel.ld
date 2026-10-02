#
#   Copyright <=2002 by Daniela Lipps
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
# The above notices apply to this file and to:
#   jhBallons.xpm[.gz], jhBlitz_anim.xpm[.gz], jhBlitz.xpm[.gz],
#   jhDrachensteigen.xpm[.gz], jhGraueWolken.xpm[.gz], jhGraueWolke.xpm[.gz],
#   jhHelleWolken.xpm[.gz], jhLandschaft.xpm[.gz], jhSonne.xpm[.gz],
#   jhVoegel_ani1.xpm[.gz], jhVoegel_ani2.xpm[.gz], jhVoegel_ani3.xpm[.gz],
#   jhVoegel_ani4.xpm[.gz], jhVoegel_ani5.xpm[.gz], jhVoegel_ani6.xpm[.gz],
#   jhVoegel_ani7.xpm[.gz], jhVoegel.xpm[.gz]
#

# referenced from labskaus.ld

Himmel={
  name="Sky"
  author="Jela"
  numexplode=4
  numexplode[1]=6
  chaingrass=1
  pics=Blitz,Voegel,jhHelleWolken.xpm,jhDrachensteigen.xpm,jhBallons.xpm
  bgcolor=150,170,255
  topcolor=60,60,60
  toptime=50
  startpic=jhSonne.xpm
  startdist="KL........","FGH.......","ABCDIJIJDE","-M%&"
  greypic=jhGraueWolke.xpm
  #(wenn man nur einzelne, nicht verbundene Wolken will.)
  #greypic=GraueWolken
  textcolor=0,0,50
  mirror=1
  toppic=jhLandschaft.xpm
  topoverlap=65
  topstop=65
  description="In which direction do balloons fall?"

  <<
  var fluegel=0;
  global={
    fluegel+=1;
    fluegel%=8
  };
  >>

  Blitz={
    pics=jhBlitz.xpm,jhBlitz_anim.xpm
    <<
    var leucht;
    Blitz={
      switch {
        1:100 && kind@(0,-1)!=Blitz || leucht@(0,-1) => leucht=1,leucht=0;
      };
      switch {
        leucht => 1,1,0,0,0,0,0,0,1;
      };
      schema16
    };
    >>
  }
  
  Voegel={
    pics=jhVoegel.xpm,jhVoegel_ani1.xpm,jhVoegel_ani2.xpm,
         jhVoegel_ani3.xpm,jhVoegel_ani4.xpm,jhVoegel_ani5.xpm,
         jhVoegel_ani6.xpm,jhVoegel_ani7.xpm
    <<
    Voegel={
      file=fluegel@;
      schema16
    };
    >>
  }
  #GraueWolken={
  #pics=jhGraueWolken.xpm
  #schema=0
  #}
}


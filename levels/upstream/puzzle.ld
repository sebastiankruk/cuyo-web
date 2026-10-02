#
#   Copyright 2006 by Mark Weyer
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

# referenced from labskaus.ld

Puzzle={
  name = "Jigsaw"
  author = "Mark Weyer"
  description = "Get rid of the border"
  numexplode = 9
  pics = Stein
  startdist =
    "1........5","1........5","1........5","1........5","2333333334","-3%&"

  gesamtzahnarten = 6
  zahnarten = 3
  zahnarten[easy] = 2
  zahnarten[hard] = 5


  Stein = {
    pics=mpAlle.xpm
    greyprob=1
    distkey="0"

    <<
      var oben   = -1 : reapply,
	  unten  = -1 : reapply,
	  links  = -1 : reapply,
	  rechts = -1 : reapply;
	# so ist der Wert -1 bei nothing und bei outside

      Stein = {
	qu=Q_TL;
	if oben==unten@(0,-1)
	  -> if links==rechts@(-1,0)
	    -> if links@(0,-1)==rechts@(-1,-1) && oben@(-1,0)==unten@(-1,-1)
	      -> E
	      else B
	    else D
	  else if links==rechts@(-1,0)
	    -> A
	    else C;
	pos+=5*gesamtzahnarten*oben+5*links;
	*;
	qu=Q_TR;
	if oben==unten@(0,-1)
	  -> if rechts==links@(1,0)
	    -> if rechts@(0,-1)==links@(1,-1) && oben@(1,0)==unten@(1,-1)
	      -> D
	      else E
	    else B
	  else if rechts==links@(1,0)
	    -> A
	    else C;
	pos+=5*gesamtzahnarten*oben+5*rechts;
	*;
	qu=Q_BL;
	if unten==oben@(0,1)
	  -> if links==rechts@(-1,0)
	    -> if links@(0,1)==rechts@(-1,1) && unten@(-1,0)==oben@(-1,1)
	      -> B
	      else A
	    else D
	  else if links==rechts@(-1,0)
	    -> E
	    else C;
	pos+=5*gesamtzahnarten*unten+5*links;
	*;
	qu=Q_BR;
	if unten==oben@(0,1)
	  -> if rechts==links@(1,0)
	    -> if rechts@(0,1)==links@(1,1) && unten@(1,0)==oben@(1,1)
	      -> A
	      else D
	    else B
	  else if rechts==links@(1,0)
	    -> E
	    else C;
	pos+=5*gesamtzahnarten*unten+5*rechts;
	*;
      };

      Stein.connect = {
	inhibit=0;
	if unten!=oben@(0,1) -> inhibit+=DIR_D;
	if rechts!=links@(1,0) -> inhibit+=DIR_R;
      };

      Stein.init = {
	oben = rnd(zahnarten);
	unten = rnd(zahnarten);
	links = rnd(zahnarten);
	rechts = rnd(zahnarten);
	weight = 1;
	if version>0 -> {
	  # Dann stand dieser Stein in der startdist, ist also Gras.
	  behaviour.+=goalblob;
	  # Rand glätten
	  if version==1..2 -> links=gesamtzahnarten-1;
	  if version==2..4 -> unten=gesamtzahnarten-1;
	  if version==4..5 -> rechts=gesamtzahnarten-1;
	};
      };

    >>
  }
}


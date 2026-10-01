#
#   Copyright 2010,2011,2014 by Mark Weyer
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

NoVIPs = {
  # TRANSLATORS: "equal" here is in the egalitarian sense
  name = "All colours are equal"
  description = "Get rid of everything"
  author = "Mark Weyer"
  anzahl = 6
  pics = Blop * <anzahl>
  startdist = ".+.+..+.+.",".+.+..+.+.",".+.+..+.+.",".+.+..+.+.","++%&"
  numexplode = 6

  Blop = {
    pics = mnv1.xpm,mnv2.xpm,mnv3.xpm,mnv4.xpm,mnv5.xpm,mnv6.xpm
    greyprob = 1
    <<
      Blop.init = {
        behaviour =
            explodes_on_explosion
          + explodes_on_chain_reaction
          + explodes_on_size
          + calculate_size
          + goalblob;
      };

      Blop = {
        file=kind-Blop; schema4;
        if informational && 1:5 => {,,,,,kind=Blop+rnd(anzahl)};
      };
    >>
  }

}

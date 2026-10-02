#
#   Copyright 2006 by Bernhard R. Link
#   Modified 2008 by Bernhard R. Link
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
# The above notices apply to this file and to:
#   ltCannon.xpm[.gz], ltGray.xpm[.gz], ltParatrooper.xpm[.gz], ltSky.xpm[.gz]
#

ParatroopersInvers =
{
# TRANSLATORS: Apparently, "Paratroopers" is the name of a computer game.
  name     = "Paratroopers"
  description = "the other way around"
  author = "brl"

  pics = Paratrooper

  greypic   = Gray
  startpic  = Cannon
  startdist = "....EF....","....GH....","....--....","....--....","-I%&"

  numexplode = 11
# TODO:
# falling_fast_is_permanent = 1

  textcolor  = 255,255,255
  bgcolor    = 0,0,0
  topcolor   = 84,252,252
  topoverlap = 0
  toptime    = 50
  emptypic   = Sky

  << var dynamite = 0 : reapply , count = 0 : reapply;
		var s1_x = -20, s1_y = -20;
		var s2_x = 20, s2_y = -20;
		var s3_x = 20, s3_y = -20;
		var s4_x = 20, s4_y = -20;
	     	var dead = 0 :reapply;
		>>
  semiglobal =
  {
     <<
		semiglobal = {
			s1_x -= 1;
			s1_y -= 1;
			s2_x += 1;
			s2_y -= 1;
			s3_y -= 1;
			s4_y -= 1;
			if dead >= 2 -> {falling_speed = 64; };
		};
     		semiglobal.keyfall = {falling_speed = 32;};
     >>
  }

  Sky =
  {
	pics = ltSky.xpm
	<<
		Sky = {
#		out1=loc_y;
#		out2=s4_y;
		switch {
			falling -> {};
			-> {
		switch {
			2*loc_x==s1_x@@() ->
				switch {
				  2*loc_y==s1_y@@() -> {pos=0;*;};
				  2*loc_y==s1_y@@()+1 -> {pos=3;*;};
				  2*loc_y==s1_y@@()-1 -> {pos=1;*;};
				};
			2*loc_x==s1_x@@()+1 ->
				switch {
				  2*loc_y==s1_y@@() -> {pos=5;*;};
				  2*loc_y==s1_y@@()+1 -> {pos=9;*;};
				  2*loc_y==s1_y@@()-1 -> {pos=7;*;};
				};
			2*loc_x==s1_x@@()-1 ->
				switch {
				  2*loc_y==s1_y@@() -> {pos=4;*;};
				  2*loc_y==s1_y@@()+1 -> {pos=8;*;};
				  2*loc_y==s1_y@@()-1 -> {pos=6;*;};
				};
		};
		switch {
			2*loc_x==s2_x@@() ->
				switch {
				  2*loc_y==s2_y@@() -> {pos=0;*;};
				  2*loc_y==s2_y@@()+1 -> {pos=3;*;};
				  2*loc_y==s2_y@@()-1 -> {pos=1;*;};
				};
			2*loc_x==s2_x@@()+1 ->
				switch {
				  2*loc_y==s2_y@@() -> {pos=5;*;};
				  2*loc_y==s2_y@@()+1 -> {pos=9;*;};
				  2*loc_y==s2_y@@()-1 -> {pos=7;*;};
				};
			2*loc_x==s2_x@@()-1 ->
				switch {
				  2*loc_y==s2_y@@() -> {pos=4;*;};
				  2*loc_y==s2_y@@()+1 -> {pos=8;*;};
				  2*loc_y==s2_y@@()-1 -> {pos=6;*;};
				};
		};
		switch {
			2*loc_x==s3_x@@() ->
				switch {
				  2*loc_y==s3_y@@() -> {pos=0;*;};
				  2*loc_y==s3_y@@()+1 -> {pos=3;*;};
				  2*loc_y==s3_y@@()-1 -> {pos=1;*;};
				};
			2*loc_x==s3_x@@()+1 ->
				switch {
				  2*loc_y==s3_y@@() -> {pos=5;*;};
				  2*loc_y==s3_y@@()+1 -> {pos=9;*;};
				  2*loc_y==s3_y@@()-1 -> {pos=7;*;};
				};
			2*loc_x==s3_x@@()-1 ->
				switch {
				  2*loc_y==s3_y@@() -> {pos=4;*;};
				  2*loc_y==s3_y@@()+1 -> {pos=8;*;};
				  2*loc_y==s3_y@@()-1 -> {pos=6;*;};
				};
		};
		switch {
			2*loc_x==s4_x@@() ->
				switch {
				  2*loc_y==s4_y@@() -> {pos=0;*;};
				  2*loc_y==s4_y@@()+1 -> {pos=3;*;};
				  2*loc_y==s4_y@@()-1 -> {pos=1;*;};
				};
			2*loc_x==s4_x@@()+1 ->
				switch {
				  2*loc_y==s4_y@@() -> {pos=5;*;};
				  2*loc_y==s4_y@@()+1 -> {pos=9;*;};
				  2*loc_y==s4_y@@()-1 -> {pos=7;*;};
				};
			2*loc_x==s4_x@@()-1 ->
				switch {
				  2*loc_y==s4_y@@() -> {pos=4;*;};
				  2*loc_y==s4_y@@()+1 -> {pos=8;*;};
				  2*loc_y==s4_y@@()-1 -> {pos=6;*;};
				};
		}; }; }; };
	>>
  }

  Gray =
  {
	pics = ltGray.xpm
	<<
		Gray = { pos = 0 ; *;
			if dynamite -> {
				dynamite@(0,0)=0;
				explode;
			};
		};
	>>
  }

  Cannon =
  {
	  pics = ltCannon.xpm
	  <<
	  	var load = 0;

		Cannon.init = {dynamite = 0;};
		Cannon = {
#			out1 = loc_x;
#			out2 = loc_y;
			if dynamite || dynamite@() -> {
				dynamite@(1,0)=1;
				dynamite@(-1,0)=1;
				dynamite@(0,1)=1;
				dynamite@(0,-1)=1;
				dynamite@(1,1)=1;
				dynamite@(1,-1)=1;
				dynamite@(-1,1)=1;
				dynamite@(-1,-1)=1;
				dynamite@() = 1;
				explode;
			};
			load += 1;
			switch {
				load >= 32 -> {
					s4_x@@() = 2*4+1;
					s4_y@@() = 2*15;
					load = 0;
				};
				load == 24 -> {
					s2_x@@() = 2*5+1;
					s2_y@@() = 2*16-1;
				};
				load == 16 -> {
					s3_x@@() = 2*4+1;
					s3_y@@() = 2*15;
				};
				load == 8 -> {
					s1_x@@() = 2*4-1;
					s1_y@@() = 2*16-1;
				};
			};
			switch {
				version == 4 || version == 5 -> {
				    pos = version;
					switch {
						load <= 4 -> pos = version;
						load <= 12 -> pos = version - 4;
						load <= 20 -> pos = version;
						load <= 28 -> pos = version - 2;
						 -> pos = version;
					};
				};
				-> {pos = version;};
			};
			*;
		};
	  >>
  }

Paratrooper =
{
	  pics = ltParatrooper.xpm
	  <<
	  	var wasfallingfast;
	  	var speed;

		Paratrooper.init = { speed=0; count=1; falling_speed@@() = 6; weight=0; };
		Paratrooper.land = {
			switch {
			dead != 0 -> { dead@@() -= 1 ; wasfallingfast=0;count = 0; explode; kind=nothing;};
			speed > 5 -> { count = 0; wasfallingfast=0; explode; kind=nothing;};
			-> { speed = 0; wasfallingfast=0; count = 1; };
			};
		};
		Paratrooper.draw = {
			switch {
				kind == nothing -> {count=0;pos=0;};
				count <= 0 -> { count=0;kind=nothing;pos=0; };
				count == 1 && loc_x <=4 -> { pos=2;*;};
				count == 1 -> { pos=3;*;};
				count == 2 -> { pos=4;*;};
				count >= 4 -> { pos=7;*;};
				loc_x <= 4 -> { pos=5;*;};
				             -> { pos=6;*;};
			};
		};
		grow = {
			if count >= 4 &&
				( kind@(0,-1)==nothing
				 || ( kind@(0,-1)==kind
				     && count@(0,-1)<1))
			-> {
				count@(0,0) -=1;
				kind@(0,-1)=kind;
				count@(0,-1) += 1;
			};
		};
		moveright = {
			switch {
				kind@(1,0) == Gray ->
					grow;
				kind@(1,0) == Cannon ->
					dynamite@(1,0)=1;
				count@(1,0) < 4 -> {
					count@(0,0)-=1;
					kind@(1,0)=kind;
					count@(1,0)+=1;
				};
				-> grow;
			};
		};
		moveleft = {
			switch {
				kind@(-1,0) == Gray ->
					grow;
				kind@(-1,0) == Cannon ->
					dynamite@(-1,0)=1;
				count@(-1,0) < 4 -> {
					count@(0,0)-=1;
					kind@(-1,0)=kind;
					count@(-1,0)+=1;
				};
				-> grow;
			};
		};
		fall = {
			if kind@(0,1) == Cannon -> {
# was to easy:
#				dynamite@(0,1)=1;
				explode;
			} else -> switch {
				kind@(0,1) != Gray
				&& ( count@(0,1) < 3
				     || ( count@(0,1) < 4
				          && count > 1 ))
				-> {
					count@(0,0)-=1;
					kind@(0,1)=kind;
					count@(0,1)+=1;
				};
				loc_x <= 4 -> moveright;
				loc_x >= 5 -> moveleft;
			};
		};
		move = {
			switch {
				count <= 0 -> {count=0;kind=nothing; };
				loc_y < 19 -> fall;
				loc_x <= 4 -> moveright;
				loc_x >= 5 -> moveleft;
			};
			Paratrooper.draw;
		};
		Paratrooper = {
#			out1 = dead@@();
			if falling && !informational -> switch {
				(2*loc_x==s1_x@@()+1  || loc_x==s1_x@@()/2)
				&& loc_y==s1_y@@()/2 && dead == 0 ->
				{dead=1;dead@@() += 1;};
				(2*loc_x==s2_x@@()+1  || loc_x==s2_x@@()/2)
				&& loc_y==s2_y@@()/2 && dead == 0 ->
				{dead=1;dead@@() += 1;};
				(2*loc_x==s3_x@@()+1  || loc_x==s3_x@@()/2)
				&& loc_y==s3_y@@()/2 && dead == 0 ->
				{dead=1;dead@@() += 1;};
				(2*loc_x==s4_x@@()+1  || loc_x==s4_x@@()/2)
				&& loc_y==s4_y@@()/2 && dead == 0 ->
				{dead=1;dead@@() += 1;};
			};
			if falling_fast -> {wasfallingfast=1;};
			switch {
				dynamite -> explode;
				wasfallingfast -> { pos = 1; speed +=1; *; };
				dead != 0 -> { pos = 8; *; };
				falling -> { pos = 0; *; };
				kind@(0,-1) == Gray -> explode;
				-> { move; };
			};
		};
	>>
}
}

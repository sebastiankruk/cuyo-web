#
#   Copyright 2004, 2009 by Bernhard R. Link
#   Modified 2005,2010 by Bernhard R. Link
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
#   lpGreen.xpm[.gz], lpRed.xpm[.gz], lp.src.xpm, lpStart.xpm[.gz]
#   lpWhite.xpm[.gz], lpYellow.xpm[.gz]
#

Pressure={
  name="Excess Pressure"
  author="brl"
  numexplode=7
  numexplode[1]=10
  chaingrass=1
  pics=Colour1, Colour2, Colour3
  bgcolor=0,0,0
  startpic=Start
  startdist="AAAAAAAAAA"
  greypic=Gray
  topcolor=227,227,227
  toptime=50
  emptypic=nothin
  randomgreys[1]=500

<< var ao,ar,au,al;
  var ft=1,fb=1,fl=1,fr=1;
  var tt=1,tb=1,tl=1,tr=1;
  var mode=0,count;
  var o1;
initcount = count = 4;
bang = { explode; mode = 0 ; u ; };
calcC = {
	ao = kind@(0,-1) == Start || kind@(0,-1) == kind || kind@(0,-1) == Gray;
	ar = kind@( 1,0) == Start || kind@( 1,0) == kind || kind@( 1,0) == Gray;
	au = kind@( 0,1) == Start || kind@( 0,1) == kind || kind@( 0,1) == Gray;
	al = kind@(-1,0) == Start || kind@(-1,0) == kind || kind@(-1,0) == Gray;
};
calcG = {
	ao = kind@(0,-1) != Start && kind@(0,-1) != nothing && kind@(0,-1) != outside;
	ar = kind@( 1,0) != Start && kind@( 1,0) != nothing && kind@( 1,0) != outside;
	au = kind@( 0,1) != Start && kind@( 0,1) != nothing && kind@( 0,1) != outside;
	al = kind@(-1,0) != Start && kind@(-1,0) != nothing && kind@(-1,0) != outside;
};
toL = { tl=1;tt=0;tr=0;tb=0;};
toT = { tl=0;tt=1;tr=0;tb=0;};
toR = { tl=0;tt=0;tr=1;tb=0;};
toB = { tl=0;tt=0;tr=0;tb=1;};
anim = {
	if mode == 4 -> mode = 0;
	if mode == 0 -> switch {
	  mode@(0,1) == 3 && tt@(0,1) -> { 
	    mode=1;initcount;fr=0;fb=1;ft=0;fl=0;switch {
		!ao &&  ar &&  au && !al -> toR ;
		!ao &&  ar &&  au &&  al -> toL,toR ;
		!ao && !ar &&  au &&  al -> toL ;
		ao &&  ar &&  au && !al	 -> toR ;
		ao &&  ar &&  au &&  al  -> toT ;
		ao && !ar &&  au &&  al  -> toL ;

		!ao && !ar &&  au && !al  -> toB ;
		ao && !ar &&  au && !al   -> toT ;
		  -> {o1=1;bang;};
	  };};
	  mode@(0,-1) == 3 && tb@(0,-1) -> { 
	    mode=1;initcount;fr=0;fb=0;ft=1;fl=0;switch {
		ao &&  ar &&  au && !al	 -> toR ;
		ao &&  ar &&  au &&  al  -> toB ;
		ao && !ar &&  au &&  al  -> toL ;
		ao &&  ar && !au && !al  -> toR ;
		ao &&  ar && !au &&  al  -> toL,toR ;
		ao && !ar && !au &&  al  -> toL ;

		ao && !ar &&  au && !al   -> toB ;
		ao && !ar && !au && !al   -> toT ;
		  -> {o1=2;bang;};
	  } ; } ;
	  mode@(-1,0) == 3 && tr@(-1,0) -> {
	    mode=1;initcount;fr=0;fb=0;ft=0;fl=1;switch {
		!ao &&  ar &&  au &&  al -> toB ;
		!ao && !ar &&  au &&  al -> toB ;
		ao &&  ar &&  au &&  al  -> toR ;
		ao && !ar &&  au &&  al  -> toT,toB ;
		ao &&  ar && !au &&  al  -> toT ;
		ao && !ar && !au &&  al  -> toT ;

		!ao &&  ar && !au &&  al  -> toR ;
		!ao && !ar && !au &&  al  -> toL ;
		  -> {o1=3;bang;};
	  };};
	  mode@(1,0) == 3 && tl@(1,0) -> { 
	    mode=1;initcount;fr=1;fb=0;ft=0;fl=0;switch {
		!ao &&  ar &&  au && !al -> toB ;
		!ao &&  ar &&  au &&  al -> toB ;
		ao &&  ar &&  au && !al	 -> toT,toB ;
		ao &&  ar &&  au &&  al  -> toL ;
		ao &&  ar && !au && !al  -> toT ;
		ao &&  ar && !au &&  al  -> toT ;

		!ao &&  ar && !au && !al  -> toR ;
		!ao &&  ar && !au &&  al  -> toL ;
		  -> {o1=4;bang;};
	  };};
	  } else switch {
	  mode@(0,1) == 3 && tt@(0,1) && !fb-> {o1=5;bang;};
	  mode@(0,-1) == 3 && tb@(0,-1) && !ft -> {o1=6;bang;};
	  mode@(-1,0) == 3 && tr@(-1,0) && !fl -> {o1=7;bang;};
	  mode@(1,0) == 3 && tl@(1,0) && !fr -> {o1=8;bang;};
	  };
};
draw = {
	switch {
	mode == 2 -> switch {
		!ao &&  ar &&  au && !al		-> Y;
		!ao &&  ar &&  au &&  al && (fl || tl)	-> pos=61 ; #075;
		!ao &&  ar &&  au &&  al && (fr || tr)	-> pos=60 ; #074;
		!ao && !ar &&  au &&  al		-> Z;
		ao &&  ar &&  au && !al && (tt || ft)	-> pos=12; #014;
		ao &&  ar &&  au && !al	&& (tb || fb)	-> pos=40; #050;
		ao &&  ar &&  au &&  al && (tl || tr)	-> pos=21; #025;
		ao &&  ar &&  au &&  al && (tt || tb)	-> pos=29; #035;
		ao && !ar &&  au &&  al && (tt || ft)	-> pos=15; #017;
		ao && !ar &&  au &&  al && (tb || fb)	-> pos=41; #051;
		ao &&  ar && !au && !al 		-> pos=56; #070;
		ao &&  ar && !au &&  al && (tr || fr)	-> pos=68; #0104;
		ao &&  ar && !au &&  al && (tl || fl)	-> pos=69; #0105;
		ao && !ar && !au &&  al 		-> pos=57; #071;

		!ao &&  ar && !au && !al 		-> pos=64; #0100;
		!ao &&  ar && !au &&  al 		-> pos=52; #064;
		!ao && !ar && !au &&  al 		-> pos=65; #0101;
		!ao && !ar &&  au && !al 		-> pos=47; #057;
		ao && !ar &&  au && !al 		-> pos=19; #023;
		ao && !ar && !au && !al 		-> pos=55; #067;
		-> {o1=10;bang;};
	};
	mode == 1 -> switch {
		#lo
		!ao &&  ar &&  au && !al && fr		-> pos=4; #004;
		!ao &&  ar &&  au && !al && fb		-> pos=58; #072;
		#o
		!ao &&  ar &&  au &&  al && fl		-> pos=5; #005;
		!ao &&  ar &&  au &&  al && fr		-> pos=6; #006;
		!ao &&  ar &&  au &&  al && fb && tl	-> pos=59; #073;
		!ao &&  ar &&  au &&  al && fb && tr	-> pos=62; #076;
		#ro
		!ao && !ar &&  au &&  al && fl		-> pos=7; #007;
		!ao && !ar &&  au &&  al && fb		-> pos=63; #077;
		#l
		ao &&  ar &&  au && !al && ft		-> pos=28; #034;
		ao &&  ar &&  au && !al && fb		-> pos=20; #024;
		ao &&  ar &&  au && !al && fr && tt	-> pos=32; #040;
		ao &&  ar &&  au && !al && fr && tb	-> pos=48; #060;
		#m
		ao &&  ar &&  au &&  al && fl		-> pos=14; #016;
		ao &&  ar &&  au &&  al && fr		-> pos=13; #015;
		ao &&  ar &&  au &&  al && fb		-> pos=22; #026;
		ao &&  ar &&  au &&  al && ft		-> pos=30; #036;
		#r
		ao && !ar &&  au &&  al && ft		-> pos=31; #037;
		ao && !ar &&  au &&  al && fl && tt	-> pos=33; #041;
		ao && !ar &&  au &&  al && fl && tb	-> pos=49; #061;
		ao && !ar &&  au &&  al && fb		-> pos=23; #027;
		#lu
		ao &&  ar && !au && !al && ft		-> pos=66; #0102;
		ao &&  ar && !au && !al && fr		-> pos=36; #044;
		#u
		ao &&  ar && !au &&  al && fl		-> pos=37; #045;
		ao &&  ar && !au &&  al && ft && tl	-> pos=67; #0103;
		ao &&  ar && !au &&  al && ft && tr	-> pos=70; #0106;
		ao &&  ar && !au &&  al && fr		-> pos=38; #046;
		#ru
		ao && !ar && !au &&  al && ft		-> pos=71; #0107;
		ao && !ar && !au &&  al && fl		-> pos=39; #047;

		!ao &&  ar && !au && !al 	-> pos=50; #062;
		!ao &&  ar && !au &&  al && fl 	-> pos=51; #063;
		!ao &&  ar && !au &&  al && fr 	-> pos=53; #065;
		!ao && !ar && !au &&  al 	-> pos=54; #066;
		!ao && !ar &&  au && !al 	-> pos=3; #003;
		ao && !ar &&  au && !al && ft 	-> pos=11; #013;
		ao && !ar &&  au && !al && fb 	-> pos=27; #033;
		ao && !ar && !au && !al 	-> pos=35; #043;
		-> {o1=11;bang;};
	};
	mode == 3 -> switch {
		#lo
		!ao &&  ar &&  au && !al && tr		-> pos=4; #004;
		!ao &&  ar &&  au && !al && tb		-> pos=58; #072;
		#o
		!ao &&  ar &&  au &&  al && tl		-> pos=5; #005;
		!ao &&  ar &&  au &&  al && tr		-> pos=6; #006;
		!ao &&  ar &&  au &&  al && tb && fl	-> pos=59; #073;
		!ao &&  ar &&  au &&  al && tb && fr	-> pos=62; #076;
		#ro
		!ao && !ar &&  au &&  al && tl		-> pos=7; #007;
		!ao && !ar &&  au &&  al && tb		-> pos=63; #077;
		#l
		ao &&  ar &&  au && !al && tt		-> pos=28; #034;
		ao &&  ar &&  au && !al && tb		-> pos=20; #024;
		ao &&  ar &&  au && !al && tr && ft	-> pos=32; #040;
		ao &&  ar &&  au && !al && tr && fb	-> pos=48; #060;
		#m
		ao &&  ar &&  au &&  al && tl		-> pos=14; #016;
		ao &&  ar &&  au &&  al && tr		-> pos=13; #015;
		ao &&  ar &&  au &&  al && tb		-> pos=22; #026;
		ao &&  ar &&  au &&  al && tt		-> pos=30; #036;
		#r
		ao && !ar &&  au &&  al && tt		-> pos=31; #037;
		ao && !ar &&  au &&  al && tl && ft	-> pos=33; #041;
		ao && !ar &&  au &&  al && tl && fb	-> pos=49; #061;
		ao && !ar &&  au &&  al && tb		-> pos=23; #027;
		#lu
		ao &&  ar && !au && !al && tt		-> pos=66; #0102;
		ao &&  ar && !au && !al && tr		-> pos=36; #044;
		#u
		ao &&  ar && !au &&  al && tl		-> pos=37; #045;
		ao &&  ar && !au &&  al && tt && fl	-> pos=67; #0103;
		ao &&  ar && !au &&  al && tt && fr	-> pos=70; #0106;
		ao &&  ar && !au &&  al && tr		-> pos=38; #046;
		#ru
		ao && !ar && !au &&  al && tt		-> pos=71; #0107;
		ao && !ar && !au &&  al && tl		-> pos=39; #047;

		!ao &&  ar && !au && !al 	-> pos=50; #062;
		!ao &&  ar && !au &&  al && tl 	-> pos=51; #063;
		!ao &&  ar && !au &&  al && tr 	-> pos=53; #065;
		!ao && !ar && !au &&  al 	-> pos=54; #066;
		!ao && !ar &&  au && !al 	-> pos=3; #003;
		ao && !ar &&  au && !al && tt 	-> pos=11; #013;
		ao && !ar &&  au && !al && tb 	-> pos=27; #033;
		ao && !ar && !au && !al 	-> pos=35; #043;
		-> {o1=12;bang;};
	};
	-> switch {
		!ao &&  ar &&  au && !al -> A;
		!ao &&  ar &&  au &&  al -> B;
		!ao && !ar &&  au &&  al -> C;
		ao &&  ar &&  au && !al -> I;
		ao &&  ar &&  au &&  al -> J;
		ao && !ar &&  au &&  al -> K;
		ao &&  ar && !au && !al -> Q;
		ao &&  ar && !au &&  al -> R;
		ao && !ar && !au &&  al -> S;

		!ao && !ar && !au && !al -> u;
		!ao &&  ar && !au && !al -> r;
		!ao &&  ar && !au &&  al -> s;
		!ao && !ar && !au &&  al -> t;
		!ao && !ar &&  au && !al -> a;
		ao && !ar &&  au && !al -> i;
		ao && !ar && !au && !al -> q;
	};
};*};

step = { if count == 0 -> { if mode != 0 -> mode += 1 ; initcount } else count-= 1; };
>>

  Start={
	pics=lpStart.xpm
<< Start = {
ao = kind@(0,-1) != Start && kind@(0,-1) != Gray && kind@(0,-1) != nothing && kind@(0,-1) != outside;
ar = kind@(1,0) != Start && kind@( 1,0) != Gray && kind@( 1,0) != nothing && kind@( 1,0) != outside;
au = kind@(0,1) != Start && kind@( 0,1) != Gray && kind@( 0,1) != nothing && kind@( 0,1) != outside;
al = kind@(-1,0) != Start && kind@(-1,0) != Gray && kind@(-1,0) != nothing && kind@(-1,0) != outside;
switch {
	mode!=1&&mode@(0,1) == 3 && tt@(0,1) ->{mode=1;initcount;fr=0;fb=1;ft=0;fl=0;};
	mode!=1&&mode@(0,-1)== 3 && tb@(0,-1) ->{mode=1;initcount;fr=0;fb=0;ft=1;fl=0;};
	mode!=1&&mode@(-1,0)== 3 && tr@(-1,0) ->{mode=1;initcount;fr=0;fb=0;ft=0;fl=1;};
	mode!=1&&mode@(1,0) == 3 && tl@(1,0) ->{ mode=1;initcount;fr=1;fb=0;ft=0;fl=0;};
	count > 0 -> count -= 1;
	mode == 3 -> { mode@(0,0) = 0; count=50+rnd(100); };
	mode == 2 -> { if tt||tb||tl||tr -> mode@(0,0)=3 else mode=0; initcount;};
	mode == 1 -> { tt=0;tb=0;tr=0;tl=0;mode = 2; initcount; };
	-> {
		tt=0;tb=0;tl=0;tr=0;
        	switch {
			1:4 -> if ao && mode@(0,-1)==0 -> tt=1;
			1:3 -> if au && mode@(0,1)==0 -> tb=1;
			1:2 -> if al && mode@(0,-1)==0 -> tl=1;
			ar && mode@(0,1) -> tr=1;
		};
		if tt || tb || tl || tr -> {mode = 2;initcount;}
		else count=100+rnd(100);
	};
 }; switch {
	(mode == 2 || mode == 3) && (tt || tb || tl || tr) -> 0A,0B;
	-> 0A;
 } ;* };
>>
  }
  Gray={
	pics=lpWhite.xpm
    	<< Gray = { calcG ; anim ; draw ; step ; }; >>
  }

  Colour1={
	pics=lpRed.xpm
	<< Colour1={ calcC ; anim ; draw; step; }; >>
  }
  Colour2={
	pics=lpYellow.xpm
	<< Colour2={ calcC ; anim ; draw; step; }; >>
  }
  Colour3={
	pics=lpGreen.xpm
	<< Colour3={ calcC ; anim ; draw; step; }; >>
  }
  nothin={
	<< nothin = { mode = 0; }; >>
  }
}

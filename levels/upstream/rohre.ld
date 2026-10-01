#
#   Copyright <=2004 by Bernhard R. Link
#   Maintenance modifications 2005,2006,2008,2011,2014 by the cuyo developers
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
#   lrEis.xpm[.gz], lrKamin.xpm[.gz], lrOfen.xpm[.gz], lrWasserH.xpm[.gz],
#   lrWasserRH.xpm[.gz], lrWasser.xpm[.gz],
#   lrKamin.xcf, lrWasser.xcf
#
# Hochschornstein reparieren


Rohre={
  name="Heating"
  author="brl"
  numexplode=18 
  numexplode[1]=20
  chaingrass=1
  pics=lrKamin,lrEisFallend,lrWasser
  bgcolor=22,222,244
  startpic=lrOfen
  startdist="..A....A..","..AA..AA.."
  greypic=lrEis
  topcolor=227,227,227
  toptime=50
  randomgreys[1]=100

  << var rauch=0; var hitze=0;
    var temp,ou1,ou2,ki,ofen_an;
    var al, ar, ao, au;
    var freio, freim, freiu;

    tradeheat_1 = {
      #switch{ ki == lrWasser || ((ki == lrOfen || ki == lrEis) && ki != kind) -> {
      if ki == lrWasser || ki == lrOfen || (ki == lrEis && ki != kind) -> {
	temp=(temp-hitze@(0,0)+2)/5;
	ou1 += temp;
      };
    };

    tradeheat = {
    	ou1=hitze;
	ki = kind@( 0, 1); temp = hitze@( 0, 1); tradeheat_1;
	ki = kind@( 0,-1); temp = hitze@( 0,-1); tradeheat_1;
	ki = kind@( 1, 0); temp = hitze@( 1, 0); tradeheat_1;
	ki = kind@(-1, 0); temp = hitze@(-1, 0); tradeheat_1;
    };
    
    coolslow = {
        ou1 -= 1;
	if ou1 <= 0 -> ou1 = 0;
        hitze@(0,0) = ou1;
    };
    coolfast = {
        ou1 -= 5 + ou1/6;
	if ou1 <= 0 -> ou1 = 0;
        hitze@(0,0) = ou1;
    };
  >>

  lrWasser={
    pics=lrWasser.xpm,lrWasserH.xpm,lrWasserRH.xpm
    	<<
	lrWasser={
		switch{ hitze >= 150 -> 2;
		        hitze >= 10  -> 1;
			             -> 0;
		};
		tradeheat;
		coolslow;
      ao = kind@(0,-1) == lrWasser || kind@(0,-1) == lrOfen;
      ar = kind@( 1,0) == lrWasser || kind@( 1,0) == lrOfen;
      au = kind@( 0,1) == lrWasser || kind@( 0,1) == lrOfen;
      al = kind@(-1,0) == lrWasser || kind@(-1,0) == lrOfen;
	    switch {
		    falling -> Z;
		    kind@(0,-1) == nothing || kind@(0,-1) == lrEis -> {
				  switch {
	    !ar && !au && !al -> a;
	     ar && !au && !al -> R;
	     ar && !au &&  al -> S;
	    !ar && !au &&  al -> T;
	    !ar &&  au && !al -> Q;
	     ar &&  au && !al -> V;
	     ar &&  au &&  al -> W;
	    !ar &&  au &&  al -> X;
				  };
		    };
		    -> {
				  switch {
	    !ao && !ar && !au && !al -> A;
	    !ao &&  ar && !au && !al -> B;
	    !ao &&  ar && !au &&  al -> C;
	    !ao && !ar && !au &&  al -> D;
	    !ao && !ar &&  au && !al -> E;
	    !ao &&  ar &&  au && !al -> F;
	    !ao &&  ar &&  au &&  al -> G;
	    !ao && !ar &&  au &&  al -> H;
	     ao && !ar &&  au && !al -> I;
	     ao &&  ar &&  au && !al -> J;
	     ao &&  ar &&  au &&  al -> K;
	     ao && !ar &&  au &&  al -> L;
	     ao && !ar && !au && !al -> M;
	     ao &&  ar && !au && !al -> N;
	     ao &&  ar && !au &&  al -> O;
	     ao && !ar && !au &&  al -> P;
				  };
		    };
	    };
	*};
	>>
  }

  lrEisFallend={
    pics=lrEis.xpm
    	<<
	lrEisFallend.land={
		hitze=0;
		kind=lrEis;
	};
    	lrEisFallend={
		0;A;*
	};
	>>
  }
  lrEis={
    pics=lrEis.xpm
    	<<
	var status;
    	lrEis={
		tradeheat;
		#if ou1 >= 5 -> status += ou1;
		status += ou1;
		coolfast;
		switch {
		  status >= 400 -> { E*; kind=nothing };
		                -> { pos=status/100+1; *};
                };
	};
	lrEis.init={
		status=-1;
		hitze=0;
	};
	lrEis.land={
		status=0;
	};
	>>
  }

  lrKamin={
    pics=lrKamin.xpm
    <<
    lrKamin={
      ao  = kind@( 0,-1) == lrKamin || kind@( 0,-1) == lrOfen;
      ar  = kind@( 1, 0) == lrKamin || kind@( 1, 0) == lrOfen;
      au  = kind@( 0, 1) == lrKamin || kind@( 0, 1) == lrOfen;
      al  = kind@(-1, 0) == lrKamin || kind@(-1, 0) == lrOfen;
      freio = (kind@(-1,-1) == nothing || kind@(-1,-1) == lrEis) &&
              (kind@(1,-1) == nothing || kind@(1,-1) == lrEis);
      freim = (kind@(-1,0) == nothing || kind@(-1,0) == lrEis) &&
              (kind@(1,0) == nothing || kind@(1,0) == lrEis);
      freiu = (kind@(-1,1) == nothing || kind@(-1,1) == lrEis) &&
              (kind@(1,1) == nothing || kind@(1,1) == lrEis);
      switch {
        falling -> Z;
        kind@(0,-1) == nothing || kind@(0,-1) == lrEis -> {
	  switch {
	    au && freim && freiu && kind@(0,1) == lrKamin -> U;

	    !ar && !au && !al -> a;
	     ar && !au && !al -> R;
	     ar && !au &&  al -> S;
	    !ar && !au &&  al -> T;
	    !ar &&  au && !al -> Q;
	     ar &&  au && !al -> V;
	     ar &&  au &&  al -> W;
	    !ar &&  au &&  al -> X;
	  };
	  
	  switch {
	    rauch > 0 && ofen_an < 24 -> ofen_an += 12;
	    rauch == 0 && ofen_an > 0 -> ofen_an -= 12;
	  };
	  
	  switch {
	    pos == 20 -> rauch -= 3;
	    pos != 18 -> rauch -= 1;
	  };
	  switch {
	    rauch < 0 -> rauch = 0;
	  };
          pos += ofen_an;
	};
	-> {
	  switch {
             ao && au && freio && freim -> {
	       switch {
	         freiu && kind@(0,1) == lrKamin -> b;
		 -> Y;
	       };
	     };
	    
	    !ao && !ar && !au && !al -> A;
	    !ao &&  ar && !au && !al -> B;
	    !ao &&  ar && !au &&  al -> C;
	    !ao && !ar && !au &&  al -> D;
	    !ao && !ar &&  au && !al -> E;
	    !ao &&  ar &&  au && !al -> F;
	    !ao &&  ar &&  au &&  al -> G;
	    !ao && !ar &&  au &&  al -> H;
	     ao && !ar &&  au && !al -> I;
	     ao &&  ar &&  au && !al -> J;
	     ao &&  ar &&  au &&  al -> K;
	     ao && !ar &&  au &&  al -> L;
	     ao && !ar && !au && !al -> M;
	     ao &&  ar && !au && !al -> N;
	     ao &&  ar && !au &&  al -> O;
	     ao && !ar && !au &&  al -> P;
	  };
	};
      };
      switch{
        rauch@(0,0) <= -1 || rauch@(0,1) <= -1 || rauch@(1,0) <= -1 -> { rauch@(0,0)=0;};
	-> {
	    if kind@(0,1) == lrKamin -> {
#			    switch{ rauch@(0,1) >= rauch@(0,0) ->{temp=(2*(- rauch@(0,0) + rauch@(0,1) )+2)/3;};->{temp=(- rauch@(0,0)+rauch@(0,1) +2)/3;};};
		    	    switch{ rauch@(0,1) >= rauch@(0,0) ->{
				    temp= rauch@(0,1);
				    temp-=rauch@(0,0);
				    temp*=2;
				    temp+=2;
				    temp/=3;
				    };->{
				    temp=rauch@(0,1)+2;
				    temp -= rauch@(0,0);
				    temp /= 3;
				    };
			    };
			    rauch@(0,1) -= temp;
			    rauch@(0,0) += temp;
		    };
		    if kind@(1,0) == lrKamin -> {
			    temp=rauch@(1,0)+2;
			    temp -= rauch@(0,0);
			    temp /= 3;
#			    temp=(-rauch@(0,0)+rauch@(1,0)+2)/3;
			    rauch@(1,0) -= temp;
			    rauch@(0,0) += temp;
		    };
      };};
      ou2=rauch;
      *;
	    
    };
    >>
}
  lrOfen={
    pics=lrOfen.xpm
    	<<
	heating={
		pos = 3;
		hitze+=100;
		switch{
			hitze >= 900 -> hitze=900;
		};
	};
	
	lrOfen={
	    # Pos wird missbraucht als Zielwert für ofen_an
	    pos = hitze / 200;
	    switch {
	      pos > 1 -> pos = 1;
	    };
	    switch {
              kind@(0,-1) == lrKamin && rauch@(0,-1) <= 30 -> { heating; rauch@(0,-1) += 2;};
	    };
	    switch {
		1:2 ->{
		    if kind@(1,0) == lrKamin && rauch@(1,0) <= 30 -> {heating; rauch@(1,0) += 2 };
		    if kind@(-1,0) == lrKamin && rauch@(-1,0) <= 30 -> {heating; rauch@(-1,0) += 2 };
		    };
		   ->{
		    if kind@(-1,0) == lrKamin && rauch@(-1,0) <= 30 -> {heating; rauch@(-1,0) += 2 };
		    if kind@(1,0) == lrKamin && rauch@(1,0) <= 30 -> {heating; rauch@(1,0) += 2 };
		    };
    		};
	    if kind@(0,1) == lrKamin && rauch@(0,1) <= 30 -> {heating; rauch@(0,1) += 2 };
# Heat water-pipes:
	    tradeheat;
	    coolfast;
	    
	    switch {
	      ofen_an < pos -> ofen_an += 1;
	      ofen_an > pos -> ofen_an -= 1;
	    };
	pos = ofen_an; *;
	};
	>>
  }
}

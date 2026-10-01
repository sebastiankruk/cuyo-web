#
#   Copyright 2009 by Konrad Voelkel
#   Modified 2011 by Mark Weyer
#   Maintenance modifications 2010,2011,2014 by the cuyo developers
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
#   kmBier.xpm[.gz], kmHetzstapel.xpm[.gz], kmMuell.xpm[.gz], kmPizza.xpm[.gz],
#   kmSofa.xpm[.gz], kmTafelgrund.xpm[.gz], kmTasse.xpm[.gz]
#


mfs={
  name="mfs"
  author="Konrad"
  numexplode=5
  chaingrass=0
  
  pics=pizza,bier,sofa
  bgcolor=29,48,53
  bgpic=kmTafelgrund.xpm
  topcolor=0,0,0
  toptime=50
  toppic=kmHetzstapel.xpm
  topoverlap=0
  startpic=muell
  startdist="A.........",
            "A....A....",
            "AA...AA..A","-*%&"
  greypic=tasse
  description="Who cleans the room?"

<<
# standard für sofas:
schemahoriz={
  switch {
    ??0???0? -> A;
    ??1???0? -> B;
    ??1???1? -> C;
    ??0???1? -> D;
  };
  *
};

# wenn sofas mit verbindungsstreben gewünscht sind:
schemasofaspezial={
  switch {
    0?0???0? -> A;
    0?1???0? -> B;
    0?1???1? -> C;
    0?0???1? -> D;
    1?0?1?0? -> E;
    1?1?1?0? -> F;
    1?1?1?1? -> G;
    1?0?1?1? -> H;
    1?0?0?0? -> I;
    1?1?0?0? -> J;
    1?1?0?1? -> K;
    1?0?0?1? -> L;
  };
  *
};

# standard für tassen:
schemavertx={ 
  switch {
    0???0??? -> A;
    0???1??? -> E;
    1???1??? -> I;
    1???0??? -> M;
  };
  pos += version;
  *
};
>>

  tasse={
    pics=kmTasse.xpm
    numexplode=4
    neighbours=<neighbours_vertical>
<<
  tasse.init = {if rnd(5)==0 -> version = rnd(4) else version = 0;};
  default behaviour = calculate_size+explodes_on_size+explodes_on_explosion : reapply;
  tasse=schemavertx;
>>
}

  pizza={
# still not working properly:
#  neighbours already explode if they are not merged!
#  that makes the level much easier.
    pics=kmPizza.xpm
    numexplode=7
<<
  pizza.init = {weight = 1;};
  default inhibit = DIR_L + DIR_R + DIR_U + DIR_D : reapply;
  pizza={
    if kind@(0,-1)==pizza && weight<4 && weight@(0,-1)>0 -> {
      weight += 1;
      weight@(0,-1) -= 1;
    } else {
      # explosiv werden:
      inhibit = DIR_UL + DIR_UR + DIR_DR + DIR_DL;
    };
    if falling -> {A*;}
    else {
      pos=weight;
      if weight==0 -> kind=nothing
      else *;
    }
  };
>>
}

  sofa={
    pics=kmSofa.xpm
    neighbours=<neighbours_horizontal>
<<
  sofa=schemahoriz;
>>
}

  bier={
    pics=kmBier.xpm
<<
  bier=*;
>>
}

  muell={
    pics=kmMuell.xpm
<<
  muell=*;
>>
}

  info={
    pics=infoicons.xpm
<<
  info={
    if version==0 -> A
    else {
      E,E,E,E,E,E,E,E,E,
      M,M,M,M,M,M,M,M,M,
      N,N,N,N,N,N,N,N,N
    };
    *
  };
>>
  }

}

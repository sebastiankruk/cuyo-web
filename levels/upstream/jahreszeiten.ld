#
#   Copyright <=2002 by Daniela Lipps
#   Modified 2011 by Immanuel Halupczok
#   Maintenance modifications 2002,2006,2008,2011,2014 by the cuyo developers
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
#   jjBasis.xpm[.gz], jjErde.xpm[.gz], jjExtra.xpm[.gz], jjFruehling1.xpm[.gz],
#   jjFruehling2.xpm[.gz], jjFruehling3.xpm[.gz], jjFruehling4.xpm[.gz],
#   jjGrau.xpm[.gz], jjHerbst1.xpm[.gz], jjHerbst2.xpm[.gz], jjHerbst3.xpm[.gz],
#   jjHerbst4.xpm[.gz], jjSommer1.xpm[.gz], jjSommer2.xpm[.gz],
#   jjSommer3.xpm[.gz], jjSommer4.xpm[.gz], jjWinter1e.xpm[.gz],
#   jjWinter1.xpm[.gz], jjWinter2.xpm[.gz], jjWinter3.xpm[.gz],
#   jjWinter4.xpm[.gz]
#

# referenced from labskaus.ld


Jahreszeiten={
  name="The four Seasons"
  author="Jela"
  numexplode=4
  numexplode[1]=7
  chaingrass=1
  pics=jjBaum*4
  bgcolor=160,170,255
  topcolor=150,10,0
  toptime=50
  startpic=jjErde
  startdist="..ABC.....","DFFDFDDFDF","-B%&"
  greypic=jjGrau
  textcolor=200,0,0
  description="Everything changes..."
  emptypic=Leer
  
  <<
  var vog_l, vog_r;
  var sitz_ok=0:reapply;
  var sitz=0:reapply;
  var neuer_vogel=0:reapply;
  var sitz_re;
  
  neu_voegel={
    if 1:2 -> {if players == 1 || loc_p == 1 -> neuer_vogel@@(0,loc_y) = 1;}
    else -> {if players == 1 || loc_p == 2 -> neuer_vogel@@(9,loc_y) = 1;};
  };
  
  
  kann_sitz_l={
    if (sitz_ok && vog_l == 1 && !sitz) -> {
      vog_l=0; sitz@(0,0)=1; sitz_re = rnd(4) == 0;
    };
  };

  kann_sitz_r={
    if (sitz_ok && vog_r == 1 && !sitz) -> {
      vog_r=0; sitz@(0,0)=1; sitz_re = rnd(4) != 0;
    };
  };

  voegel={
    file=0;
    if sitz>rnd(64) && 1:10  ||  sitz && !sitz_ok -> {
      if rnd(3) > sitz_re -> {
        if !vog_l || !sitz_ok -> { sitz = 0; vog_l = rnd(9) + 2; };
      } else -> {
        if !vog_r || !sitz_ok -> { sitz = 0; vog_r = rnd(9) + 2; };
      };
    };
    if sitz-> sitz+=1;
    if vog_r -> {
        {A*;kann_sitz_r},{B*;kann_sitz_r},{C*;kann_sitz_r},{D*;kann_sitz_r},
        {[qu=Q_TL_TR] A*;kann_sitz_r;},
        {[qu=Q_TL_TR] B*; [qu=Q_TR_TL] B*@(1,0)},
        {[qu=Q_TL_TR] C*; [qu=Q_TR_TL] C*@(1,0)},
        {[qu=Q_TL_TR] D*; [qu=Q_TR_TL] D*@(1,0);
          if vog_r==1 -> vog_r@(1,0) = 1 else -> vog_r@(1,0)=vog_r-1;
          vog_r=0;
          if players == 2 && loc_x == 9 && loc_p == 1 -> neuer_vogel@@(0, loc_y; >) = 1;
        };
    };
    if vog_l -> {
        {H*;kann_sitz_l},{G*;kann_sitz_l},{F*;kann_sitz_l},{E*;kann_sitz_l},
        {[qu=Q_BR_BL] H*;kann_sitz_l;},
        {[qu=Q_BR_BL] G*; [qu=Q_BL_BR] G*@(-1,0)},
        {[qu=Q_BR_BL] F*; [qu=Q_BL_BR] F*@(-1,0)},
        {[qu=Q_BR_BL] E*; [qu=Q_BL_BR] E*@(-1,0);
          if vog_l==1 -> vog_l@(-1,0) = 1 else -> vog_l@(-1,0)=vog_l-1;
          vog_l=0;
          if players == 2 && loc_x == 0 && loc_p == 2 -> neuer_vogel@@(9, loc_y; <) = 1;
        };
    };
    if vog_l || vog_r -> neuer_vogel = 0;
    if neuer_vogel && loc_x == 0 => {
      {[qu=Q_TR_TL] B*},
      {[qu=Q_TR_TL] C*},
      {[qu=Q_TR_TL] D*; vog_r = rnd(10) + 1; neuer_vogel = 0;}
    };
    if neuer_vogel && loc_x == 9 => {
      {[qu=Q_BL_BR] G*},
      {[qu=Q_BL_BR] F*},
      {[qu=Q_BL_BR] E*; vog_l = rnd(10) + 1; neuer_vogel = 0;}
    };
  };
  >>
  
  Leer={
    pics=jjExtra.xpm
    <<
    Leer={
      voegel;
      if 1:5000 && rnd(20) > loc_y && rnd(20) < loc_y -> neu_voegel;
    };
    >>
  }
  
  jjErde={
    pics=jjExtra.xpm,jjErde.xpm
    <<
    jjErde={
      if 1??????? -> 1E* else -> {pos=version;1*;};
      voegel;
    };
    >>
  }

  jjGrau={
    pics=jjExtra.xpm,jjGrau.xpm
    <<
    jjGrau={
      1A*;
      voegel;
    };
    >>
  }

  jjBaum={
    pics=jjExtra.xpm,
      jjWinter1.xpm,jjWinter2.xpm,jjWinter3.xpm,jjWinter4.xpm,
      jjFruehling1.xpm,jjFruehling2.xpm,jjFruehling3.xpm,jjFruehling4.xpm,
      jjSommer1.xpm,jjSommer2.xpm,jjSommer3.xpm,jjSommer4.xpm,
      jjHerbst1.xpm,jjHerbst2.xpm,jjHerbst3.xpm,jjHerbst4.xpm,
      jjWinter1e.xpm
    <<
    var dt;
    var akt_t;
    jjBaum.init={dt=rnd(16)+rnd(16)};
    jjBaum={
      akt_t=((kind-jjBaum)*4+(time+dt)/32)%16;
      file = akt_t + 1; schema16;

      sitz_ok = 0;
      # Kann hier eine Amsel sitzen?
      if akt_t >= 4 && akt_t <= 14 && ! 1?1?1?1? -> sitz_ok = 1;
      # Kann hier eine Eule sitzen?
      if akt_t == 0 && (??0???1? || (! ??0???0? && ! 1???1??? && ! 0?1?0?0?)) -> sitz_ok = 1;
      
      # Nest wird fluegge:
      if 1?1?1?1? && (time+dt) % 32 == 0 && akt_t == 13 -> {
        vog_l = 2 + rnd(9);
        vog_r = 2 + rnd(9);
      };
      
      # Vogel-Hauptprogramm:
      voegel;
      
      # Sitzende Voegel malen:
      if sitz -> {if akt_t == 0 -> { file = 17; schema16; } else -> {I; pos += sitz_re; 0*;};};
      
      # Evtl. neuen Vogel in dieser Zeile starten:
      if 1:5000 -> neu_voegel;
    };
    >>
  }
}

#
#   Copyright <=2004 by Immanuel Halupczok
#   Modified 2006,2008,2014 by Immanuel Halupczok
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
#   ipGrau.xpm[.gz], ipHochRunter.xpm[.gz], ipHoch.xpm[.gz],
#   ipLinksRechts.xpm[.gz], ipLinks.xpm[.gz], ipOben.xpm[.gz],
#   ipRechts.xpm[.gz], ipRunter.xpm[.gz], ipStart.xpm[.gz],
#   ipStart.xcf
#

# referenced from memory.ld

Pfeile={
  name="Arrows"
  author="Immi"
  numexplode=4
  numexplode[1]=7
  numexplode[1,easy]=5
  chaingrass=0
  pics=ipHoch,ipRechts,ipRunter,ipLinks,ipHochRunter,ipLinksRechts
  toptime=50
  toppic="ipOben.xpm"
  topoverlap=41
  topcolor=255,0,0
  textcolor=255,209,25
  startpic=ipStart
  #startdist[1]="....++....","...++++...","..++AF++..",".++BCDE++.","++GHIJKL++","++MNOPQR++","SSSTUVWXXX"
  startdist="....AA....","...AAAA...","..ADAAJA..","..MAAAAG..","AAAAAAAAAA"
  greypic=ipGrau
  description="Arrows can be turned"
  emptypic=ipEmpty


  <<
  pfeil=switch {
    turn==1 -> E*;
    turn==2 -> F*;
    -> schema4;
  };
  
  ipHoch=pfeil;
  ipRechts=pfeil;
  ipRunter=pfeil;
  ipLinks=pfeil;
  ipHochRunter=pfeil;
  ipLinksRechts=pfeil;

  ipHoch.turn=kind=ipRechts;
  ipRechts.turn=kind=ipRunter;
  ipRunter.turn=kind=ipLinks;
  ipLinks.turn=kind=ipHoch;
  ipHochRunter.turn=kind=ipLinksRechts;
  ipLinksRechts.turn=kind=ipHochRunter;

  var grasig = 1 : reapply;

  >>

  ipStart={
    pics="ipStart.xpm"
    <<
    var vn, vne, ve, vse, vs, vsw, vw, vnw;
    var manuell;
    var manuell_pos;

    ipStart={
      if informational -> S*
      else -> {
        # In welche Richtungen möchte ich mich verbinden:
        # normalerweise mit anderen starts oder mit outside
        # version ist aber ein bitfeld, das verbindungen blockieren kann
        vn = grasig@(0,-1) &&
          version & 1 == 0 && version@(0,-1) & 4 == 0;
        vne = grasig@(1,-1) &&
          version & 3 == 0 && version@(1,-1) & 12 == 0 && version@(0,-1) & 6 == 0 && version@(1,0) & 9 == 0;
        ve = grasig@(1,0) &&
          version & 2 == 0 && version@(1,0) & 8 == 0;
        vse = grasig@(1,1) &&
          version & 6 == 0 && version@(1,1) & 9 == 0 && version@(0,1) & 3 == 0 && version@(1,0) & 12 == 0;
        vs = grasig@(0,1) &&
          version & 4 == 0 && version@(0,1) & 1 == 0;
        vsw = grasig@(-1,1) &&
          version & 12 == 0 && version@(-1,1) & 3 == 0 && version@(0,1) & 9 == 0 && version@(-1,0) & 6 == 0;
        vw = grasig@(-1,0) &&
          version & 8 == 0 && version@(-1,0) & 2 == 0;
        vnw = grasig@(-1,-1) &&
          version & 9 == 0 && version@(-1,-1) & 6 == 0 && version@(0,-1) & 12 == 0 && version@(-1,0) & 3 == 0;

        if vs && vse && ve && (vne || vsw) && !vn && !vw -> C*
        else if vs && vsw && vw && (vnw || vse) && !vn && !ve -> D*
        else if !vn && !vs && !vw && ve -> U*
        else if !vn && !vs && vw && !ve -> V*
        else if !vn && !vs && !vw && !ve -> {
          if loc_x <= 2 || version == 3 -> G*
          else if loc_x >= 7 || version == 9 -> L*
          else -> S*;
        } else -> {
          manuell = 0;
          manuell_pos = -1;
          if version == 3 && vs -> { manuell .+= 10; manuell_pos = 7; };
          if version == 9 && vs -> { manuell .+= 5; manuell_pos = 10; };
          if version == 12 && ve -> { manuell .+= 12; manuell_pos = 12; };
          if version == 6 && vw -> { manuell .+= 12; manuell_pos = 17; };

          if manuell == 0 -> { # sicherheitshalber nicht mehrere manuell-malungen
            if vn && vw && version@(-1,-1) == 3 -> { manuell += 17; manuell_pos = 14; };
            if vn && ve && version@(1,-1) == 9 -> { manuell += 18; manuell_pos = 15; };
            if vn && vw && version@(-1,-1) == 12 -> { manuell += 17; manuell_pos = 19; };
            if vn && ve && version@(1,-1) == 6 -> { manuell += 18; manuell_pos = 22; };
            if manuell >= 32 -> {
              # zwei manuells geht nicht
              manuell = 0; manuell_pos = -1;
            };
          };

	  if manuell & 1 == 0 -> [qu=Q_TL] {switch {
	    !vn && !vw -> E;
	    vn && !vw -> A;
	    !vn &&  vw -> B;
	    vn &&  vw &&  vnw -> N;
            version@(0,-1) == 9 -> Q;
	    grasig@(-2,0) || grasig@(0,-2) -> F;
            -> Q;
	  };*};
	  if manuell & 2 == 0 -> [qu=Q_TR] {switch {
	    !vn && !ve -> B;
	    vn && !ve -> F;
	    !vn &&  ve -> E;
	    vn &&  ve &&  vne -> Q;
            version@(0,-1) == 3 -> N;
	    grasig@(2,0) || grasig@(0,-2) -> A;
            -> N;
	  };*};
	  if manuell & 4 == 0 -> [qu=Q_BL] {switch {
	    !vs && !vw -> E;
	    vs && !vw -> A;
	    !vs &&  vw -> B;
	    vs &&  vw &&  vsw -> Q;
            version@(-1,0) == 12 -> N;
	    grasig@(-2,0) || grasig@(0,2) -> F;
            -> N;
	  };*};
	  if manuell & 8 == 0 -> [qu=Q_BR] {switch {
	    !vs && !ve -> B;
	    vs && !ve -> F;
	    !vs &&  ve -> E;
	    vs &&  ve &&  vse -> N;
            version@(1,0) == 6 -> Q;
	    grasig@(2,0) || grasig@(0,2) -> A;
            -> Q;
	  };*};

          if manuell_pos != -1 -> { pos = manuell_pos; *;};



#	  [qu=Q_TL] {switch {
#	    !vn && !vw -> E;
#	    vn && !vw -> A;
#	    !vn &&  vw -> B;
#	    vn &&  vw && !vnw -> F;
#	    vn &&  vw &&  vnw -> N;
#	  };*};
#	  [qu=Q_TR] {switch {
#	    !vn && !ve -> B;
#	    vn && !ve -> F;
#	    !vn &&  ve -> E;
#	    vn &&  ve && !vne -> A;
#	    vn &&  ve &&  vne -> Q;
#	  };*};
#	  [qu=Q_BL] {switch {
#	    !vs && !vw -> E;
#	    vs && !vw -> A;
#	    !vs &&  vw -> B;
#	    vs &&  vw && !vsw -> F;
#	    vs &&  vw &&  vsw -> Q;
#	  };*};
#	  [qu=Q_BR] {switch {
#	    !vs && !ve -> B;
#	    vs && !ve -> F;
#	    !vs &&  ve -> E;
#	    vs &&  ve && !vse -> A;
#	    vs &&  ve &&  vse -> N;
#	  };*};
        };

       
      };
    };
    >>
  }

  ipHoch={
    pics=ipHoch.xpm
    << default grasig = 0 : reapply; >>
  }
  ipRechts={
    pics=ipRechts.xpm
    << default grasig = 0 : reapply; >>
  }
  ipRunter={
    pics=ipRunter.xpm
    << default grasig = 0 : reapply; >>
  }
  ipLinks={
    pics=ipLinks.xpm
    << default grasig = 0 : reapply; >>
  }
  ipHochRunter={
    pics=ipHochRunter.xpm
    << default grasig = 0 : reapply; >>
  }
  ipLinksRechts={
    pics=ipLinksRechts.xpm
    << default grasig = 0 : reapply; >>
  }
  ipGrau={
    pics=ipGrau.xpm
    << default grasig = 0 : reapply; >>
  }
  ipEmpty={
    << default grasig = 0 : reapply; >>
  }
}


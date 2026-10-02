#
#   Copyright 2011 by Mark Weyer
#   Maintenance modifications 2012 by the cuyo developers
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

Angst = {

  name[easy] = "Balls at ease"
  name = "Frightened balls"
  name[hard] = "Angry balls"
  author = "Mark Weyer"
  description[easy] = "These balls are oblivious to the rules of cuyo"
  description = "These balls are learning the rules of cuyo"
  description[hard] = "These balls have learned the rules of cuyo"

  anzahl = 7
  pics = Blob * <2*anzahl>
  greypic = Grau
  startpic = Gras
  startdist = ".........**.........","...*....****....*...","..***..******..***..",".******************."
  numexplode = 4
  randomfallpos = 1

  <<
    var id;

    werbung[easy] = {message("Also try this level in normal and hard difficulty");};
    werbung = {message("Also try this level in easy and hard difficulty");};
    werbung[hard] = {message("Also try this level in easy and normal difficulty");};

    semiglobal = {
      if time==750 -> {
        falling_speed = 0;
        falling_fast_speed = 0;
        message("Commercial break");
      };
      if time==800 -> werbung;
      if time==850 -> {
        falling_speed = 6;
        falling_fast_speed = 32;
      };
    };
  >>

  Blob = {
    pics = manKoepfe1.xpm, manGesichter1.xpm,
      manKoepfe2.xpm, manGesichter2.xpm, manKoepfe3.xpm, manGesichter3.xpm,
      manKoepfe4.xpm, manGesichter4.xpm, manKoepfe5.xpm, manGesichter5.xpm,
      manKoepfe6.xpm, manGesichter6.xpm, manKoepfe7.xpm, manGesichter7.xpm

    <<
      var alt_y,faellt,gemalt;
      var tauschrichtung,tauschpartner;
      var linksbesser,rechtsbesser;
      var linksrechtsbesser,rechtslinksbesser;
      var bedroht,abstand,getauschtwerdrichtung,tauschphase,kind_;

      Blob.init = {
        kind_ = Blob+(kind-Blob)%anzahl;
        kind = kind_;
        id = 4*time + 2*loc_p + (loc_xx==loc_xx@@(0) && loc_yy==loc_yy@@(0));
      };

      fallbilder = {
        faellt = alt_y<loc_y && !falling;
        gemalt = 1;
        switch {
          faellt -> O;
          faellt@(0,0) => {P,P,P};
          -> gemalt=0;
        };
        alt_y = loc_y;
      };

      Blob[easy] = {
        file=2*(kind-Blob);
        schema4;
        file+=1;
        fallbilder;
        switch {
          gemalt -> ;
          exploding -> J;
          -> if 1:20 => {A,A,A,A,A,A,A,A,A,I,I,I,I}
            else -> I;
        };
        *;
      };

      Blob = {
        file=2*(kind_-Blob);
        if id@(tauschrichtung*(3-2*tauschphase),0)!=tauschpartner -> {
          tauschrichtung=0;
          kind=kind_;
        };
        if id@(getauschtwerdrichtung,0)!=tauschpartner ->
          getauschtwerdrichtung=0;
        if tauschrichtung -> {
          switch {
            tauschphase==1 -> {
              pos = 13+(tauschrichtung==1); *;
              pos += tauschrichtung; *@(tauschrichtung,0);
              kind@(tauschrichtung,0)=kind_+anzahl;
              kind_@(tauschrichtung,0)=kind_;
              kind=kind_@(tauschrichtung,0);
              kind_=kind_@(tauschrichtung,0);
              tauschrichtung@(tauschrichtung,0)=tauschrichtung;
              tauschphase@(tauschrichtung,0)=2;
              getauschtwerdrichtung=tauschrichtung;
              getauschtwerdrichtung@(tauschrichtung,0)=0;
              tauschrichtung=0;
            };
            tauschphase==2 -> {
              pos = 8+3*(tauschrichtung==1); *;
              pos -= tauschrichtung; *@(-tauschrichtung,0);
              getauschtwerdrichtung@(-tauschrichtung,0)=0;
              tauschrichtung=0;
              kind=kind_;
            };
          };
        } else {
          schema4;
          file+=1;
          fallbilder;
          abstand = 2*loc_y-loc_y@@(0)-loc_y@@(1);
          bedroht = (kind_==kind_@@(0) || kind_==kind_@@(1)) && abstand>=-6;
          switch {
            gemalt -> ;
            falling -> U;
            exploding -> H;
            bedroht && abstand>13 -> E;
            bedroht && abstand>8 -> K;
            bedroht -> {
              abstand = 2*loc_x-loc_x@@(0)-loc_x@@(1);
              if abstand==1..5 -> tauschrichtung=1;
              if abstand==-5..-1 -> tauschrichtung=-1;
              if basekind@(tauschrichtung,0)!=Blob ||
                kind_@(tauschrichtung,0)==kind_@@(0) ||
                kind_@(tauschrichtung,0)==kind_@@(1) -> tauschrichtung=0;
              switch {
                abstand<-5 || abstand>5 -> K;
                tauschrichtung -> pos=17-(tauschrichtung==1);
                -> {M,N};
              };
              if tauschrichtung -> {
                tauschpartner=id@(tauschrichtung,0);
                getauschtwerdrichtung@(tauschrichtung,0)=-tauschrichtung;
                tauschpartner@(tauschrichtung,0)=id;
                kind=kind_+anzahl;
                tauschphase=1;
              };
            };
            -> if getauschtwerdrichtung => {
                pos=18+(getauschtwerdrichtung==1),
                X,X,X,X,X,X,X,X,X,X,X,W,W,W,W,W,W,W,W,W,W,W,W,W,W
              } else -> V;
          };
          *;
        };
      };

      Blob[hard] = {
        file=2*(kind_-Blob);
        if linksbesser && !tauschrichtung && !tauschrichtung@(-1,0) &&
            loc_y==alt_y && loc_y==alt_y@(-1,0) &&
            (loc_x % 2 || !rechtsbesser || !linksbesser@(-1,0) ||
              tauschrichtung@(-2,0)) -> {
          tauschrichtung=-1;
          tauschpartner=id@(-1,0);
        };
        if rechtsbesser && !tauschrichtung && !tauschrichtung@(1,0) &&
            loc_y==alt_y && loc_y==alt_y@(1,0) &&
            (loc_x%2==0 || !rechtsbesser@(1,0) || tauschrichtung@(2,0)) -> {
          tauschrichtung=1;
          tauschpartner=id@(1,0);
        };
        linksbesser =
          (kind==kind@(1,0)) + (kind==kind@(0,1)) + (kind==kind@(0,-1))
          - (kind==kind@(-2,0)) - (kind==kind@(-1,1)) - (kind==kind@(-1,-1));
        rechtsbesser =
         (kind==kind@(-1,0)) + (kind==kind@(0,1)) + (kind==kind@(0,-1))
          - (kind==kind@(2,0)) - (kind==kind@(1,1)) - (kind==kind@(1,-1));
        linksrechtsbesser =
          (kind@(-1,0)==kind@(-2,0)) + (kind@(-1,0)==kind@(-1,1))
          + (kind@(-1,0)==kind@(-1,-1)) - (kind@(-1,0)==kind@(1,0))
          - (kind@(-1,0)==kind@(0,1)) - (kind@(-1,0)==kind@(0,-1));
        rechtslinksbesser =
          (kind@(1,0)==kind@(2,0)) + (kind@(1,0)==kind@(1,1))
          + (kind@(1,0)==kind@(1,-1)) - (kind@(1,0)==kind@(-1,0))
          - (kind@(1,0)==kind@(0,1)) - (kind@(1,0)==kind@(0,-1));
        linksbesser = kind==kind_ && basekind@(-1,0)==Blob &&
          !exploding && !exploding@(-1,0) &&
          ((linksbesser>0 && linksrechtsbesser>=0) ||
            (linksbesser>=0 && linksrechtsbesser>0));
        rechtsbesser = kind==kind_ && basekind@(1,0)==Blob &&
          !exploding && !exploding@(1,0) &&
          ((rechtsbesser>0 && rechtslinksbesser>=0) ||
            (rechtsbesser>=0 && rechtslinksbesser>0));

        if id@(tauschrichtung,0)!=tauschpartner
            || exploding || exploding@(tauschrichtung,0)
          -> {tauschrichtung=0; kind=kind_;};
        if tauschrichtung -> {
          if kind==kind_ -> {schema4; file+=1; C*; kind=kind_+anzahl;}
          else -> {
            {pos=5+(tauschrichtung==1); *@(0,0);
              pos+=tauschrichtung; *@(tauschrichtung,0);} ,
            {pos=7-3*(tauschrichtung==1); *@(0,0);
              pos+=tauschrichtung; *@(tauschrichtung,0);
              kind_=kind_@(tauschrichtung,0);
              kind=kind_;
              tauschrichtung=0;
              linksbesser=0;
              rechtsbesser=0;
              linksbesser@(1,0)=0;
              rechtsbesser@(-1,0)=0;
            }
          };
        }
        else {
          schema4;
          file+=1;
          fallbilder;
          switch {
            gemalt -> ;
            exploding -> G;
            -> if 1:20 => {B,B,B,B,B,B,B,B,B,F,F,F,F}
              else -> F;
          };
          *;
        };
      };

    >>
  }

  Grau = {
    pics = manGrau.xpm
    << Grau=schema4; >>
  }

  Gras = {
    pics = manGras.xpm
    << Gras=schema4; >>
  }

}


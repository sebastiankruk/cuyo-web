#
#   Copyright 2006,2011,2014 by Mark Weyer
#   Modified 2010 by Mark Weyer
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

Fische = {
  name="Fish"
  author="Mark Weyer"

  zuckrate = 20
  maxgroesse = 3
  anzahlsorten[easy] = 4
  anzahlsorten = 5
  anzahlsorten[hard] = 6

  pics = fisch*<anzahlsorten>
  greypic = qualle
  startpic = muschel
  startdist = "...*....*.","..***...**",".*****.***"
  numexplode[easy] = 8
  numexplode = 9
  numexplode[hard] = 10
  numexplode[2,easy] = 7
  numexplode[2] = 8
  numexplode[2,hard] = 9

  muschel = {
    pics = mfmuschel.xpm

    <<
      var offen,bedroht;

      muschel.init = {offen=rnd(2);};

      muschel = {
        bedroht = basekind@(-1,0)==fisch || basekind@(1,0)==fisch;
        if offen
          -> if bedroht
            => {D,C,B,{offen=0; A}}
            else -> E
          else => if 1:50
            => {F,F,F,G,G,G,if bedroht => A else => {A,B,C,D,{offen=1; E}}}
            else -> A;
        *;
      };
    >>
  }

  qualle = {
    pics = mfqualle.xpm

    <<
      qualle = {
        switch {
          1:70 => {B,B,B};
          1:69 => {C,C,C};
          -> A;
        };
        *;
      };
    >>
  }

  fisch = {
    pics = mffisch1.xpm, mffisch2.xpm, mffisch3.xpm,
      mffisch4.xpm, mffisch5.xpm, mffisch6.xpm

    <<
      var richtung, fressend;

      fisch.init = {richtung=rnd(2)*2-1;};

      fisch = {

        # Wichtiger Spezialfall im Automaten:
        # Wenn ich einen Fisch fressen will, der sich gleichzeitig auch
        # dazu entscheidet, dann tun wir das beide erstmal, aber ich
        # merke später daran, daß er fressend ist, daß ich ihn nicht
        # fressen kann und wachse nicht.

        file = kind-fisch;
        pos = 12*(weight-1);
        if richtung==-1 -> pos+=3;
        switch {

          # Gibt's Happi?

          weight<maxgroesse
              # Ich bin noch hungrig
            && (!fressend@(-richtung,0) || richtung@(-richtung,0)!=richtung)
              # und werde nicht selbst grad von hinten gefressen
            && basekind@(richtung,0)==fisch
              # und vor mir ist ein Fisch
            && !fressend@(richtung,0)
              # der noch nicht wegschwimmt
            && (weight@(richtung,0)<weight
              || (weight@(richtung,0)==weight
                && richtung@(richtung,0)==richtung))
              # und der sich nicht wehren kann
            && ((!basekind@(2*richtung,0)==fisch)
              || richtung@(2*richtung,0)==richtung
              || weight@(2*richtung,0)<weight
              || weight@(2*richtung,0)==maxgroesse
              || (weight@(2*richtung,0)==weight
                && richtung@(richtung,0)==richtung))
              # und wenn eins weiter noch einer ist,
              # dann schnappt der mir das Happi trotzdem nicht weg
            => { # Fressen!
            { # Phase 1: ranschwimmen
              fressend=1; pos=pos+4; *; pos=pos+richtung; *@(richtung,0);
            },
            { # Phase 2: zuschnappen, wachsen und hier verschwinden
              pos=pos+8; *; pos=pos+richtung; *@(richtung,0);
              kind@(richtung,0)=kind; kind=nothing;
              if fressend@(richtung,0)
                -> weight@(richtung,0)=weight
                  # Der leckere Fisch ist abgehauen: doch nicht wachsen
                else weight@(richtung,0)=weight+1;
              richtung@(richtung,0)=richtung;
              fressend=0;
            },
            { # Phase 3: ankommen
              *;
            }
          };

          # Nervöse Zuckung, wenn der Fall vorbeikommt

          !falling && 1:4 && weight<maxgroesse &&
            ((loc_x@@0==loc_x+richtung && loc_yy@@0-loc_y*32==-8..8)
              || (loc_x@@1==loc_x+richtung && loc_yy@@1-loc_y*32==-8..8))
          => {{pos=pos+8; *; pos=pos+richtung; *@(richtung,0)},*,*,*};

          # Ab jetzt: Abwarten und vielleicht auch mal Zucken

          kind==fisch+1 # Krake
          -> switch {
            1:(2*zuckrate) -> { # Je nach Richtung Paddeln oder Blinzeln
              qu=Q_TL; *; qu=Q_BL; *;
              pos+=richtung;
              qu=Q_TR; *; qu=Q_BR; *;
            };
            1:(2*zuckrate-1) -> { # Das andere
              qu=Q_TR; *; qu=Q_BR; *;
              pos+=richtung;
              qu=Q_TL; *; qu=Q_BL; *;
            };
            -> *;
          };
          kind==fisch+3 # Seepferdchen
          -> switch {
            1:(2*zuckrate) -> { # Schwanzrollen
              qu=Q_TL; *; qu=Q_TR; *;
              pos+=richtung;
              qu=Q_BL; *; qu=Q_BR; *;
            };
            1:(2*zuckrate-1) -> { # Blinzeln
              qu=Q_BL; *; qu=Q_BR; *;
              pos+=richtung;
              qu=Q_TL; *; qu=Q_TR; *;
            };
            -> *;
          };
          # Hai und Zierfisch
          -> switch {
            1:(3*zuckrate) -> # Schwanzzucken
              if richtung==1 -> {
                qu=Q_TR; *; qu=Q_BR; *;
                pos=pos+1; qu=Q_TL; *; qu=Q_BL; *;
              }
              else {
                qu=Q_TL; *; qu=Q_BL; *;
                pos=pos-1; qu=Q_TR; *; qu=Q_BR; *;
              };
            1:(3*zuckrate-1) -> # Paddeln
              if richtung==1 -> {
                qu=Q_TL; *; qu=Q_TR; *; qu=Q_BL; *;
                pos=pos+1; qu=Q_BR; *;
              }
              else {
                qu=Q_TL; *; qu=Q_TR; *; qu=Q_BR; *;
                pos=pos-1; qu=Q_BL; *;
              };
            1:(3*zuckrate-2) -> # Blinzeln
              if richtung==1 -> {
                qu=Q_TL; *;qu=Q_BL; *; qu=Q_BR; *;
                pos=pos+1; qu=Q_TR; *;
              }
              else {
                qu=Q_TR; *;qu=Q_BL; *; qu=Q_BR; *;
                pos=pos-1; qu=Q_TL; *;
              };
            -> *;
          };
        };
      };
    >>
  }

}


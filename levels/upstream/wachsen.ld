#
#   Copyright <=2004 by Immanuel Halupczok
#   Maintenance modifications 2005,2006,2011 by the cuyo developers
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
#   iwBaum2.xpm[.gz], iwBaum.xpm[.gz], iwErde.xpm[.gz], iwKreis.xpm[.gz],
#   iwQuadrat.xpm[.gz], iwRaute.xpm[.gz]
#

Wachsen={
  name="Growing"
  author="Immi"
  numexplode=4
  numexplode[1]=5
  chaingrass[1]=1
  chaingrass=0
  pics=iwKreis.xpm,iwQuadrat.xpm,iwRaute.xpm
  startpic=Erde
  startdist="AAAAAAAAAA","AAAAAAAAAA"
  toptime=50
  greypic=Baum
  emptypic=Nichts
  randomgreys[1]=100
  
  <<
  var neu, richtung;
  var li, re, ob, un;
  var frucht, reif;
  var frei;
  
  # löscht die li, re, ob, un Variablen, wenn sie beim
  # zugehörigen Nachbarfeld nicht gesetzt sind.
  wegbrechen = {
    switch {!un@(0,-1) -> ob=0;};
    switch {!ob@(0,1) -> un=0;};
    switch {!re@(-1,0) -> li=0;};
    switch {!li@(1,0) -> re=0;};
  };
  # Wachsen...
  w_hoch   = {ob=1; un@(0,-1)=1;};
  w_runter = {un=1; ob@(0,1)=1;};
  w_links  = {li=1; re@(-1,0)=1;};
  w_rechts = {re=1; li@(1,0)=1;};
  
  iwKreis = schema4;
  iwQuadrat = schema4;
  iwRaute = schema4;
  
  >>

  
  Erde={
    pics=iwErde.xpm
    <<
    Erde={
      
      wegbrechen;
      
      switch {
      
        # Untere Erde (andere Erde drüber
        kind@(0,-1) == Erde -> {
          E*
        };
      
        #  Baum da
        ob -> {
          D*
        };
        
        # Baum entsteht
        frei@(0,-1) && 1:600 => {
          B*, B*, B*, B*,
          {
            kind@(0,-1)=Baum;
            neu@(0,-1)=1;
            richtung@(0,-1)=2;
            w_hoch;
            C*
          }, C*, C*, C*
        };
        
        # Kein Baum
        -> {
          A*;          
        };
      };
    };
    >>
  }


  Nichts={
    pics=iwBaum2.xpm
    <<
    Nichts={
      frei = !frucht;
      switch {
        frucht && reif -> {
          X*;
          # Frucht fällt runter?
          if frei@(0,1) -> {
            frucht@(0,1)=frucht;
            reif@(0,1)=1;

            frucht=0;
            reif=0;
          } else {
            # Aufgekommen. Also sprießen.
            kind=Baum;
            neu=1;
            richtung=5;
            frucht=0;
            reif=0;
          };
        };
        frucht && !reif -> {
          D, D, D, D, C, C, C, C, B, B, B, B, A, A, A, {A, reif=1};
          pos *= 6;
          pos += frucht;
          0*
        };
        -> {
          li = 0; re = 0; ob = 0; un = 0;
        };
      };
    };
    >>
  }
  
  
  Baum={
    pics=iwBaum.xpm,iwBaum2.xpm
    <<
    
    Baum.init={
      # Wird ausgeführt für neue Graue, die einem der Gegner schickt:
      # Dann sind wir erst mal ein Obst
      neu=1;
      richtung=5;
    };
    
    Baum={
      frei=0;
      wegbrechen;
      
      switch {
        # Neuer Trieb?
        neu => {
          {
            neu=0;
            D;
            # Wenn wir in der Luft sind, dann erst mal nicht ausschlüpfen
            # bzw. nicht wachsen
            switch {
              kind@(0,1) == nothing -> busy;
            };
          }, D, D, D, C, C, C, C, B, B, B, B, A, A, A, A;
          pos *= 6;
          pos += richtung;
          1*
        };
        
        # Alter Baum
        -> {
          # Malen
          switch {
            li && re && ob && un -> K;
            li && re && ob       -> O;
            li && re &&       un -> G;
            li && re             -> C;
            li       && ob && un -> L;
            li       && ob       -> P;
            li       &&       un -> H;
            li                   -> D;
                  re && ob && un -> J;
                  re && ob       -> N;
                  re &&       un -> F;
                  re             -> B;
                        ob && un -> I;
                        ob       -> M;
                              un -> E;
                                 -> A;
          };
          *;
          
          switch { kind@(0,1) != nothing -> {
            # Weiterwachsen? (Nicht, wenn wir am fallen sind.)
            switch {
              # Hoch wachsen
              frei@(0,-1) && 1:300 -> {
                kind@(0,-1)=Baum;
                neu@(0,-1)=1;
                richtung@(0,-1)=2;
                w_hoch;
              };
              # Nach links fruchten
              frei@(-1,0) && kind@(-1,1) == nothing && 1:200 -> {
                frucht@(-1,0)=3;
                reif@(-1,0)=0;
                w_links;
              };
              # Nach links wachsen
              frei@(-1,0) && kind@(-1,1) != nothing && 1:400 -> {
                kind@(-1,0)=Baum;
                neu@(-1,0)=1;
                richtung@(-1,0)=0;
                w_links;
              };
              # Nach rechts fruchten
              frei@(1,0) && kind@(1,1) == nothing && 1:200 -> {
                frucht@(1,0)=4;
                reif@(1,0)=0;
                w_rechts;
              };
              # Nach rechts wachsen
              frei@(1,0) && kind@(1,1) != nothing && 1:400 -> {
                kind@(1,0)=Baum;
                neu@(1,0)=1;
                richtung@(1,0)=1;
                w_rechts;
              };
              # Hoch verbinden
              kind@(0,-1) == Baum && 1:500 => {
                w_hoch;
              };
              # Nach links verbinden
              kind@(-1,0) == Baum && 1:500 => {
                w_links;
              };
              # Nach rechts verbinden
              kind@(1,0) == Baum && 1:500 => {
                w_rechts;
              };
              # Runter verbinden (Wurzeln schlagen)
              kind@(0,1) == Erde && 1:500 => {
                w_rechts;
              };
            }
          };} # switch untendrunter ist was
        };
      }
    };
    >>
  }
}



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


BoniMali2 = {

  name = "PowerUps and -Downs"
  author = "Mark Weyer"
  description = "Collect PowerUps but avoid the bad ones"
  description[2] = "Collect PowerUps and hand the bad ones to the other player"
  description[2,geek] = "Collect PowerUps and hand the bad ones to your opponent^H^H^H^H^H^H^H^Hpartner"
  anzahl = 14
  pics = Kurz*<anzahl>, Normal*<anzahl>, Lang*<anzahl>
  emptypic = Nichts
  greypic = Grau
  startpic = Gras
  startdist = "....**....","...*++*...",".**+**+**.","*++*++*++*","*++*++*++*"
  randomgreys = 100
  neighbours = <neighbours_eight>
  bgcolor = 0,0,0
  toptime = 100
  toppic = "mbmBoss.xpm"
  topoverlap = 8
  topstop = 8
  topcolor = 0,0,0
  randomfallpos = 1

  uhranz = 8
  ssanz = 5
  stern1w = 3
  stern2w = <8*stern1w>
  stern4w = <4*stern2w>
  basisdauer = 250
  bonusdauer = <basisdauer>
  bonusdauer[easy] = <basisdauer*3/2>
  bonusdauer[hard] = <basisdauer/2>
  malusdauer = <basisdauer>
  malusdauer[easy] = <basisdauer/2>
  malusdauer[hard] = <basisdauer*3/2>
  uhrschritte = 20

# Liste der Boni und Mali nach Sorte
# 0  - schnellerer Fall
# 1  - langsamerer Fall
# 2  - hoeheres numexplode
# 3  - niedrigeres numexplode
# 4  - alles ununterscheidbar (ausser dem Fall)
# 5  - eine Sorte verschwindet
# 6  - Bonuspunkte
# 7  - die naechsten Grauen sind Gras
# 8  - die naechsten Grauen sind Joker
# 9  - Kettenreaktionspflicht
# 10 - Verbindbarkeit in acht Richtungen
# 11 - zwei Raketen
# 12 - Zusatzleben
# 13 - Verbindbarkeit in zwei Richtungen

  <<
    var sorte,basis,joker;
    var schnell,langsam,lang,kurz,ununterscheidbar,verschwind,
        grauwirdgras,grauwirdjoker,ketten,kettenalt,achtverbind,zweiverbind;
    var nachN=-1, nachNNO=-1, nachNO=-1, nachONO=-1,
        nachO=-1, nachOSO=-1, nachSSO=-1, nachSO=-1,
        nachS=-1, nachSSW=-1, nachSW=-1, nachWSW=-1,
        nachW=-1, nachWNW=-1, nachNW=-1, nachNNW=-1;
    var anwesend;
    var topy;
    var xx,wert,wert_,maxwert;
    var stern1a,stern1b,
      stern2a,stern2b,stern2c,stern2d,
      stern4a,stern4b,stern4c,stern4d;
    var sx,sy,sdx,sdy,st,scx,scy,scr,raketen;
    var fx,fy,fdx,fdy,fs,fe,fls,fle;
      # (fdx,fdy) ist die Bewegungsrichtung.
      # Die Richtung der Reihe ist (fdy,-fdx).
    var explodier,fexplodier;
    var leben,energie;

    zwei_hoch = {
      wert_ = 1;
      if wert%2 -> wert_ *= 2;
      if wert%4>=2 -> wert_ *= 4;
      if wert%8>=4 -> wert_ *= 16;
      if wert%16>=8 -> wert_ *= 256;
    };

    neue_feinde = {
      if 1:2 -> {fx=0; fdx=1;} else {fx=19; fdx=-1;};
      if 1:2 -> {fy=0; fdy=1;} else {fy=39; fdy=-1;};
      fs = ((sx-fx)*fdy-(sy-fy)*fdx-leben+1+rnd(2))/2;
      fe = fs+leben-1;
      fls = fe+1;
      fle = fs-1;
    };

    semiglobal.init = {
      basis=Normal;
      verschwind=-1;
      sx=loc_p*20-21;
      sy=32;
      sdx=6-loc_p*4;
      sdy=-1;
      st=4;
      scx=-2;
      leben=2;
      energie=50;
      message("3 blops explode");
      neue_feinde;
    };

    kollisionstest_einzel = {
      wert = (wert-fx)/fdy;
      if wert_==fy-wert*fdx && wert==fs..fe && !(wert==fls..fle) -> {
        energie -= 10;
        if energie<=0 -> {
          energie=50;
          leben-=1;
        };
        if wert<fls -> fls=wert;
        if wert>fle -> fle=wert;
        wert=fx+wert*fdy;
        fexplodier@@(wert/2,wert_/2) .-= 7*(1+7*(wert%2))*(1+63*(wert_%2));
        fexplodier@@(wert/2,wert_/2) .+= 4*(1+7*(wert%2))*(1+63*(wert_%2));
      };
    };

    kollisionstest = {
      wert=sx; wert_=sy; kollisionstest_einzel;
      wert=sx+1; wert_=sy; kollisionstest_einzel;
      wert=sx; wert_=sy+1; kollisionstest_einzel;
      wert=sx+1; wert_=sy+1; kollisionstest_einzel;
    };

    semiglobal = {
      topy = ((time/toptime)+8)/16;
      if energie<50 && !(time%75) -> energie+=1;

      kollisionstest;

      sx+=sdx; if sx<0 -> sx=0; if sx>18 -> sx=18;
      sy+=sdy; if sy<topy -> sy=topy; if sy>38 -> sy=38;
      if kind@@(sx/2,sy/2)==Gras || kind@@((sx+1)/2,sy/2)==Gras ||
          kind@@(sx/2,(sy+1)/2)==Gras || kind@@((sx+1)/2,(sy+1)/2)==Gras -> {
        sx=sx@@;
        sy=sy@@;
        st=0;
      };
      st-=1; if st<0 -> {
        sdx = rnd(3)-1;
        sdy = rnd(3)-1;
        st = rnd(9);
      };

      kollisionstest;

      if scx!=-2 -> {
        scy-=1;
        if scy<topy -> scx=-2
        else {
          sorte = (kind@@(scx/2,scy/2)==Grau)
            + 2*(kind@@(scx/2,scy/2)==Gras)
            + 4*(kind@@((scx+1)/2,scy/2)==Grau)
            + 8*(kind@@((scx+1)/2,scy/2)==Gras);
          if sorte -> {
            bonus(1);
            if !scr -> sorte.-=10;
            if scr && sorte.10 -> {sorte.-=5; bonus(9);};
            switch {
              sorte.3 && sorte.12 -> explodier@@((scx+rnd(1))/2,scy/2)=1;
              sorte.3 -> explodier@@(scx/2,scy/2)=1;
              sorte.12 -> explodier@@((scx+1)/2,scy/2)=1;
            };
            scx=-2;
          };
        };
      }
      else if 1:4 -> {
        scx=sx; scy=sy-1;
        if raketen -> {
          scr=1;
          raketen-=1;
        } else scr=0;
      };

      fx+=fdx;
      fy+=fdy;
      if fy<0 || fy>39 -> neue_feinde;

      if schnell && langsam -> {schnell=0; langsam=0;};
      switch {
        schnell -> {
          falling_speed = 12;
          schnell -= 1;
        };
        langsam -> {
          falling_speed = 3;
          langsam -= 1;
        };
        -> falling_speed = 6;
      };

      if lang && kurz -> {lang=0; kurz=0;};
      switch {
        lang -> {
          basis = Lang;
          lang -= 1;
        };
        kurz -> {
          basis = Kurz;
          kurz -= 1;
        };
        -> basis = Normal;
      };
      if basis!=basis@@ -> switch {
        basis==Lang -> message("4 blops explode");
        basis==Kurz -> message("2 blops explode");
        -> message("3 blops explode");
      };

      if ununterscheidbar -> ununterscheidbar -= 1;

      if verschwind==-2 && anwesend -> {
        wert = anwesend.1 + anwesend.2 + anwesend.4 + anwesend.8
          + anwesend.16 + anwesend.32 + anwesend.64 + anwesend.128
          + anwesend.256 + anwesend. 512 + anwesend.1024 + anwesend.2048
          + anwesend.4096 + anwesend.8192 + anwesend.16384 + anwesend.32768;
        verschwind = rnd(wert);
        if verschwind>=0 && !anwesend.1 -> verschwind+=1;
        if verschwind>=1 && !anwesend.2 -> verschwind+=1;
        if verschwind>=2 && !anwesend.4 -> verschwind+=1;
        if verschwind>=3 && !anwesend.8 -> verschwind+=1;
        if verschwind>=4 && !anwesend.16 -> verschwind+=1;
        if verschwind>=5 && !anwesend.32 -> verschwind+=1;
        if verschwind>=6 && !anwesend.64 -> verschwind+=1;
        if verschwind>=7 && !anwesend.128 -> verschwind+=1;
        if verschwind>=8 && !anwesend.256 -> verschwind+=1;
        if verschwind>=9 && !anwesend. 512 -> verschwind+=1;
        if verschwind>=10 && !anwesend.1024 -> verschwind+=1;
        if verschwind>=11 && !anwesend.2048 -> verschwind+=1;
        if verschwind>=12 && !anwesend.4096 -> verschwind+=1;
        if verschwind>=13 && !anwesend.8192 -> verschwind+=1;
        if verschwind>=14 && !anwesend.16384 -> verschwind+=1;
        if verschwind>=15 && !anwesend.32768 -> verschwind+=1;
      } else verschwind = -1;
      anwesend = 0;

      if grauwirdgras && grauwirdjoker -> {
        grauwirdgras=0;
        grauwirdjoker=0;
      };
      joker=rnd(anzahl);

      if ketten -> {
        if !kettenalt -> message("Chain reaction necessary");
        ketten -= 1;
        if !ketten -> message("Chain reaction not necessary");
      };
      kettenalt=ketten;

      if achtverbind && zweiverbind -> {achtverbind=0; zweiverbind=0;};
      if achtverbind -> achtverbind -= 1;
      if zweiverbind -> zweiverbind -= 1;
    };

    init = {
      if 1:stern1w -> {stern1a=rnd(32); stern1a@(0,1)=-1;} else -> stern1a=-1;
      if 1:stern1w -> {stern1b=rnd(32); stern1b@(0,1)=-1;} else -> stern1b=-1;
      if 1:stern2w -> {stern2a=rnd(16); stern2a@(0,1)=-1;} else -> stern2a=-1;
      if 1:stern2w -> {stern2b=rnd(16); stern2b@(0,1)=-1;} else -> stern2b=-1;
      if 1:stern2w -> {stern2c=rnd(16); stern2c@(0,1)=-1;} else -> stern2c=-1;
      if 1:stern2w -> {stern2d=rnd(16); stern2d@(0,1)=-1;} else -> stern2d=-1;
      if 1:stern4w -> {stern4a=rnd(8); stern4a@(0,1)=-1;} else -> stern4a=-1;
      if 1:stern4w -> {stern4b=rnd(8); stern4b@(0,1)=-1;} else -> stern4b=-1;
      if 1:stern4w -> {stern4c=rnd(8); stern4c@(0,1)=-1;} else -> stern4c=-1;
      if 1:stern4w -> {stern4d=rnd(8); stern4d@(0,1)=-1;} else -> stern4d=-1;
    };

    uhr = {
      if wert -> {
        if loc_x==xx..xx+1 && loc_y==topy@@/2..topy@@/2+1 -> {
          pos = (uhrschritte * (maxwert-wert)) / maxwert;
          switch {
            loc_x==xx && loc_y==topy@@/2 -> qu=Q_TL_BR;
            loc_y==topy@@/2 -> qu=Q_TR_BL;
            loc_x==xx -> qu=Q_BL_TR;
            -> qu=Q_BR_TL;
          };
          *;
        };
        xx+=2;
      };
      file+=1;
    };

    doppeluhr = {
      if !(wert && wert_) -> {
        maxwert=malusdauer;
        uhr;
        wert=wert_;
        maxwert=bonusdauer;
        uhr;
      };
    };

    grasverbindungen = {
      file = anzahl+uhranz+ssanz; E;
      if kind@(-1,0)==Gras && kind@(0,-1)==Gras -> {qu=Q_TL;*;};
      if kind@(1,0)==Gras && kind@(0,-1)==Gras -> {qu=Q_TR;*;};
      if kind@(-1,0)==Gras && kind@(0,1)==Gras -> {qu=Q_BL;*;};
      if kind@(1,0)==Gras && kind@(0,1)==Gras -> {qu=Q_BR;*;};

      qu=Q_ALL;
    };

    hintergrund[eco] = grasverbindungen;

    hintergrund = {
      # Sterne

      file = anzahl+uhranz;
      if stern1a!=-1 -> {
        pos = stern1a%16;
        if stern1a<16 -> qu=Q_TL else -> qu=Q_TL_BL;
        *;
        stern1a+=1;
        if stern1a==32 -> {stern1a=-1; stern1a@(0,1)=0;};
      } else if loc_y==0 && 1:(32*stern1w) -> stern1a=0;
      if stern1b!=-1 -> {
        pos = stern1b%16;
        if stern1b<16 -> qu=Q_TR else -> qu=Q_TR_BR;
        *;
        stern1b+=1;
        if stern1b==32 -> {stern1b=-1; stern1b@(0,1)=0;};
      } else if loc_y==0 && 1:(32*stern1w) -> stern1b=0;
      if stern2a!=-1 -> {
        pos = stern2a%8;
        if stern2a<8 -> qu=Q_BL_TL else -> qu=Q_BL;
        *;
        stern2a+=1;
        if stern2a==16 -> {stern2a=-1; stern2a@(0,1)=0;};
      } else if loc_y==0 && 1:(16*stern2w) -> stern2a=0;
      if stern2b!=-1 -> {
        pos = stern2b%8;
        if stern2b<8 -> qu=Q_BR_TR else -> qu=Q_BR;
        *;
        stern2b+=1;
        if stern2b==16 -> {stern2b=-1; stern2b@(0,1)=0;};
      } else if loc_y==0 && 1:(16*stern2w) -> stern2b=0;
      if stern2c!=-1 -> {
        pos = stern2c%8+8;
        if stern2c<8 -> qu=Q_BL_TL else -> qu=Q_BL;
        *;
        stern2c+=1;
        if stern2c==16 -> {stern2c=-1; stern2c@(0,1)=0;};
      } else if loc_y==0 && 1:(16*stern2w) -> stern2c=0;
      if stern2d!=-1 -> {
        pos = stern2d%8+8;
        if stern2d<8 -> qu=Q_BR_TR else -> qu=Q_BR;
        *;
        stern2d+=1;
        if stern2d==16 -> {stern2d=-1; stern2d@(0,1)=0;};
      } else if loc_y==0 && 1:(16*stern2w) -> stern2d=0;
      file+=1;
      if stern4a!=-1 -> {
        pos = stern4a%4;
        if stern4a<4 -> qu=Q_TL else -> qu=Q_TL_BL;
        *;
        stern4a+=1;
        if stern4a==8 -> {stern4a=-1; stern4a@(0,1)=0;};
      } else if loc_y==0 && 1:(8*stern4w) -> stern4a=0;
      if stern4b!=-1 -> {
        pos = stern4b%4;
        if stern4b<4 -> qu=Q_TR else -> qu=Q_TR_BR;
        *;
        stern4b+=1;
        if stern4b==8 -> {stern4b=-1; stern4b@(0,1)=0;};
      } else if loc_y==0 && 1:(8*stern4w) -> stern4b=0;
      if stern4c!=-1 -> {
        pos = stern4c%4;
        if stern4c<4 -> qu=Q_BL_TL else -> qu=Q_BL;
        *;
        stern4c+=1;
        if stern4c==8 -> {stern4c=-1; stern4c@(0,1)=0;};
      } else if loc_y==0 && 1:(8*stern4w) -> stern4c=0;
      if stern4d!=-1 -> {
        pos = stern4d%4;
        if stern4d<4 -> qu=Q_BR_TR else -> qu=Q_BR;
        *;
        stern4d+=1;
        if stern4d==8 -> {stern4d=-1; stern4d@(0,1)=0;};
      } else if loc_y==0 && 1:(8*stern4w) -> stern4d=0;

      # Sprites

      # Feindexplosion
      if fexplodier -> {
        file = anzahl+uhranz+3; B;
        if fexplodier . 7 -> {
          switch {
            fexplodier&7 == 4 -> qu=Q_TL_TL;
            fexplodier&7 == 3 -> qu=Q_TR_TL;
            fexplodier&7 == 2 -> qu=Q_BL_TL;
            fexplodier&7 == 1 -> qu=Q_BR_TL;
          };
          *;
          fexplodier=fexplodier.-7.+(fexplodier&7-1);
        };
        if fexplodier . 56 -> {
          switch {
            fexplodier&56 == 32 -> qu=Q_TL_TR;
            fexplodier&56 == 24 -> qu=Q_TR_TR;
            fexplodier&56 == 16 -> qu=Q_BL_TR;
            fexplodier&56 == 8 -> qu=Q_BR_TR;
          };
          *;
          fexplodier=fexplodier.-56.+(fexplodier&56-8);
        };
        if fexplodier . 448 -> {
          switch {
            fexplodier&448 == 256 -> qu=Q_TL_BL;
            fexplodier&448 == 192 -> qu=Q_TR_BL;
            fexplodier&448 == 128 -> qu=Q_BL_BL;
            fexplodier&448 == 64 -> qu=Q_BR_BL;
          };
          *;
          fexplodier=fexplodier.-448.+(fexplodier&448-64);
        };
        if fexplodier . 3584 -> {
          switch {
            fexplodier&3584 == 2048 -> qu=Q_TL_BR;
            fexplodier&3584 == 1536 -> qu=Q_TR_BR;
            fexplodier&3584 == 1024 -> qu=Q_BL_BR;
            fexplodier&3584 == 512 -> qu=Q_BR_BR;
          };
          *;
          fexplodier=fexplodier.-3584.+(fexplodier&3584-512);
        };
      };
      # Schiff
      if loc_x == sx@@/2..(sx@@+1)/2 && loc_y == sy@@/2..(sy@@+1)/2 -> {
        file = anzahl+uhranz+2; A;
        switch {
          sx@@%2 && sy@@%2 -> {
            switch {
              loc_x==sx@@/2 && loc_y==sy@@/2 -> qu=Q_TL_BR;
              loc_x==sx@@/2 -> qu=Q_BL_TR;
              loc_y==sy@@/2 -> qu=Q_TR_BL;
              -> qu=Q_BR_TL;
            };
            *;
          };
          sx@@%2 -> if loc_x==sx@@/2 -> {qu=Q_TL_TR; *; qu=Q_BL_BR; *}
            else -> {qu=Q_TR_TL; *; qu=Q_BR_BL; *};
          sy@@%2 -> if loc_y==sy@@/2 -> {qu=Q_TL_BL; *; qu=Q_TR_BR; *}
            else -> {qu=Q_BL_TL; *; qu=Q_BR_TR; *};
          -> {qu=Q_ALL; *;};
        };
      };
      # Schuss
      if loc_x == scx@@/2..(scx@@+1)/2 && loc_y == scy@@/2 -> {
        file = anzahl+uhranz+2;
        pos = 1+scr@@;
        if scy@@==topy@@ || (kind==Gras && !scr@@) -> {
          if scx@@%2 -> {
            switch {
              loc_x==scx@@/2 && scy@@%2 -> qu=Q_BL_BR;
              loc_x==scx@@/2 -> qu=Q_BL_TR;
              scy@@%2 -> qu=Q_BR_BL;
              -> qu=Q_BR_TL;
            };
            *;
          } else -> if loc_x==scx@@/2 -> {
            if scy@@%2 -> {qu=Q_BL_BL; *; qu=Q_BR_BR; *;}
            else -> {qu=Q_BL_TL; *; qu=Q_BR_TR; *;};
          }
        } else -> {
          if scx@@%2 -> {
            switch {
              loc_x==scx@@/2 && scy@@%2 -> qu=Q_TL_BR;
              loc_x==scx@@/2 -> qu=Q_TL_TR;
              scy@@%2 -> qu=Q_TR_BL;
              -> qu=Q_TR_TL;
            };
            *;
          } else -> if loc_x==scx@@/2 -> {
            if scy@@%2 -> {qu=Q_TL_BL; *; qu=Q_TR_BR; *;}
            else -> {qu=Q_TL_TL; *; qu=Q_TR_TR; *;};
          }
        };
      };
      # Feinde
      file = anzahl+uhranz+3; A;
      wert = (loc_x*2-fx@@)/fdy@@;
      if wert==fs@@..fe@@ && !(wert==fls@@..fle@@) -> {
        wert=fy@@-wert*fdx@@;
        if wert==loc_y*2 -> switch {
          fdx@@>0 && fdy@@>0 -> {qu=Q_TL_TL; *;};
          fdx@@>0 -> {qu=Q_BL_TL; *;};
          fdy@@>0 -> {qu=Q_TR_TL; *;};
          -> {qu=Q_BR_TL; *;};
        };
        if wert==loc_y*2+1 -> switch {
          fdx@@>0 && fdy@@>0 -> {qu=Q_TL_BL; *;};
          fdx@@>0 -> {qu=Q_BL_BL; *;};
          fdy@@>0 -> {qu=Q_TR_BL; *;};
          -> {qu=Q_BR_BL; *;};
        };
      };
      wert = (loc_x*2+1-fx@@)/fdy@@;
      if wert==fs@@..fe@@ && !(wert==fls@@..fle@@) -> {
        wert=fy@@-wert*fdx@@;
        if wert==loc_y*2 -> switch {
          fdx@@>0 && fdy@@>0 -> {qu=Q_TL_TR; *;};
          fdx@@>0 -> {qu=Q_BL_TR; *;};
          fdy@@>0 -> {qu=Q_TR_TR; *;};
          -> {qu=Q_BR_TR; *;};
        };
        if wert==loc_y*2+1 -> switch {
          fdx@@>0 && fdy@@>0 -> {qu=Q_TL_BR; *;};
          fdx@@>0 -> {qu=Q_BL_BR; *;};
          fdy@@>0 -> {qu=Q_TR_BR; *;};
          -> {qu=Q_BR_BR; *;};
        };
      };

      # Uhren

      xx = 5-((schnell@@>0)+(langsam@@>0))%2-((lang@@>0)+(kurz@@>0))%2
        -(ununterscheidbar@@>0)-((achtverbind@@>0)+(zweiverbind@@>0))
        -(ketten@@>0);
      file=anzahl;
      wert=schnell@@; wert_=langsam@@; doppeluhr;
      wert=ununterscheidbar@@; maxwert=malusdauer; uhr;
      wert=zweiverbind@@; wert_=achtverbind@@; doppeluhr;
      wert=ketten@@; maxwert=malusdauer; uhr;
      wert=lang@@; wert_=kurz@@; doppeluhr;

      grasverbindungen;
    };

    vordergrund[eco] = {};

    vordergrund = {
      # Feuerwerk
      if nachN!=-1 -> {
        file=nachN%anzahl; G; qu=Q_TL; *; qu=Q_TR; *;
        nachN@(0,-1)=nachN;
        nachN=-1;
      };
      if nachNNO!=-1 -> {
        file=nachNNO%anzahl; I;
        if nachNNO>=anzahl -> qu=Q_TR else qu=Q_TR_TL; *;
        nachNNO@(nachNNO>=anzahl,-1)=(nachNNO+anzahl)%(2*anzahl);
        nachNNO=-1;
      };
      if nachNO!=-1 -> {
        file=nachNO%anzahl; F; qu=Q_TR; *;
        nachNO@(1,-1)=nachNO;
        nachNO=-1;
      };
      if nachONO!=-1 -> {
        file=nachONO%anzahl;
        J; if nachONO>=anzahl -> qu=Q_TR else qu=Q_TR_BR; *;
        nachONO@(1,-(nachONO>=anzahl))=(nachONO+anzahl)%(2*anzahl);
        nachONO=-1;
      };
      if nachO!=-1 -> {
        file=nachO%anzahl; H; qu=Q_TR; *; qu=Q_BR; *;
        nachO@(1,0)=nachO;
        nachO=-1;
      };
      if nachOSO!=-1 -> {
        file=nachOSO%anzahl;
        I; if nachOSO>=anzahl -> qu=Q_BR else qu=Q_BR_TR; *;
        nachOSO@(1,nachOSO>=anzahl)=(nachOSO+anzahl)%(2*anzahl);
        nachOSO=-1;
      };
      if nachSO!=-1 -> {
        file=nachSO%anzahl; F; qu=Q_BR; *;
        nachSO@(1,1)=nachSO;
        nachSO=-1;
      };
      if nachSSO!=-1 -> {
        file=nachSSO%anzahl; J;
        if nachSSO>=anzahl -> qu=Q_BR else qu=Q_BR_BL; *;
        nachSSO@(nachSSO>=anzahl,1)=(nachSSO+anzahl)%(2*anzahl);
        nachSSO=-1;
      };
      if nachS!=-1 -> {
        file=nachS%anzahl; G; qu=Q_BL; *; qu=Q_BR; *;
        nachS@(0,1)=nachS;
        nachS=-1;
      };
      if nachSSW!=-1 -> {
        file=nachSSW%anzahl; I;
        if nachSSW>=anzahl -> qu=Q_BL else qu=Q_BL_BR; *;
        nachSSW@(-(nachSSW>=anzahl),1)=(nachSSW+anzahl)%(2*anzahl);
        nachSSW=-1;
      };
      if nachSW!=-1 -> {
        file=nachSW%anzahl; F; qu=Q_BL; *;
        nachSW@(-1,1)=nachSW;
        nachSW=-1;
      };
      if nachWSW!=-1 -> {
        file=nachWSW%anzahl; J;
        if nachWSW>=anzahl -> qu=Q_BL else qu=Q_BL_TL; *;
        nachWSW@(-1,nachWSW>=anzahl)=(nachWSW+anzahl)%(2*anzahl);
        nachWSW=-1;
      };
      if nachW!=-1 -> {
        file=nachW%anzahl; H; qu=Q_TL; *; qu=Q_BL; *;
        nachW@(-1,0)=nachW;
        nachW=-1;
      };
      if nachWNW!=-1 -> {
        file=nachWNW%anzahl; I;
        if nachWNW>=anzahl -> qu=Q_TL else qu=Q_TL_BL; *;
        nachWNW@(-1,-(nachWNW>=anzahl))=(nachWNW+anzahl)%(2*anzahl);
        nachWNW=-1;
      };
      if nachNW!=-1 -> {
        file=nachNW%anzahl; F; qu=Q_TL; *;
        nachNW@(-1,-1)=nachNW;
        nachNW=-1;
      };
      if nachNNW!=-1 -> {
        file=nachNNW%anzahl; J;
        if nachNNW>=anzahl -> qu=Q_TL else qu=Q_TL_TR; *;
        nachNNW@(-(nachNNW>=anzahl),-1)=(nachNNW+anzahl)%(2*anzahl);
        nachNNW=-1;
      };

      # Raketen, Leben und Energie
      if loc_y==19 -> {
        file = anzahl+uhranz+2;
        # Raketen
        if loc_x==8 -> {
          D;
          qu=Q_TR_BR; *;
        };
        if loc_x==9 -> {
          wert = (raketen@@/10)%10;
          pos = 3+(wert+2)/4;
          switch {
            wert%4==0 -> qu=Q_BL;
            wert%4==1 -> qu=Q_BR_BL;
            wert%4==2 -> qu=Q_TL_BL;
            -> qu=Q_TR_BL;
          };
          *;
          wert = raketen@@%10;
          pos = 3+(wert+2)/4;
          switch {
            wert%4==0 -> qu=Q_BL_BR;
            wert%4==1 -> qu=Q_BR;
            wert%4==2 -> qu=Q_TL_BR;
            -> qu=Q_TR_BR;
          };
          *;
        };
        # Leben
        if loc_x==6 -> {
          D;
          qu=Q_TL_BR; *;
        };
        if loc_x==7 -> {
          wert = (leben@@/10)%10;
          pos = 3+(wert+2)/4;
          switch {
            wert%4==0 -> qu=Q_BL;
            wert%4==1 -> qu=Q_BR_BL;
            wert%4==2 -> qu=Q_TL_BL;
            -> qu=Q_TR_BL;
          };
          *;
          wert = leben@@%10;
          pos = 3+(wert+2)/4;
          switch {
            wert%4==0 -> qu=Q_BL_BR;
            wert%4==1 -> qu=Q_BR;
            wert%4==2 -> qu=Q_TL_BR;
            -> qu=Q_TR_BR;
          };
          *;
        };
        # Energie
        if energie@@>loc_x*8 -> {
          file = anzahl+uhranz+4;
          if loc_x>=4 -> C else if loc_x>=2 -> B else A;
          energie=energie@@-loc_x*8;
          if energie>4 -> energie=4;
          if energie>2 -> pos+=3;
          if energie%2 -> qu=Q_TL_BL else qu=Q_BL_BL;
          *;
          pos%=3;
          energie=energie@@-loc_x*8-4;
          if energie>4 -> energie=4;
          if energie>2 -> pos+=3;
          if energie%2 -> qu=Q_TL_BR else qu=Q_BL_BR;
          if energie>0 -> *;
        };
      };
    };

    schummel = {};

    schummel[easy] = {
      if sorte==4 -> {
        sorte = rnd(anzahl-1);
        if sorte>=4 -> sorte+=1;
      };
    };

    Sorte_init = {
      init;
      sorte=kind-basis;
      schummel;
      kind=sorte+Normal;
      wert = sorte; zwei_hoch; anwesend=wert_;
    };

    Sorte_connect = {
      switch {
        achtverbind@@ -> inhibit = 0;
        zweiverbind@@ -> inhibit = DIR_U+DIR_D+DIR_UL+DIR_UR+DIR_DL+DIR_DR;
        -> inhibit = DIR_UL+DIR_UR+DIR_DL+DIR_DR;
      };
    };

    Sorte = {
      if !falling -> hintergrund;

      if sorte==verschwind@@ && !joker => {
        file = sorte;
        {
          {F*;H*;I*;J*;qu=Q_BL;G*;qu=Q_BR;*},
          {F*;H*;J*;qu=Q_TL;I*;qu=Q_BL;*;G*;qu=Q_BR;*;I*},
          {H*;J*;qu=Q_TL;F*;I*;qu=Q_BL;*;F*;G*;qu=Q_BR;*;F*;I*},
          {H*;qu=Q_TL;F*;I*;J*;qu=Q_BL;*;F*;G*;I*;qu=Q_BR;*;F*;G*;J*},
          {qu=Q_TL;F*;H*;I*;J*;qu=Q_BL;*;F*;G*;H*;I*;qu=Q_BR;*;F*;G*;J*},
          {qu=Q_TL;F*;H*;I*;J*;qu=Q_BL;*;F*;H*;I*;G*;qu=Q_BR;*;F*;J*},
          {qu=Q_TL;F*;H*;I*;J*;qu=Q_BL;*;F*;H*;I*;G*;qu=Q_BR;*;J*},
          {qu=Q_TL;F*;H*;I*;J*;qu=Q_BL;*;F*;H*;I*;G*;qu=Q_BR;*},
          {qu=Q_TL;F*;H*;I*;J*;qu=Q_BL;*;F*;H*;I*},
          {qu=Q_TL;F*;H*;I*;J*;qu=Q_BL;*;F*;H*},
          {qu=Q_TL;F*;H*;I*;J*;qu=Q_BL;*;H*},
          {qu=Q_TL;F*;I*;J*;H*;qu=Q_BL;*},
          {qu=Q_TL;F*;I*;J*},
          {qu=Q_TL;F*;J*},
          {qu=Q_TL;J*;kind=nothing}
        }
      }
      else -> {
        if !falling && !exploding && !joker -> anwesend@@.+=anwesend;

        kind=basis@@+sorte;

        if falling || (!ununterscheidbar@@ && !exploding) -> {
          file = sorte;
          schema4;
          if achtverbind@@ -> {
            E;
            if ?1?????? -> {qu=Q_TR;*;};
            if ???1???? -> {qu=Q_BR;*;};
            if ?????1?? -> {qu=Q_BL;*;};
            if ???????1 -> {qu=Q_TL;*;};
          };
        };
        if ununterscheidbar@@ && !falling -> {
          ununterscheidbar += 1;
          if ununterscheidbar > 4 -> {
            4;
            qu=Q_TL; A*;
            qu=Q_TR; B*;
            qu=Q_BL; C*;
            qu=Q_BR; D*;
          } else -> {
            file=sorte;
            qu=Q_ALL; H*;
            if ununterscheidbar > 3 -> 4;
            qu=Q_TL; I*; qu=Q_BR; *; qu=Q_TR; J*; qu=Q_BL; *;
            if ununterscheidbar > 2 -> 4;
            qu=Q_ALL; F*;
            if ununterscheidbar > 1 -> 4;
            qu=Q_TL; J*; qu=Q_BR; *; qu=Q_TR; I*; qu=Q_BL; *;
            qu=Q_ALL; 4G*;
          };
        } else -> ununterscheidbar = 0;

        if exploding && sorte==6 && !joker -> bonus(25);

        if exploding==1 && !falling -> {
          nachN=sorte;
          nachNNO=sorte+anzahl;
          nachNO=sorte;
          nachONO=sorte+anzahl;
          nachO=sorte;
          nachOSO=sorte+anzahl;
          nachSO=sorte;
          nachSSO=sorte+anzahl;
          nachS=sorte;
          nachSSW=sorte+anzahl;
          nachSW=sorte;
          nachWSW=sorte+anzahl;
          nachW=sorte;
          nachWNW=sorte+anzahl;
          nachNW=sorte;
          nachNNW=sorte+anzahl;

          if !joker -> {
            switch { # Boni
              sorte==1 -> langsam@@=bonusdauer;
              sorte==3 -> kurz@@=bonusdauer;
              sorte==5 -> verschwind@@=-2;
              sorte==6 -> message("Extra points");
              sorte==8 -> grauwirdjoker@@=1;
              sorte==10 -> achtverbind@@=bonusdauer;
              sorte==11 -> {message("Power missiles"); raketen@@+=2;};
              sorte==12 -> {message("Extra ships"); leben@@+=1;};
            };
            if players>1 -> switch { # Mali fuer 2 Spieler
              sorte==0 -> schnell@@(;!)=malusdauer;
              sorte==2 -> lang@@(;!)=malusdauer;
              sorte==4 -> ununterscheidbar@@(;!)=malusdauer;
              sorte==7 -> grauwirdgras@@(;!)=1;
              sorte==9 -> ketten@@(;!)=malusdauer;
              sorte==13 -> zweiverbind@@(;!)=malusdauer;
            } else -> switch { # Mali fuer 1 Spieler
              sorte==0 -> schnell@@=malusdauer;
              sorte==2 -> lang@@=malusdauer;
              sorte==4 -> ununterscheidbar@@=malusdauer;
              sorte==7 -> grauwirdgras@@=1;
              sorte==9 -> ketten@@=malusdauer;
              sorte==13 -> zweiverbind@@=malusdauer;
            };
          };
        };
      };
      if joker && !exploding -> {sorte=joker@@; kind=basis@@+sorte;};

      if !falling -> vordergrund;
    };

    gras_schema = {
      file = anzahl+uhranz+ssanz;
      qu = Q_TL;
      switch {
        0?????00 -> C;
        0?????01 -> H;
        0?????10 -> I;
        0?????11 -> D;
        1?????00 -> A;
        1?????01 -> F;
        1?????10 -> G;
        1?????11 -> B;
      };
      *;
      qu = Q_TR;
      switch {
        000????? -> I;
        001????? -> C;
        010????? -> D;
        011????? -> H;
        100????? -> G;
        101????? -> A;
        110????? -> B;
        111????? -> F;
      };
      *;
      if loc_y==19 -> {
        qu = Q_BL;
        switch {
          ?????00? -> C;
          ?????01? -> I;
          ?????10? -> H;
          ?????11? -> D;
        };
        *;
        qu = Q_BR;
        switch {
          ??00???? -> I;
          ??01???? -> D;
          ??10???? -> C;
          ??11???? -> H;
        };
        *;
      } else {
        qu = Q_BL;
        switch {
          ????000? -> A;
          ????001? -> G;
          ????010? -> F;
          ????011? -> B;
          ????100? -> C;
          ????101? -> I;
          ????110? -> H;
          ????111? -> D;
        };
        *;
        qu = Q_BR;
        switch {
          ??000??? -> G;
          ??001??? -> I;
          ??010??? -> B;
          ??011??? -> D;
          ??100??? -> A;
          ??101??? -> C;
          ??110??? -> F;
          ??111??? -> H;
        };
        *;
      }
    };

  >>

  Lang = {
    pics = mbmSchnell.xpm, mbmLangsam.xpm, mbmLang.xpm, mbmKurz.xpm,
      mbmUnunterscheidbar.xpm, mbmVerschwind.xpm, mbmPunkte.xpm,
      mbmGrauGras.xpm, mbmGrauJoker.xpm, mbmKetten.xpm, mbmOcti.xpm,
      mbmRaketen.xpm, mbmLeben.xpm, mbmMinus.xpm,
      mbmSchnellUhr.xpm, mbmLangsamUhr.xpm, mbmUnunterscheidbarUhr.xpm,
      mbmMinusUhr.xpm, mbmOctiUhr.xpm, mbmKettenUhr.xpm,
      mbmLangUhr.xpm, mbmKurzUhr.xpm,
      mbmSterne12.xpm, mbmSterne4.xpm, mbmSprites.xpm, mbmFeind.xpm,
      mbmEnergie.xpm,
      mbmGras.xpm
    numexplode=4
    colourprob=0
    <<
      Lang.init = {
        basis=Lang;
        Sorte_init;
      };

      Lang.connect = Sorte_connect;
      Lang = Sorte;
    >>
  }

  Normal = {
    pics = mbmSchnell.xpm, mbmLangsam.xpm, mbmLang.xpm, mbmKurz.xpm,
      mbmUnunterscheidbar.xpm, mbmVerschwind.xpm, mbmPunkte.xpm,
      mbmGrauGras.xpm, mbmGrauJoker.xpm, mbmKetten.xpm, mbmOcti.xpm,
      mbmRaketen.xpm, mbmLeben.xpm, mbmMinus.xpm,
      mbmSchnellUhr.xpm, mbmLangsamUhr.xpm, mbmUnunterscheidbarUhr.xpm,
      mbmMinusUhr.xpm, mbmOctiUhr.xpm, mbmKettenUhr.xpm,
      mbmLangUhr.xpm, mbmKurzUhr.xpm,
      mbmSterne12.xpm, mbmSterne4.xpm, mbmSprites.xpm, mbmFeind.xpm,
      mbmEnergie.xpm,
      mbmGras.xpm
    numexplode=3
    <<
      Normal.init = {
        basis=Normal;
        Sorte_init;
      };

      Normal.connect = Sorte_connect;
      Normal = Sorte;
    >>
  }

  Kurz = {
    pics = mbmSchnell.xpm, mbmLangsam.xpm, mbmLang.xpm, mbmKurz.xpm,
      mbmUnunterscheidbar.xpm, mbmVerschwind.xpm, mbmPunkte.xpm,
      mbmGrauGras.xpm, mbmGrauJoker.xpm, mbmKetten.xpm, mbmOcti.xpm,
      mbmRaketen.xpm, mbmLeben.xpm, mbmMinus.xpm,
      mbmSchnellUhr.xpm, mbmLangsamUhr.xpm, mbmUnunterscheidbarUhr.xpm,
      mbmMinusUhr.xpm, mbmOctiUhr.xpm, mbmKettenUhr.xpm,
      mbmLangUhr.xpm, mbmKurzUhr.xpm,
      mbmSterne12.xpm, mbmSterne4.xpm, mbmSprites.xpm, mbmFeind.xpm,
      mbmEnergie.xpm,
      mbmGras.xpm
    numexplode=2
    colourprob=0
    <<
      Kurz.init = {
        basis=Kurz;
        Sorte_init;
      };

      Kurz.connect = Sorte_connect;
      Kurz = Sorte;
    >>
  }

  Grau = {
    pics = mbmSchnell.xpm, mbmLangsam.xpm, mbmLang.xpm, mbmKurz.xpm,
      mbmUnunterscheidbar.xpm, mbmVerschwind.xpm, mbmPunkte.xpm,
      mbmGrauGras.xpm, mbmGrauJoker.xpm, mbmKetten.xpm, mbmOcti.xpm,
      mbmRaketen.xpm, mbmLeben.xpm, mbmMinus.xpm,
      mbmSchnellUhr.xpm, mbmLangsamUhr.xpm, mbmUnunterscheidbarUhr.xpm,
      mbmMinusUhr.xpm, mbmOctiUhr.xpm, mbmKettenUhr.xpm,
      mbmLangUhr.xpm, mbmKurzUhr.xpm,
      mbmSterne12.xpm, mbmSterne4.xpm, mbmSprites.xpm, mbmFeind.xpm,
      mbmEnergie.xpm,
      mbmGras.xpm,
      mbmGrau.xpm
    <<
      Grau.init = {
        init;

        switch {
          grauwirdgras@@ && !grauwirdjoker@@ -> {
            kind=Gras;
            grauwirdgras@@=0;
          };
          grauwirdjoker@@ && !grauwirdgras@@ -> {
            kind=basis@@+joker@@;
            joker=1;
            grauwirdjoker@@=0;
          };
        };
      };

      Grau =
        if informational -> switch {
          grauwirdgras@@ -> gras_schema;
          grauwirdjoker@@ -> {file=joker@@; schema4};
          -> {file=anzahl+uhranz+ssanz+1;A*};
        } else {
          if explodier -> explode;
          hintergrund;
          file=anzahl+uhranz+ssanz+1;A*;
          vordergrund;
        };
    >>
  }

  Gras = {
    pics = mbmSchnell.xpm, mbmLangsam.xpm, mbmLang.xpm, mbmKurz.xpm,
      mbmUnunterscheidbar.xpm, mbmVerschwind.xpm, mbmPunkte.xpm,
      mbmGrauGras.xpm, mbmGrauJoker.xpm, mbmKetten.xpm, mbmOcti.xpm,
      mbmRaketen.xpm, mbmLeben.xpm, mbmMinus.xpm,
      mbmSchnellUhr.xpm, mbmLangsamUhr.xpm, mbmUnunterscheidbarUhr.xpm,
      mbmMinusUhr.xpm, mbmOctiUhr.xpm, mbmKettenUhr.xpm,
      mbmLangUhr.xpm, mbmKurzUhr.xpm,
      mbmSterne12.xpm, mbmSterne4.xpm, mbmSprites.xpm, mbmFeind.xpm,
      mbmEnergie.xpm,
      mbmGras.xpm
    <<
      Gras.init = init;

      Gras =
        if informational -> gras_schema
        else {
          if explodier -> explode;

          hintergrund;

          if ketten@@ -> behaviour .-= explodes_on_explosion
          else -> behaviour .+= explodes_on_explosion;

          gras_schema;

          vordergrund;
        };
    >>
  }

  Nichts = {
    pics = mbmSchnell.xpm, mbmLangsam.xpm, mbmLang.xpm, mbmKurz.xpm,
      mbmUnunterscheidbar.xpm, mbmVerschwind.xpm, mbmPunkte.xpm,
      mbmGrauGras.xpm, mbmGrauJoker.xpm, mbmKetten.xpm, mbmOcti.xpm,
      mbmRaketen.xpm, mbmLeben.xpm, mbmMinus.xpm,
      mbmSchnellUhr.xpm, mbmLangsamUhr.xpm, mbmUnunterscheidbarUhr.xpm,
      mbmMinusUhr.xpm, mbmOctiUhr.xpm, mbmKettenUhr.xpm,
      mbmLangUhr.xpm, mbmKurzUhr.xpm,
      mbmSterne12.xpm, mbmSterne4.xpm, mbmSprites.xpm, mbmFeind.xpm,
      mbmEnergie.xpm,
      mbmGras.xpm
    <<
      Nichts.init = init;

      Nichts = {
        hintergrund;
        vordergrund;
      };
    >>
  }

  info = {
    pics = infoicons.xpm
    <<
      info = if version==0
        -> if ketten@@ -> B* else A*
        else switch {
          achtverbind@@ -> J*;
          zweiverbind@@ -> M*;
          -> E*;
        };
    >>
  }

}

